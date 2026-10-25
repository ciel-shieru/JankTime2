package com.cielshieru.janktime2.pebble

import android.content.Context
import android.util.Log
import io.rebble.pebblekit2.client.DefaultPebbleAndroidAppPicker
import io.rebble.pebblekit2.client.DefaultPebbleSender
import io.rebble.pebblekit2.client.PebbleAndroidAppPicker
import io.rebble.pebblekit2.common.model.PebbleDictionaryItem
import java.util.UUID

/**
 * Bounded AppMessage serializer. It sends display fields only; credentials and provider
 * response bodies never enter this class.
 */
class PebbleBridge(context: Context) : AutoCloseable {
    private val appContext = context.applicationContext
    private val picker: PebbleAndroidAppPicker = DefaultPebbleAndroidAppPicker.getInstance(appContext)
    private val sender = DefaultPebbleSender(appContext)

    init {
        // Auto-selecting an arbitrary service is unsafe for a watchface carrying private data.
        picker.enableAutoSelect = false
    }

    suspend fun availablePebbleApps(): List<String> =
        picker.getAllEligibleApps().filter { it.length <= 200 }.take(20).sorted()

    suspend fun selectPebbleApp(packageName: String?) {
        require(packageName == null || packageName in availablePebbleApps()) {
            "Select an installed Pebble mobile app."
        }
        picker.selectApp(packageName)
    }

    suspend fun send(snapshot: com.cielshieru.janktime2.data.WatchSnapshot, config: com.cielshieru.janktime2.config.CompanionConfig) {
        if (picker.getCurrentlySelectedApp() == null) return

        for ((slot, metric) in config.metricSlots) {
            sendMessage("slot", slot, metric)
        }
        for ((metric, value) in snapshot.metricValues) {
            sendMessage(
                type = "metric",
                id = metric,
                value = value.take(160),
                flags = if (metric in snapshot.staleMetrics) 1 else 0,
                extra = if (metric == "weatherFeelsLike") snapshot.weatherCondition.orEmpty() else "",
            )
        }
        snapshot.phoneBatteryPercent?.let { sendMessage("status", "phoneBattery", it.toString()) }
        snapshot.phoneBluetoothConnected?.let {
            sendMessage("status", "phoneBluetooth", if (it) "1" else "0")
        }
        snapshot.alarmTime?.let {
            sendMessage("status", "alarmTime", it, if (snapshot.alarmIsBedtime) 1 else 0)
        }
        snapshot.currentBpm?.let { sendMessage("status", "heartRate", it.toString()) }
        snapshot.heartSamples?.takeIf { it.size in 2..56 }?.let { samples ->
            sendMessage("status", "heartSamples", samples.joinToString(","))
        }
        snapshot.focusRows.take(2).forEachIndexed { index, text ->
            text?.let { sendMessage("row", "focus." + (index + 1), it.take(200)) }
        }
        snapshot.calendarRows.take(2).forEachIndexed { index, text ->
            text?.let { sendMessage("row", "calendar." + (index + 1), it.take(200)) }
        }
    }

    suspend fun sendImageRows(rows: List<String>) {
        require(rows.size == 30 && rows.all { it.matches(Regex("[01]{30}")) }) {
            "Image must be downscaled to a 30 by 30 one-bit map before transfer."
        }
        if (picker.getCurrentlySelectedApp() == null) return
        rows.chunked(6).forEachIndexed { chunkIndex, chunk ->
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
        require(type.length <= 16 && id.length <= 24 && value.length <= 200 && extra.length <= 48)
        val values = mapOf<UInt, PebbleDictionaryItem>(
            TYPE_KEY to PebbleDictionaryItem.Text(type),
            ID_KEY to PebbleDictionaryItem.Text(id),
            VALUE_KEY to PebbleDictionaryItem.Text(value),
            FLAGS_KEY to PebbleDictionaryItem.UInt8(flags),
            EXTRA_KEY to PebbleDictionaryItem.Text(extra),
        )
        try {
            sender.sendDataToPebble(WATCHFACE_UUID, values)
        } catch (_: Exception) {
            // Avoid logging payloads, provider values, or sensitive status.
        }
    }

    override fun close() {
        sender.close()
    }

    companion object {
        val WATCHFACE_UUID: UUID = UUID.fromString("5448a6a5-e5c9-4692-ae14-3fbdf0497e8e")
        private const val TYPE_KEY = 0u
        private const val ID_KEY = 1u
        private const val VALUE_KEY = 2u
        private const val FLAGS_KEY = 3u
        private const val EXTRA_KEY = 4u
    }
}
