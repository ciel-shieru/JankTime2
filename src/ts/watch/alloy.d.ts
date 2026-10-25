declare interface AlloyScreen {
    readonly width: number;
    readonly height: number;
    readonly color: boolean;
    readonly round: boolean;
}

declare const screen: AlloyScreen;

declare interface AlloyWatchMinuteEvent {
    readonly date: Date;
}

declare const watch: {
    addEventListener(
        type: "minutechange",
        callback: (event: AlloyWatchMinuteEvent) => void
    ): void;
};

declare module "commodetto/Poco" {
    interface PocoFont {
        readonly height: number;
    }

    class Poco {
        constructor(display: AlloyScreen);
        readonly width: number;
        readonly height: number;
        readonly Font: new (family: string, size: number) => PocoFont;
        makeColor(red: number, green: number, blue: number): unknown;
        begin(): void;
        fillRectangle(color: unknown, x: number, y: number, width: number, height: number): void;
        getTextWidth(text: string, font: PocoFont): number;
        drawText(text: string, font: PocoFont, color: unknown, x: number, y: number): void;
        end(): void;
    }

    export default Poco;
}
