import Poco from "commodetto/Poco";
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
import { displayState, setBridgeLowPowerMode, setBridgeRedraw } from "./bridge";
import { PREVIEW_MODE } from "./config";
import { MDI_ICON_MASKS, type MdiIconName } from "./mdi-icons";
import { formatSleepMinutes, formatSteps, readHealthSnapshot, type NativeHealthSnapshot } from "./health";

const render = new Poco(screen);
const paper = render.makeColor(255, 255, 255);
const black = render.makeColor(0, 0, 0);
const blue = render.makeColor(0, 170, 224);
const yellow = render.makeColor(238, 191, 24);
const red = render.makeColor(225, 32, 38);

function systemFont(size: 9 | 14 | 18 | 24 | 28 | 36, bold = false): PocoFont {
    return new render.Font(bold ? "Gothic-Bold" : "Gothic-Regular", size);
}
const statusFont = systemFont(14);
const valueFont = systemFont(14, true);
const smallFont = systemFont(9);
const clockFont = new render.Font("Leco-Bold", 36);

let lastDate = new Date();
let watchBatteryPercent: number | null = null;
let lowPowerMode = false;

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

function centered(text: string, font: PocoFont, color: unknown, cx: number, baselineY: number): void {
    render.drawText(text, font, color, Math.floor(cx - render.getTextWidth(text, font) / 2), baselineY - font.height);
}
function centeredAtY(text: string, font: PocoFont, color: unknown, cx: number, centerY: number): void {
    render.drawText(text, font, color, Math.floor(cx - render.getTextWidth(text, font) / 2), Math.floor(centerY - font.height / 2));
}
function drawTextCenteredAtY(text: string, font: PocoFont, color: unknown, x: number, centerY: number): void {
    render.drawText(text, font, color, x, Math.floor(centerY - font.height / 2));
}
function drawBaseline(text: string, font: PocoFont, color: unknown, x: number, baselineY: number): void {
    render.drawText(text, font, color, x, baselineY - font.height);
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
function labelDate(date: Date): string {
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return days[date.getDay()] + " " + months[date.getMonth()] + " " + date.getDate();
}
function drawMdiGlyph(
    cx: number,
    cy: number,
    color: unknown,
    name: MdiIconName,
    width = 16,
    height = 16,
): void {
    const mask = MDI_ICON_MASKS[name];
    if (mask === undefined || mask.length !== 64 || width < 1 || height < 1) return;
    const left = Math.floor(cx - width / 2);
    const top = Math.floor(cy - height / 2);
    for (let dy = 0; dy < height; dy++) {
        const sourceY = Math.min(15, Math.floor(dy * 16 / height));
        const rowMask = Number.parseInt(mask.slice(sourceY * 4, sourceY * 4 + 4), 16);
        let dx = 0;
        while (dx < width) {
            const sourceX = Math.min(15, Math.floor(dx * 16 / width));
            if (((rowMask >> sourceX) & 1) === 0) {
                dx++;
                continue;
            }
            const start = dx;
            while (dx < width) {
                const currentSourceX = Math.min(15, Math.floor(dx * 16 / width));
                if (((rowMask >> currentSourceX) & 1) === 0) break;
                dx++;
            }
            render.fillRectangle(color, left + start, top + dy, dx - start, 1);
        }
    }
}

function weatherIcon(condition: string | null): MdiIconName {
    const value = (condition ?? "").toLowerCase();
    if (value === "" || value === "unknown" || value === "unavailable" || value === "none") return "help-circle-outline";
    if (value.includes("lightning") || value.includes("thunder")) return "weather-lightning";
    if (value.includes("snow") || value.includes("hail")) return "weather-snowy";
    if (value.includes("rain") || value.includes("pour")) return "weather-rainy";
    if (value.includes("fog") || value.includes("mist")) return "weather-fog";
    if (value.includes("wind")) return "weather-windy";
    if (value === "clear-night" || value === "night") return "weather-night";
    if (value === "sunny" || value === "clear") return "weather-sunny";
    if (value.includes("partlycloudy") || value.includes("partly-cloudy")) return "weather-partly-cloudy";
    if (value.includes("cloud") || value.includes("overcast")) return "weather-cloudy";
    return "help-circle-outline";
}

function drawAlarm(cx: number, cy: number, color: unknown): void {
    drawMdiGlyph(cx, cy, color, "alarm", 10, 10);
}
function drawBluetooth(cx: number, cy: number, color: unknown): void {
    drawMdiGlyph(cx, cy, color, "bluetooth", 8 * 1.25, 10 * 1.25);
}
function drawBattery(cx: number, cy: number, width: number, height: number, percent: number | null, color: unknown): void {
    drawMdiGlyph(cx, cy, color, "battery-outline", width, height);
    const safe = percent === null ? null : Math.max(0, Math.min(100, Math.trunc(percent)));
    centeredAtY(safe === null ? "--" : String(safe), statusFont, black, cx, cy);
}
function drawMetricIcon(metric: MetricId, cx: number, cy: number, stale: boolean): void {
    const color = stale ? red : blue;
    let icon: MdiIconName;
    switch (metric) {
        case "focusCount": icon = "check-circle-outline"; break;
        case "steps": icon = "shoe-print"; break;
        case "totalSleep": icon = "moon-waning-crescent"; break;
        case "restfulSleep": icon = "bed-outline"; break;
        case "fanState": icon = "fan"; break;
        case "cpuUsage": icon = "cpu-64-bit"; break;
        case "memoryUsage": icon = "memory"; break;
        case "weatherFeelsLike": icon = weatherIcon(PREVIEW_MODE ? (displayState.weatherCondition ?? "partlycloudy") : displayState.weatherCondition); break;
        case "rainChance": icon = "weather-rainy"; break;
        case "alertCount": icon = "bell-alert-outline"; break;
        case "water": icon = "water-percent"; break;
        case "haSensor": icon = "gauge"; break;
        case "haClimateValue": icon = "thermometer"; break;
        case "none": return;
        default: icon = "help-circle-outline"; break;
    }
    drawMdiGlyph(cx, cy, color, icon, 16, 16);
}

let nativeHealth: NativeHealthSnapshot = {
    steps: null,
    totalSleepMinutes: null,
    restfulSleepMinutes: null,
    currentBpm: null,
    heartSamples: [],
    // Start conservatively: use normal mode until HealthService returns
    // an accessible, current activity state.
    isSleeping: false,
    sleepStateStale: true,
    stepsStale: true,
    totalSleepStale: true,
    restfulSleepStale: true,
    currentBpmStale: true,
    heartSamplesStale: true,
};
let lastHealthMinute = -1;
let lastHealthHistoryMinutes = -1;

function refreshHealthForMinute(date: Date): void {
    if (PREVIEW_MODE) return;
    const key = Math.floor(date.getTime() / 60000);
    const historyMinutes = displayState.heartRateHistoryMinutes;
    if (key === lastHealthMinute && historyMinutes === lastHealthHistoryMinutes) return;
    lastHealthMinute = key;
    lastHealthHistoryMinutes = historyMinutes;
    nativeHealth = readHealthSnapshot(historyMinutes);
    // Unknown/unavailable activity state fails open to the normal watchface.
    const nextLowPowerMode = !nativeHealth.sleepStateStale && nativeHealth.isSleeping;
    if (nextLowPowerMode !== lowPowerMode) {
        lowPowerMode = nextLowPowerMode;
        setBridgeLowPowerMode(lowPowerMode);
    }
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

function drawLocalSleepMetric(
    metric: "totalSleep" | "restfulSleep",
    cx: number,
    iconY: number,
    valueY: number,
    maxWidth: number,
): void {
    const localReading = nativeHealthMetric(metric);
    drawMetricIcon(metric, cx, iconY, localReading?.stale ?? true);
    centered(clipped(localReading?.value ?? "--", valueFont, maxWidth), valueFont, black, cx, valueY);
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
    const planetTop = 62;
    const rows = displayState.imageRows;
    if (rows !== null && rows.length === 30 && rows.every((row) => /^[01]{30}$/.test(row)) && rows.some((row) => row.includes("1"))) {
        for (let y = 0; y < 30; y++) {
            const row = rows[y] ?? "";
            for (let x = 0; x < 30; x++) {
                if (row[x] === "1") render.fillRectangle(black, 85 + x, planetTop + y, 1, 1);
            }
        }
        return;
    }

    render.frameRoundRect(85, planetTop, 30, 30, blue, 1);
    if (!PREVIEW_MODE) return;
    circle(92, planetTop + 8, 1, blue); circle(109, planetTop + 6, 1, blue);
    circle(110, planetTop + 23, 1, blue); circle(92, planetTop + 25, 1, blue);
    circle(100, planetTop + 15, 7, blue);
    line(88, planetTop + 22, 95, planetTop + 16, blue, 2);
    line(104, planetTop + 13, 112, planetTop + 7, blue, 2);
    line(90, planetTop + 13, 98, planetTop + 18, paper, 2);
    line(98, planetTop + 10, 103, planetTop + 15, paper, 2);
    line(101, planetTop + 13, 106, planetTop + 18, paper, 2);
}

function drawHeartRate(): void {
    const samples = PREVIEW_MODE ? (displayState.heartSamples ?? heartSamples) : nativeHealth.heartSamples;
    const bpm = PREVIEW_MODE ? (displayState.currentBpm ?? currentBpm) : nativeHealth.currentBpm;
    const heartFresh = PREVIEW_MODE || !nativeHealth.currentBpmStale;
    const graphFresh = PREVIEW_MODE || !nativeHealth.heartSamplesStale;
    const heartColor = heartFresh ? blue : red;
    drawMdiGlyph(11, 141, heartColor, "heart", 14, 14);
    drawBaseline(bpm === null ? "--" : String(bpm), valueFont, black, 22, 149);

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
        drawBaseline(String(minimum) + "/" + String(maximum), smallFont, black, 168, 147);
    } else {
        drawBaseline("--/--", smallFont, black, 168, 147);
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
    drawBaseline(clipped(focus[0] ?? "", statusFont, 190), statusFont, black, 6, 169);
    drawBaseline(clipped(focus[1] ?? "", statusFont, 190), statusFont, black, 6, 184);
    line(5, 188, 195, 188, black);
    drawBaseline(clipped(events[0] ?? "", statusFont, 190), statusFont, black, 6, 207);
    drawBaseline(clipped(events[1] ?? "", statusFont, 190), statusFont, black, 6, 221);
}
function drawStatus(date: Date, sleeping: boolean): void {
    const statusCenterY = 10;
    const dateText = labelDate(date);
    centeredAtY(dateText, statusFont, black, 5 + render.getTextWidth(dateText, statusFont) / 2, statusCenterY);

    // Size the watch battery outline for its numeric value in either mode.
    const batteryTextWidth = render.getTextWidth("100", statusFont);
    const batteryWidth = Math.ceil((batteryTextWidth + 2) * 16 / 8);
    const batteryHeight = Math.ceil((statusFont.height + 2) * 16 / 6);
    const rightBatteryCx = Math.floor(render.width - 1 - batteryWidth * 7 / 16);
    if (sleeping) {
        // Retain only watch-local status: date and watch battery.
        drawBattery(rightBatteryCx, statusCenterY, batteryWidth, batteryHeight, watchBatteryPercent, blue);
        line(5, 20, render.width - 5, 20, black);
        return;
    }

    const previewAlarm = PREVIEW_MODE ? formatTime24(previewAlarmAt) : null;
    const alarmTime = displayState.alarmTime ?? previewAlarm ?? "--:--";
    const bedtime = displayState.alarmTime !== null
        ? displayState.alarmIsBedtime
        : PREVIEW_MODE && previewBedtimeAt !== null && previewBedtimeAt.getTime() < previewAlarmAt.getTime();

    const leftBatteryCx = rightBatteryCx - batteryWidth - 2;
    const bluetoothCenterX = Math.floor(leftBatteryCx - batteryWidth * 7 / 16 - 4);
    const alarmCenterX = bluetoothCenterX - 7;
    const timeRight = alarmCenterX - 6;
    const timeLeft = timeRight - render.getTextWidth(alarmTime, statusFont);
    const alarmStale = alarmTime === "--:--" || displayState.alarmStale;
    const alarmColor = alarmStale ? red : black;

    if (bedtime) drawMdiGlyph(alarmCenterX, statusCenterY, alarmStale ? red : blue, "moon-waning-crescent", 10, 10);
    else drawAlarm(alarmCenterX, statusCenterY, alarmColor);
    drawTextCenteredAtY(alarmTime, statusFont, black, timeLeft, statusCenterY);

    // Right-justify the batteries, Bluetooth, alarm and time as a compact status cluster.
    drawBluetooth(bluetoothCenterX, statusCenterY, watch.connected.app ? blue : red);
    drawBattery(leftBatteryCx, statusCenterY, batteryWidth, batteryHeight,
        displayState.phoneBatteryPercent ?? (PREVIEW_MODE ? previewPhoneBatteryPercent : null), yellow);
    drawBattery(rightBatteryCx, statusCenterY, batteryWidth, batteryHeight, watchBatteryPercent, blue);
    line(5, 20, render.width - 5, 20, black);
}
function draw(event?: AlloyWatchMinuteEvent): void {
    lastDate = event?.date ?? lastDate;
    refreshHealthForMinute(lastDate);
    render.begin();
    render.fillRectangle(paper, 0, 0, render.width, render.height);
    drawStatus(lastDate, lowPowerMode);

    if (lowPowerMode) {
        centered(formatTime24(lastDate), clockFont, black, 100, 135);
        drawLocalSleepMetric("totalSleep", 20, 108, 134, 36);
        drawLocalSleepMetric("restfulSleep", 180, 108, 134, 36);
        drawHeartRate();
        render.end();
        return;
    }

    const rowOne = [
        ["grid.top.1", 20], ["grid.top.2", 60], ["grid.top.3", 100],
        ["grid.top.4", 140], ["grid.top.5", 180],
    ] as const;
    for (const [slot, x] of rowOne) drawMetric(slot, x, 34, 58, 36);

    drawMetric("grid.bottom.1", 20, 72, 98, 36);
    drawMetric("grid.bottom.2", 60, 72, 98, 36);
    drawPlanet();
    drawMetric("grid.bottom.4", 140, 72, 98, 36);
    drawMetric("grid.bottom.5", 180, 72, 98, 36);

    centered(formatTime24(lastDate), clockFont, black, 100, 135);
    drawMetric("clock.left", 20, 108, 134, 36);
    drawMetric("clock.right", 180, 108, 134, 36);
    drawHeartRate();
    drawRows();
    render.end();
}

const battery = new Battery({
    onSample() {
        try {
            const nextPercent = Math.max(0, Math.min(100, Math.trunc(this.sample().percent)));
            if (nextPercent !== watchBatteryPercent) {
                watchBatteryPercent = nextPercent;
                draw();
            }
        } catch {
            // Preserve the last sample if the sensor briefly fails.
        }
    },
});
try {
    watchBatteryPercent = Math.max(0, Math.min(100, Math.trunc(battery.sample().percent)));
} catch {
    watchBatteryPercent = null;
}

setBridgeRedraw(() => draw());
watch.addEventListener("minutechange", draw);
watch.addEventListener("connected", () => { if (!lowPowerMode) draw(); });
watch.addEventListener("resize", () => { if (!lowPowerMode) draw(); });
