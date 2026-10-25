package com.cielshieru.janktime2.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import com.cielshieru.janktime2.config.RegexFilter
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class DeviceCalendar(val id: String, val displayName: String)

data class CalendarEventRow(
    val startMillis: Long,
    val startTime: String,
    val location: String,
    val title: String,
    val description: String,
) {
    fun displayRow(): String = startTime + " | " + location.take(10) + " | " + title
}

class CalendarReader(private val context: Context) {
    fun listCalendars(): List<DeviceCalendar> {
        requirePermission()
        val result = mutableListOf<DeviceCalendar>()
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
        )
        context.contentResolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            CalendarContract.Calendars.VISIBLE + " = ?",
            arrayOf("1"),
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC",
        )?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars._ID)
            val nameIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)
            while (cursor.moveToNext() && result.size < MAX_CALENDARS) {
                val id = cursor.getLong(idIndex).toString()
                val name = cursor.safeString(nameIndex).take(100)
                result += DeviceCalendar(id, name)
            }
        }
        return result
    }

    fun nextEvents(
        selectedCalendarIds: Set<String>,
        rawPatterns: List<String>,
        nowMillis: Long = System.currentTimeMillis(),
    ): List<CalendarEventRow> {
        requirePermission()
        if (selectedCalendarIds.isEmpty()) return emptyList()
        val ids = selectedCalendarIds.filter { it.matches(Regex("\\d{1,12}")) }.take(MAX_CALENDARS)
        if (ids.isEmpty()) return emptyList()

        val patterns = RegexFilter.validate(rawPatterns).map(::Regex)
        val endMillis = nowMillis + LOOK_AHEAD_MILLIS
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon()
            .appendPath(nowMillis.toString())
            .appendPath(endMillis.toString())
            .build()
        val projection = arrayOf(
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.DESCRIPTION,
            CalendarContract.Instances.CALENDAR_ID,
        )
        val placeholders = ids.joinToString(",") { "?" }
        val selection = CalendarContract.Instances.CALENDAR_ID + " IN (" + placeholders + ")"
        val events = ArrayList<CalendarEventRow>()
        context.contentResolver.query(
            uri,
            projection,
            selection,
            ids.toTypedArray(),
            CalendarContract.Instances.BEGIN + " ASC",
        )?.use { cursor ->
            val beginIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)
            val titleIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.TITLE)
            val locationIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_LOCATION)
            val descriptionIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.DESCRIPTION)
            while (cursor.moveToNext() && events.size < MAX_EVENTS_SCANNED) {
                val title = cleanText(cursor.safeString(titleIndex), 180)
                val location = cleanText(cursor.safeString(locationIndex), 128)
                val description = cleanText(cursor.safeString(descriptionIndex), 512)
                if (RegexFilter.matchesAny(patterns, listOf(title, location, description))) continue
                val begin = cursor.getLong(beginIndex)
                val time = DateTimeFormatter.ofPattern("HH:mm")
                    .withZone(ZoneId.systemDefault())
                    .format(Instant.ofEpochMilli(begin))
                events += CalendarEventRow(begin, time, location.take(10), title, "")
            }
        }
        return events.sortedBy { it.startMillis }.take(2)
    }

    private fun requirePermission() {
        check(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
            "Calendar permission is not granted."
        }
    }

    private fun Cursor.safeString(index: Int): String =
        if (isNull(index)) "" else getString(index).orEmpty().filterNot(Char::isISOControl)

    private fun cleanText(value: String, maximum: Int): String =
        value.replace(Regex("[\\u202a-\\u202e\\u2066-\\u2069]"), "").take(maximum)

    companion object {
        private const val MAX_CALENDARS = 50
        private const val MAX_EVENTS_SCANNED = 400
        private const val LOOK_AHEAD_MILLIS = 7L * 24L * 60L * 60L * 1000L
    }
}
