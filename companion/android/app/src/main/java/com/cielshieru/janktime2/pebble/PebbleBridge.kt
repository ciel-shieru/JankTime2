package com.cielshieru.janktime2.pebble

import android.content.Context
import kotlinx.coroutines.CancellationException
import com.cielshieru.janktime2.data.SyncDiagnostics
import io.rebble.pebblekit2.client.DefaultPebbleAndroidAppPicker
import io.rebble.pebblekit2.client.DefaultPebbleSender
import io.rebble.pebblekit2.client.PebbleAndroidAppPicker
import io.rebble.pebblekit2.common.model.PebbleDictionaryItem
import io.rebble.pebblekit2.common.model.TransmissionResult
import java.io.IOException
import java.util.UUID

enum class PebbleDeliveryFailure(val logCode: String) {
    NO_SELECTED_BRIDGE("no_selected_bridge"),
    NO_ACKNOWLEDGEMENT("no_acknowledgement"),
    WATCH_NOT_CONNECTED("watch_not_connected"),
    DIFFERENT_APP_OPEN("different_app_open"),
    PERMISSIONS_DENIED("permissions_denied"),
    WATCH_TIMEOUT("watch_timeout"),
    WATCH_REJECTED_PACKET("watch_rejected_packet"),
    UNKNOWN_BRIDGE_RESULT("unknown_bridge_result"),
}

class PebbleDeliveryException(
    val failure: PebbleDeliveryFailure,
    message: String,
) : IOException(message)

/**
 * Bounded AppMessage serializer. It sends display fields only; credentials and provider
 * response bodies never enter this class.
 */
class PebbleBridge(context: Context) : AutoCloseable {
    private val appContext = context.applicationContext
    private val picker: PebbleAndroidAppPicker = DefaultPebbleAndroidAppPicker.getInstance(appContext)
    // PebbleKit Android 2 closes by unbinding unconditionally, even when its connection never bound.
    // Keep the sender lazy so app-picker operations do not create an unbound ServiceConnection.
    private val senderDelegate = lazy(LazyThreadSafetyMode.NONE) { DefaultPebbleSender(appContext) }
    private val sender by senderDelegate
    private var senderUsed = false

    init {
        // Auto-selecting an arbitrary service is unsafe for a watchface carrying private data.
        picker.enableAutoSelect = false
    }

    suspend fun availablePebbleApps(): List<String> =
        picker.getAllEligibleApps().filter { it.length <= 200 }.take(20).sorted()

    suspend fun selectedPebbleApp(): String? = picker.getCurrentlySelectedApp()

    suspend fun selectPebbleApp(packageName: String?) {
        require(packageName == null || packageName in availablePebbleApps()) {
            "Select an installed Pebble mobile app."
        }
        picker.selectApp(packageName)
    }

