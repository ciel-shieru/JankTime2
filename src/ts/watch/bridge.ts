import Message from "pebble/message";
import { DIAGNOSTIC_MODE } from "./config";

// The Moddable XS watch runtime exposes console.log; this declaration keeps
// the watch-only TypeScript config independent of browser/Node type libraries.
declare const console: { log(message: string): void };
import {
    DEFAULT_SLOT_CONFIGURATION,
    METRIC_IDS,
    SLOT_IDS,
    type MetricId,
    type SlotId,
    type SlotConfiguration,
} from "./model";

export interface BridgeDisplayState {
    slotConfiguration: SlotConfiguration;
    metricValues: Partial<Record<MetricId, string>>;
    staleMetrics: Partial<Record<MetricId, boolean>>;
    phoneBatteryPercent: number | null;
    phoneBluetoothConnected: boolean | null;
    alarmTime: string | null;
    alarmIsBedtime: boolean;
    focusRows: [string | null, string | null];
    calendarRows: [string | null, string | null];
    currentBpm: number | null;
    heartSamples: number[] | null;
    weatherCondition: string | null;
    imageRows: string[] | null;
}

export const displayState: BridgeDisplayState = {
    slotConfiguration: { ...DEFAULT_SLOT_CONFIGURATION },
    metricValues: {},
    staleMetrics: {},
    phoneBatteryPercent: null,
    phoneBluetoothConnected: null,
    alarmTime: null,
    alarmIsBedtime: false,
    focusRows: [null, null],
    calendarRows: [null, null],
    currentBpm: null,
    heartSamples: null,
    weatherCondition: null,
    imageRows: null,
};

type MessageValue = string | number;
type IncomingMessage = Map<string, MessageValue>;
let redraw: (() => void) | null = null;
let hasLoggedFirstIncomingMessage = false;

export interface ReceiverDiagnostics {
    messagesReceived: number;
    slotUpdatesApplied: number;
    messagesRejected: number;
    redrawInvocations: number;
    handlerErrors: number;
    redrawHandlerRegistered: boolean;
    lastType: string;
    lastId: string;
    lastOutcome: string;
    lastDetail: string;
    lastSlot: SlotId | null;
    lastPreviousMetric: MetricId | null;
    lastMetric: MetricId | null;
    lastRedrawInvoked: boolean;
}

export const receiverDiagnostics: ReceiverDiagnostics = {
    messagesReceived: 0,
    slotUpdatesApplied: 0,
    messagesRejected: 0,
    redrawInvocations: 0,
    handlerErrors: 0,
    redrawHandlerRegistered: false,
    lastType: "none",
    lastId: "none",
    lastOutcome: "waiting",
    lastDetail: "no AppMessage received",
    lastSlot: null,
    lastPreviousMetric: null,
    lastMetric: null,
    lastRedrawInvoked: false,
};

const RECEIVER_LOG_PREFIX = "[JankTime2Receiver]";

function receiverLog(event: string, details = ""): void {
    const suffix = details.length > 0 ? " " + details : "";
    console.log(RECEIVER_LOG_PREFIX + " event=" + event + suffix);
}

function asText(value: unknown, maxLength = 200): string | null {
    if (typeof value !== "string" || value.length > maxLength) return null;
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "");
}
function asInteger(value: unknown, min: number, max: number): number | null {
    const numberValue = typeof value === "number"
        ? value
        : typeof value === "string" && /^-?\d{1,4}$/.test(value)
            ? Number(value)
            : NaN;
    if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) return null;
    return numberValue;
}
function asFlag(value: unknown): boolean | null {
    const flag = asInteger(value, 0, 1);
    return flag === null ? null : flag === 1;
}
function validTime(value: unknown): string | null {
    const time = asText(value, 5);
    return time !== null && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}
function validSlot(value: unknown): SlotId | null {
    return typeof value === "string" && (SLOT_IDS as readonly string[]).includes(value)
        ? value as SlotId : null;
}
function validMetric(value: unknown): MetricId | null {
    return typeof value === "string" && (METRIC_IDS as readonly string[]).includes(value)
        ? value as MetricId : null;
}
function parseSamples(value: unknown): number[] | null {
    const raw = asText(value, 200);
    if (raw === null || raw.length === 0) return null;
    const pieces = raw.split(",");
    if (pieces.length < 2 || pieces.length > 56) return null;
    const result: number[] = [];
    for (const piece of pieces) {
        const item = asInteger(piece, 20, 240);
        if (item === null) return null;
        result.push(item);
    }
    return result;
}
function changed(): boolean {
    if (redraw === null) {
        receiverDiagnostics.lastRedrawInvoked = false;
        return false;
    }
    receiverDiagnostics.redrawInvocations++;
    receiverDiagnostics.lastRedrawInvoked = true;
    redraw();
    return true;
}

