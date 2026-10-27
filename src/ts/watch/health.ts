declare const Natives: {
    health_refresh(historyMinutes: number): number;
    health_metric(metric: number): number;
    health_sample_count(): number;
    health_sample(index: number): number;
};
declare const localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

export interface NativeHealthSnapshot {
    readonly steps: number | null;
    readonly totalSleepMinutes: number | null;
    readonly restfulSleepMinutes: number | null;
    readonly currentBpm: number | null;
    readonly heartSamples: number[];
    readonly stepsStale: boolean;
    readonly totalSleepStale: boolean;
    readonly restfulSleepStale: boolean;
    readonly currentBpmStale: boolean;
    readonly heartSamplesStale: boolean;
}

interface HealthCache {
    day: string;
    historyMinutes: number;
    steps: number | null;
    totalSleepMinutes: number | null;
    restfulSleepMinutes: number | null;
    currentBpm: number | null;
    heartSamples: number[];
}

const CACHE_KEY = "janktime2.health.snapshot.v1";
const MAX_SAMPLES = 16;
const DEFAULT_HISTORY_MINUTES = 120;

function validHistoryMinutes(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 5 && value <= 1440
        ? value : DEFAULT_HISTORY_MINUTES;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
        ? value : null;
}

function dayKey(date: Date): string {
    return String(date.getFullYear()) + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
}

function readCache(): HealthCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw || raw.length > 1024) return null;
        const value = JSON.parse(raw) as Partial<HealthCache>;
        if (typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) return null;
        const samples = Array.isArray(value.heartSamples)
            ? value.heartSamples.slice(0, MAX_SAMPLES).filter((n): n is number =>
                typeof n === "number" && Number.isInteger(n) && n >= 20 && n <= 240)
            : [];
        return {
            day: value.day,
            historyMinutes: validHistoryMinutes(value.historyMinutes),
            steps: integer(value.steps, 0, 100000),
            totalSleepMinutes: integer(value.totalSleepMinutes, 0, 1440),
            restfulSleepMinutes: integer(value.restfulSleepMinutes, 0, 1440),
            currentBpm: integer(value.currentBpm, 20, 240),
            heartSamples: samples,
        };
    } catch {
        return null;
    }
}

function readMetric(id: number): number | null {
    try {
        const value = Natives.health_metric(id);
        return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
    } catch {
        return null;
    }
}

export function readHealthSnapshot(requestedHistoryMinutes: number = DEFAULT_HISTORY_MINUTES): NativeHealthSnapshot {
    const historyMinutes = validHistoryMinutes(requestedHistoryMinutes);
    const today = dayKey(new Date());
    const previous = readCache();
    const sameHistoryWindow = previous?.historyMinutes === historyMinutes;
    const cache: HealthCache = previous?.day === today ? {
        ...previous,
        historyMinutes,
        heartSamples: sameHistoryWindow ? previous.heartSamples : [],
    } : {
        day: today,
        historyMinutes,
        steps: null,
        totalSleepMinutes: previous?.totalSleepMinutes ?? null,
        restfulSleepMinutes: previous?.restfulSleepMinutes ?? null,
        currentBpm: previous?.currentBpm ?? null,
        heartSamples: sameHistoryWindow ? previous?.heartSamples ?? [] : [],
    };
    let freshSteps: number | null = null;
    let freshTotalSleep: number | null = null;
    let freshRestfulSleep: number | null = null;
    let freshBpm: number | null = null;
    const freshSamples: number[] = [];

    try {
        Natives.health_refresh(historyMinutes);
        freshSteps = readMetric(0);
        freshTotalSleep = readMetric(1);
        freshRestfulSleep = readMetric(2);
        freshBpm = readMetric(3);
        const count = Math.max(0, Math.min(MAX_SAMPLES, Math.trunc(Natives.health_sample_count())));
        for (let i = 0; i < count; i++) {
            const bpm = Math.trunc(Natives.health_sample(i));
            if (bpm >= 20 && bpm <= 240) freshSamples.push(bpm);
        }
    } catch {
        // Keep the last-known-good values below and mark them stale.
    }

    const heartSamplesFresh = freshSamples.length >= 2;
    const snapshot: HealthCache = {
        day: today,
        historyMinutes,
        steps: freshSteps ?? cache.steps,
        totalSleepMinutes: freshTotalSleep ?? cache.totalSleepMinutes,
        restfulSleepMinutes: freshRestfulSleep ?? cache.restfulSleepMinutes,
        currentBpm: freshBpm ?? freshSamples[freshSamples.length - 1] ?? cache.currentBpm,
        heartSamples: (heartSamplesFresh ? freshSamples : cache.heartSamples).slice(-MAX_SAMPLES),
    };
    try {
        const encoded = JSON.stringify(snapshot);
        if (encoded.length <= 1024) localStorage.setItem(CACHE_KEY, encoded);
    } catch {
        // Current-session values remain usable when persistent storage is unavailable.
    }

    return {
        ...snapshot,
        stepsStale: freshSteps === null,
        totalSleepStale: freshTotalSleep === null,
        restfulSleepStale: freshRestfulSleep === null,
        currentBpmStale: freshBpm === null && freshSamples.length === 0,
        heartSamplesStale: !heartSamplesFresh,
    };
}

export function formatSteps(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) return "--";
    return value >= 1000 ? (Math.round(value / 100) / 10).toString() + "k" : String(Math.trunc(value));
}

export function formatSleepMinutes(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) return "--";
    const minutes = Math.trunc(value);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return String(hours) + "h" + (remainder < 10 ? "0" : "") + String(remainder);
}
