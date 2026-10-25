import Poco from "commodetto/Poco";
import parseBMF from "commodetto/parseBMF";
import parseRLE from "commodetto/parseRLE";
import Battery from "embedded:sensor/Battery";
import {
    DEFAULT_SLOT_CONFIGURATION,
    PREVIEW_METRICS,
    clipByWidth,
    formatCalendarRow,
    formatFocusRow,
    formatTime24,
    type MetricId,
    type SlotId,
} from "./model";
import { displayState, setBridgeRedraw } from "./bridge";

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
const clockFont = loadFont(56);

let lastDate = new Date();
let watchBatteryPercent = 0;
const slotConfiguration = { ...DEFAULT_SLOT_CONFIGURATION };

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
function drawBattery(x: number, y: number, width: number, percent: number, color: unknown): void {
    render.frameRoundRect(x, y, width - 3, 12, color, 1);
    render.drawRoundRect(x + width - 3, y + 3, 3, 6, color, 1);
    const safe = Math.max(0, Math.min(100, Math.trunc(percent)));
    centered(String(safe) + "%", smallFont, black, x + Math.floor((width - 3) / 2), y + 1);
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
        case "rainChance":
            circle(cx - 3, cy - 4, 4, color);
            line(cx - 3, cy - 11, cx - 3, cy - 9, color);
            line(cx - 10, cy - 4, cx - 8, cy - 4, color);
            circle(cx + 3, cy + 2, 5, black); circle(cx + 8, cy + 1, 4, black);
            render.drawRoundRect(cx - 2, cy + 1, 14, 5, black, 2);
            circle(cx + 3, cy + 2, 3, paper); circle(cx + 8, cy + 1, 2, paper);
            render.drawRoundRect(cx, cy + 2, 10, 3, paper, 1);
            if (metric === "rainChance") {
                line(cx - 4, cy + 7, cx - 6, cy + 10, color, 2);
                line(cx + 3, cy + 7, cx + 1, cy + 10, color, 2);
            }
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
function drawMetric(slot: SlotId, cx: number, iconY: number, valueY: number, maxWidth: number): void {
    const metric = displayState.slotConfiguration[slot];
    if (metric === "none") return;
    const item = PREVIEW_METRICS[metric];
    const value = displayState.metricValues[metric] ?? item.value;
    const stale = displayState.staleMetrics[metric] ?? item.stale;
    drawMetricIcon(metric, cx, iconY, stale);
    centered(clipped(value, valueFont, maxWidth), valueFont, black, cx, valueY);
}
function drawPlanet(): void {
    render.frameRoundRect(85, 56, 30, 30, blue, 1);
    circle(92, 64, 1, blue); circle(109, 62, 1, blue);
    circle(110, 79, 1, blue); circle(92, 81, 1, blue);
    circle(100, 71, 7, blue);
    line(88, 78, 95, 72, blue, 2);
    line(104, 69, 112, 63, blue, 2);
    line(90, 69, 98, 74, paper, 2);
    line(98, 66, 103, 71, paper, 2);
    line(101, 69, 106, 74, paper, 2);
}
function drawHeartRate(): void {
    const samples = displayState.heartSamples ?? heartSamples;
    const bpm = displayState.currentBpm ?? currentBpm;
    let minimum = samples[0] ?? bpm;
    let maximum = minimum;
    for (const sample of samples) {
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
    }
    circle(8, 135, 4, blue); circle(14, 135, 4, blue);
    line(4, 136, 11, 144, blue, 2); line(18, 136, 11, 144, blue, 2);
    render.drawText(String(bpm), valueFont, black, 22, 128);
    const left = 39, right = 159, top = 130, bottom = 143;
    const span = Math.max(1, maximum - minimum);
    let px = left;
    let py = bottom - Math.round(((samples[0] ?? minimum) - minimum) * (bottom - top) / span);
    for (let i = 1; i < samples.length; i++) {
        const value = samples[i] ?? minimum;
        const x = left + Math.round(i * (right - left) / (samples.length - 1));
        const y = bottom - Math.round((value - minimum) * (bottom - top) / span);
        line(px, py, x, y, blue);
        px = x; py = y;
    }
    centered(String(minimum) + "/" + String(maximum), smallFont, black, 179, 132);
}
function drawRows(): void {
    const focus = [
        displayState.focusRows[0] ?? formatFocusRow("09:30", "17:00", 2, "Submit lab report"),
        displayState.focusRows[1] ?? formatFocusRow("13:00", "18:30", 1, "Review cluster alerts"),
    ];
    const events = [
        displayState.calendarRows[0] ?? formatCalendarRow("10:00", "Campus", "Systems lab"),
        displayState.calendarRows[1] ?? formatCalendarRow("15:30", "Home", "Model eval run"),
    ];
    line(5, 147, 195, 147, black);
    render.drawText(clipped(focus[0] ?? "", smallFont, 190), smallFont, black, 6, 152);
    render.drawText(clipped(focus[1] ?? "", smallFont, 190), smallFont, black, 6, 166);
    line(5, 180, 195, 180, black);
    render.drawText(clipped(events[0] ?? "", smallFont, 190), smallFont, black, 6, 186);
    render.drawText(clipped(events[1] ?? "", smallFont, 190), smallFont, black, 6, 200);
}
function drawStatus(date: Date): void {
    render.drawText(labelDate(date), statusFont, black, 5, 3);
    const selected = displayState.alarmTime === null
        ? null
        : { time: displayState.alarmTime, isBedtime: displayState.alarmIsBedtime };
    const isBedtime = selected?.isBedtime ?? (
        previewBedtimeAt !== null && previewBedtimeAt.getTime() < previewAlarmAt.getTime()
    );
    if (isBedtime) {
        circle(62, 9, 6, blue);
        circle(65, 6, 5, paper);
    } else {
        drawAlarm(62, 9, black);
    }
    render.drawText(selected?.time ?? formatTime24(previewAlarmAt), statusFont, black, 71, 3);
    const phoneBluetoothConnected = displayState.phoneBluetoothConnected;
    const bluetoothConnected = watch.connected.app && phoneBluetoothConnected === true;
    drawBluetooth(111, 10, bluetoothConnected ? blue : red);
    drawBattery(126, 4, 32, displayState.phoneBatteryPercent ?? previewPhoneBatteryPercent, yellow);
    drawBattery(163, 4, 34, watchBatteryPercent, blue);
    line(5, 20, 195, 20, black);
}
function draw(event?: AlloyWatchMinuteEvent): void {
    lastDate = event?.date ?? lastDate;
    render.begin();
    render.fillRectangle(paper, 0, 0, render.width, render.height);
    drawStatus(lastDate);

    const rowOne = [
        ["grid.top.1", 20], ["grid.top.2", 60], ["grid.top.3", 100],
        ["grid.top.4", 140], ["grid.top.5", 180],
    ] as const;
    for (const [slot, x] of rowOne) drawMetric(slot, x, 31, 40, 36);

    drawMetric("grid.bottom.1", 20, 65, 76, 36);
    drawMetric("grid.bottom.2", 60, 65, 76, 36);
    drawPlanet();
    drawMetric("grid.bottom.4", 140, 65, 76, 36);
    drawMetric("grid.bottom.5", 180, 65, 76, 36);

    centered(formatTime24(lastDate), clockFont, black, 100, 91);
    drawMetric("clock.left", 20, 101, 113, 36);
    drawMetric("clock.right", 180, 101, 113, 36);
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
