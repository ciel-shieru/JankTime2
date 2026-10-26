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
    fun calendarTodayOnlyDefaultsOffAndSurvivesBackupRoundTrip() {
        assertFalse(CompanionConfig().calendarTodayOnly)
        assertEquals("", CompanionConfig().climateAttribute)
        val enabled = CompanionConfig(calendarTodayOnly = true, climateAttribute = "")
        val restored = ConfigBackupCodec.decode(ConfigBackupCodec.encode(enabled)).config
        assertTrue(restored.calendarTodayOnly)
        assertEquals("", restored.climateAttribute)

        // Older schema-v1 backups that lack the optional field stay compatible.
        val legacy = ConfigBackupCodec.decode(
            """{"schemaVersion":1,"config":{"climateAttribute":""}}"""
        ).config
        assertFalse(legacy.calendarTodayOnly)
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
