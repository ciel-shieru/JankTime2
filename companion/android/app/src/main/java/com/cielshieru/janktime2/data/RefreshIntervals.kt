package com.cielshieru.janktime2.data

import com.cielshieru.janktime2.config.CompanionConfig
import com.cielshieru.janktime2.config.ConfigStore
import com.cielshieru.janktime2.config.RefreshIntervals
import java.time.Clock
import java.util.concurrent.TimeUnit
import android.content.Context
import android.os.BatteryManager
import android.os.SystemClock
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import com.cielshieru.janktime2.network.HomeAssistantClient
import com.cielshieru.janktime2.network.PrometheusClient
import com.cielshieru.janktime2.network.MindwtrClient
import com.cielshieru.janktime2.network.WakeyExportClient
import com.cielshieru.janktime2.network.SecureHttp
import com.cielshieru.janktime2.security.EncryptedSecretStore
import com.cielshieru.janktime2.pebble.PebbleBridge
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.first
import io.rebble.pebblekit2.client.DefaultPebbleInfoRetriever

class SnapshotRefresher(private val context: Context) {
    private val snapshotStore = WatchSnapshotStore(context)
    private val secrets = EncryptedSecretStore(context)
    private val ha = HomeAssistantClient()
    private val prometheus = PrometheusClient()
    private val mindwtr = MindwtrClient(context)

