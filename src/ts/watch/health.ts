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
}

const MAX_SAMPLES = 16;

function readMetric(id: number): number | null {
    const value = Natives.health_metric(id);
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

export function readHealthSnapshot(): NativeHealthSnapshot {
    try {
        Natives.health_refresh();
        const count = Math.max(0, Math.min(MAX_SAMPLES, Math.trunc(Natives.health_sample_count())));
        const samples: number[] = [];
        for (let i = 0; i < count; i++) {
            const value = Math.trunc(Natives.health_sample(i));
            if (value >= 20 && value <= 240) samples.push(value);
        }
        return {
            steps: readMetric(0),
            totalSleepMinutes: readMetric(1),
            restfulSleepMinutes: readMetric(2),
            currentBpm: readMetric(3),
            heartSamples: samples,
        };
    } catch {
        return { steps: null, totalSleepMinutes: null, restfulSleepMinutes: null, currentBpm: null, heartSamples: [] };
    }
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
