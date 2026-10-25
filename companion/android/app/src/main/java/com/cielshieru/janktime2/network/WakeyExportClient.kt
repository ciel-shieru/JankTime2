package com.cielshieru.janktime2.network

import android.content.ContentResolver
import android.net.Uri
import android.os.Bundle
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class WakeyAlarmStatus(val displayTime: String, val isBedtime: Boolean)

class WakeyExportClient(private val resolver: ContentResolver) {
    fun read(token: String): WakeyAlarmStatus? {
        require(token.length in 40..80 && token.all { it.code in 0x21..0x7e }) { "Wakey pairing token is invalid." }
        val uri = Uri.parse("content://com.cielshieru.wakey.pebble-export")
        val args = Bundle().apply { putString("pairing_token", token) }
        val response = resolver.call(uri, "get_snapshot", null, args)
            ?: throw IOException("Wakey export returned no response.")
        if (response.containsKey("error")) throw IOException("Wakey export is disabled or pairing is invalid.")
        if (response.getInt("schemaVersion", -1) != 1) throw IOException("Wakey export schema is unsupported.")

        val alarmAt = response.getString("nextAlarmAt")?.let(::parseInstant)
        val bedtimeAt = response.getString("bedtimeAt")?.let(::parseInstant)
        val chosenBedtime = bedtimeAt != null && (alarmAt == null || bedtimeAt.isBefore(alarmAt))
        val selected = if (chosenBedtime) bedtimeAt else alarmAt
        if (selected == null) return null

        val formatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
        return WakeyAlarmStatus(formatter.format(selected), chosenBedtime)
    }

    private fun parseInstant(raw: String): Instant =
        runCatching { Instant.parse(raw) }.getOrElse {
            throw IOException("Wakey export timestamp is invalid.")
        }
}
