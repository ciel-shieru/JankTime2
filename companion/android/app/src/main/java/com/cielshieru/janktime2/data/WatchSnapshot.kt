package com.cielshieru.janktime2.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class WatchSnapshot(
    val metricValues: Map<String, String> = emptyMap(),
    val staleMetrics: Set<String> = emptySet(),
    val lastAttemptBySource: Map<String, Long> = emptyMap(),
    val lastSuccessBySource: Map<String, Long> = emptyMap(),
    val phoneBatteryPercent: Int? = null,
    val phoneBluetoothConnected: Boolean? = null,
    val alarmTime: String? = null,
    val alarmIsBedtime: Boolean = false,
    val alarmStale: Boolean = true,
    val focusRows: List<String?> = listOf(null, null),
    val calendarRows: List<String?> = listOf(null, null),
    val currentBpm: Int? = null,
    val heartSamples: List<Int>? = null,
    val weatherCondition: String? = null,
) {
    fun withMetric(id: String, value: String, stale: Boolean = false): WatchSnapshot {
        val clean = value.filterNot { it.isISOControl() || it.code in 0x202a..0x202e || it.code in 0x2066..0x2069 }.take(160)
        val values = metricValues.toMutableMap().apply { put(id, clean) }
        val staleSet = staleMetrics.toMutableSet().apply {
            if (stale) add(id) else remove(id)
        }
        return copy(metricValues = values, staleMetrics = staleSet)
    }

    fun markStale(ids: Collection<String>): WatchSnapshot =
        copy(staleMetrics = staleMetrics + ids)

    fun attempted(source: String, nowMillis: Long): WatchSnapshot =
        copy(lastAttemptBySource = lastAttemptBySource + (source to nowMillis))

    fun succeeded(source: String, nowMillis: Long): WatchSnapshot =
        copy(lastSuccessBySource = lastSuccessBySource + (source to nowMillis))
}

class WatchSnapshotStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun load(): WatchSnapshot = decode(preferences.getString(SNAPSHOT_KEY, null))

    @Synchronized
    fun save(snapshot: WatchSnapshot) {
        preferences.edit().putString(SNAPSHOT_KEY, encode(snapshot).toString()).apply()
    }

    private fun encode(s: WatchSnapshot): JSONObject = JSONObject().apply {
        put("metricValues", JSONObject().apply { s.metricValues.forEach { (k, v) -> put(k, v) } })
        put("staleMetrics", JSONArray(s.staleMetrics.toList()))
        put("lastAttemptBySource", JSONObject().apply { s.lastAttemptBySource.forEach { (k, v) -> put(k, v) } })
        put("lastSuccessBySource", JSONObject().apply { s.lastSuccessBySource.forEach { (k, v) -> put(k, v) } })
        putNullable("phoneBatteryPercent", s.phoneBatteryPercent)
        putNullable("phoneBluetoothConnected", s.phoneBluetoothConnected)
        putNullable("alarmTime", s.alarmTime)
        put("alarmIsBedtime", s.alarmIsBedtime)
        put("alarmStale", s.alarmStale)
        put("focusRows", JSONArray(s.focusRows.map { it ?: JSONObject.NULL }))
        put("calendarRows", JSONArray(s.calendarRows.map { it ?: JSONObject.NULL }))
        putNullable("currentBpm", s.currentBpm)
        put("heartSamples", s.heartSamples?.let(::JSONArray) ?: JSONObject.NULL)
        putNullable("weatherCondition", s.weatherCondition)
    }

    private fun JSONObject.putNullable(key: String, value: Any?) {
        put(key, value ?: JSONObject.NULL)
    }

    private fun decode(raw: String?): WatchSnapshot {
        if (raw.isNullOrBlank() || raw.length > MAX_SNAPSHOT_JSON) return WatchSnapshot()
        return runCatching {
            val root = JSONObject(raw)
            val valuesObj = root.optJSONObject("metricValues") ?: JSONObject()
            val values = buildMap {
                val keys = valuesObj.keys()
                while (keys.hasNext() && size < MAX_METRICS) {
                    val key = keys.next()
                    if (key in VALID_METRICS) {
                        val value = valuesObj.optString(key).take(160)
                        put(key, value)
                    }
                }
            }
            val staleArray = root.optJSONArray("staleMetrics") ?: JSONArray()
            val stale = buildSet {
                for (i in 0 until minOf(staleArray.length(), MAX_METRICS)) {
                    staleArray.optString(i).takeIf { it in VALID_METRICS }?.let(::add)
                }
            }
            fun decodeSourceTimes(name: String): Map<String, Long> {
                val sourceObj = root.optJSONObject(name) ?: JSONObject()
                return buildMap {
                    val keys = sourceObj.keys()
                    while (keys.hasNext() && size < MAX_SOURCES) {
                        val key = keys.next()
                        val value = sourceObj.optLong(key, -1L)
                        if (key in VALID_SOURCES && value >= 0) put(key, value)
                    }
                }
            }
            WatchSnapshot(
                metricValues = values,
                staleMetrics = stale,
                lastAttemptBySource = decodeSourceTimes("lastAttemptBySource"),
                lastSuccessBySource = decodeSourceTimes("lastSuccessBySource"),
                phoneBatteryPercent = root.optIntOrNull("phoneBatteryPercent")?.takeIf { it in 0..100 },
                phoneBluetoothConnected = root.optBooleanOrNull("phoneBluetoothConnected"),
                alarmTime = root.optString("alarmTime").takeIf { it.matches(Regex("(?:[01]\\\\d|2[0-3]):[0-5]\\\\d")) },
                alarmIsBedtime = root.optBoolean("alarmIsBedtime", false),
                alarmStale = root.optBoolean("alarmStale", true),
                focusRows = root.arrayOfTwo("focusRows"),
                calendarRows = root.arrayOfTwo("calendarRows"),
                currentBpm = root.optIntOrNull("currentBpm")?.takeIf { it in 20..240 },
                heartSamples = root.optJSONArray("heartSamples")?.let { array ->
                    if (array.length() !in 2..56) null else buildList {
                        for (i in 0 until array.length()) {
                            val item = array.optInt(i, -1)
                            if (item !in 20..240) return@buildList
                            add(item)
                        }
                    }.takeIf { it.size == array.length() }
                },
                weatherCondition = root.optString("weatherCondition").takeIf { it.length <= 40 && it.isNotBlank() },
            )
        }.getOrDefault(WatchSnapshot())
    }

    private fun JSONObject.optIntOrNull(key: String): Int? =
        if (!has(key) || isNull(key)) null else optInt(key, Int.MIN_VALUE).takeIf { it != Int.MIN_VALUE }

    private fun JSONObject.optBooleanOrNull(key: String): Boolean? =
        if (!has(key) || isNull(key)) null else optBoolean(key)

    private fun JSONObject.arrayOfTwo(key: String): List<String?> {
        val array = optJSONArray(key) ?: return listOf(null, null)
        return (0..1).map { i ->
            if (i >= array.length() || array.isNull(i)) null else array.optString(i).take(200)
        }
    }

    private companion object {
        const val PREFS_NAME = "janktime2_display_cache"
        const val SNAPSHOT_KEY = "snapshot_v1"
        const val MAX_SNAPSHOT_JSON = 64 * 1024
        const val MAX_METRICS = 20
        const val MAX_SOURCES = 8
        val VALID_METRICS = setOf(
            "focusCount", "steps", "totalSleep", "restfulSleep", "fanState", "cpuUsage",
            "memoryUsage", "weatherFeelsLike", "rainChance", "alertCount", "water", "haSensor",
            "haClimateValue",
        )
        val VALID_SOURCES = setOf("homeAssistant", "prometheus", "mindwtr", "wakey", "calendar", "phone")
    }
}
