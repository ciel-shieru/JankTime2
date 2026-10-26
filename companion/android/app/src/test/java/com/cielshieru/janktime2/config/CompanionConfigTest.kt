package com.cielshieru.janktime2.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CompanionConfigTest {
    @Test
    fun refreshIntervalsAcceptInclusiveBounds() {
        assertEquals(1, RefreshIntervals.validate(1))
        assertEquals(60, RefreshIntervals.validate(60))
    }

    @Test
    fun refreshIntervalsRejectValuesOutsideRange() {
        listOf(-1, 0, 61, 1000).forEach { value ->
            runCatching { RefreshIntervals.validate(value) }
                .onSuccess { throw AssertionError("Accepted invalid interval: " + value) }
        }
    }

    @Test
    fun calendarTodayOnlyDefaultsOffAndSupportsLegacyBackups() {
        assertFalse(CompanionConfig().calendarTodayOnly)
        assertEquals("", CompanionConfig().climateAttribute)
        assertTrue(decodeCalendarTodayOnly(true, true))
        assertFalse(decodeCalendarTodayOnly(true, false))

        // Older schema-v1 backups without the optional field default to disabled.
        assertFalse(decodeCalendarTodayOnly(false, null))
        runCatching { decodeCalendarTodayOnly(true, "true") }
            .onSuccess { throw AssertionError("Accepted a non-boolean calendar setting") }
    }

    @Test
    fun regexFilterRejectsMalformedUnsafeAndOversizedPatterns() {
        assertEquals(2, RegexFilter.validate(listOf("cluster.*", "^lab$")).size)
        assertFalse(RegexFilter.matchesAny(listOf(Regex("blocked")), listOf("public title")))
        listOf("[", "(a+)+$", "(?=private)", "(a)\\1").forEach { pattern ->
            runCatching { RegexFilter.validate(listOf(pattern)) }
                .onSuccess { throw AssertionError("Accepted unsafe or invalid regular expression: " + pattern) }
        }
        runCatching { RegexFilter.validate(listOf("a".repeat(121))) }
            .onSuccess { throw AssertionError("Accepted oversized regular expression") }
        runCatching { RegexFilter.validate((1..11).map { "a$it" }) }
            .onSuccess { throw AssertionError("Accepted too many regular expressions") }
    }
}
