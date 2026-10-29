declare interface AlloyScreen {
    readonly width: number;
    readonly height: number;
    readonly color: boolean;
    readonly round: boolean;
}
declare const screen: AlloyScreen;
declare class Resource { constructor(name: string); }
declare interface PocoFont { readonly height: number; bitmap?: unknown; }
declare interface AlloyWatchMinuteEvent { readonly date: Date; }
interface BatterySample { readonly percent: number; }
interface BatterySensor { sample(): BatterySample; }
declare const watch: {
    readonly connected: { readonly app: boolean; };
    addEventListener(type: "minutechange", callback: (event: AlloyWatchMinuteEvent) => void): void;
    addEventListener(type: "connected" | "resize", callback: () => void): void;
};
declare module "commodetto/Poco" {
    class Poco {
        constructor(display: AlloyScreen);
        readonly width: number;
        readonly height: number;
        readonly Font: new (family: string, size: number) => PocoFont;
        makeColor(red: number, green: number, blue: number): unknown;
        begin(): void;
        fillRectangle(color: unknown, x: number, y: number, width: number, height: number): void;
        drawRoundRect(x: number, y: number, width: number, height: number, color: unknown, radius: number): void;
        frameRoundRect(x: number, y: number, width: number, height: number, color: unknown, radius: number): void;
        drawLine(x1: number, y1: number, x2: number, y2: number, color: unknown, thickness: number): void;
        drawCircle(color: unknown, cx: number, cy: number, radius: number, startAngle: number, endAngle: number): void;
        getTextWidth(text: string, font: PocoFont): number;
        drawText(text: string, font: PocoFont, color: unknown, x: number, y: number): void;
        end(): void;
    }
    export default Poco;
}
declare module "commodetto/parseBMF" {
    function parseBMF(resource: Resource): PocoFont;
    export default parseBMF;
}
declare module "commodetto/parseRLE" {
    function parseRLE(resource: Resource): unknown;
    export default parseRLE;
}
declare module "embedded:sensor/Battery" {
    export default class Battery {
        constructor(options: { onSample?: (this: BatterySensor) => void });
        sample(): BatterySample;
    }
}
declare module "pebble/message" {
    interface MessageOptions {
        keys: string[] | Map<string, number>;
        /** Incoming/outgoing AppMessage buffer capacities in bytes. */
        input?: number;
        output?: number;
        onReadable?: (this: WatchMessage) => void;
        onWritable?: (this: WatchMessage) => void;
        onSuspend?: (this: WatchMessage) => void;
    }
    class WatchMessage {
        constructor(options: MessageOptions);
        read(): Map<string | number, string | number | ArrayBuffer>;
        write(message: Map<string, string | number>): void;
        close(): void;
    }
    export default WatchMessage;
}
