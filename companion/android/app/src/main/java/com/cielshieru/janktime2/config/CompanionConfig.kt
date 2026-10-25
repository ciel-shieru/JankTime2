package com.cielshieru.janktime2.config

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray

data class CompanionConfig(
    val homeAssistantUrl: String = "",
    val sensorEntity: String = "",
    val genericSensorEntity: String = "",
    val waterEntity: String = "",
    val weatherEntity: String = "",
    val climateEntity: String = "",
    val climateAttribute: String = "temperature",
    val prometheusUrl: String = "",
    val cpuQuery: String = "",
    val memoryQuery: String = "",
    val alertQuery: String = "sum(alertmanager_alerts{state=\"active\"})",
    val mindwtrUrl: String = "",
    val refreshHomeAssistantMinutes: Int = 3,
    val refreshPrometheusMinutes: Int = 5,
    val refreshMindwtrMinutes: Int = 5,
    val refreshWakeyMinutes: Int = 5,
    val metricSlots: Map<String, String> = DEFAULT_SLOTS,
    val selectedCalendarIds: Set<String> = emptySet(),
    val calendarBlocklist: List<String> = emptyList(),
) {
    companion object {
        val DEFAULT_SLOTS = mapOf(
            "grid.top.1" to "focusCount",
            "grid.top.2" to "steps",
            "grid.top.3" to "totalSleep",
            "grid.top.4" to "restfulSleep",
            "grid.top.5" to "fanState",
            "grid.bottom.1" to "cpuUsage",
            "grid.bottom.2" to "memoryUsage",
            "grid.bottom.4" to "weatherFeelsLike",
            "grid.bottom.5" to "alertCount",
            "clock.left" to "none",
            "clock.right" to "water",
        )
    }
}

object RefreshIntervals {
    const val MIN_MINUTES = 1
    const val MAX_MINUTES = 60

    fun validate(value: Int): Int {
        require(value in MIN_MINUTES..MAX_MINUTES) {
            "Refresh interval must be between $MIN_MINUTES and $MAX_MINUTES minutes."
        }
        return value
    }
}

object ConfigStore {
    private const val PREFS = "janktime2_config"
    private const val SLOT_PREFIX = "slot."
    private const val SELECTED_CALENDARS = "calendar.selected_ids"
    private const val CALENDAR_BLOCKLIST = "calendar.blocklist"

    fun load(context: Context): CompanionConfig {
        val prefs = preferences(context)
        val slotMap = CompanionConfig.DEFAULT_SLOTS.mapValues { (slot, default) ->
            prefs.getString(SLOT_PREFIX + slot, default)?.takeIf { it in METRIC_IDS } ?: default
        }
        val selectedIds = decodeStringList(prefs.getString(SELECTED_CALENDARS, null)).toSet()
        val filters = decodeStringList(prefs.getString(CALENDAR_BLOCKLIST, null))
        return CompanionConfig(
            homeAssistantUrl = prefs.getString("ha.url", "").orEmpty(),
            sensorEntity = prefs.getString("ha.sensor_entity", "").orEmpty(),
            genericSensorEntity = prefs.getString("ha.generic_sensor_entity", "").orEmpty(),
            waterEntity = prefs.getString("ha.water_entity", "").orEmpty(),
            weatherEntity = prefs.getString("ha.weather_entity", "").orEmpty(),
            climateEntity = prefs.getString("ha.climate_entity", "").orEmpty(),
            climateAttribute = prefs.getString("ha.climate_attribute", "temperature").orEmpty(),
            prometheusUrl = prefs.getString("prom.url", "").orEmpty(),
            cpuQuery = prefs.getString("prom.cpu_query", "").orEmpty(),
            memoryQuery = prefs.getString("prom.memory_query", "").orEmpty(),
            alertQuery = prefs.getString("prom.alert_query", "sum(alertmanager_alerts{state=\"active\"})").orEmpty(),
            mindwtrUrl = prefs.getString("mindwtr.url", "").orEmpty(),
            refreshHomeAssistantMinutes = refresh(prefs, "refresh.ha", 3),
            refreshPrometheusMinutes = refresh(prefs, "refresh.prometheus", 5),
            refreshMindwtrMinutes = refresh(prefs, "refresh.mindwtr", 5),
            refreshWakeyMinutes = refresh(prefs, "refresh.wakey", 5),
            metricSlots = slotMap,
            selectedCalendarIds = selectedIds,
            calendarBlocklist = filters,
        )
    }

