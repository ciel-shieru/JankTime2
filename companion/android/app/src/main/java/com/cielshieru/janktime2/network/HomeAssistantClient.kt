package com.cielshieru.janktime2.network

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

data class HomeAssistantState(
    val entityId: String,
    val state: String,
    val attributes: JSONObject,
)

data class HomeAssistantWeather(
    val condition: String,
    val feelsLikeTemperature: Double?,
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
        val state = json.optString("state", "").take(256)
        val attributes = json.optJSONObject("attributes") ?: JSONObject()
        return HomeAssistantState(entityId, state, attributes)
    }

    fun fetchWeather(baseUrl: String, token: String, entityId: String): HomeAssistantWeather {
        val current = fetchState(baseUrl, token, entityId)
        val condition = current.state.lowercase().take(40)
        val currentApparent = numericAttribute(current.attributes, "apparent_temperature")
        val forecast = runCatching { fetchFirstForecast(baseUrl, token, entityId) }.getOrNull()
        return HomeAssistantWeather(
            condition = condition,
            feelsLikeTemperature = currentApparent ?: forecast?.first,
            rainChancePercent = forecast?.second,
        )
    }

    /**
     * Home Assistant's weather.get_forecasts action returns
     * service_response[entity_id].forecast. Integrations can omit optional fields.
     */
    private fun fetchFirstForecast(
        baseUrl: String,
        token: String,
        entityId: String,
    ): Pair<Double?, Int?>? {
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
        for (i in 0 until minOf(forecasts.length(), 48)) {
            val item = forecasts.optJSONObject(i) ?: continue
            val apparent = numericValue(item.opt("apparent_temperature"))
            val probability = numericValue(item.opt("precipitation_probability"))
                ?.takeIf { it in 0.0..100.0 }
                ?.roundToInt()
            if (apparent != null || probability != null) return apparent to probability
        }
        return null
    }

    fun climateDisplayValue(baseUrl: String, token: String, entityId: String, attribute: String): String? {
        val state = fetchState(baseUrl, token, entityId)
        if (attribute == "state") return state.state.takeIf { it.isNotBlank() }?.take(32)
        require(attribute.matches(Regex("[a-zA-Z_][a-zA-Z0-9_]{0,63}"))) {
            "Climate attribute name is invalid."
        }
        val value = state.attributes.opt(attribute) ?: return null
        if (value is JSONObject || value is JSONArray || value == JSONObject.NULL) return null
        return value.toString().filterNot { it.isISOControl() }.take(32).ifBlank { null }
    }

    fun sensorValue(baseUrl: String, token: String, entityId: String): String? {
        val state = fetchState(baseUrl, token, entityId)
        return state.state.takeIf { it.isNotBlank() && it.length <= 32 }
    }

    private fun numericAttribute(attributes: JSONObject, name: String): Double? =
        numericValue(attributes.opt(name))

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