function safeDiagnosticMessageId(kind: string | null, id: string | null): string {
    if (kind === null || id === null) return "invalid";
    if (kind === "slot") return validSlot(id) ?? "invalid";
    if (kind === "metric") return validMetric(id) ?? "invalid";
    if (kind === "image") return /^chunk\.[0-9]$/.test(id) ? id : "invalid";
    if (kind === "status" &&
        ["phoneBattery", "phoneBluetooth", "alarmTime", "heartRate", "heartSamples"].includes(id)) {
        return id;
    }
    if (kind === "row" && ["focus.1", "focus.2", "calendar.1", "calendar.2"].includes(id)) {
        return id;
    }
    return "invalid";
}

function rejectMessage(event: string, reason: string): void {
    receiverDiagnostics.messagesRejected++;
    receiverDiagnostics.lastOutcome = "rejected";
    receiverDiagnostics.lastDetail = reason;
    receiverLog(event, "reason=" + reason);
}

function handleMessage(message: IncomingMessage): void {
    const kind = asText(message.get("TYPE"), 16);
    const id = asText(message.get("ID"), 24);
    const value = message.get("VALUE");
    const flags = message.get("FLAGS");
    const extra = asText(message.get("EXTRA"), 48);
    if (kind === null || id === null) {
        rejectMessage("message_rejected", "missing_type_or_id");
        return;
    }

    if (kind === "slot") {
        const slot = validSlot(id);
        const metric = validMetric(value);
        if (slot === null || metric === null) {
            // Do not expose untrusted IDs or values on the diagnostic screen or logs.
            rejectMessage("slot_update_rejected", "invalid_slot_or_metric");
            return;
        }
        const previous = displayState.slotConfiguration[slot];
        displayState.slotConfiguration[slot] = metric;
        receiverDiagnostics.slotUpdatesApplied++;
        receiverDiagnostics.lastSlot = slot;
        receiverDiagnostics.lastPreviousMetric = previous;
        receiverDiagnostics.lastMetric = metric;
        receiverDiagnostics.lastOutcome = "slot_applied";
        receiverDiagnostics.lastDetail = slot;
        const redrawInvoked = changed();
        // Slot and metric are validated enums. Log identifiers only, never
        // display values, row text, credentials, or raw AppMessage dictionaries.
        receiverLog(
            "slot_update_applied",
            "slot=" + slot + " previous=" + previous + " metric=" + metric +
                " redraw_invoked=" + String(redrawInvoked),
        );
        return;
    }
    if (kind === "metric") {
        const metric = validMetric(id);
        const text = asText(value);
        const stale = asFlag(flags);
        if (metric === null || metric === "none" || text === null || stale === null) {
            rejectMessage("metric_update_rejected", "invalid_metric_payload");
            return;
        }
        receiverDiagnostics.lastOutcome = "metric_applied";
        receiverDiagnostics.lastDetail = metric;
        displayState.metricValues[metric] = text;
        displayState.staleMetrics[metric] = stale;
        if (metric === "weatherFeelsLike" && extra !== null && extra.length > 0) {
            displayState.weatherCondition = extra.toLowerCase();
        }
        changed();
        return;
    }
    if (kind === "image") {
        const match = /^chunk\.[0-9]$/.exec(id);
        const chunkIndex = match === null ? -1 : Number(id.slice(6));
        const text = asText(value, 96);
        if (chunkIndex < 0 || text === null) {
            rejectMessage("image_chunk_rejected", "invalid_chunk_payload");
            return;
        }
        const chunkRows = text.split(";");
        if (chunkRows.length !== 3 || !chunkRows.every((row) => /^[01]{30}$/.test(row))) {
            rejectMessage("image_chunk_rejected", "invalid_chunk_rows");
            return;
        }
        receiverDiagnostics.lastOutcome = "image_applied";
        receiverDiagnostics.lastDetail = "chunk." + String(chunkIndex);
        const rows = displayState.imageRows?.slice() ?? Array.from({ length: 30 }, () => "");
        for (let i = 0; i < chunkRows.length; i++) rows[chunkIndex * 3 + i] = chunkRows[i] ?? "";
        displayState.imageRows = rows;
        changed();
        return;
    }
    if (kind === "status") {
        switch (id) {
            case "phoneBattery": {
                const number = asInteger(value, 0, 100);
                if (number === null) {
                    rejectMessage("status_update_rejected", "invalid_phone_battery");
                    return;
                }
                displayState.phoneBatteryPercent = number;
                break;
            }
            case "phoneBluetooth": {
                const connected = asFlag(value);
                if (connected === null) {
                    rejectMessage("status_update_rejected", "invalid_phone_bluetooth");
                    return;
                }
                displayState.phoneBluetoothConnected = connected;
                break;
            }
            case "alarmTime": {
                const raw = asText(value, 5);
                if (raw === "--:--") {
                    displayState.alarmTime = null;
                    displayState.alarmIsBedtime = false;
                    break;
                }
                const time = validTime(raw);
                const bedtime = asFlag(flags);
                if (time === null || bedtime === null) {
                    rejectMessage("status_update_rejected", "invalid_alarm_time");
                    return;
                }
                displayState.alarmTime = time;
                displayState.alarmIsBedtime = bedtime;
                break;
            }
            case "heartRate": {
                const bpm = asInteger(value, 20, 240);
                if (bpm === null) {
                    rejectMessage("status_update_rejected", "invalid_heart_rate");
                    return;
                }
                displayState.currentBpm = bpm;
                break;
            }
            case "heartSamples": {
                const samples = parseSamples(value);
                if (samples === null) {
                    rejectMessage("status_update_rejected", "invalid_heart_samples");
                    return;
                }
                displayState.heartSamples = samples;
                break;
            }
            default:
                rejectMessage("status_update_rejected", "unknown_status_id");
                return;
        }
        receiverDiagnostics.lastOutcome = "status_applied";
        receiverDiagnostics.lastDetail = id;
        changed();
        return;
    }
    if (kind === "row") {
        const text = asText(value);
        if (text === null) {
            rejectMessage("row_update_rejected", "invalid_row_text");
            return;
        }
        switch (id) {
            case "focus.1": displayState.focusRows[0] = text; break;
            case "focus.2": displayState.focusRows[1] = text; break;
            case "calendar.1": displayState.calendarRows[0] = text; break;
            case "calendar.2": displayState.calendarRows[1] = text; break;
            default:
                rejectMessage("row_update_rejected", "unknown_row_id");
                return;
        }
        receiverDiagnostics.lastOutcome = "row_applied";
        receiverDiagnostics.lastDetail = id;
        changed();
        return;
    }
    receiverDiagnostics.lastOutcome = "ignored";
    receiverDiagnostics.lastDetail = "unsupported_type";
    receiverLog("message_ignored", "reason=unsupported_type");
}

