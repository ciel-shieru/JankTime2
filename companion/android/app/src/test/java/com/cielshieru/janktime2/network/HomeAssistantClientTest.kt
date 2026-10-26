package com.cielshieru.janktime2.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeAssistantClientTest {
    @Test
    fun weatherUsesCurrentTemperatureWhenApparentTemperatureIsNotProvided() {
        val weather = weatherFromValues(
            condition = "Rainy",
            apparentTemperature = null,
            currentTemperature = 27.2,
            forecast = null,
        )
        assertEquals("rainy", weather.condition)
        assertEquals(27.2, weather.displayTemperature!!, 0.0001)
        assertNull(weather.rainChancePercent)
    }

    @Test
    fun apparentTemperatureWinsAndForecastProbabilityRemainsIndependent() {
        val weather = weatherFromValues(
            condition = "rainy",
            apparentTemperature = 29.0,
            currentTemperature = 27.2,
            forecast = HomeAssistantForecast(
                apparentTemperature = 28.0,
                temperature = 26.0,
                rainChancePercent = 70,
            ),
        )
        assertEquals(29.0, weather.displayTemperature!!, 0.0001)
        assertEquals(70, weather.rainChancePercent)
    }

    @Test
    fun climateTranslationPrefersTemplateResultThenStateResponse() {
        assertEquals("Heating", preferredTranslatedClimateState("Heating", "heat"))
        assertEquals("Cooling", preferredTranslatedClimateState(null, "Cooling"))
        assertEquals("Cooling", preferredTranslatedClimateState("", "Cooling"))
        assertNull(preferredTranslatedClimateState(null, ""))
    }

    @Test
    fun blankClimateAttributeUsesTranslatedStateAndFallsBackToRawState() {
        assertEquals("Heating", resolveClimateDisplayValue("heat", "", "Heating"))
        assertEquals("heat", resolveClimateDisplayValue("heat", ""))
        assertEquals("heat", resolveClimateDisplayValue("heat", "state"))
        assertEquals("21.5", resolveClimateDisplayValue("heat", "temperature", attributeValue = 21.5))
    }
}
