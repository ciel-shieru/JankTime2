package com.cielshieru.janktime2

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
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
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.lifecycle.lifecycleScope
import com.cielshieru.janktime2.config.CompanionConfig
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
                            RefreshScheduler(this).scheduleNext(1L)
                        },
                        onRefresh = {
                            lifecycleScope.launch(Dispatchers.IO) {
                                SnapshotRefresher(applicationContext).refreshAndSend(forceRefresh = true)
                            }
                        },
                        onLoadCalendars = {
                            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALENDAR) ==
                                PackageManager.PERMISSION_GRANTED
                            ) CalendarReader(this).listCalendars() else emptyList()
                        },
                        onSelectPebbleApp = { packageName ->
                            lifecycleScope.launch {
                                PebbleBridge(this@MainActivity).use { it.selectPebbleApp(packageName) }
                            }
                        },
                        onListPebbleApps = {
                            PebbleBridge(this).use { it.availablePebbleApps() }
                        },
                        onChooseImage = { uri ->
                            val rows = withContext(Dispatchers.IO) { imageStore.importFromUri(uri) }
                            lifecycleScope.launch(Dispatchers.IO) {
                                PebbleBridge(applicationContext).use { it.sendImageRows(rows) }
                            }
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
    onRefresh: () -> Unit,
    onLoadCalendars: suspend () -> List<DeviceCalendar>,
    onSelectPebbleApp: (String?) -> Unit,
    onListPebbleApps: suspend () -> List<String>,
    onChooseImage: suspend (android.net.Uri) -> Unit,
) {
    val context = LocalContext.current
    var config by remember { mutableStateOf(initial) }
    var secrets by remember { mutableStateOf(SecretInputs()) }
    var notice by remember { mutableStateOf("") }
    var calendars by remember { mutableStateOf(emptyList<DeviceCalendar>()) }
    var pebbleApps by remember { mutableStateOf(emptyList<String>()) }
    var selectedPebblePackage by remember { mutableStateOf<String?>(null) }
    var slotMenu by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            runCatching { onChooseImage(uri) }
                .onSuccess { notice = "Image resized to 30×30 and queued for transfer." }
                .onFailure { notice = "Image import failed: " + (it.message ?: "invalid image") }
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

        Text("Pebble mobile app", style = MaterialTheme.typography.titleMedium)
        OutlinedButton(onClick = { scope.launch { pebbleApps = runCatching { onListPebbleApps() }.getOrDefault(emptyList()) } }) {
            Text("Refresh available Pebble apps")
        }
        pebbleApps.forEach { pkg ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = selectedPebblePackage == pkg, onCheckedChange = { selectedPebblePackage = pkg })
                Text(pkg)
                Spacer(Modifier.weight(1f))
                Button(onClick = { onSelectPebbleApp(pkg); notice = "Selected Pebble mobile app." }) { Text("Select") }
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
                runCatching {
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
                }.onSuccess { notice = "Configuration saved." }
                    .onFailure { notice = it.message ?: "Configuration is invalid." }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Save configuration")
        }
        OutlinedButton(onClick = { onRefresh(); notice = "Refresh requested." }, modifier = Modifier.fillMaxWidth()) {
            Text("Refresh data now")
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
