package com.cielshieru.janktime2.config

import org.junit.Assert.assertEquals
import org.junit.Test

class HeartRateHistoryTest {
    @Test
    fun acceptsMinutePrecisionFromFiveMinutesThroughOneDay() {
        assertEquals(5, HeartRateHistory.fromHoursAndMinutes(0, 5))
        assertEquals(59, HeartRateHistory.fromHoursAndMinutes(0, 59))
        assertEquals(60, HeartRateHistory.fromHoursAndMinutes(1, 0))
        assertEquals(720, HeartRateHistory.fromHoursAndMinutes(12, 0))
        assertEquals(1440, HeartRateHistory.fromHoursAndMinutes(24, 0))
    }

    @Test
    fun rejectsOutOfRangeAndMalformedValues() {
        listOf(4, 1441, 0, -1).forEach { minutes ->
            runCatching { HeartRateHistory.validate(minutes) }
                .onSuccess { throw AssertionError("Accepted invalid heart-rate history: $minutes") }
        }
        runCatching { HeartRateHistory.fromHoursAndMinutes(24, 1) }
            .onSuccess { throw AssertionError("Accepted a window longer than 24 hours") }
        runCatching { HeartRateHistory.fromHoursAndMinutes(0, 4) }
            .onSuccess { throw AssertionError("Accepted a window shorter than 5 minutes") }
        runCatching { HeartRateHistory.decodeBackupValue(true, "720") }
            .onSuccess { throw AssertionError("Accepted a non-numeric JSON history value") }
        runCatching { HeartRateHistory.decodeBackupValue(true, 720.5) }
            .onSuccess { throw AssertionError("Accepted fractional history") }
    }

    @Test
    fun oldBackupsAndCorruptStoredPreferencesUseTheTwoHourDefault() {
        assertEquals(120, HeartRateHistory.decodeBackupValue(false, null))
        assertEquals(120, HeartRateHistory.storedOrDefault(-1))
        assertEquals(720, HeartRateHistory.decodeBackupValue(true, 720))
    }
}
