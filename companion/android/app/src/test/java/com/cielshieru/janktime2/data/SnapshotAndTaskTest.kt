package com.cielshieru.janktime2.data

import com.cielshieru.janktime2.config.CompanionConfig
import com.cielshieru.janktime2.network.MindwtrTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SnapshotAndTaskTest {
    @Test
    fun refreshReportExplainsDeliveryAndUnavailableSourcesWithoutProviderDetails() {
        assertEquals(
            "Refresh complete. The latest data snapshot was sent to the watch.",
            RefreshReport(emptyList()).userMessage(),
        )
        val report = RefreshReport(listOf("Home Assistant", "Prometheus", "Home Assistant"))
        val message = report.userMessage()
        assertTrue(message.contains("Home Assistant (HTTPS URL, token"))
        assertTrue(message.contains("Prometheus (HTTPS URL, token"))
        assertTrue(message.contains("Watch updated where data is available"))
        assertTrue(!message.contains("https://") && !message.contains("example-secret"))
    }

    @Test
    fun metricSanitizationIsBoundedAndStalenessIsTracked() {
        val snapshot = WatchSnapshot()
            .withMetric("cpuUsage", "10%\u202e")
            .markStale(listOf("cpuUsage"))
        assertEquals("10%", snapshot.metricValues["cpuUsage"])
        assertTrue("cpuUsage" in snapshot.staleMetrics)
    }

    @Test
    fun climateMetricCanBeConfiguredWithoutFanOrWaterEntities() {
        val config = CompanionConfig(climateEntity = "climate.living_room")
        assertEquals(listOf("haClimateValue"), configuredHomeAssistantMetrics(config))
    }

    @Test
    fun taskRowsUseDatesWhenTimesAreMissingOrMidnight() {
        val task = MindwtrTask(
            id = "date-only",
            title = "Review",
            status = "next",
            priority = "medium",
            startTime = "2026-10-26",
            dueDate = "2026-10-27",
            focusedToday = true,
        )
        assertTrue(task.row().startsWith("26/10 | 27/10 | !! |"))
        val midnightTask = task.copy(
            startTime = "2026-10-26T00:00:00",
            dueDate = "2026-10-27T00:00:00",
        )
        assertTrue(midnightTask.row().startsWith("26/10 | 27/10 | !! |"))
    }

    @Test
    fun taskRowsShowDatesAndTimesWhenTimedTaskSpansDays() {
        val task = MindwtrTask(
            id = "spanning-task",
            title = "Travel",
            status = "next",
            priority = "high",
            startTime = "2026-10-26T13:00:00",
            dueDate = "2026-10-27T15:30:00",
            focusedToday = true,
        )
        assertTrue(task.row().startsWith("26/10 13:00 | 27/10 15:30 | !!! |"))
    }

    @Test
    fun taskRowsApplyPriorityMarksAndStripBidirectionalControls() {
        val task = MindwtrTask(
            id = "opaque-task-id",
            title = "Review\u202e cluster alerts",
            status = "next",
            priority = "urgent",
            startTime = "2026-10-25T09:30:00+08:00",
            dueDate = "2026-10-25T17:00:00+08:00",
            focusedToday = true,
        )
        val row = task.row()
        assertTrue(row.contains("!!!!"))
        assertTrue(row.endsWith("Review cluster alerts"))
        assertTrue(!row.contains('\u202e'))
    }
}
