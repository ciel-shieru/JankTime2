package com.cielshieru.janktime2.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Instant
import java.time.ZoneId

class WakeyExportClientTest {
    private val now = Instant.parse("2026-10-27T03:00:00Z")
    private val zone = ZoneId.of("Asia/Singapore")

    @Test
    fun selectsEarlierUpcomingBedtime() {
        val result = selectWakeyAlarmStatus(
            nextAlarmAt = "2026-10-27T23:30:00Z",
            bedtimeAt = "2026-10-27T14:00:00Z",
            now = now,
            zone = zone,
        )
        assertEquals("22:00", result.displayTime)
        assertTrue(result.isBedtime)
    }

    @Test
    fun fallsBackToUpcomingAlarmWhenBedtimeHasPassed() {
        val result = selectWakeyAlarmStatus(
            nextAlarmAt = "2026-10-27T23:30:00Z",
            bedtimeAt = "2026-10-27T02:00:00Z",
            now = now,
            zone = zone,
        )
        assertEquals("07:30", result.displayTime)
        assertFalse(result.isBedtime)
    }

    @Test
    fun refusesEmptyOrPastTimestampsSoLastKnownGoodCanBeRetained() {
        listOf(
            null to null,
            "2026-10-27T02:00:00Z" to null,
            null to "2026-10-27T02:00:00Z",
        ).forEach { (alarm, bedtime) ->
            runCatching { selectWakeyAlarmStatus(alarm, bedtime, now, zone) }
                .onSuccess { throw AssertionError("Accepted an export with no upcoming alarm/bedtime") }
                .onFailure { failure -> assertTrue(failure is IOException) }
        }
    }

    @Test
    fun malformedTimestampIsRejectedInsteadOfClearingCachedState() {
        runCatching {
            selectWakeyAlarmStatus("not-an-instant", null, now, zone)
        }.onSuccess {
            throw AssertionError("Accepted an invalid timestamp")
        }.onFailure { failure ->
            assertTrue(failure is IOException)
        }
    }
}
