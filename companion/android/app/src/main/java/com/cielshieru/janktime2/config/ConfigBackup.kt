package com.cielshieru.janktime2.config

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI

data class ConfigBackup(
    val config: CompanionConfig,
    /** Null means this backup deliberately omitted secrets. Non-null values are plaintext in the file. */
    val secrets: Map<String, String>?,
    val imageRows: List<String>? = null,
)

object ConfigBackupCodec {
    const val MAX_IMPORT_BYTES = 256 * 1024
    private const val SCHEMA_VERSION = 1
    private val secretNames = setOf("home_assistant", "prometheus", "mindwtr", "wakey_pairing")
    private val metricIds = CompanionConfig.DEFAULT_SLOTS.values.toSet() +
        setOf("none", "rainChance", "haSensor", "haClimateValue")
    private val configKeys = setOf(
        "homeAssistantUrl", "sensorEntity", "genericSensorEntity", "waterEntity", "weatherEntity",
        "climateEntity", "climateAttribute", "prometheusUrl", "cpuQuery", "memoryQuery", "alertQuery",
        "mindwtrUrl", "refreshHomeAssistantMinutes", "refreshPrometheusMinutes", "refreshMindwtrMinutes",
        "refreshWakeyMinutes", "metricSlots", "selectedCalendarIds", "calendarBlocklist", "calendarTodayOnly",
    )

    fun encode(
        config: CompanionConfig,
        secrets: Map<String, String>? = null,
        imageRows: List<String>? = null,
    ): String {
        validateConfig(config)
        validateImageRows(imageRows)
        val root = JSONObject()
            .put("schemaVersion", SCHEMA_VERSION)
            .put("imageRows", JSONArray(imageRows ?: emptyList<String>()))
            .put("config", JSONObject().apply {
                put("homeAssistantUrl", config.homeAssistantUrl.trim())
                put("sensorEntity", config.sensorEntity.trim())
                put("genericSensorEntity", config.genericSensorEntity.trim())
                put("waterEntity", config.waterEntity.trim())
                put("weatherEntity", config.weatherEntity.trim())
                put("climateEntity", config.climateEntity.trim())
                put("climateAttribute", config.climateAttribute.trim())
                put("prometheusUrl", config.prometheusUrl.trim())
                put("cpuQuery", config.cpuQuery.trim())
                put("memoryQuery", config.memoryQuery.trim())
                put("alertQuery", config.alertQuery.trim())
                put("mindwtrUrl", config.mindwtrUrl.trim())
                put("refreshHomeAssistantMinutes", config.refreshHomeAssistantMinutes)
                put("refreshPrometheusMinutes", config.refreshPrometheusMinutes)
                put("refreshMindwtrMinutes", config.refreshMindwtrMinutes)
                put("refreshWakeyMinutes", config.refreshWakeyMinutes)
                put("metricSlots", JSONObject().apply {
                    CompanionConfig.DEFAULT_SLOTS.keys.sorted().forEach { slot ->
                        put(slot, config.metricSlots[slot] ?: CompanionConfig.DEFAULT_SLOTS.getValue(slot))
                    }
                })
                put("selectedCalendarIds", JSONArray(config.selectedCalendarIds.sorted()))
                put("calendarBlocklist", JSONArray(RegexFilter.validate(config.calendarBlocklist)))
                put("calendarTodayOnly", config.calendarTodayOnly)
            })
        if (secrets != null) {
            require(secrets.keys.all { it in secretNames }) { "Backup contains an unsupported secret field." }
            val cleanSecrets = JSONObject()
            for ((key, value) in secrets) {
                require(value.length <= 8192 && !value.any(Char::isISOControl)) {
                    "A secret is too long or contains control characters."
                }
                if (value.isNotEmpty()) cleanSecrets.put(key, value)
            }
            root.put("secrets", cleanSecrets)
        }
        val encoded = root.toString(2)
        require(encoded.toByteArray(Charsets.UTF_8).size <= MAX_IMPORT_BYTES) {
            "Configuration backup exceeds the 256 KiB limit."
        }
        return encoded
    }

