package com.cielshieru.janktime2

import android.Manifest
import android.content.pm.PackageManager
import java.io.ByteArrayOutputStream
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.work.ExistingWorkPolicy
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.cielshieru.janktime2.config.CompanionConfig
import com.cielshieru.janktime2.config.ConfigBackup
import com.cielshieru.janktime2.config.ConfigBackupCodec
import com.cielshieru.janktime2.config.ConfigStore
import com.cielshieru.janktime2.config.RegexFilter
import com.cielshieru.janktime2.config.RefreshIntervals
import com.cielshieru.janktime2.data.CalendarReader
import com.cielshieru.janktime2.data.DeviceCalendar
import com.cielshieru.janktime2.data.PixelImageStore
import com.cielshieru.janktime2.data.RefreshScheduler
import com.cielshieru.janktime2.data.SnapshotRefresher
import com.cielshieru.janktime2.pebble.PebbleBridge
import com.cielshieru.janktime2.security.EncryptedSecretStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val secrets by lazy { EncryptedSecretStore(applicationContext) }
    private val imageStore by lazy { PixelImageStore(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    CompanionSettingsScreen(
                        initial = ConfigStore.load(this),
                        onSave = { config, secretUpdates ->
                            ConfigStore.save(this, config)
                            secretUpdates.forEach { (key, value) ->
                                if (value.isNotBlank()) secrets.put(key, value)
                            }
                            RefreshScheduler(this).scheduleNext(1L, ExistingWorkPolicy.REPLACE)
                        },
                        onRefresh = {
                            val report = SnapshotRefresher(applicationContext).refreshAndSend(forceRefresh = true)
                            RefreshScheduler(applicationContext).scheduleNext(existingWorkPolicy = ExistingWorkPolicy.REPLACE)
                            report.userMessage()
                        },
                        onLoadCalendars = {
                            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALENDAR) ==
                                PackageManager.PERMISSION_GRANTED
                            ) CalendarReader(this).listCalendars() else emptyList()
                        },
                        onSelectPebbleApp = { packageName ->
                            PebbleBridge(applicationContext).use { it.selectPebbleApp(packageName) }
                        },
                        onListPebbleApps = {
                            PebbleBridge(applicationContext).use { it.availablePebbleApps() }
                        },
                        onGetSelectedPebbleApp = {
                            PebbleBridge(applicationContext).use { it.selectedPebbleApp() }
                        },
                        onChooseImage = { uri ->
                            val rows = withContext(Dispatchers.IO) { imageStore.importFromUri(uri) }
                            withContext(Dispatchers.IO) {
                                PebbleBridge(applicationContext).use { it.sendImageRows(rows) }
                            }
                        },
                        onGetImageRows = { withContext(Dispatchers.IO) { imageStore.loadRows() } },
                        onGetSavedSecret = { key -> withContext(Dispatchers.IO) { secrets.get(key) } },
                        onApplyImportedConfig = { backup, restoreSecrets ->
                            var deliveryWarning: String? = null
                            ConfigStore.save(applicationContext, backup.config)
                            if (backup.imageRows != null) {
                                val rowsFromBackup = backup.imageRows
                                withContext(Dispatchers.IO) {
                                    if (rowsFromBackup.isEmpty()) imageStore.clear()
                                    else imageStore.restoreRows(rowsFromBackup)
                                }
                                val rowsToSend = rowsFromBackup.ifEmpty { List(30) { "0".repeat(30) } }
                                runCatching {
                                    withContext(Dispatchers.IO) {
                                        PebbleBridge(applicationContext).use { it.sendImageRows(rowsToSend) }
                                    }
                                }.onFailure {
                                    deliveryWarning = "The configuration and image were restored on the phone, but the image could not be delivered to the watch. Open the JankTime2 watchface and retry."
                                }
                            }
                            if (restoreSecrets) {
                                withContext(Dispatchers.IO) {
                                    backup.secrets.orEmpty().forEach { (key, value) -> secrets.put(key, value) }
                                }
                            }
                            runCatching {
                                val report = SnapshotRefresher(applicationContext).refreshAndSend(forceRefresh = true)
                                if (report.unavailableSources.isNotEmpty()) {
                                    deliveryWarning = report.userMessage()
                                }
                            }.onFailure { failure ->
                                deliveryWarning = "Configuration was restored on the phone, but the watch could not be refreshed: " +
                                    (failure.message ?: "check the selected mobile-app bridge and watch connection").take(160)
                            }
                            RefreshScheduler(applicationContext).scheduleNext(existingWorkPolicy = ExistingWorkPolicy.REPLACE)
                            deliveryWarning
                        },
                    )
                }
            }
        }
    }
}

