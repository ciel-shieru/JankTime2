import Message from "pebble/message";

// The Moddable XS watch runtime exposes console.log; this declaration keeps
// the watch-only TypeScript config independent of browser/Node type libraries.
declare const console: { log(message: string): void };
declare const localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};
import {
    DEFAULT_SLOT_CONFIGURATION,
    METRIC_IDS,
    SLOT_IDS,
    validateSlotConfiguration,
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
    alarmStale: boolean;
    heartRateHistoryMinutes: number;
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
    alarmStale: true,
    heartRateHistoryMinutes: 120,
    focusRows: [null, null],
    calendarRows: [null, null],
    currentBpm: null,
    heartSamples: null,
    weatherCondition: null,
    imageRows: null,
};

type MessageValue = string | number | ArrayBuffer;
type IncomingMessage = Map<string | number, MessageValue>;
let redraw: (() => void) | null = null;
let lowPowerMode = false;
let hasLoggedFirstIncomingMessage = false;

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
const DISPLAY_CACHE_KEY = "janktime2.display.snapshot.v1";
const MAX_DISPLAY_CACHE_CHARS = 8192;

function storedRows(value: unknown): [string | null, string | null] {
    if (!Array.isArray(value)) return [null, null];
    const first = value[0] === null ? null : asText(value[0], 200);
    const second = value[1] === null ? null : asText(value[1], 200);
    return [first, second];
}

function restoreDisplayState(): void {
    try {
        const raw = localStorage.getItem(DISPLAY_CACHE_KEY);
        if (raw === null || raw.length === 0 || raw.length > MAX_DISPLAY_CACHE_CHARS) return;
        const stored = JSON.parse(raw) as Record<string, unknown>;
        if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return;

        displayState.slotConfiguration = validateSlotConfiguration(stored.slotConfiguration);

        const values = stored.metricValues;
        if (typeof values === "object" && values !== null && !Array.isArray(values)) {
            const source = values as Record<string, unknown>;
            for (const id of METRIC_IDS) {
                if (id === "none") continue;
                const value = asText(source[id], 160);
                if (value !== null) displayState.metricValues[id] = value;
            }
        }

        const stale = stored.staleMetrics;
        if (typeof stale === "object" && stale !== null && !Array.isArray(stale)) {
            const source = stale as Record<string, unknown>;
            for (const id of METRIC_IDS) {
                if (id !== "none" && typeof source[id] === "boolean") {
                    displayState.staleMetrics[id] = source[id] as boolean;
                }
            }
        }

        if (stored.phoneBatteryPercent === null) displayState.phoneBatteryPercent = null;
        else {
            const battery = asInteger(stored.phoneBatteryPercent, 0, 100);
            if (battery !== null) displayState.phoneBatteryPercent = battery;
        }
        if (stored.phoneBluetoothConnected === null || typeof stored.phoneBluetoothConnected === "boolean") {
            displayState.phoneBluetoothConnected = stored.phoneBluetoothConnected as boolean | null;
        }

        if (stored.alarmTime === null) displayState.alarmTime = null;
        else {
            const time = validTime(stored.alarmTime);
            if (time !== null) displayState.alarmTime = time;
        }
        if (typeof stored.alarmIsBedtime === "boolean") displayState.alarmIsBedtime = stored.alarmIsBedtime;
        if (typeof stored.alarmStale === "boolean") displayState.alarmStale = stored.alarmStale;
        const historyMinutes = asInteger(stored.heartRateHistoryMinutes, 5, 1440);
        if (historyMinutes !== null) displayState.heartRateHistoryMinutes = historyMinutes;

        displayState.focusRows = storedRows(stored.focusRows);
        displayState.calendarRows = storedRows(stored.calendarRows);

        if (stored.currentBpm === null) displayState.currentBpm = null;
        else {
            const bpm = asInteger(stored.currentBpm, 20, 240);
            if (bpm !== null) displayState.currentBpm = bpm;
        }
        if (Array.isArray(stored.heartSamples) && stored.heartSamples.every(sample => typeof sample === "number")) {
            displayState.heartSamples = parseSamples(stored.heartSamples.join(","));
        } else if (stored.heartSamples === null) {
            displayState.heartSamples = null;
        }

        displayState.weatherCondition = asText(stored.weatherCondition, 40)?.toLowerCase() ?? null;
        if (Array.isArray(stored.imageRows) && stored.imageRows.length === 30 &&
            stored.imageRows.every(row => typeof row === "string" && /^[01]{30}$/.test(row))) {
            displayState.imageRows = stored.imageRows as string[];
        } else if (stored.imageRows === null) {
            displayState.imageRows = null;
        }
    } catch {
        // Missing/corrupt/full storage must not prevent the watchface from launching.
    }
}

function persistDisplayState(): void {
    try {
        const encoded = JSON.stringify(displayState);
        if (encoded.length <= MAX_DISPLAY_CACHE_CHARS) localStorage.setItem(DISPLAY_CACHE_KEY, encoded);
    } catch {
        // The live in-memory state remains usable if localStorage is unavailable.
    }
}

function changed(): boolean {
    if (lowPowerMode) return false;
    persistDisplayState();
    if (redraw === null) return false;
    redraw();
    return true;
}

export function setBridgeLowPowerMode(active: boolean): void {
    if (lowPowerMode === active) return;
    lowPowerMode = active;
    // Flush the last-known display state only after leaving sleep mode.
    if (!lowPowerMode) persistDisplayState();
}