    fun decode(raw: String): ConfigBackup {
        require(raw.isNotBlank() && raw.toByteArray(Charsets.UTF_8).size <= MAX_IMPORT_BYTES) {
            "Configuration file is empty or exceeds the 256 KiB limit."
        }
        val root = JSONObject(raw)
        require(root.optInt("schemaVersion", -1) == SCHEMA_VERSION) {
            "Unsupported configuration backup version."
        }
        requireKeys(root, setOf("schemaVersion", "config", "secrets", "imageRows"), required = setOf("schemaVersion", "config"))
        val c = root.optJSONObject("config") ?: throw IllegalArgumentException("Configuration section is missing.")
        requireKeys(c, configKeys)
        fun string(key: String, default: String = "", max: Int = 4096): String {
            if (!c.has(key)) return default
            val value = c.opt(key)
            require(value is String && value.length <= max && !value.any(Char::isISOControl)) {
                "Invalid value for configuration field: " + key
            }
            return value
        }
        fun interval(key: String, default: Int): Int {
            if (!c.has(key)) return default
            val value = c.opt(key)
            require(value is Number && value.toDouble().isFinite() && value.toDouble() == value.toInt().toDouble()) {
                "Invalid refresh interval: " + key
            }
            return RefreshIntervals.validate(value.toInt())
        }

        val slotObject = if (!c.has("metricSlots")) JSONObject() else {
            c.optJSONObject("metricSlots") ?: throw IllegalArgumentException("Metric slots must be a JSON object.")
        }
        val slots = CompanionConfig.DEFAULT_SLOTS.toMutableMap()
        val slotIterator = slotObject.keys()
        while (slotIterator.hasNext()) {
            val slot = slotIterator.next()
            require(slot in CompanionConfig.DEFAULT_SLOTS) { "Unknown metric slot: " + slot }
            val value = slotObject.opt(slot)
            require(value is String && value in metricIds) { "Invalid metric assignment for slot: " + slot }
            slots[slot] = value
        }
        val selectedArray = if (!c.has("selectedCalendarIds")) JSONArray() else {
            c.optJSONArray("selectedCalendarIds") ?: throw IllegalArgumentException("Selected calendar IDs must be a JSON array.")
        }
        require(selectedArray.length() <= 200) { "Too many selected calendars in backup." }
        val calendarIds = buildSet {
            for (i in 0 until selectedArray.length()) {
                val item = selectedArray.opt(i)
                require(item is String && item.matches(Regex("\\d{1,12}"))) {
                    "Invalid selected calendar identifier."
                }
                add(item)
            }
        }
        val filterArray = if (!c.has("calendarBlocklist")) JSONArray() else {
            c.optJSONArray("calendarBlocklist") ?: throw IllegalArgumentException("Calendar blocklist must be a JSON array.")
        }
        require(filterArray.length() <= 10) { "Too many calendar blocklist patterns." }
        val filters = buildList {
            for (i in 0 until filterArray.length()) {
                val item = filterArray.opt(i)
                require(item is String) { "Invalid calendar blocklist pattern." }
                add(item)
            }
        }
        val calendarTodayOnly = if (!c.has("calendarTodayOnly")) false else {
            val value = c.opt("calendarTodayOnly")
            require(value is Boolean) { "Invalid calendar today-only setting." }
            value
        }
        val config = CompanionConfig(
            homeAssistantUrl = string("homeAssistantUrl", max = 2048),
            sensorEntity = string("sensorEntity", max = 255),
            genericSensorEntity = string("genericSensorEntity", max = 255),
            waterEntity = string("waterEntity", max = 255),
            weatherEntity = string("weatherEntity", max = 255),
            climateEntity = string("climateEntity", max = 255),
            climateAttribute = string("climateAttribute", "temperature", 64),
            prometheusUrl = string("prometheusUrl", max = 2048),
            cpuQuery = string("cpuQuery", max = 512),
            memoryQuery = string("memoryQuery", max = 512),
            alertQuery = string("alertQuery", "sum(alertmanager_alerts{state=\"active\"})", 512),
            mindwtrUrl = string("mindwtrUrl", max = 2048),
            refreshHomeAssistantMinutes = interval("refreshHomeAssistantMinutes", 3),
            refreshPrometheusMinutes = interval("refreshPrometheusMinutes", 5),
            refreshMindwtrMinutes = interval("refreshMindwtrMinutes", 5),
            refreshWakeyMinutes = interval("refreshWakeyMinutes", 5),
            metricSlots = slots,
            selectedCalendarIds = calendarIds,
            calendarBlocklist = RegexFilter.validate(filters),
            calendarTodayOnly = calendarTodayOnly,
        )
        validateConfig(config)

        val secretsObject = if (root.has("secrets")) {
            root.optJSONObject("secrets") ?: throw IllegalArgumentException("Secrets section must be a JSON object.")
        } else null
        val decodedSecrets = secretsObject?.let { obj ->
            val iterator = obj.keys()
            val values = linkedMapOf<String, String>()
            while (iterator.hasNext()) {
                val key = iterator.next()
                require(key in secretNames) { "Backup contains an unsupported secret field." }
                val value = obj.opt(key)
                require(value is String && value.length <= 8192 && !value.any(Char::isISOControl)) {
                    "Invalid plaintext secret field: " + key
                }
                values[key] = value
            }
            values
        }
        val decodedRows: List<String>? = if (!root.has("imageRows")) null else {
            val array = root.optJSONArray("imageRows")
                ?: throw IllegalArgumentException("Image rows must be a JSON array.")
            if (array.length() == 0) emptyList<String>() else {
                require(array.length() == 30) { "Image backup must contain exactly 30 rows." }
                buildList<String> {
                    for (i in 0 until array.length()) {
                        val row = array.opt(i)
                        require(row is String && row.matches(Regex("[01]{30}"))) {
                            "Image backup contains an invalid row."
                        }
                        add(row)
                    }
                }
            }
        }
        return ConfigBackup(config, decodedSecrets, decodedRows)
    }

