declare const Natives: {
    health_refresh(): number;
    health_metric(metric: number): number;
    health_sample_count(): number;
    health_sample(index: number): number;
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

interface PersistedHealthSnapshot {
    readonly day: string;
    readonly steps: number | null;
    readonly totalSleepMinutes: number | null;
    readonly restfulSleepMinutes: number | null;
    readonly currentBpm: number | null;
    readonly heartSamples: number[];
}

const MAX_SAMPLES = 16;
const HEALTH_CACHE_KEY = "janktime2.health.snapshot.v1";
const MAX_CACHE_CHARS = 1024;

function readMetric(id: number): number | null {
    try {
        const value = Natives.health_metric(id);
        return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
    } catch {
        return null;
    }
}

function validNullableInteger(value: unknown, minimum: number, maximum: number): number | null {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
        return null;
    }
    return value;
}

function readPersistedHealth(): PersistedHealthSnapshot | null {
    try {
        const raw = localStorage.getItem(HEALTH_CACHE_KEY);
        if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CACHE_CHARS) return null;
        const candidate: unknown = JSON.parse(raw);
        if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return null;
        const input = candidate as Record<string, unknown>;
        const day = typeof input.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.day)
            ? input.day : "";
        if (day.length === 0) return null;
        const heartSamples = Array.isArray(input.heartSamples)
            ? input.heartSamples.slice(0, MAX_SAMPLES).filter((value): value is number =>
                typeof value === "number" && Number.isInteger(value) && value >= 20 && value <= 240)
            : [];
        return {
            day,
            steps: validNullableInteger(input.steps, 0, 100_000),
            totalSleepMinutes: validNullableInteger(input.totalSleepMinutes, 0, 1440),
            restfulSleepMinutes: validNullableInteger(input.restfulSleepMinutes, 0, 1440),
            currentBpm: validNullableInteger(input.currentBpm, 20, 240),
            heartSamples,
        };
    } catch {
        return null;
    }
}

function persistHealth(snapshot: PersistedHealthSnapshot): void {
    try {
        const encoded = JSON.stringify(snapshot);
        if (encoded.length <= MAX_CACHE_CHARS) localStorage.setItem(HEALTH_CACHE_KEY, encoded);
    } catch {
        // Storage may be unavailable; current-session rendering still works.
    }
}

/**
 * Read Pebble Health once per display minute, retaining the last usable reading
 * on transient API gaps. Retained values are explicitly marked stale to the UI.
 */
export function readHealthSnapshot(): NativeHealthSnapshot {
    let freshSteps: number | null = null;
    let freshTotalSleep: number | null = null;
    let freshRestfulSleep: number | null = null;
    let freshCurrentBpm: number | null = null;
    let freshSamples: number[] = [];

    try {
        Natives.health_refresh();
        freshSteps = readMetric(0);
        freshTotalSleep = readMetric(1);
        freshRestfulSleep = readMetric(2);
        freshCurrentBpm = readMetric(3);

        const rawCount = Natives.health_sample_count();
        const count = Number.isFinite(rawCount)
            ? Math.max(0, Math.min(MAX_SAMPLES, Math.trunc(rawCount)))
            : 0;
        for (let i = 0; i < count; i++) {
            const value = Math.trunc(Natives.health_sample(i));
            if (value >= 20 && value <= 240) freshSamples.push(value);
        }
    } catch {
        // Use the persisted snapshot below, and mark the cached values stale.
    }

    const now = new Date();
    const today = String(now.getFullYear()) + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0");
    const previous = readPersistedHealth();
    const cache = previous?.day === today
        ? previous
        : {
            day: today,
            steps: null,
            totalSleepMinutes: previous?.totalSleepMinutes ?? null,
            restfulSleepMinutes: previous?.restfulSleepMinutes ?? null,
            currentBpm: previous?.currentBpm ?? null,
            heartSamples: previous?.heartSamples ?? [],
        };

    const steps = freshSteps ?? cache.steps;
    const totalSleepMinutes = freshTotalSleep ?? cache.totalSleepMinutes;
    const restfulSleepMinutes = freshRestfulSleep ?? cache.restfulSleepMinutes;
    const currentBpm = freshCurrentBpm ?? freshSamples[freshSamples.length - 1] ?? cache.currentBpm;
    const hasFreshGraph = freshSamples.length >= 2;
    const heartSamples = hasFreshGraph ? freshSamples : cache.heartSamples;

    const persisted: PersistedHealthSnapshot = {
        day: today,
        steps,
        totalSleepMinutes,
        restfulSleepMinutes,
        currentBpm,
        heartSamples: heartSamples.slice(-MAX_SAMPLES),
    };
    persistHealth(persisted);

    return {
        ...persisted,
        stepsStale: freshSteps === null,
        totalSleepStale: freshTotalSleep === null,
        restfulSleepStale: freshRestfulSleep === null,
        currentBpmStale: freshCurrentBpm === null && freshSamples.length === 0,
        heartSamplesStale: !hasFreshGraph,
    };
}

export function formatSteps(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) return "--";
    if (value >= 1000) return (Math.round(value / 100) / 10).toString() + "k";
    return Math.trunc(value).toString();
}

export function formatSleepMinutes(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) return "--";
    const minutes = Math.trunc(value);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return String(hours) + "h" + (remainder < 10 ? "0" : "") + String(remainder);
}