private data class SecretInputs(
    val homeAssistant: String = "",
    val prometheus: String = "",
    val mindwtr: String = "",
    val wakeyPairing: String = "",
)

@Composable
private fun CompanionSettingsScreen(
    initial: CompanionConfig,
    onSave: (CompanionConfig, Map<String, String>) -> Unit,
    onRefresh: suspend () -> String,
    onLoadCalendars: suspend () -> List<DeviceCalendar>,
    onSelectPebbleApp: suspend (String?) -> Unit,
    onListPebbleApps: suspend () -> List<String>,
    onGetSelectedPebbleApp: suspend () -> String?,
    onChooseImage: suspend (android.net.Uri) -> Unit,
    onGetImageRows: suspend () -> List<String>?,
    onGetSavedSecret: suspend (String) -> String?,
    onApplyImportedConfig: suspend (ConfigBackup, Boolean) -> String?,
) {
    val context = LocalContext.current
    var config by remember { mutableStateOf(initial) }
    var secrets by remember { mutableStateOf(SecretInputs()) }
    var notice by remember { mutableStateOf("") }
    var calendars by remember { mutableStateOf(emptyList<DeviceCalendar>()) }
    var pebbleApps by remember { mutableStateOf(emptyList<String>()) }
    var selectedPebblePackage by remember { mutableStateOf<String?>(null) }
    var slotMenu by remember { mutableStateOf<String?>(null) }
    var showExportDialog by remember { mutableStateOf(false) }
    var showPlaintextExportWarning by remember { mutableStateOf(false) }
    var pendingExportIncludesSecrets by remember { mutableStateOf(false) }
    var showImportSecretsDialog by remember { mutableStateOf(false) }
    var pendingImportedBackup by remember { mutableStateOf<ConfigBackup?>(null) }
    val scope = rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            runCatching { onChooseImage(uri) }
                .onSuccess { notice = "Image resized to 30×30 and queued for transfer." }
                .onFailure { notice = "Image import failed: " + (it.message ?: "invalid image") }
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) scope.launch {
            try {
                val exportedSecrets = if (pendingExportIncludesSecrets) {
                    val entered = mapOf(
                        "home_assistant" to secrets.homeAssistant,
                        "prometheus" to secrets.prometheus,
                        "mindwtr" to secrets.mindwtr,
                        "wakey_pairing" to secrets.wakeyPairing,
                    )
                    buildMap {
                        for (key in listOf("home_assistant", "prometheus", "mindwtr", "wakey_pairing")) {
                            val typed = entered[key].orEmpty()
                            val stored = if (typed.isBlank()) onGetSavedSecret(key).orEmpty() else typed
                            if (stored.isNotEmpty()) put(key, stored)
                        }
                    }
                } else null
                val currentConfig = config
                val imageRows = onGetImageRows()
                val json = withContext(Dispatchers.IO) { ConfigBackupCodec.encode(currentConfig, exportedSecrets, imageRows) }
                withContext(Dispatchers.IO) {
                    val output = context.contentResolver.openOutputStream(uri, "wt")
                        ?: throw IllegalStateException("The chosen file could not be opened.")
                    output.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                }
                notice = if (pendingExportIncludesSecrets) {
                    "Export completed. This JSON contains plaintext secrets; protect it and delete unneeded copies."
                } else {
                    "Configuration exported without secrets."
                }
            } catch (_: Exception) {
                notice = "Export failed. Check the destination and available storage; no credentials were logged."
            } finally {
                pendingExportIncludesSecrets = false
            }
        }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            try {
                val raw = withContext(Dispatchers.IO) {
                    val input = context.contentResolver.openInputStream(uri)
                        ?: throw IllegalStateException("The selected file could not be opened.")
                    input.use { stream ->
                        val output = ByteArrayOutputStream()
                        val buffer = ByteArray(4096)
                        var total = 0
                        while (true) {
                            val count = stream.read(buffer)
                            if (count < 0) break
                            total += count
                            require(total <= ConfigBackupCodec.MAX_IMPORT_BYTES) {
                                "Configuration backup exceeds the 256 KiB limit."
                            }
                            output.write(buffer, 0, count)
                        }
                        String(output.toByteArray(), Charsets.UTF_8)
                    }
                }
                val backup = withContext(Dispatchers.IO) { ConfigBackupCodec.decode(raw) }
                if (backup.secrets != null) {
                    pendingImportedBackup = backup
                    showImportSecretsDialog = true
                } else {
                    val warning = onApplyImportedConfig(backup, false)
                    config = backup.config
                    secrets = SecretInputs()
                    notice = warning ?: "Configuration restored. Existing encrypted secrets were left unchanged."
                }
            } catch (failure: Exception) {
                notice = "Import failed: " + (failure.message ?: "invalid configuration backup").take(180)
            }
        }
    }
    val applyImportedBackup: (ConfigBackup, Boolean) -> Unit = { backup, restoreSecrets ->
        scope.launch {
            try {
                val warning = onApplyImportedConfig(backup, restoreSecrets)
                config = backup.config
                secrets = SecretInputs()
                pendingImportedBackup = null
                showImportSecretsDialog = false
                notice = warning ?: if (restoreSecrets) {
                    "Configuration and included secrets restored. Secrets were re-encrypted in Android Keystore."
                } else {
                    "Configuration restored. Existing encrypted secrets were left unchanged."
                }
            } catch (_: Exception) {
                notice = "Configuration restore failed. Existing configuration was not confirmed as restored."
            }
        }
    }

    val calendarPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            scope.launch { calendars = runCatching { onLoadCalendars() }.getOrDefault(emptyList()) }
        } else {
            notice = "Calendar permission was denied. Calendar rows remain unavailable."
        }
    }

    LaunchedEffect(Unit) {
        pebbleApps = runCatching { onListPebbleApps() }.getOrDefault(emptyList())
        selectedPebblePackage = runCatching { onGetSelectedPebbleApp() }.getOrNull()
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
            calendars = runCatching { onLoadCalendars() }.getOrDefault(emptyList())
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("JankTime2 Companion", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Provider tokens are encrypted with an Android Keystore AES-GCM key. Leave a token field blank to keep its current value.",
            style = MaterialTheme.typography.bodySmall,
        )

        Text("Configuration backup", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { showExportDialog = true }, modifier = Modifier.weight(1f)) { Text("Export to file") }
            OutlinedButton(onClick = { importLauncher.launch(arrayOf("application/json", "text/json")) }, modifier = Modifier.weight(1f)) { Text("Import from file") }
        }
        Text("Backups include URLs, entity IDs, queries, metric slots, refresh settings, and calendar selections. Secrets are excluded unless explicitly requested.", style = MaterialTheme.typography.bodySmall)

        Text("Pebble mobile app", style = MaterialTheme.typography.titleMedium)
        Text("Selected bridge: " + (selectedPebblePackage ?: "none"), style = MaterialTheme.typography.bodySmall)
        if (pebbleApps.isEmpty()) {
            Text("No compatible PebbleKit Android 2 service was found. Install or enable the Pebble mobile app or a compatible Gravel release.", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = { scope.launch {
            pebbleApps = runCatching { onListPebbleApps() }.getOrDefault(emptyList())
            selectedPebblePackage = runCatching { onGetSelectedPebbleApp() }.getOrNull()
        } }) {
            Text("Refresh available Pebble apps")
        }
        pebbleApps.forEach { pkg ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = selectedPebblePackage == pkg, onCheckedChange = { selectedPebblePackage = pkg })
                Text(pkg)
                Spacer(Modifier.weight(1f))
                Button(onClick = {
                    scope.launch {
                        runCatching { onSelectPebbleApp(pkg) }
                            .onSuccess {
                                selectedPebblePackage = pkg
                                notice = "Selected Pebble bridge: " + pkg
                            }
                            .onFailure { failure ->
                                notice = "Could not select Pebble bridge: " + (failure.message ?: "unknown error")
                            }
                    }
                }) { Text(if (selectedPebblePackage == pkg) "Selected" else "Select") }
            }
        }

        Text("Metric slots", style = MaterialTheme.typography.titleMedium)
        config.metricSlots.forEach { (slot, current) ->
            Column {
                OutlinedButton(onClick = { slotMenu = if (slotMenu == slot) null else slot }, modifier = Modifier.fillMaxWidth()) {
                    Text(slot + " → " + current)
                }
                DropdownMenu(expanded = slotMenu == slot, onDismissRequest = { slotMenu = null }) {
                    CompanionConfig.DEFAULT_SLOTS.values.plus(
                        listOf("none", "rainChance", "haSensor", "haClimateValue")
                    ).distinct().forEach { metric ->
                        DropdownMenuItem(
                            text = { Text(metric) },
                            onClick = {
                                config = config.copy(metricSlots = config.metricSlots + (slot to metric))
                                slotMenu = null
                            },
                        )
                    }
                }
            }
        }

        Text("Home Assistant", style = MaterialTheme.typography.titleMedium)
        TextInput("HTTPS base URL", config.homeAssistantUrl, { config = config.copy(homeAssistantUrl = it) })
        SecretInput("Long-lived access token", secrets.homeAssistant, { secrets = secrets.copy(homeAssistant = it) })
        TextInput("Sensor entity (fan state)", config.sensorEntity, { config = config.copy(sensorEntity = it) })
        TextInput("Generic Home Assistant sensor entity (optional)", config.genericSensorEntity, {
            config = config.copy(genericSensorEntity = it)
        })
        TextInput("Water sensor entity", config.waterEntity, { config = config.copy(waterEntity = it) })
        TextInput("Weather entity", config.weatherEntity, { config = config.copy(weatherEntity = it) })
        TextInput("Climate entity", config.climateEntity, { config = config.copy(climateEntity = it) })
        TextInput("Climate attribute (or state)", config.climateAttribute, { config = config.copy(climateAttribute = it) })
        NumberInput("Home Assistant refresh minutes (1–60)", config.refreshHomeAssistantMinutes, {
            config = config.copy(refreshHomeAssistantMinutes = it)
        })

        Text("Prometheus", style = MaterialTheme.typography.titleMedium)
        TextInput("HTTPS base URL", config.prometheusUrl, { config = config.copy(prometheusUrl = it) })
        SecretInput("Bearer token (optional)", secrets.prometheus, { secrets = secrets.copy(prometheus = it) })
        TextInput("CPU PromQL instant query", config.cpuQuery, { config = config.copy(cpuQuery = it) })
        TextInput("Memory PromQL instant query", config.memoryQuery, { config = config.copy(memoryQuery = it) })
        TextInput("Alert count query", config.alertQuery, { config = config.copy(alertQuery = it) })
        NumberInput("Prometheus refresh minutes (1–60)", config.refreshPrometheusMinutes, {
            config = config.copy(refreshPrometheusMinutes = it)
        })

        Text("Mindwtr Cloud", style = MaterialTheme.typography.titleMedium)
        TextInput("Self-hosted Cloud HTTPS base URL", config.mindwtrUrl, { config = config.copy(mindwtrUrl = it) })
        SecretInput("Read-only bearer token", secrets.mindwtr, { secrets = secrets.copy(mindwtr = it) })
        NumberInput("Mindwtr refresh minutes (1–60)", config.refreshMindwtrMinutes, {
            config = config.copy(refreshMindwtrMinutes = it)
        })

        Text("Wakey-SITizen", style = MaterialTheme.typography.titleMedium)
        SecretInput("Wakey export pairing token", secrets.wakeyPairing, { secrets = secrets.copy(wakeyPairing = it) })
        NumberInput("Wakey refresh minutes (1–60)", config.refreshWakeyMinutes, {
            config = config.copy(refreshWakeyMinutes = it)
        })

        Text("Phone calendars", style = MaterialTheme.typography.titleMedium)
        Text("Grant calendar permission in Android settings before selecting calendars.")
        Button(onClick = {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
                scope.launch { calendars = runCatching { onLoadCalendars() }.getOrDefault(emptyList()) }
            } else {
                calendarPermissionLauncher.launch(Manifest.permission.READ_CALENDAR)
            }
        }) {
            Text("Grant calendar access / refresh calendars")
        }
        calendars.forEach { calendar ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = calendar.id in config.selectedCalendarIds,
                    onCheckedChange = { checked ->
                        config = config.copy(
                            selectedCalendarIds = if (checked) config.selectedCalendarIds + calendar.id
                            else config.selectedCalendarIds - calendar.id
                        )
                    },
                )
                Text(calendar.displayName.take(100))
            }
        }
        TextInput(
            "Calendar regex blocklist (one pattern per line)",
            config.calendarBlocklist.joinToString("\n"),
            { raw -> config = config.copy(calendarBlocklist = raw.lines().take(10)) },
            singleLine = false,
        )

        Text("Image", style = MaterialTheme.typography.titleMedium)
        Button(onClick = { imagePicker.launch("image/*") }) {
            Text("Choose and resize image")
        }
        Text("The phone center-crops and downsizes to 30×30 pixels before transfer.")

        Button(
            onClick = {
                scope.launch {
                    var saved = false
                    try {
                        RefreshIntervals.validate(config.refreshHomeAssistantMinutes)
                        RefreshIntervals.validate(config.refreshPrometheusMinutes)
                        RefreshIntervals.validate(config.refreshMindwtrMinutes)
                        RefreshIntervals.validate(config.refreshWakeyMinutes)
                        RegexFilter.validate(config.calendarBlocklist)
                        onSave(
                            config,
                            mapOf(
                                "home_assistant" to secrets.homeAssistant,
                                "prometheus" to secrets.prometheus,
                                "mindwtr" to secrets.mindwtr,
                                "wakey_pairing" to secrets.wakeyPairing,
                            ),
                        )
                        saved = true
                        notice = "Configuration saved. Refreshing providers and updating the watch…"
                        notice = "Configuration saved. " + onRefresh()
                    } catch (failure: Exception) {
                        val message = failure.message ?: "unknown error"
                        notice = if (saved) "Configuration saved, but refresh failed: " + message.take(180)
                            else message.take(180).ifBlank { "Configuration is invalid." }
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Save configuration")
        }
        OutlinedButton(
            onClick = {
                scope.launch {
                    notice = "Refreshing providers and updating the watch…"
                    try {
                        notice = onRefresh()
                    } catch (failure: Exception) {
                        notice = "Refresh failed: " + (failure.message ?: "unknown error").take(180)
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Refresh data now")
        }
        if (showExportDialog) {
                    AlertDialog(
                        onDismissRequest = { showExportDialog = false },
                        title = { Text("Export configuration") },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("The default backup excludes provider and pairing secrets. Configuration values may still reveal internal hostnames, entity IDs, and queries.")
                                TextButton(onClick = {
                                    showExportDialog = false
                                    pendingExportIncludesSecrets = false
                                    exportLauncher.launch("janktime2-config.json")
                                }) { Text("Export without secrets") }
                            }
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                showExportDialog = false
                                showPlaintextExportWarning = true
                            }) { Text("Include secrets…") }
                        },
                        dismissButton = { TextButton(onClick = { showExportDialog = false }) { Text("Cancel") } },
                    )
                }
                if (showPlaintextExportWarning) {
                    AlertDialog(
                        onDismissRequest = { showPlaintextExportWarning = false },
                        title = { Text("Danger: plaintext secrets") },
                        text = {
                            Text("Provider access tokens and the Wakey pairing token will be written as unencrypted text in the JSON file. Anyone who can read, copy, sync, or back up that file can use the credentials. Export only to trusted storage, do not email or upload it, and securely delete extra copies. JankTime2 will not log the file contents.")
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                showPlaintextExportWarning = false
                                pendingExportIncludesSecrets = true
                                exportLauncher.launch("janktime2-config.json")
                            }) { Text("Export plaintext secrets") }
                        },
                        dismissButton = { TextButton(onClick = { showPlaintextExportWarning = false }) { Text("Cancel") } },
                    )
                }
                if (showImportSecretsDialog && pendingImportedBackup != null) {
                    AlertDialog(
                        onDismissRequest = {
                            showImportSecretsDialog = false
                            pendingImportedBackup = null
                        },
                        title = { Text("Backup contains plaintext secrets") },
                        text = {
                            Text("The selected JSON includes credentials in plaintext. Importing them will encrypt them in Android Keystore, but the source file remains plaintext until you securely delete it. You can also restore settings only and leave currently stored secrets unchanged.")
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                pendingImportedBackup?.let { applyImportedBackup(it, true) }
                            }) { Text("Restore included secrets") }
                        },
                        dismissButton = {
                            Row {
                                TextButton(onClick = {
                                    pendingImportedBackup?.let { applyImportedBackup(it, false) }
                                }) { Text("Settings only") }
                                TextButton(onClick = {
                                    showImportSecretsDialog = false
                                    pendingImportedBackup = null
                                }) { Text("Cancel") }
                            }
                        },
                    )
                }
        if (notice.isNotBlank()) Text(notice, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun TextInput(label: String, value: String, onChange: (String) -> Unit, singleLine: Boolean = true) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = singleLine,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun SecretInput(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = { Text("Leave blank to keep current secret") },
        visualTransformation = PasswordVisualTransformation(),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun NumberInput(label: String, value: Int, onChange: (Int) -> Unit) {
    OutlinedTextField(
        value = value.toString(),
        onValueChange = { raw -> raw.toIntOrNull()?.takeIf { it in 1..60 }?.let(onChange) },
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}