    suspend fun refreshAndSend(forceRefresh: Boolean = false): RefreshReport =
        RefreshExecutionLock.withLock {
            val startedAt = SystemClock.elapsedRealtime()
            var stage = "load_configuration"
            SyncDiagnostics.info("refresh_started", mapOf("force_refresh" to forceRefresh.toString()))
            try {
                withContext(Dispatchers.IO) {
        val config = ConfigStore.load(context)
        stage = "load_snapshot"
        var snapshot = snapshotStore.load()
        val now = Clock.systemUTC().millis()
        val credentials = secrets
        val unavailableSources = linkedSetOf<String>()

        stage = "refresh_phone"
        if (due(snapshot, "phone", 5) || forceRefresh) {
            snapshot = snapshot.attempted("phone", now)
            val manager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val level = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                ?.takeIf { it in 0..100 }
            snapshot = if (level != null) {
                snapshot.copy(phoneBatteryPercent = level)
            } else {
                unavailableSources += "Phone battery"
                snapshot.markStale(listOf("phoneBattery"))
            }
            val connected = try {
                DefaultPebbleInfoRetriever(context).getConnectedWatches().first().isNotEmpty()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                SyncDiagnostics.failure(
                    "connected_watch_lookup_failed",
                    failure,
                    includeStack = false,
                )
                null
            }
            snapshot = snapshot.copy(phoneBluetoothConnected = connected)
            if (level != null) snapshot = snapshot.succeeded("phone", now)
        }

        stage = "refresh_home_assistant"
        if (due(snapshot, "homeAssistant", config.refreshHomeAssistantMinutes) || forceRefresh) {
            snapshot = snapshot.attempted("homeAssistant", now)
            val base = config.homeAssistantUrl
            val token = credentials.get("home_assistant")
            val configuredMetrics = buildList {
                if (config.sensorEntity.isNotBlank()) add("fanState")
                if (config.genericSensorEntity.isNotBlank()) add("haSensor")
                if (config.waterEntity.isNotBlank()) add("water")
                if (config.weatherEntity.isNotBlank()) {
                    add("weatherFeelsLike")
                    add("rainChance")
                }
                if (config.climateEntity.isNotBlank()) add("haClimateValue")
            }

            if (configuredMetrics.isEmpty() || base.isBlank() || token.isNullOrBlank()) {
                SyncDiagnostics.warning(
                    "provider_unavailable",
                    mapOf(
                        "source" to "home_assistant",
                        "reason" to (if (configuredMetrics.isEmpty()) "no_entities_configured" else "missing_url_or_token"),
                    ),
                )
                unavailableSources += "Home Assistant"
                snapshot = snapshot.markStale(
                    if (configuredMetrics.isEmpty()) {
                        listOf("fanState", "haSensor", "water", "haClimateValue", "weatherFeelsLike", "rainChance")
                    } else configuredMetrics,
                )
            } else {
                var anySuccess = false
                fun updateHaMetric(metric: String, fetch: () -> String?) {
                    try {
                        val value = fetch()?.takeIf { it.isNotBlank() }
                        if (value == null) {
                            snapshot = snapshot.markStale(listOf(metric))
                            unavailableSources += "Home Assistant"
                        } else {
                            snapshot = snapshot.withMetric(metric, value)
                            anySuccess = true
                        }
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        SyncDiagnostics.failure(
                            "provider_metric_failed",
                            failure,
                            mapOf("source" to "home_assistant", "metric" to metric),
                            includeStack = false,
                        )
                        // Failure of one entity must not prevent independent HA metrics updating.
                        snapshot = snapshot.markStale(listOf(metric))
                        unavailableSources += "Home Assistant"
                    }
                }

                if (config.sensorEntity.isNotBlank()) {
                    updateHaMetric("fanState") { ha.sensorValue(base, token, config.sensorEntity) }
                }
                if (config.genericSensorEntity.isNotBlank()) {
                    updateHaMetric("haSensor") { ha.sensorValue(base, token, config.genericSensorEntity) }
                }
                if (config.waterEntity.isNotBlank()) {
                    updateHaMetric("water") { ha.sensorValue(base, token, config.waterEntity) }
                }
                if (config.climateEntity.isNotBlank()) {
                    updateHaMetric("haClimateValue") {
                        ha.climateDisplayValue(base, token, config.climateEntity, config.climateAttribute)
                    }
                }
                if (config.weatherEntity.isNotBlank()) {
                    try {
                        val weather = ha.fetchWeather(base, token, config.weatherEntity)
                        snapshot = snapshot.copy(weatherCondition = weather.condition)
                        val feelsLike = weather.feelsLikeTemperature?.let { "%.0f°".format(it) }
                        val rainChance = weather.rainChancePercent?.let { "$it%" }
                        if (feelsLike != null) {
                            snapshot = snapshot.withMetric("weatherFeelsLike", feelsLike)
                            anySuccess = true
                        } else {
                            snapshot = snapshot.markStale(listOf("weatherFeelsLike"))
                            unavailableSources += "Home Assistant"
                        }
                        if (rainChance != null) {
                            snapshot = snapshot.withMetric("rainChance", rainChance)
                            anySuccess = true
                        } else {
                            snapshot = snapshot.markStale(listOf("rainChance"))
                            unavailableSources += "Home Assistant"
                        }
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        SyncDiagnostics.failure(
                            "provider_metric_failed",
                            failure,
                            mapOf("source" to "home_assistant", "metric" to "weather"),
                            includeStack = false,
                        )
                        snapshot = snapshot.markStale(listOf("weatherFeelsLike", "rainChance"))
                        unavailableSources += "Home Assistant"
                    }
                }
                if (anySuccess) snapshot = snapshot.succeeded("homeAssistant", now)
            }
        }

        stage = "refresh_prometheus"
        if (due(snapshot, "prometheus", config.refreshPrometheusMinutes) || forceRefresh) {
            snapshot = snapshot.attempted("prometheus", now)
            val token = credentials.get("prometheus")
            val base = config.prometheusUrl
            val queries = listOf(
                "cpuUsage" to config.cpuQuery,
                "memoryUsage" to config.memoryQuery,
                "alertCount" to config.alertQuery,
            ).filter { it.second.isNotBlank() }

            if (base.isBlank() || queries.isEmpty()) {
                SyncDiagnostics.warning(
                    "provider_unavailable",
                    mapOf("source" to "prometheus", "reason" to (if (base.isBlank()) "missing_url" else "no_queries_configured")),
                )
                unavailableSources += "Prometheus"
                snapshot = snapshot.markStale(
                    if (queries.isEmpty()) listOf("cpuUsage", "memoryUsage", "alertCount")
                    else queries.map { it.first },
                )
            } else {
                var anySuccess = false
                for ((metric, query) in queries) {
                    try {
                        val value = prometheus.instantQuery(base, query, token)
                        if (value != null) {
                            snapshot = snapshot.withMetric(metric, value)
                            anySuccess = true
                        } else {
                            snapshot = snapshot.markStale(listOf(metric))
                            unavailableSources += "Prometheus"
                        }
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        SyncDiagnostics.failure(
                            "provider_metric_failed",
                            failure,
                            mapOf("source" to "prometheus", "metric" to metric),
                            includeStack = false,
                        )
                        // A bad query only marks its own metric stale; other queries still run.
                        snapshot = snapshot.markStale(listOf(metric))
                        unavailableSources += "Prometheus"
                    }
                }
                if (anySuccess) snapshot = snapshot.succeeded("prometheus", now)
            }
        }

        stage = "refresh_mindwtr"
        if (due(snapshot, "mindwtr", config.refreshMindwtrMinutes) || forceRefresh) {
            snapshot = snapshot.attempted("mindwtr", now)
            try {
                val token = credentials.get("mindwtr")
                    ?: throw IllegalStateException("Mindwtr token is not configured.")
                val result = mindwtr.fetchTodayFocus(config.mindwtrUrl, token)
                snapshot = snapshot.withMetric("focusCount", result.remaining.toString() + " / " + result.total)
                snapshot = snapshot.copy(focusRows = listOf(result.rows.getOrNull(0), result.rows.getOrNull(1)))
                snapshot = snapshot.succeeded("mindwtr", now)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                SyncDiagnostics.failure(
                    "provider_refresh_failed",
                    failure,
                    mapOf("source" to "mindwtr"),
                    includeStack = false,
                )
                unavailableSources += "Mindwtr"
                snapshot = snapshot.markStale(listOf("focusCount"))
            }
        }

        stage = "refresh_wakey"
        if (due(snapshot, "wakey", config.refreshWakeyMinutes) || forceRefresh) {
            snapshot = snapshot.attempted("wakey", now)
            try {
                val token = credentials.get("wakey_pairing")
                if (!token.isNullOrBlank()) {
                    val status = WakeyExportClient(context.contentResolver).read(token)
                    snapshot = snapshot.copy(alarmTime = status?.displayTime, alarmIsBedtime = status?.isBedtime ?: false)
                    snapshot = snapshot.succeeded("wakey", now)
                } else {
                    unavailableSources += "Wakey-SITizen"
                    SyncDiagnostics.warning(
                        "provider_unavailable",
                        mapOf("source" to "wakey", "reason" to "missing_pairing_token"),
                    )
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                SyncDiagnostics.failure(
                    "provider_refresh_failed",
                    failure,
                    mapOf("source" to "wakey"),
                    includeStack = false,
                )
                unavailableSources += "Wakey-SITizen"
                // Preserve last-known-good alarm/bedtime on failures.
            }
        }

        stage = "refresh_calendar"
        if (due(snapshot, "calendar", 5) || forceRefresh) {
            snapshot = snapshot.attempted("calendar", now)
            try {
                val events = CalendarReader(context).nextEvents(config.selectedCalendarIds, config.calendarBlocklist)
                snapshot = snapshot.copy(calendarRows = listOf(events.getOrNull(0)?.displayRow(), events.getOrNull(1)?.displayRow()))
                snapshot = snapshot.succeeded("calendar", now)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                SyncDiagnostics.failure(
                    "provider_refresh_failed",
                    failure,
                    mapOf("source" to "calendar"),
                    includeStack = false,
                )
                unavailableSources += "Phone calendar"
                // Preserve last-known-good calendar rows on failures.
            }
        }

        stage = "save_snapshot"
        snapshotStore.save(snapshot)
        SyncDiagnostics.info("snapshot_saved", mapOf("metric_count" to snapshot.metricValues.size.toString()))
        stage = "send_watch_snapshot"
        PebbleBridge(context).use { bridge ->
            bridge.send(snapshot, config)
        }
        RefreshReport(unavailableSources.toList()).also { report ->
            SyncDiagnostics.info(
                "refresh_pipeline_completed",
                mapOf("unavailable_source_count" to report.unavailableSources.size.toString()),
            )
        }
                }
            } catch (cancelled: CancellationException) {
                SyncDiagnostics.warning("refresh_cancelled", mapOf("stage" to stage))
                throw cancelled
            } catch (failure: Exception) {
                SyncDiagnostics.failure("refresh_failed", failure, mapOf("stage" to stage))
                throw failure
            } finally {
                SyncDiagnostics.info(
                    "refresh_finished",
                    mapOf("duration_ms" to (SystemClock.elapsedRealtime() - startedAt).toString()),
                )
            }
        }

    private fun due(snapshot: WatchSnapshot, source: String, intervalMinutes: Int): Boolean {
        val valid = RefreshIntervals.validate(intervalMinutes)
        val last = snapshot.lastAttemptBySource[source] ?: return true
        return Clock.systemUTC().millis() - last >= TimeUnit.MINUTES.toMillis(valid.toLong())
    }
}

class RefreshScheduler(private val context: Context) {
    fun scheduleNext(
        delayMinutes: Long? = null,
        existingWorkPolicy: ExistingWorkPolicy = ExistingWorkPolicy.APPEND_OR_REPLACE,
    ) {
        val delay = delayMinutes ?: nextDueMinutes()
        val request = OneTimeWorkRequestBuilder<RefreshWorker>()
            .setInitialDelay(delay.coerceIn(1L, 60L), TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            UNIQUE_WORK_NAME,
            existingWorkPolicy,
            request,
        )
    }

    private fun nextDueMinutes(): Long {
        val snapshot = WatchSnapshotStore(context).load()
        val config = ConfigStore.load(context)
        val now = Clock.systemUTC().millis()
        val intervals = mapOf(
            "phone" to 5,
            "homeAssistant" to config.refreshHomeAssistantMinutes,
            "prometheus" to config.refreshPrometheusMinutes,
            "mindwtr" to config.refreshMindwtrMinutes,
            "wakey" to config.refreshWakeyMinutes,
            "calendar" to 5,
        )
        val next = intervals.map { (source, minutes) ->
            val lastAttempt = snapshot.lastAttemptBySource[source] ?: return@map 0L
            val dueAt = lastAttempt + TimeUnit.MINUTES.toMillis(minutes.toLong())
            ((dueAt - now).coerceAtLeast(0L) + 59_999L) / 60_000L
        }.minOrNull() ?: 1L
        return next.coerceIn(1L, 60L)
    }

    companion object {
        const val UNIQUE_WORK_NAME = "janktime2-provider-refresh"
    }
}