restoreDisplayState();

function handleMessage(message: IncomingMessage): void {
    const kind = asText(message.get("TYPE"), 16);
    const id = asText(message.get("ID"), 24);
    const value = message.get("VALUE");
    const flags = message.get("FLAGS");
    const extra = asText(message.get("EXTRA"), 48);
    if (kind === null || id === null) {
        receiverLog("message_rejected", "reason=missing_type_or_id");
        return;
    }

    if (kind === "slot") {
        const slot = validSlot(id);
        const metric = validMetric(value);
        if (slot === null || metric === null) {
            // Do not log untrusted packet fields; a malformed sender must not
            // be able to make the watch log contain provider/private data.
            receiverLog("slot_update_rejected", "reason=invalid_slot_or_metric");
            return;
        }
        const previous = displayState.slotConfiguration[slot];
        displayState.slotConfiguration[slot] = metric;
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
            receiverLog("metric_update_rejected", "reason=invalid_metric_payload");
            return;
        }
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
            receiverLog("image_chunk_rejected", "reason=invalid_chunk_payload");
            return;
        }
        const chunkRows = text.split(";");
        if (chunkRows.length !== 3 || !chunkRows.every((row) => /^[01]{30}$/.test(row))) {
            receiverLog("image_chunk_rejected", "reason=invalid_chunk_rows");
            return;
        }
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
                    receiverLog("status_update_rejected", "reason=invalid_phone_battery");
                    return;
                }
                displayState.phoneBatteryPercent = number;
                break;
            }
            case "phoneBluetooth": {
                const connected = asFlag(value);
                if (connected === null) {
                    receiverLog("status_update_rejected", "reason=invalid_phone_bluetooth");
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
                    receiverLog("status_update_rejected", "reason=invalid_alarm_time");
                    return;
                }
                displayState.alarmTime = time;
                displayState.alarmIsBedtime = bedtime;
                break;
            }
            case "heartRate": {
                const bpm = asInteger(value, 20, 240);
                if (bpm === null) {
                    receiverLog("status_update_rejected", "reason=invalid_heart_rate");
                    return;
                }
                displayState.currentBpm = bpm;
                break;
            }
            case "heartSamples": {
                const samples = parseSamples(value);
                if (samples === null) {
                    receiverLog("status_update_rejected", "reason=invalid_heart_samples");
                    return;
                }
                displayState.heartSamples = samples;
                break;
            }
            case "heartHistoryMinutes": {
                const minutes = asInteger(value, 5, 1440);
                if (minutes === null) {
                    receiverLog("status_update_rejected", "reason=invalid_heart_history_window");
                    return;
                }
                displayState.heartRateHistoryMinutes = minutes;
                break;
            }
            case "alarmStale": {
                const stale = asFlag(value);
                if (stale === null) {
                    receiverLog("status_update_rejected", "reason=invalid_alarm_staleness");
                    return;
                }
                displayState.alarmStale = stale;
                break;
            }
            default:
                receiverLog("status_update_rejected", "reason=unknown_status_id");
                return;
        }
        changed();
        return;
    }
    if (kind === "row") {
        const text = asText(value);
        if (text === null) {
            receiverLog("row_update_rejected", "reason=invalid_row_text");
            return;
        }
        switch (id) {
            case "focus.1": displayState.focusRows[0] = text; break;
            case "focus.2": displayState.focusRows[1] = text; break;
            case "calendar.1": displayState.calendarRows[0] = text; break;
            case "calendar.2": displayState.calendarRows[1] = text; break;
            default:
                receiverLog("row_update_rejected", "reason=unknown_row_id");
                return;
        }
        changed();
        return;
    }
    receiverLog("message_ignored", "reason=unsupported_type");
}

const message = new Message({
    // AppMessage dictionaries are capped at 124 bytes. The API defaults to
    // 8 KiB buffers in each direction; this protocol never needs those buffers.
    input: 124,
    output: 124,
    // Keep wire IDs explicit: Alloy's array shorthand assigns 10000 + index.
    // The Android companion must use these exact numeric AppMessage dictionary keys.
    keys: new Map<string, number>([
        ["TYPE", 10000],
        ["ID", 10001],
        ["VALUE", 10002],
        ["FLAGS", 10003],
        ["EXTRA", 10004],
    ]),
    onReadable() {
        // The sleeping display has no phone dependency. Skip decoding, logging,
        // flash writes and redraws for companion packets until the watch wakes.
        if (lowPowerMode) return;
        try {
            const incoming = this.read();
            if (!hasLoggedFirstIncomingMessage) {
                const type = asText(incoming.get("TYPE"), 16);
                const supportedType = type !== null &&
                    ["slot", "metric", "image", "status", "row"].includes(type)
                    ? type : "unknown";
                receiverLog("first_message_received", "type=" + supportedType);
                hasLoggedFirstIncomingMessage = true;
            }
            handleMessage(incoming);
        } catch {
            // Never log exception text or packet contents; they may include private data.
            receiverLog("message_handler_failed", "reason=exception");
        }
    },
});

receiverLog(
    "receiver_initialized",
    "slot_count=" + String(SLOT_IDS.length) + " metric_count=" + String(METRIC_IDS.length),
);

export function setBridgeRedraw(callback: () => void): void {
    redraw = callback;
    receiverLog("redraw_handler_registered");
}
