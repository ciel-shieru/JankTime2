package com.cielshieru.janktime2.data

import android.content.Context
import org.json.JSONArray
import java.time.LocalDate

/** Stores only task IDs observed focused today; never task titles. */
class MindwtrFocusLedger(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun mergeToday(idsObservedFocused: Collection<String>): Set<String> {
        val today = LocalDate.now().toString()
        val previousDate = prefs.getString(DATE_KEY, null)
        val existing = if (previousDate == today) readIds() else emptySet()
        val merged = (existing + idsObservedFocused.filter(::validId)).take(MAX_IDS).toSet()
        prefs.edit()
            .putString(DATE_KEY, today)
            .putString(IDS_KEY, JSONArray(merged.toList()).toString())
            .apply()
        return merged
    }

    private fun readIds(): Set<String> {
        val source = prefs.getString(IDS_KEY, null) ?: return emptySet()
        return runCatching {
            val json = JSONArray(source)
            buildSet {
                for (i in 0 until minOf(json.length(), MAX_IDS)) {
                    val value = json.optString(i)
                    if (validId(value)) add(value)
                }
            }
        }.getOrDefault(emptySet())
    }

    private fun validId(id: String): Boolean =
        id.length in 1..128 && id.all { it.isLetterOrDigit() || it in "-_" }

    companion object {
        private const val PREFS_NAME = "janktime2_focus_ledger"
        private const val DATE_KEY = "date"
        private const val IDS_KEY = "task_ids"
        private const val MAX_IDS = 1000
    }
}
