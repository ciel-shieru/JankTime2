import Poco from "commodetto/Poco";
import parseBMF from "commodetto/parseBMF";
import parseRLE from "commodetto/parseRLE";
import Battery from "embedded:sensor/Battery";
import {
    PREVIEW_METRICS,
    clipByWidth,
    formatCalendarRow,
    formatFocusRow,
    formatTime24,
    type MetricId,
    type SlotId,
} from "./model";
import { displayState, setBridgeRedraw } from "./bridge";
import { PREVIEW_MODE } from "./config";
import { formatSleepMinutes, formatSteps, readHealthSnapshot, type NativeHealthSnapshot } from "./health";

const render = new Poco(screen);
const paper = render.makeColor(255, 255, 255);
const black = render.makeColor(0, 0, 0);
const blue = render.makeColor(0, 170, 224);
const yellow = render.makeColor(238, 191, 24);
const red = render.makeColor(225, 32, 38);

function loadFont(size: number): PocoFont {
    const font = parseBMF(new Resource("Jersey10-Regular-" + size + ".fnt"));
    font.bitmap = parseRLE(new Resource("Jersey10-Regular-" + size + "-alpha.bm4"));
    return font;
}
const statusFont = loadFont(12);
const valueFont = loadFont(16);
const smallFont = loadFont(12);
const clockFont = loadFont(42);

let lastDate = new Date();
let watchBatteryPercent: number | null = null;

// These are visual test fixtures only; provider integrations will replace them.
const previewPhoneBatteryPercent = 83;
const previewAlarmAt = new Date();
previewAlarmAt.setHours(7, 30, 0, 0);
if (previewAlarmAt.getTime() <= Date.now()) previewAlarmAt.setDate(previewAlarmAt.getDate() + 1);
const previewBedtimeAt: Date | null = null;
const currentBpm = 72;
const heartSamples = [
    65, 67, 70, 63, 62, 64, 68, 76, 73, 68, 63, 60, 56, 58,
    62, 67, 73, 81, 77, 70, 64, 61, 58, 60, 64, 69, 74, 85,
    79, 71, 65, 62, 58, 55, 60, 66, 69, 74, 78, 71, 66, 60,
    64, 68, 74, 82, 92, 81, 73, 67, 62, 57, 54, 60, 66, 72,
];