    fun save(context: Context, config: CompanionConfig) {
        val checked = config.copy(
            refreshHomeAssistantMinutes = RefreshIntervals.validate(config.refreshHomeAssistantMinutes),
            refreshPrometheusMinutes = RefreshIntervals.validate(config.refreshPrometheusMinutes),
            refreshMindwtrMinutes = RefreshIntervals.validate(config.refreshMindwtrMinutes),
            refreshWakeyMinutes = RefreshIntervals.validate(config.refreshWakeyMinutes),
            metricSlots = CompanionConfig.DEFAULT_SLOTS.mapValues { (slot, default) ->
                config.metricSlots[slot]?.takeIf { it in METRIC_IDS } ?: default
            },
            selectedCalendarIds = config.selectedCalendarIds.filter { it.matches(Regex("\\d{1,12}")) }.toSet(),
            calendarBlocklist = RegexFilter.validate(config.calendarBlocklist),
        )
        val editor = preferences(context).edit()
            .putString("ha.url", checked.homeAssistantUrl.trim())
            .putString("ha.sensor_entity", checked.sensorEntity.trim())
            .putString("ha.generic_sensor_entity", checked.genericSensorEntity.trim())
            .putString("ha.water_entity", checked.waterEntity.trim())
            .putString("ha.weather_entity", checked.weatherEntity.trim())
            .putString("ha.climate_entity", checked.climateEntity.trim())
            .putString("ha.climate_attribute", checked.climateAttribute.trim())
            .putString("prom.url", checked.prometheusUrl.trim())
            .putString("prom.cpu_query", checked.cpuQuery.trim())
            .putString("prom.memory_query", checked.memoryQuery.trim())
            .putString("prom.alert_query", checked.alertQuery.trim())
            .putString("mindwtr.url", checked.mindwtrUrl.trim())
            .putInt("refresh.ha", checked.refreshHomeAssistantMinutes)
            .putInt("refresh.prometheus", checked.refreshPrometheusMinutes)
            .putInt("refresh.mindwtr", checked.refreshMindwtrMinutes)
            .putInt("refresh.wakey", checked.refreshWakeyMinutes)
            .putString(SELECTED_CALENDARS, JSONArray(checked.selectedCalendarIds.toList()).toString())
            .putString(CALENDAR_BLOCKLIST, JSONArray(checked.calendarBlocklist).toString())
        checked.metricSlots.forEach { (slot, metric) -> editor.putString(SLOT_PREFIX + slot, metric) }
        editor.apply()
    }

    private fun preferences(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun refresh(prefs: SharedPreferences, key: String, fallback: Int): Int =
        runCatching { RefreshIntervals.validate(prefs.getInt(key, fallback)) }.getOrDefault(fallback)

    private fun decodeStringList(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until minOf(array.length(), 200)) {
                    val value = array.optString(i)
                    if (value.isNotBlank()) add(value)
                }
            }
        }.getOrDefault(emptyList())
    }

    private val METRIC_IDS = setOf(
        "none", "focusCount", "steps", "totalSleep", "restfulSleep", "fanState",
        "cpuUsage", "memoryUsage", "weatherFeelsLike", "rainChance", "alertCount",
        "water", "haSensor", "haClimateValue",
    )
}

object RegexFilter {
    private const val MAX_PATTERNS = 10
    private const val MAX_PATTERN_LENGTH = 120
    private const val MAX_TOTAL_LENGTH = 600

    private val unsafeConstructs = listOf(
        Regex("""\\[1-9]"""),
        Regex("""\(\?[=!<]"""),
        Regex("""\([^)]*(?:[*+]|\{\d)[^)]*\)\s*(?:[*+?]|\{\d)"""),
        Regex("""(?:[*+]|\{\d+(?:,\d*)?\})\s*(?:[*+?]|\{)"""),
    )

    fun validate(patterns: List<String>): List<String> {
        require(patterns.size <= MAX_PATTERNS) { "Use at most $MAX_PATTERNS calendar filter patterns." }
        val cleaned = patterns.map { it.trim() }.filter { it.isNotEmpty() }
        require(cleaned.all { it.length <= MAX_PATTERN_LENGTH }) {
            "Each calendar filter pattern must be at most $MAX_PATTERN_LENGTH characters."
        }
        require(cleaned.sumOf { it.length } <= MAX_TOTAL_LENGTH) {
            "Calendar filter patterns exceed the total size limit."
        }
        cleaned.forEach { pattern ->
            require(unsafeConstructs.none { it.containsMatchIn(pattern) }) {
                "Calendar filter uses a potentially expensive regular expression construct."
            }
            try {
                Regex(pattern)
            } catch (_: IllegalArgumentException) {
                throw IllegalArgumentException("One or more calendar filter patterns are invalid.")
            }
        }
        return cleaned
    }

    fun matchesAny(patterns: List<Regex>, fields: List<String?>): Boolean =
        patterns.any { pattern -> fields.filterNotNull().any(pattern::containsMatchIn) }
}