    suspend fun send(snapshot: com.cielshieru.janktime2.data.WatchSnapshot, config: com.cielshieru.janktime2.config.CompanionConfig) {
        val selectedApp = try {
            picker.getCurrentlySelectedApp()
        } catch (cancelled: CancellationException) {
            SyncDiagnostics.warning("bridge_selection_cancelled")
            throw cancelled
        } catch (failure: Exception) {
            SyncDiagnostics.failure("bridge_selection_lookup_failed", failure, includeStack = false)
            throw failure
        }
        SyncDiagnostics.info("bridge_selection_checked", mapOf("selected" to (selectedApp != null).toString()))
        if (selectedApp == null) {
            throw PebbleDeliveryException(
                PebbleDeliveryFailure.NO_SELECTED_BRIDGE,
                "No Pebble mobile app is selected. Select the installed Pebble or compatible Gravel app before refreshing.",
            )
        }
        SyncDiagnostics.info(
            "watch_sync_send_started",
            mapOf("slot_count" to config.metricSlots.size.toString(), "metric_count" to snapshot.metricValues.size.toString()),
        )

        for ((slot, metric) in config.metricSlots) {
            sendMessage("slot", slot, metric)
        }
        for ((metric, value) in snapshot.metricValues) {
            sendMessage(
                type = "metric",
                id = metric,
                value = truncateUtf8(value, MAX_VALUE_BYTES),
                flags = if (metric in snapshot.staleMetrics) 1 else 0,
                extra = if (metric == "weatherFeelsLike") snapshot.weatherCondition.orEmpty() else "",
            )
        }
        snapshot.phoneBatteryPercent?.let { sendMessage("status", "phoneBattery", it.toString()) }
        snapshot.phoneBluetoothConnected?.let {
            sendMessage("status", "phoneBluetooth", if (it) "1" else "0")
        }
        sendMessage("status", "alarmTime", snapshot.alarmTime ?: "--:--", if (snapshot.alarmIsBedtime) 1 else 0)
        sendMessage("status", "alarmStale", if (snapshot.alarmStale) "1" else "0")
        sendMessage("status", "heartHistoryMinutes", config.heartRateHistoryMinutes.toString())
        snapshot.currentBpm?.let { sendMessage("status", "heartRate", it.toString()) }
        snapshot.heartSamples?.takeIf { it.size >= 2 }?.take(16)?.let { samples ->
            sendMessage("status", "heartSamples", samples.joinToString(","))
        }
        snapshot.focusRows.take(2).forEachIndexed { index, text ->
            sendMessage("row", "focus." + (index + 1), truncateUtf8(text.orEmpty(), MAX_ROW_BYTES))
        }
        snapshot.calendarRows.take(2).forEachIndexed { index, text ->
            sendMessage("row", "calendar." + (index + 1), truncateUtf8(text.orEmpty(), MAX_ROW_BYTES))
        }
        SyncDiagnostics.info("watch_sync_send_completed")
    }

    suspend fun sendImageRows(rows: List<String>) {
        require(rows.size == 30 && rows.all { it.matches(Regex("[01]{30}")) }) {
            "Image must be downscaled to a 30 by 30 one-bit map before transfer."
        }
        if (picker.getCurrentlySelectedApp() == null) {
            throw IOException("No Pebble mobile app is selected. Select the installed Pebble or compatible Gravel app before sending an image.")
        }
        rows.chunked(3).forEachIndexed { chunkIndex, chunk ->
            val value = chunk.joinToString(";")
            sendMessage("image", "chunk." + chunkIndex, value, flags = 0)
        }
    }