function centered(text: string, font: PocoFont, color: unknown, cx: number, y: number): void {
    render.drawText(text, font, color, Math.floor(cx - render.getTextWidth(text, font) / 2), y);
}
function clipped(text: string, font: PocoFont, width: number): string {
    return clipByWidth(text, width, (candidate) => render.getTextWidth(candidate, font));
}
function line(x1: number, y1: number, x2: number, y2: number, color: unknown, thickness = 1): void {
    render.drawLine(x1, y1, x2, y2, color, thickness);
}
function circle(cx: number, cy: number, r: number, color: unknown): void {
    render.drawCircle(color, cx, cy, r, 0, 360);
}
function ring(cx: number, cy: number, r: number, color: unknown, inner = 2): void {
    circle(cx, cy, r, color);
    circle(cx, cy, r - inner, paper);
}
function labelDate(date: Date): string {
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return days[date.getDay()] + " " + months[date.getMonth()] + " " + date.getDate();
}
function drawAlarm(cx: number, cy: number, color: unknown): void {
    ring(cx, cy, 5, color, 1);
    line(cx, cy, cx, cy - 3, color);
    line(cx, cy, cx + 2, cy + 1, color);
    line(cx - 4, cy - 6, cx - 6, cy - 8, color);
    line(cx + 4, cy - 6, cx + 6, cy - 8, color);
    line(cx - 2, cy + 6, cx - 3, cy + 8, color);
    line(cx + 2, cy + 6, cx + 3, cy + 8, color);
}
function drawBluetooth(cx: number, cy: number, color: unknown): void {
    line(cx, cy - 7, cx, cy + 7, color, 2);
    line(cx, cy - 7, cx + 5, cy - 2, color, 2);
    line(cx + 5, cy - 2, cx - 4, cy + 4, color, 2);
    line(cx - 4, cy - 4, cx + 5, cy + 3, color, 2);
    line(cx + 5, cy + 3, cx, cy + 7, color, 2);
}
function drawBattery(x: number, y: number, width: number, percent: number | null, color: unknown): void {
    render.frameRoundRect(x, y, width - 3, 12, color, 1);
    render.drawRoundRect(x + width - 3, y + 3, 3, 6, color, 1);
    const safe = percent === null ? null : Math.max(0, Math.min(100, Math.trunc(percent)));
    centered(safe === null ? "--%" : String(safe) + "%", smallFont, black, x + Math.floor((width - 3) / 2), y + 1);
}
function drawMetricIcon(metric: MetricId, cx: number, cy: number, stale: boolean): void {
    const color = stale ? red : blue;
    switch (metric) {
        case "focusCount":
            ring(cx, cy, 8, color, 2);
            line(cx - 4, cy, cx - 1, cy + 3, color, 2);
            line(cx - 1, cy + 3, cx + 5, cy - 4, color, 2);
            break;
        case "steps":
            circle(cx - 4, cy + 3, 3, color); circle(cx + 5, cy - 4, 3, color);
            circle(cx - 7, cy - 3, 1, color); circle(cx - 5, cy - 5, 1, color);
            circle(cx + 2, cy + 1, 1, color); circle(cx + 4, cy - 8, 1, color);
            break;
        case "totalSleep":
            circle(cx, cy, 8, color); circle(cx + 4, cy - 3, 7, paper);
            circle(cx - 4, cy - 4, 1, color); circle(cx + 5, cy + 6, 1, color);
            break;
        case "restfulSleep":
            line(cx - 9, cy + 4, cx + 9, cy + 4, color, 2);
            line(cx - 8, cy - 3, cx - 8, cy + 7, color, 2);
            line(cx + 8, cy, cx + 8, cy + 7, color, 2);
            render.drawRoundRect(cx - 6, cy - 5, 6, 6, color, 1);
            render.drawRoundRect(cx + 1, cy - 5, 7, 5, color, 1);
            break;
        case "fanState":
            render.drawRoundRect(cx - 3, cy - 9, 6, 8, color, 2);
            render.drawRoundRect(cx + 1, cy - 2, 8, 5, color, 2);
            render.drawRoundRect(cx - 3, cy + 1, 6, 8, color, 2);
            render.drawRoundRect(cx - 9, cy - 2, 8, 5, color, 2);
            circle(cx, cy, 2, color);
            break;
        case "cpuUsage":
            render.drawRoundRect(cx - 6, cy - 6, 12, 12, color, 1);
            render.fillRectangle(paper, cx - 3, cy - 3, 6, 6);
            for (let i = -1; i <= 1; i++) {
                line(cx + i * 4, cy - 9, cx + i * 4, cy - 6, color);
                line(cx + i * 4, cy + 6, cx + i * 4, cy + 9, color);
                line(cx - 9, cy + i * 4, cx - 6, cy + i * 4, color);
                line(cx + 6, cy + i * 4, cx + 9, cy + i * 4, color);
            }
            break;
        case "memoryUsage":
            render.frameRoundRect(cx - 9, cy - 5, 18, 10, color, 1);
            render.fillRectangle(color, cx - 6, cy - 2, 3, 4);
            render.fillRectangle(color, cx - 1, cy - 2, 3, 4);
            render.fillRectangle(color, cx + 4, cy - 2, 3, 4);
            line(cx - 7, cy + 5, cx - 7, cy + 8, color);
            line(cx - 2, cy + 5, cx - 2, cy + 8, color);
            line(cx + 3, cy + 5, cx + 3, cy + 8, color);
            line(cx + 7, cy + 5, cx + 7, cy + 8, color);
            break;
        case "weatherFeelsLike":
            drawWeatherCondition(cx, cy, color, displayState.weatherCondition);
            break;
        case "rainChance":
            drawWeatherCondition(cx, cy, color, displayState.weatherCondition);
            line(cx - 4, cy + 7, cx - 6, cy + 10, color, 2);
            line(cx + 3, cy + 7, cx + 1, cy + 10, color, 2);
            line(cx + 8, cy + 7, cx + 6, cy + 10, color, 2);
            break;
        case "alertCount":
            line(cx - 7, cy + 5, cx - 5, cy + 2, color, 2);
            line(cx - 5, cy + 2, cx - 4, cy - 5, color, 2);
            line(cx - 4, cy - 5, cx, cy - 8, color, 2);
            line(cx, cy - 8, cx + 4, cy - 5, color, 2);
            line(cx + 4, cy - 5, cx + 5, cy + 2, color, 2);
            line(cx + 5, cy + 2, cx + 7, cy + 5, color, 2);
            line(cx - 7, cy + 5, cx + 7, cy + 5, color, 2);
            circle(cx, cy + 7, 2, color); circle(cx, cy - 10, 1, color);
            break;
        case "water":
            line(cx, cy - 9, cx - 6, cy + 1, color, 2);
            line(cx - 6, cy + 1, cx - 6, cy + 4, color, 2);
            line(cx - 6, cy + 4, cx - 3, cy + 8, color, 2);
            line(cx - 3, cy + 8, cx + 3, cy + 8, color, 2);
            line(cx + 3, cy + 8, cx + 6, cy + 4, color, 2);
            line(cx + 6, cy + 4, cx + 6, cy + 1, color, 2);
            line(cx + 6, cy + 1, cx, cy - 9, color, 2);
            break;
        case "haSensor":
        case "haClimateValue":
            ring(cx, cy, 7, color, 2);
            line(cx, cy, cx + 4, cy - 3, color, 2);
            circle(cx, cy, 2, color);
            break;
        case "none":
            break;
    }
}
let nativeHealth: NativeHealthSnapshot = {
    steps: null,
    totalSleepMinutes: null,
    restfulSleepMinutes: null,
    currentBpm: null,
    heartSamples: [],
    stepsStale: true,
    totalSleepStale: true,
    restfulSleepStale: true,
    currentBpmStale: true,
    heartSamplesStale: true,
};
let lastHealthMinute = -1;

