/**
 * Temporary scaffold-only screen. This is not the approved JankTime2 layout.
 * Replace it during the implementation phase after reviewing the pinned skill.
 */
import Poco from "commodetto/Poco";

const render = new Poco(screen);
const foreground = render.makeColor(0, 0, 0);
const font = new render.Font("Gothic-Bold", 18);

function draw(event: { date: Date }): void {
    const label = "JankTime2 scaffold";
    const labelWidth = render.getTextWidth(label, font);
    const x = Math.floor((render.width - labelWidth) / 2);
    const y = Math.floor((render.height - font.height) / 2);

    // Do not paint the screen background: preserve the device's default tint.
    render.begin();
    render.drawText(label, font, foreground, x, y);
    render.end();

    void event;
}

// Alloy delivers the first minutechange immediately; no duplicate startup draw.
watch.addEventListener("minutechange", draw);
