package com.cielshieru.janktime2.network

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

data class HomeAssistantState(
    val entityId: String,
    val state: String,
    val attributes: JSONObject,
    val translatedState: String? = null,
)

internal data class HomeAssistantForecast(
    val apparentTemperature: Double?,
    val temperature: Double?,
    val rainChancePercent: Int?,
)

data class HomeAssistantWeather(
    val condition: String,
    val displayTemperature: Double?,
    val rainChancePercent: Int?,
)

class HomeAssistantClient {
    fun fetchState(baseUrl: String, token: String, entityId: String): HomeAssistantState {
        validateEntityId(entityId)
        val json = SecureHttp.requestJson(
            baseUrl = baseUrl,
            pathSegments = listOf("api", "states", entityId),
            bearerToken = token,
        )
        if (json.optString("entity_id") != entityId) throw IllegalArgumentException("Home Assistant returned an unexpected entity.")
        // Standard HA REST state is raw text; accept nested raw/translated data too.
        val stateField = json.opt("state")
        val rawState = if (stateField is JSONObject) stateField.optString("raw", "") else json.optString("state", "")
        val nestedTranslated = if (stateField is JSONObject) stateField.optString("translated", "") else ""
        val translated = nestedTranslated.ifBlank { json.optString("state_translated", "") }
            .takeIf { it.isNotBlank() && it != "null" }
            ?.take(64)
        val attributes = json.optJSONObject("attributes") ?: JSONObject()
        return HomeAssistantState(entityId, rawState.take(256), attributes, translated)
    }

    fun fetchWeather(baseUrl: String, token: String, entityId: String): HomeAssistantWeather {
        val current = fetchState(baseUrl, token, entityId)
        val forecast = runCatching { fetchFirstForecast(baseUrl, token, entityId) }.getOrNull()
        return weatherFromState(current, forecast)
    }

    /** Home Assistant's weather.get_forecasts action returns service_response[entity_id].forecast. */
    private fun fetchFirstForecast(baseUrl: String, token: String, entityId: String): HomeAssistantForecast? {
        validateEntityId(entityId)
        val response = SecureHttp.requestJson(
            baseUrl = baseUrl,
            pathSegments = listOf("api", "services", "weather", "get_forecasts"),
            query = mapOf("return_response" to "true"),
            bearerToken = token,
            method = "POST",
            jsonBody = JSONObject().put("entity_id", entityId).put("type", "hourly"),
        )
        val serviceResponse = response.optJSONObject("service_response")
            ?: throw IllegalArgumentException("Home Assistant forecast response is missing.")
        val entityResponse = serviceResponse.optJSONObject(entityId)
            ?: throw IllegalArgumentException("Home Assistant forecast response does not contain the selected entity.")
        val forecasts = entityResponse.optJSONArray("forecast") ?: return null

        var apparentTemperature: Double? = null
        var temperature: Double? = null
        var rainChancePercent: Int? = null
        for (i in 0 until minOf(forecasts.length(), 48)) {
            val item = forecasts.optJSONObject(i) ?: continue
            if (apparentTemperature == null) apparentTemperature = numericValue(item.opt("apparent_temperature"))
            if (temperature == null) temperature = numericValue(item.opt("temperature"))
            if (rainChancePercent == null) {
                rainChancePercent = numericValue(item.opt("precipitation_probability"))
                    ?.takeIf { it in 0.0..100.0 }
                    ?.roundToInt()
            }
            if (apparentTemperature != null && temperature != null && rainChancePercent != null) break
        }
        if (apparentTemperature == null && temperature == null && rainChancePercent == null) return null
        return HomeAssistantForecast(apparentTemperature, temperature, rainChancePercent)
    }

    fun climateDisplayValue(baseUrl: String, token: String, entityId: String, attribute: String): String? {
        val state = fetchState(baseUrl, token, entityId)
        val translated = if (attribute.isBlank()) {
            // Prefer the actual translated state from HA; use any translated value already
            // carried by the response as a fallback before displaying the raw state.
            runCatching { fetchTranslatedState(baseUrl, token, entityId) }.getOrNull()
                ?: state.translatedState
        } else null
        val attributeValue = if (attribute.isBlank() || attribute == "state") null else state.attributes.opt(attribute)
        return resolveClimateDisplayValue(state.state, attribute, translated, attributeValue)
    }

    private fun fetchTranslatedState(baseUrl: String, token: String, entityId: String): String? {
        validateEntityId(entityId)
        val template = """{{ {"translated": state_translated("$entityId")} | to_json }}"""
        val response = SecureHttp.requestJson(
            baseUrl = baseUrl,
            pathSegments = listOf("api", "template"),
            bearerToken = token,
            method = "POST",
            jsonBody = JSONObject().put("template", template),
        )
        return response.optString("translated", "").take(64).ifBlank { null }
    }

    fun sensorValue(baseUrl: String, token: String, entityId: String): String? {
        val state = fetchState(baseUrl, token, entityId)
        return state.state.takeIf { it.isNotBlank() && it.length <= 32 }
    }

    private fun numericValue(value: Any?): Double? {
        val number = when (value) {
            is Number -> value.toDouble()
            is String -> value.toDoubleOrNull()
            else -> null
        }
        return number?.takeIf { it.isFinite() && it in -100.0..100.0 }
    }

    private fun validateEntityId(entityId: String) {
        require(entityId.length <= 255 && entityId.matches(Regex("[a-z_][a-z0-9_]*\\.[a-z0-9_]+"))) {
            "Home Assistant entity ID is invalid."
        }
    }
}

internal fun weatherFromState(current: HomeAssistantState, forecast: HomeAssistantForecast?): HomeAssistantWeather =
    weatherFromValues(
        condition = current.state,
        apparentTemperature = current.attributes.opt("apparent_temperature"),
        currentTemperature = current.attributes.opt("temperature"),
        forecast = forecast,
    )

internal fun weatherFromValues(
    condition: String,
    apparentTemperature: Any?,
    currentTemperature: Any?,
    forecast: HomeAssistantForecast?,
): HomeAssistantWeather {
    val apparent = numericValueInRange(apparentTemperature)
    val current = numericValueInRange(currentTemperature)
    return HomeAssistantWeather(
        condition = condition.lowercase().take(40),
        // Many integrations omit apparent_temperature but do expose current temperature.
        displayTemperature = apparent ?: forecast?.apparentTemperature
            ?: current ?: forecast?.temperature,
        rainChancePercent = forecast?.rainChancePercent,
    )
}

internal fun resolveClimateDisplayValue(
    rawState: String,
    attribute: String,
    translatedState: String? = null,
    attributeValue: Any? = null,
): String? {
    if (attribute.isBlank()) return cleanClimateDisplayValue(translatedState ?: rawState)
    if (attribute == "state") return cleanClimateDisplayValue(rawState)
    require(attribute.matches(Regex("[a-zA-Z_][a-zA-Z0-9_]{0,63}"))) {
        "Climate attribute name is invalid."
    }
    val value = attributeValue ?: return null
    if (value is JSONObject || value is JSONArray || value == JSONObject.NULL) return null
    return cleanClimateDisplayValue(value.toString())
}

private fun numericValueInRange(value: Any?): Double? {
    val number = when (value) {
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull()
        else -> null
    }
    return number?.takeIf { it.isFinite() && it in -100.0..100.0 }
}

private fun cleanClimateDisplayValue(value: String?): String? =
    value?.filterNot { it.isISOControl() || it.code in 0x202a..0x202e || it.code in 0x2066..0x2069 }
        ?.take(32)
        ?.ifBlank { null }