function refreshHealthForMinute(date: Date): void {
    if (PREVIEW_MODE) return;
    const key = Math.floor(date.getTime() / 60000);
    if (key === lastHealthMinute) return;
    lastHealthMinute = key;
    nativeHealth = readHealthSnapshot();
}

function nativeHealthMetric(metric: MetricId): { value: string; stale: boolean } | null {
    if (PREVIEW_MODE) return null;
    switch (metric) {
        case "steps": return { value: formatSteps(nativeHealth.steps), stale: nativeHealth.stepsStale };
        case "totalSleep": return { value: formatSleepMinutes(nativeHealth.totalSleepMinutes), stale: nativeHealth.totalSleepStale };
        case "restfulSleep": return { value: formatSleepMinutes(nativeHealth.restfulSleepMinutes), stale: nativeHealth.restfulSleepStale };
        default: return null;
    }
}

function drawMetric(slot: SlotId, cx: number, iconY: number, valueY: number, maxWidth: number): void {
    const metric = displayState.slotConfiguration[slot];
    if (metric === "none") return;
    const item = PREVIEW_METRICS[metric];
    const nativeValue = nativeHealthMetric(metric);
    const value = nativeValue?.value ?? displayState.metricValues[metric] ?? (PREVIEW_MODE ? item.value : "--");
    const stale = nativeValue?.stale ?? displayState.staleMetrics[metric] ?? (PREVIEW_MODE ? item.stale : true);
    drawMetricIcon(metric, cx, iconY, stale);
    centered(clipped(value, valueFont, maxWidth), valueFont, black, cx, valueY);
}
function drawPlanet(): void {
    const rows = displayState.imageRows;
    if (rows !== null && rows.length === 30 && rows.every((row) => /^[01]{30}$/.test(row))) {
        for (let y = 0; y < 30; y++) {
            const row = rows[y] ?? "";
            for (let x = 0; x < 30; x++) {
                if (row[x] === "1") render.fillRectangle(black, 85 + x, 58 + y, 1, 1);
            }
        }
        return;
    }

    render.frameRoundRect(85, 58, 30, 30, blue, 1);
    if (!PREVIEW_MODE) return;
    circle(92, 66, 1, blue); circle(109, 64, 1, blue);
    circle(110, 81, 1, blue); circle(92, 83, 1, blue);
    circle(100, 73, 7, blue);
    line(88, 80, 95, 74, blue, 2);
    line(104, 71, 112, 65, blue, 2);
    line(90, 71, 98, 76, paper, 2);
    line(98, 68, 103, 73, paper, 2);
    line(101, 71, 106, 76, paper, 2);
}

