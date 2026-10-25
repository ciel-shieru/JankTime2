export const SLOT_IDS = [
    "grid.top.1",
    "grid.top.2",
    "grid.top.3",
    "grid.top.4",
    "grid.top.5",
    "grid.bottom.1",
    "grid.bottom.2",
    "grid.bottom.4",
    "grid.bottom.5",
    "clock.left",
    "clock.right",
] as const;

export type SlotId = typeof SLOT_IDS[number];

export const METRIC_IDS = [
    "none",
    "focusCount",
    "steps",
    "totalSleep",
    "restfulSleep",
    "fanState",
    "cpuUsage",
    "memoryUsage",
    "weatherFeelsLike",
    "rainChance",
    "alertCount",
    "water",
    "haSensor",
    "haClimateValue",
] as const;

export type MetricId = typeof METRIC_IDS[number];

export interface MetricPreview {
    readonly value: string;
    readonly icon: MetricId;
    readonly stale: boolean;
}

export type SlotConfiguration = Record<SlotId, MetricId>;

export const DEFAULT_SLOT_CONFIGURATION: Readonly<SlotConfiguration> = Object.freeze({
    "grid.top.1": "focusCount",
    "grid.top.2": "steps",
    "grid.top.3": "totalSleep",
    "grid.top.4": "restfulSleep",
    "grid.top.5": "fanState",
    "grid.bottom.1": "cpuUsage",
    "grid.bottom.2": "memoryUsage",
    "grid.bottom.4": "weatherFeelsLike",
    "grid.bottom.5": "alertCount",
    "clock.left": "none",
    "clock.right": "water",
});

export const PREVIEW_METRICS: Readonly<Record<MetricId, MetricPreview>> = Object.freeze({
    none: { value: "", icon: "none", stale: false },
    focusCount: { value: "4/7", icon: "focusCount", stale: false },
    steps: { value: "8.4k", icon: "steps", stale: false },
    totalSleep: { value: "7h42", icon: "totalSleep", stale: false },
    restfulSleep: { value: "1h38", icon: "restfulSleep", stale: false },
    fanState: { value: "ON", icon: "fanState", stale: false },
    cpuUsage: { value: "34%", icon: "cpuUsage", stale: false },
    memoryUsage: { value: "62%", icon: "memoryUsage", stale: false },
    weatherFeelsLike: { value: "31°", icon: "weatherFeelsLike", stale: false },
    rainChance: { value: "--%", icon: "rainChance", stale: false },
    alertCount: { value: "3", icon: "alertCount", stale: false },
    water: { value: "60%", icon: "water", stale: false },
    haSensor: { value: "--", icon: "haSensor", stale: true },
    haClimateValue: { value: "--", icon: "haClimateValue", stale: true },
});

export function validateSlotConfiguration(input: unknown): SlotConfiguration {
    const result: SlotConfiguration = { ...DEFAULT_SLOT_CONFIGURATION };
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return result;
    }

    const candidate = input as Record<string, unknown>;
    for (const id of SLOT_IDS) {
        const metric = candidate[id];
        if (typeof metric === "string" && (METRIC_IDS as readonly string[]).includes(metric)) {
            result[id] = metric as MetricId;
        }
    }
    return result;
}

export function selectAlarmOrBedtime(
    alarmAt: Date | null,
    bedtimeAt: Date | null,
): { readonly time: Date | null; readonly isBedtime: boolean } {
    const validAlarm = alarmAt !== null && Number.isFinite(alarmAt.getTime());
    const validBedtime = bedtimeAt !== null && Number.isFinite(bedtimeAt.getTime());

    if (validBedtime && (!validAlarm || (bedtimeAt as Date).getTime() < (alarmAt as Date).getTime())) {
        return { time: bedtimeAt, isBedtime: true };
    }
    return { time: validAlarm ? alarmAt : null, isBedtime: false };
}

export function formatTime24(date: Date): string {
    if (!Number.isFinite(date.getTime())) {
        return "--:--";
    }
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return hours + ":" + minutes;
}

export function clipByWidth(
    text: string,
    maxWidth: number,
    measure: (value: string) => number,
): string {
    let clipped = text;
    while (clipped.length > 0 && measure(clipped) > maxWidth) {
        clipped = clipped.slice(0, -1);
    }
    return clipped;
}

export function formatFocusRow(
    start: string,
    due: string,
    priority: number,
    title: string,
): string {
    const marks = "!".repeat(Math.max(0, Math.min(4, Math.trunc(priority))));
    return start + " | " + due + " | " + marks + " | " + title;
}

export function formatCalendarRow(start: string, location: string, title: string): string {
    return start + " | " + location.slice(0, 10) + " | " + title;
}
