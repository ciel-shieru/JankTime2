package com.cielshieru.janktime2.data

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
        assertTrue(message.contains("Home Assistant, Prometheus"))
        assertTrue(message.contains("Watch updated where data is available"))
        assertTrue(!message.contains("token") && !message.contains("https://"))
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
