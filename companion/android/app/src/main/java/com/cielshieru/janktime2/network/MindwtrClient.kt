package com.cielshieru.janktime2.network

import android.content.Context
import com.cielshieru.janktime2.data.MindwtrFocusLedger
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private fun parseMindwtrInstant(raw: String?): Instant? {
    if (raw.isNullOrBlank()) return null
    try { return Instant.parse(raw) } catch (_: DateTimeParseException) { }
    try { return OffsetDateTime.parse(raw).toInstant() } catch (_: DateTimeParseException) { }
    try { return LocalDateTime.parse(raw).atZone(ZoneId.systemDefault()).toInstant() } catch (_: DateTimeParseException) { }
    try { return LocalDate.parse(raw).atStartOfDay(ZoneId.systemDefault()).toInstant() } catch (_: DateTimeParseException) { }
    return null
}

private fun formatMindwtrTime(raw: String?): String {
    val instant = parseMindwtrInstant(raw) ?: return "--:--"
    return DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(instant)
}

private fun cleanMindwtrText(value: String, maxChars: Int): String =
    value.replace(Regex("[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]"), "")
        .take(maxChars)

data class MindwtrTask(
    val id: String,
    val title: String,
    val status: String,
    val priority: String,
    val startTime: String?,
    val dueDate: String?,
    val focusedToday: Boolean,
) {
    val isActive: Boolean get() = status.lowercase() !in setOf("done", "completed", "archived", "deleted")

    fun row(): String {
        val marks = when (priority.lowercase()) {
            "low" -> "!"
            "medium" -> "!!"
            "high" -> "!!!"
            "urgent" -> "!!!!"
            else -> ""
        }
        return formatMindwtrTime(startTime) + " | " + formatMindwtrTime(dueDate) + " | " + marks + " | " + cleanMindwtrText(title, 160)
    }

    fun sortKey(): Pair<Long, Long> =
        (parseMindwtrInstant(startTime)?.toEpochMilli() ?: Long.MAX_VALUE) to
            (parseMindwtrInstant(dueDate)?.toEpochMilli() ?: Long.MAX_VALUE)
}

data class MindwtrFocusResult(val remaining: Int, val total: Int, val rows: List<String>)

class MindwtrClient(context: Context) {
    private val ledger = MindwtrFocusLedger(context)

    fun fetchTodayFocus(baseUrl: String, token: String): MindwtrFocusResult {
        require(token.isNotBlank()) { "Mindwtr token is required." }
        val limit = 100
        var offset = 0
        var expectedTotal = 0
        val tasks = mutableListOf<MindwtrTask>()
        do {
            val response = SecureHttp.requestJson(
                baseUrl = baseUrl,
                pathSegments = listOf("v1", "tasks"),
                query = mapOf(
                    "isFocusedToday" to "true",
                    "all" to "1",
                    "limit" to limit.toString(),
                    "offset" to offset.toString(),
                ),
                bearerToken = token,
            )
            val page = response.optJSONArray("tasks")
                ?: throw IllegalArgumentException("Mindwtr response has no task list.")
            expectedTotal = response.optInt("total", offset + page.length())
            if (expectedTotal !in 0..MAX_TASKS) throw IllegalArgumentException("Mindwtr task list exceeds the configured limit.")
            for (i in 0 until page.length()) {
                val obj = page.optJSONObject(i) ?: continue
                parseTask(obj)?.let(tasks::add)
            }
            if (page.length() == 0) break
            offset += page.length()
        } while (offset < expectedTotal && offset < MAX_TASKS)

        val seenToday = ledger.mergeToday(tasks.filter { it.focusedToday }.map { it.id })
        val currentFocused = tasks.filter { it.focusedToday && it.isActive }.distinctBy { it.id }
        val total = (seenToday + currentFocused.map { it.id }).size.coerceAtMost(MAX_TASKS)
        val rows = currentFocused.sortedWith(
            compareBy<MindwtrTask> { it.sortKey().first }
                .thenBy { it.sortKey().second }
                .thenBy { it.id },
        ).take(2).map(MindwtrTask::row)
        return MindwtrFocusResult(remaining = currentFocused.size, total = total, rows = rows)
    }

    private fun parseTask(obj: JSONObject): MindwtrTask? {
        val id = obj.optString("id").take(128)
        if (id.isBlank()) return null
        return MindwtrTask(
            id = id,
            title = obj.optString("title").take(512),
            status = obj.optString("status").take(24),
            priority = obj.optString("priority").take(16),
            startTime = obj.optString("startTime").takeIf { it.isNotBlank() && it != "null" }?.take(64),
            dueDate = obj.optString("dueDate").takeIf { it.isNotBlank() && it != "null" }?.take(64),
            focusedToday = obj.optBoolean("isFocusedToday", false),
        )
    }

    companion object {
        private const val MAX_TASKS = 1000
    }
}