function drawWeatherCondition(cx: number, cy: number, color: unknown, condition: string | null): void {
    const value = (condition ?? "").toLowerCase();
    const unknown = value === "" || value === "unknown" || value === "unavailable" || value === "none";
    if (unknown) {
        render.drawText("?", smallFont, color, cx - 3, cy - 7);
        return;
    }
    const clearNight = value === "clear-night";
    const sunny = value === "sunny" || (value === "clear" && !clearNight);
    const partlyCloudy = value === "partlycloudy" || value === "partly-cloudy";
    const cloudy = partlyCloudy || value.includes("cloud") || value.includes("overcast");
    const rainy = value.includes("rain") || value.includes("pour");
    const snowy = value.includes("snow") || value.includes("hail");
    const foggy = value.includes("fog") || value.includes("mist");
    const stormy = value.includes("lightning") || value.includes("thunder");
    const windy = value.includes("windy");
    if (sunny || clearNight || partlyCloudy) {
        circle(cx - 3, cy - 4, 4, color);
        line(cx - 3, cy - 11, cx - 3, cy - 9, color);
        line(cx - 10, cy - 4, cx - 8, cy - 4, color);
        line(cx + 2, cy - 9, cx + 3, cy - 8, color);
        if (clearNight) {
            circle(cx - 1, cy - 4, 3, black);
            circle(cx + 1, cy - 5, 3, paper);
        }
    }
    if (cloudy || rainy || snowy || foggy || stormy || windy) {
        circle(cx + 1, cy + 1, 5, black);
        circle(cx + 7, cy, 4, black);
        render.drawRoundRect(cx - 4, cy, 15, 6, black, 2);
        circle(cx + 1, cy + 1, 3, paper);
        circle(cx + 7, cy, 2, paper);
        render.drawRoundRect(cx - 2, cy + 1, 10, 4, paper, 1);
    }
    if (rainy) {
        line(cx - 3, cy + 7, cx - 5, cy + 10, color, 2);
        line(cx + 3, cy + 7, cx + 1, cy + 10, color, 2);
        line(cx + 8, cy + 7, cx + 6, cy + 10, color, 2);
    } else if (snowy) {
        line(cx - 3, cy + 7, cx - 3, cy + 10, color, 1);
        line(cx - 5, cy + 8, cx - 1, cy + 8, color, 1);
        line(cx + 5, cy + 7, cx + 5, cy + 10, color, 1);
        line(cx + 3, cy + 8, cx + 7, cy + 8, color, 1);
    } else if (foggy) {
        line(cx - 6, cy + 7, cx + 8, cy + 7, color, 1);
        line(cx - 5, cy + 10, cx + 7, cy + 10, color, 1);
    } else if (stormy) {
        line(cx + 2, cy + 5, cx - 1, cy + 9, yellow, 2);
        line(cx - 1, cy + 9, cx + 2, cy + 9, yellow, 2);
        line(cx + 2, cy + 9, cx, cy + 12, yellow, 2);
    } else if (windy) {
        line(cx - 5, cy + 7, cx + 8, cy + 7, color, 1);
        line(cx - 3, cy + 10, cx + 5, cy + 10, color, 1);
    }
}

