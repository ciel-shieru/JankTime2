package com.cielshieru.janktime2.pebble

import com.cielshieru.janktime2.data.SyncDiagnostics
import io.rebble.pebblekit2.client.BasePebbleListenerService
import io.rebble.pebblekit2.common.model.PebbleDictionary
import io.rebble.pebblekit2.common.model.PebbleDictionaryItem
import io.rebble.pebblekit2.common.model.ReceiveResult
import io.rebble.pebblekit2.common.model.WatchIdentifier
import java.util.UUID

/**
 * Temporary diagnostic-only watch-to-phone listener.
 *
 * The watch sends only receiver state, outcome enums, a capped packet count, and
 * validated slot/metric identifiers. Never log the raw Pebble dictionary.
 */
class WatchDiagnosticListenerService : BasePebbleListenerService() {
    override fun onAppOpened(watchappUUID: UUID, watch: WatchIdentifier) {
        if (watchappUUID == PebbleBridge.WATCHFACE_UUID) {
            SyncDiagnostics.info("watch_diagnostic_app_opened")
        }
    }

    override fun onAppClosed(watchappUUID: UUID, watch: WatchIdentifier) {
        if (watchappUUID == PebbleBridge.WATCHFACE_UUID) {
            SyncDiagnostics.info("watch_diagnostic_app_closed")
        }
    }

    override suspend fun onMessageReceived(
        watchappUUID: UUID,
        data: PebbleDictionary,
        watch: WatchIdentifier,
    ): ReceiveResult {
        if (watchappUUID != PebbleBridge.WATCHFACE_UUID) return ReceiveResult.Nack

        val type = data[TYPE_KEY].asText()
        val id = data[ID_KEY].asText()
        if (type != "diagnostic" || id != "receiver") {
            // This temporary listener ignores non-diagnostic payloads without logging them.
            return ReceiveResult.Ack
        }

        val outcome = data[VALUE_KEY].asText()
            ?.takeIf { it in ALLOWED_OUTCOMES } ?: "unknown"
        val receivedCount = data[FLAGS_KEY].asNonNegativeLong()
            ?.coerceAtMost(MAX_RECEIVED_COUNT)?.toString() ?: "invalid"
        val summary = data[EXTRA_KEY].asText()
            ?.let(::safeDiagnosticSummary) ?: "unavailable"

        SyncDiagnostics.info(
            "watch_receiver_diagnostic",
            mapOf(
                "outcome" to outcome,
                "rx" to receivedCount,
                "summary" to summary,
            ),
        )
        return ReceiveResult.Ack
    }

    private fun PebbleDictionaryItem?.asText(): String? =
        (this as? PebbleDictionaryItem.Text)?.value

    private fun PebbleDictionaryItem?.asNonNegativeLong(): Long? = when (this) {
        is PebbleDictionaryItem.UInt32 -> value.toLong()
        is PebbleDictionaryItem.Int32 -> value.takeIf { it >= 0 }?.toLong()
        is PebbleDictionaryItem.UInt16 -> value.toLong()
        is PebbleDictionaryItem.Int16 -> value.takeIf { it >= 0 }?.toLong()
        is PebbleDictionaryItem.UInt8 -> value.toLong()
        is PebbleDictionaryItem.Int8 -> value.takeIf { it >= 0 }?.toLong()
        else -> null
    }

    private fun safeDiagnosticSummary(value: String): String {
        val match = SLOT_SUMMARY.matchEntire(value) ?: return "unavailable"
        val slot = match.groupValues[1]
        val previousMetric = match.groupValues[2]
        val nextMetric = match.groupValues[3]
        val redraw = match.groupValues[4]
        if (slot !in ALLOWED_SLOTS ||
            previousMetric !in ALLOWED_METRICS ||
            nextMetric !in ALLOWED_METRICS
        ) return "unavailable"

        return "$slot:$previousMetric>$nextMetric:$redraw"
    }

    companion object {
        private const val TYPE_KEY = 0u
        private const val ID_KEY = 1u
        private const val VALUE_KEY = 2u
        private const val FLAGS_KEY = 3u
        private const val EXTRA_KEY = 4u
        private const val MAX_RECEIVED_COUNT = 2_147_483_647L

        private val ALLOWED_OUTCOMES = setOf(
            "waiting",
            "received",
            "slot_applied",
            "rejected",
            "metric_applied",
            "image_applied",
            "status_applied",
            "row_applied",
            "ignored",
            "handler_error",
        )
        private val ALLOWED_SLOTS = setOf(
            "grid.top.1", "grid.top.2", "grid.top.3", "grid.top.4", "grid.top.5",
            "grid.bottom.1", "grid.bottom.2", "grid.bottom.4", "grid.bottom.5",
            "clock.left", "clock.right",
        )
        private val ALLOWED_METRICS = setOf(
            "none", "focusCount", "steps", "totalSleep", "restfulSleep", "fanState",
            "cpuUsage", "memoryUsage", "weatherFeelsLike", "rainChance", "alertCount",
            "water", "haSensor", "haClimateValue",
        )
        private val SLOT_SUMMARY = Regex(
            "^((?:grid\\.top\\.[1-5])|(?:grid\\.bottom\\.(?:1|2|4|5))|(?:clock\\.(?:left|right))):" +
                "([A-Za-z0-9]+)>([A-Za-z0-9]+):([01])$",
        )
    }
}