    private fun validateImageRows(rows: List<String>?) {
        if (rows == null || rows.isEmpty()) return
        require(rows.size == 30 && rows.all { it.matches(Regex("[01]{30}")) }) {
            "Image backup must be a 30×30 one-bit map."
        }
    }

    private fun validateConfig(config: CompanionConfig) {
        require(config.refreshHomeAssistantMinutes in 1..60 &&
            config.refreshPrometheusMinutes in 1..60 &&
            config.refreshMindwtrMinutes in 1..60 &&
            config.refreshWakeyMinutes in 1..60) { "Refresh intervals must be from 1 to 60 minutes." }
        require(config.metricSlots.keys.all { it in CompanionConfig.DEFAULT_SLOTS } &&
            config.metricSlots.values.all { it in metricIds }) { "Metric slot configuration is invalid." }
        require(RegexFilter.validate(config.calendarBlocklist).size <= 10) { "Calendar blocklist is invalid." }
        require(config.selectedCalendarIds.size <= 200 &&
            config.selectedCalendarIds.all { it.matches(Regex("\\d{1,12}")) }) {
            "Selected calendar identifiers are invalid."
        }
        validateHttpsUrl(config.homeAssistantUrl, "Home Assistant")
        validateHttpsUrl(config.prometheusUrl, "Prometheus")
        validateHttpsUrl(config.mindwtrUrl, "Mindwtr")
        require(config.climateAttribute.isBlank() || config.climateAttribute == "state" ||
            config.climateAttribute.matches(Regex("[a-zA-Z_][a-zA-Z0-9_]{0,63}"))) {
            "Climate attribute name is invalid."
        }
        val entityIds = listOf(
            config.sensorEntity,
            config.genericSensorEntity,
            config.waterEntity,
            config.weatherEntity,
            config.climateEntity,
        ).filter { it.isNotBlank() }
        require(entityIds.all { it.length <= 255 && it.matches(Regex("[a-z_][a-z0-9_]*\\.[a-z0-9_]+")) }) {
            "A Home Assistant entity ID is invalid."
        }
        require(config.cpuQuery.length <= 512 && config.memoryQuery.length <= 512 && config.alertQuery.length <= 512) {
            "A Prometheus query exceeds 512 characters."
        }
    }

    private fun validateHttpsUrl(raw: String, label: String) {
        require(raw.length <= 2048 && !raw.any(Char::isISOControl)) { label + " URL is too long or malformed." }
        if (raw.isBlank()) return
        val uri = try { URI(raw) } catch (_: Exception) {
            throw IllegalArgumentException(label + " URL is invalid.")
        }
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank() &&
            uri.userInfo == null && uri.fragment == null) {
            label + " URL must be HTTPS, contain a host, and have no embedded credentials or fragment."
        }
    }

    private fun requireKeys(obj: JSONObject, allowed: Set<String>, required: Set<String> = emptySet()) {
        val iterator = obj.keys()
        while (iterator.hasNext()) {
            val key = iterator.next()
            require(key in allowed) { "Unknown configuration field: " + key }
        }
        require(required.all { obj.has(it) }) { "Configuration backup is missing a required field." }
    }
}