    private suspend fun sendMessage(
        type: String,
        id: String,
        value: String,
        flags: Int = 0,
        extra: String = "",
    ) {
        require(type.length <= 16 && id.length <= 24 && extra.length <= 48)
        val valueLimit = if (type == "image") MAX_IMAGE_CHUNK_BYTES else MAX_VALUE_BYTES
        val boundedValue = truncateUtf8(value, valueLimit)
        val values = linkedMapOf<UInt, PebbleDictionaryItem>(
            TYPE_KEY to PebbleDictionaryItem.Text(type),
            ID_KEY to PebbleDictionaryItem.Text(id),
            VALUE_KEY to PebbleDictionaryItem.Text(boundedValue),
        )
        if (type == "metric" || (type == "status" && id == "alarmTime") || flags != 0) {
            values[FLAGS_KEY] = PebbleDictionaryItem.UInt8(flags)
        }
        if (extra.isNotEmpty()) values[EXTRA_KEY] = PebbleDictionaryItem.Text(truncateUtf8(extra, MAX_EXTRA_BYTES))

        // The dictionary limit includes key/type/length overhead, not only UTF-8 values.
        val wireBytes = values.values.sumOf { it.size + ENTRY_OVERHEAD_BYTES }
        require(wireBytes <= MAX_APP_MESSAGE_BYTES) {
            "AppMessage payload exceeds the supported dictionary size."
        }
        senderUsed = true
        SyncDiagnostics.debug(
            "appmessage_send_started",
            mapOf("type" to type, "id" to id, "payload_bytes" to wireBytes.toString()),
        )
        val result = try {
            sender.sendDataToPebble(WATCHFACE_UUID, values)
        } catch (cancelled: CancellationException) {
            SyncDiagnostics.warning("appmessage_send_cancelled", mapOf("type" to type, "id" to id))
            throw cancelled
        } catch (failure: Exception) {
            SyncDiagnostics.failure(
                "appmessage_transport_exception",
                failure,
                mapOf("type" to type, "id" to id),
                includeStack = false,
            )
            throw failure
        }
        if (result.isNullOrEmpty()) {
            val exception = PebbleDeliveryException(
                PebbleDeliveryFailure.NO_ACKNOWLEDGEMENT,
                "No connected Pebble watch acknowledged the data. Check the watch's Bluetooth connection and selected mobile-app bridge.",
            )
            SyncDiagnostics.failure(
                "appmessage_send_failed",
                exception,
                mapOf("type" to type, "id" to id),
                includeStack = false,
            )
            throw exception
        }
        val failure = result.values.firstOrNull { it !== TransmissionResult.Success }
        if (failure != null) {
            val (code, reason) = when (failure) {
                TransmissionResult.FailedWatchNotConnected ->
                    PebbleDeliveryFailure.WATCH_NOT_CONNECTED to "The Pebble watch is not connected. Reconnect it and retry."
                TransmissionResult.FailedDifferentAppOpen ->
                    PebbleDeliveryFailure.DIFFERENT_APP_OPEN to "Open the JankTime2 watchface on the Pebble before refreshing; AppMessage is delivered only to the foreground watch app."
                TransmissionResult.FailedNoPermissions ->
                    PebbleDeliveryFailure.PERMISSIONS_DENIED to "The mobile app denied AppMessage access. Check that this watchface UUID and companion package are permitted by the installed Pebble mobile app."
                TransmissionResult.FailedTimeout ->
                    PebbleDeliveryFailure.WATCH_TIMEOUT to "The watch did not acknowledge AppMessage before timeout. Check Bluetooth connectivity and retry."
                TransmissionResult.FailedWatchNacked ->
                    PebbleDeliveryFailure.WATCH_REJECTED_PACKET to "The watch rejected the data packet. Update/reinstall the matching JankTime2 watchface and retry."
                is TransmissionResult.Unknown ->
                    PebbleDeliveryFailure.UNKNOWN_BRIDGE_RESULT to "The mobile-app bridge returned an unknown AppMessage result. Update the Pebble mobile app or choose another compatible bridge."
                TransmissionResult.Success -> error("Unreachable success result.")
            }
            val exception = PebbleDeliveryException(code, reason)
            SyncDiagnostics.failure(
                "appmessage_send_rejected",
                exception,
                mapOf("type" to type, "id" to id, "result" to code.logCode),
                includeStack = false,
            )
            throw exception
        }
        SyncDiagnostics.debug(
            "appmessage_acknowledged",
            mapOf("type" to type, "id" to id, "acknowledgements" to result.size.toString()),
        )
    }

    override fun close() {
        if (!senderDelegate.isInitialized() || !senderUsed) return
        try {
            sender.close()
        } catch (failure: IllegalArgumentException) {
            // PebbleKit Android 2 may try to unbind a connection after bindService failed
            // or after the underlying service already unbound it. Ignore only this cleanup error.
            if (failure.message?.startsWith("Service not registered:") != true) throw failure
        }
    }

    companion object {
        val WATCHFACE_UUID: UUID = UUID.fromString("5448a6a5-e5c9-4692-ae14-3fbdf0497e8e")
        private const val TYPE_KEY = 10000u
        private const val ID_KEY = 10001u
        private const val VALUE_KEY = 10002u
        private const val FLAGS_KEY = 10003u
        private const val EXTRA_KEY = 10004u
        private const val MAX_APP_MESSAGE_BYTES = 124
        private const val ENTRY_OVERHEAD_BYTES = 4
        private const val MAX_VALUE_BYTES = 64
        private const val MAX_ROW_BYTES = 64
        private const val MAX_IMAGE_CHUNK_BYTES = 96
        private const val MAX_EXTRA_BYTES = 20

        private fun truncateUtf8(value: String, maxBytes: Int): String {
            val result = StringBuilder()
            var bytes = 0
            var index = 0
            while (index < value.length) {
                val codePoint = value.codePointAt(index)
                val chunk = String(Character.toChars(codePoint))
                val length = chunk.toByteArray(Charsets.UTF_8).size
                if (bytes + length > maxBytes) break
                result.append(chunk)
                bytes += length
                index += Character.charCount(codePoint)
            }
            return result.toString()
        }
    }
}