const message = new Message({
    // AppMessage dictionaries are capped at 124 bytes. The API defaults to
    // 8 KiB buffers in each direction; this protocol never needs those buffers.
    input: 124,
    output: 124,
    keys: ["TYPE", "ID", "VALUE", "FLAGS", "EXTRA"],
    onReadable() {
        const previousRedrawCount = receiverDiagnostics.redrawInvocations;
        try {
            const incoming = this.read();
            const type = asText(incoming.get("TYPE"), 16);
            const id = asText(incoming.get("ID"), 24);
            const supportedType = type !== null &&
                ["slot", "metric", "image", "status", "row"].includes(type)
                ? type : "unknown";
            receiverDiagnostics.messagesReceived++;
            receiverDiagnostics.lastType = supportedType;
            receiverDiagnostics.lastId = safeDiagnosticMessageId(type, id);
            receiverDiagnostics.lastOutcome = "received";
            receiverDiagnostics.lastDetail = "";
            if (!hasLoggedFirstIncomingMessage) {
                receiverLog("first_message_received", "type=" + supportedType);
                hasLoggedFirstIncomingMessage = true;
            }
            handleMessage(incoming);
        } catch {
            // Never log exception text or packet contents; they may include private data.
            receiverDiagnostics.handlerErrors++;
            receiverDiagnostics.lastOutcome = "handler_error";
            receiverDiagnostics.lastDetail = "exception";
            receiverLog("message_handler_failed", "reason=exception");
        }
        // Invalid/unsupported packets do not normally redraw the production face.
        // The diagnostic build redraws once so the on-watch status reflects the outcome.
        if (DIAGNOSTIC_MODE && receiverDiagnostics.redrawInvocations === previousRedrawCount) {
            try { changed(); } catch { /* Keep diagnostics best-effort. */ }
        }
    },
});

receiverLog(
    "receiver_initialized",
    "slot_count=" + String(SLOT_IDS.length) + " metric_count=" + String(METRIC_IDS.length),
);

export function setBridgeRedraw(callback: () => void): void {
    redraw = callback;
    receiverDiagnostics.redrawHandlerRegistered = true;
    receiverLog("redraw_handler_registered");
}
