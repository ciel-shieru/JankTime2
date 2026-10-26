package com.cielshieru.janktime2.network

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeAssistantClientTest {
    @Test
    fun weatherUsesCurrentTemperatureWhenApparentTemperatureIsNotProvided() {
        val state = HomeAssistantState(
            entityId = "weather.home",
            state = "rainy",
            attributes = JSONObject().put("temperature", 27.2).put("humidity", 84).put("uv_index", 0),
        )
        val weather = weatherFromState(state, null)
        assertEquals("rainy", weather.condition)
        assertEquals(27.2, weather.displayTemperature!!, 0.0001)
        assertNull(weather.rainChancePercent)
    }

    @Test
    fun currentApparentTemperatureWinsAndForecastProbabilityRemainsIndependent() {
        val state = HomeAssistantState(
            entityId = "weather.home",
            state = "rainy",
            attributes = JSONObject().put("temperature", 27.2).put("apparent_temperature", 29.0),
        )
        val weather = weatherFromState(
            state,
            HomeAssistantForecast(apparentTemperature = 28.0, temperature = 26.0, rainChancePercent = 70),
        )
        assertEquals(29.0, weather.displayTemperature!!, 0.0001)
        assertEquals(70, weather.rainChancePercent)
    }

    @Test
    fun blankClimateAttributeUsesTranslatedStateAndFallsBackToRawState() {
        val state = HomeAssistantState("climate.living_room", "heat", JSONObject().put("temperature", 21.5))
        assertEquals("Heating", resolveClimateDisplayValue(state, "", "Heating"))
        assertEquals("heat", resolveClimateDisplayValue(state, ""))
        assertEquals("heat", resolveClimateDisplayValue(state, "state"))
        assertEquals("21.5", resolveClimateDisplayValue(state, "temperature"))
    }
}
