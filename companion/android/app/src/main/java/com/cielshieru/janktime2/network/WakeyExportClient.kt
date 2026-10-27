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
    fun read(token: String): WakeyAlarmStatus {
        require(token.length in 40..80 && token.all { it.code in 0x21..0x7e }) {
            "Wakey pairing token is invalid."
        }
        val uri = Uri.parse("content://com.cielshieru.wakey.pebble-export")
        val args = Bundle().apply { putString("pairing_token", token) }
        val response = resolver.call(uri, "get_snapshot", null, args)
            ?: throw IOException("Wakey export returned no response.")
        if (response.containsKey("error")) throw IOException("Wakey export is disabled or pairing is invalid.")
        if (response.getInt("schemaVersion", -1) != 1) throw IOException("Wakey export schema is unsupported.")

        return selectWakeyAlarmStatus(
            response.getString("nextAlarmAt"),
            response.getString("bedtimeAt"),
            Instant.now(),
            ZoneId.systemDefault(),
        )
    }
}

internal fun selectWakeyAlarmStatus(
    nextAlarmAt: String?,
    bedtimeAt: String?,
    now: Instant,
    zone: ZoneId,
): WakeyAlarmStatus {
    fun futureInstant(raw: String?, label: String): Instant? {
        if (raw == null) return null
        if (raw.length > 64) throw IOException("Wakey export $label timestamp is too long.")
        val parsed = runCatching { Instant.parse(raw) }.getOrElse {
            throw IOException("Wakey export timestamp is invalid.")
        }
        return parsed.takeIf { it.isAfter(now) }
    }

    val alarmAt = futureInstant(nextAlarmAt, "alarm")
    val bedtime = futureInstant(bedtimeAt, "bedtime")
    val chooseBedtime = bedtime != null && (alarmAt == null || bedtime.isBefore(alarmAt))
    val selected = (if (chooseBedtime) bedtime else alarmAt)
        ?: throw IOException("Wakey export has no upcoming alarm or bedtime.")

    val formatter = DateTimeFormatter.ofPattern("HH:mm").withZone(zone)
    return WakeyAlarmStatus(formatter.format(selected), chooseBedtime)
}
