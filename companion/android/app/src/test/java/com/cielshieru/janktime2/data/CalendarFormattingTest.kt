package com.cielshieru.janktime2.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class CalendarFormattingTest {
    @Test
    fun todayOnlyWindowEndsAtNextLocalMidnightWhileDefaultKeepsSevenDayWindow() {
        val zone = ZoneId.systemDefault()
        val now = LocalDate.of(2026, 10, 26).atTime(13, 15).atZone(zone).toInstant().toEpochMilli()
        val nextMidnight = LocalDate.of(2026, 10, 27).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(nextMidnight, calendarQueryEndMillis(now, onlyToday = true))
        assertEquals(
            java.time.Instant.ofEpochMilli(now).atZone(zone).plusYears(1).toInstant().toEpochMilli(),
            calendarQueryEndMillis(now, onlyToday = false),
        )
    }

    @Test
    fun calendarRowsConditionallyPrefixTheLocalDate() {
        val start = LocalDate.of(2026, 10, 26).atTime(13, 0)
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val event = CalendarEventRow(start, "13:00", "Home", "Event", "")
        assertTrue(event.displayRow(includeDate = true).startsWith("26/10 13:00 | Home | Event"))
        assertTrue(event.displayRow(includeDate = false).startsWith("13:00 | Home | Event"))
    }
}