function drawHeartRate(): void {
    const samples = PREVIEW_MODE ? (displayState.heartSamples ?? heartSamples) : nativeHealth.heartSamples;
    const bpm = PREVIEW_MODE ? (displayState.currentBpm ?? currentBpm) : nativeHealth.currentBpm;
    const heartFresh = PREVIEW_MODE || !nativeHealth.currentBpmStale;
    const graphFresh = PREVIEW_MODE || !nativeHealth.heartSamplesStale;
    const heartColor = heartFresh ? blue : red;
    circle(8, 140, 4, heartColor); circle(14, 140, 4, heartColor);
    line(4, 141, 11, 149, heartColor, 2); line(18, 141, 11, 149, heartColor, 2);
    render.drawText(bpm === null ? "--" : String(bpm), valueFont, black, 22, 137);

    if (samples.length >= 2) {
        let minimum = samples[0] ?? 0;
        let maximum = minimum;
        for (const sample of samples) {
            minimum = Math.min(minimum, sample);
            maximum = Math.max(maximum, sample);
        }
        const left = 39, right = 159, top = 136, bottom = 147;
        const span = Math.max(1, maximum - minimum);
        let px = left;
        let py = bottom - Math.round(((samples[0] ?? minimum) - minimum) * (bottom - top) / span);
        for (let i = 1; i < samples.length; i++) {
            const sample = samples[i] ?? minimum;
            const x = left + Math.round(i * (right - left) / (samples.length - 1));
            const y = bottom - Math.round((sample - minimum) * (bottom - top) / span);
            line(px, py, x, y, graphFresh ? blue : red);
            px = x; py = y;
        }
        centered(String(minimum) + "/" + String(maximum), smallFont, black, 179, 138);
    } else {
        centered("--/--", smallFont, black, 179, 138);
    }
}
function drawRows(): void {
    const focus = [
        displayState.focusRows[0] ?? (PREVIEW_MODE ? formatFocusRow("09:30", "17:00", 2, "Submit lab report") : ""),
        displayState.focusRows[1] ?? (PREVIEW_MODE ? formatFocusRow("13:00", "18:30", 1, "Review cluster alerts") : ""),
    ];
    const events = [
        displayState.calendarRows[0] ?? (PREVIEW_MODE ? formatCalendarRow("10:00", "Campus", "Systems lab") : ""),
        displayState.calendarRows[1] ?? (PREVIEW_MODE ? formatCalendarRow("15:30", "Home", "Model eval run") : ""),
    ];
    line(5, 153, 195, 153, black);
    render.drawText(clipped(focus[0] ?? "", smallFont, 190), smallFont, black, 6, 159);
    render.drawText(clipped(focus[1] ?? "", smallFont, 190), smallFont, black, 6, 174);
    line(5, 188, 195, 188, black);
    render.drawText(clipped(events[0] ?? "", smallFont, 190), smallFont, black, 6, 196);
    render.drawText(clipped(events[1] ?? "", smallFont, 190), smallFont, black, 6, 210);
}
function drawStatus(date: Date): void {
    render.drawText(labelDate(date), statusFont, black, 5, 3);
    const previewAlarm = PREVIEW_MODE ? formatTime24(previewAlarmAt) : null;
    const alarmTime = displayState.alarmTime ?? previewAlarm;
    const bedtime = displayState.alarmTime !== null
        ? displayState.alarmIsBedtime
        : PREVIEW_MODE && previewBedtimeAt !== null && previewBedtimeAt.getTime() < previewAlarmAt.getTime();
    if (bedtime) {
        circle(62, 9, 6, blue);
        circle(65, 6, 5, paper);
    } else {
        drawAlarm(62, 9, alarmTime === null ? red : black);
    }
    render.drawText(alarmTime ?? "--:--", statusFont, black, 71, 3);
    const phoneBluetoothConnected = displayState.phoneBluetoothConnected;
    const bluetoothConnected = watch.connected.app && phoneBluetoothConnected === true;
    drawBluetooth(111, 10, bluetoothConnected ? blue : red);
    drawBattery(126, 4, 32, displayState.phoneBatteryPercent ?? (PREVIEW_MODE ? previewPhoneBatteryPercent : null), yellow);
    drawBattery(163, 4, 34, watchBatteryPercent, blue);
    line(5, 20, 195, 20, black);
}
function draw(event?: AlloyWatchMinuteEvent): void {
    lastDate = event?.date ?? lastDate;
    refreshHealthForMinute(lastDate);
    render.begin();
    render.fillRectangle(paper, 0, 0, render.width, render.height);
    drawStatus(lastDate);

    const rowOne = [
        ["grid.top.1", 20], ["grid.top.2", 60], ["grid.top.3", 100],
        ["grid.top.4", 140], ["grid.top.5", 180],
    ] as const;
    for (const [slot, x] of rowOne) drawMetric(slot, x, 34, 44, 36);

    drawMetric("grid.bottom.1", 20, 68, 80, 36);
    drawMetric("grid.bottom.2", 60, 68, 80, 36);
    drawPlanet();
    drawMetric("grid.bottom.4", 140, 68, 80, 36);
    drawMetric("grid.bottom.5", 180, 68, 80, 36);

    centered(formatTime24(lastDate), clockFont, black, 100, 87);
    drawMetric("clock.left", 20, 107, 119, 36);
    drawMetric("clock.right", 180, 107, 119, 36);
    drawHeartRate();
    drawRows();
    render.end();
}

const battery = new Battery({
    onSample() {
        try {
            watchBatteryPercent = Math.max(0, Math.min(100, Math.trunc(this.sample().percent)));
            draw();
        } catch {
            // Preserve the last sample if the sensor briefly fails.
        }
    },
});
try {
    watchBatteryPercent = Math.max(0, Math.min(100, Math.trunc(battery.sample().percent)));
} catch {
    watchBatteryPercent = 0;
}

setBridgeRedraw(() => draw());
watch.addEventListener("minutechange", draw);
watch.addEventListener("connected", () => draw());
watch.addEventListener("resize", () => draw());
