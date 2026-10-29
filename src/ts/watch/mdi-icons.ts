/**
 * Exact 16×16 one-bit masks rasterized from Pictogrammers Material Design Icons SVG artwork.
 * See third-party-notices/MaterialDesign-SVG-LICENSE.txt for the collection-level license.
 * Per-icon license terms follow each source SVG; masks are precomputed for bounded watch drawing.
 */
export type MdiIconName =
    | "alarm"
    | "bluetooth"
    | "battery-outline"
    | "check-circle-outline"
    | "shoe-print"
    | "moon-waning-crescent"
    | "bed-outline"
    | "fan"
    | "cpu-64-bit"
    | "memory"
    | "weather-sunny"
    | "weather-night"
    | "weather-partly-cloudy"
    | "weather-cloudy"
    | "weather-rainy"
    | "weather-snowy"
    | "weather-fog"
    | "weather-lightning"
    | "weather-windy"
    | "help-circle-outline"
    | "bell-alert-outline"
    | "water-percent"
    | "thermometer"
    | "gauge"
    | "heart";

/** Each 64-character hex string stores sixteen 16-bit rows; bit x represents pixel x. */
export const MDI_ICON_MASKS: Readonly<Record<MdiIconName, string>> = {
    "alarm": "00000810181837ec2c341898318c318c2184330c360c10081c380ff003c00000",
    "bluetooth": "000000800180038007b00df007e003c003c007e00db007b00380018000800000",
    "battery-outline": "00000000000000001ffe3806700670067006700638061ffe0000000000000000",
    "check-circle-outline": "000003c00ff01818300c2c046e06670663b661e620c4300c18180ff003c00000",
    "shoe-print": "0000001000380078007800781c781e001e701e701e001c0000000e0006000000",
    "moon-waning-crescent": "000001c001f00078003c003c003e001e001e003e003c003c007801f001c00000",
    "bed-outline": "000000000000000200037fb261fbc1efc1bbc1837ffe6006c003000000000000",
    "fan": "0000038007c007c003c001cc3fde7ffe7ffe7bfc338003c003e003e001c00000",
    "cpu-64-bit": "0000000002400ff01ff81ff83e9c18d81b183b9c1ff81ff80ff0024000000000",
    "memory": "0000000002400ff01ff818183bdc1bd81bd83bdc18181ff80ff0024000000000",
    "weather-sunny": "0000000001800000100833cc166804200420166833cc10080000018000000000",
    "weather-night": "0000000003100798033c04b400363826186600c607843e0c18180ff003c00000",
    "weather-partly-cloudy": "00000200021800c003f00210161807fa06700c38081c380660067ffc3ff80000",
    "weather-cloudy": "00000000000003c007e00c30081c380e7802400340067ffe3ff8000000000000",
    "weather-rainy": "000003c007e00c30081c380e780240034006781e399801800180000000000000",
    "weather-snowy": "000003c007e00c30081c380e780240034006794e39c807c003e0078000800000",
    "weather-fog": "0000000003c007e00c30081c38066002400200003dfe000000007fee00000000",
    "weather-lightning": "000003c007e00c30081c380e780243034386799e3b9801800100000000000000",
    "weather-windy": "0000018003c00600060033fc79fc60003ff8000000003ffc30003c0018000000",
    "help-circle-outline": "000003c00ff0181833cc27e466666606630661862004318c18180ff003c00000",
    "bell-alert-outline": "00000180018007e00e70c8105818d81858181818d81818183ffc03c001800000",
    "water-percent": "000000000000018003c007e007e00db00ef00f700db007e007e0000000000000",
    "thermometer": "0000018003c00240024003c003c003c003c007e007e007e007e007e001800000",
    "gauge": "000003c00ff01818324c23046916618661866006200437ec1ff80ff003c00000",
    "heart": "000000001e783ffc7ffe7ffe7ffe3ffc3ffc1ff80ff007e003c0018000000000",
};
