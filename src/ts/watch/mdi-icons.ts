/**
 * 16x16 pre-rasterized Material Design Icons from Pictogrammers' MaterialDesign-SVG set.
 * SVGs are rasterized at build time to bounded one-bit masks so the watch does not
 * need a vector renderer or runtime resources. Icon sources: https://github.com/Templarian/MaterialDesign-SVG
 */
export type MdiIconName =
    | "alarm"
    | "bluetooth"
    | "battery-horizontal"
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
    "alarm": "00000000181837ec2c341818308c208420842104360c100818180ff001800000",
    "bluetooth": "0000000001800380079005a003c00180018003c005a007900380018000000000",
    "battery-horizontal": "00000000000000001ffc1006700670067006700610061ffc0000000000000000",
    "check-circle-outline": "000001800ff01818300c28042c046606633621e420c4300c18180ff001800000",
    "shoe-print": "0000001000380078007800780c381c001e601e601e000c0000000e0004000000",
    "moon-waning-crescent": "0000018000f00078003c003c003c001e001e003c003c003c007800f001800000",
    "bed-outline": "000000000000000200027f9241ba41ea41ba41827ffe40024002000000000000",
    "fan": "0000038007c007c003c001cc3d9e7ffe7ffe79bc338003c003e003e001800000",
    "cpu-64-bit": "0000000002400ff01ff81ff83a1c18d81b183b1c1ff81ff80ff0024000000000",
    "memory": "0000000002400ff01ff818183bdc1bd81bd83bdc18181ff80ff0024000000000",
    "weather-sunny": "0000000001800000000013c8066004200420066013c800000000018000000000",
    "weather-night": "0000000003000798031c003400341826186600c407841e0c18180ff001800000",
    "weather-partly-cloudy": "00000000021800c003f00210161807da04300c38081c380660063ffc1ff80000",
    "weather-cloudy": "000000000000018007e00c30081c38067002400240027ffe3ff8000000000000",
    "weather-rainy": "0000018007e00c30081c180670024002418273ce32480660066003c001800000",
    "weather-snowy": "000003c007e00c30081c380e7802400340067b5e3df807c003e007a002c00000",
    "weather-fog": "0000000003c006600810081c38066002400200007dfe000000007fee00000000",
    "weather-lightning": "0000018007e00c30081c3806700243024102719e339801000100000000000000",
    "weather-windy": "0000018003c00600060013fc39fc60003ff8000000003ffc20003c0018000000",
    "help-circle-outline": "000001c00ff0181833cc224426066206630621842004318c18180ff001800000",
    "bell-alert-outline": "00000180018007e00c3048105818581858181818581818183ffc000001800000",
    "water-percent": "000000000000018003c003c007e00db00ef00f700db007e003c0000000000000",
    "thermometer": "0000018003c00240024003c003c003c003c007e007e007e007e003e001800000",
    "gauge": "000001c00ff01818324c23042916618661862004200437ec1ff80ff001800000",
    "heart": "000000001e783ffc3ffc7ffe7ffe3ffc3ffc1ff80ff007e003c0018000000000",
};
