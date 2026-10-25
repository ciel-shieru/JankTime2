package com.cielshieru.janktime2.data

/** Safe-to-display refresh summary; never includes URLs, tokens, or provider response bodies. */
data class RefreshReport(val unavailableSources: List<String>) {
    fun userMessage(): String =
        if (unavailableSources.isEmpty()) {
            "Refresh complete. The latest data snapshot was sent to the watch."
        } else {
            "Watch updated where data is available. Check: " +
                unavailableSources.distinct().joinToString("; ") { source ->
                    when (source) {
                        "Home Assistant" -> "Home Assistant (HTTPS URL, token, configured entity IDs, and server reachability)"
                        "Prometheus" -> "Prometheus (HTTPS URL, token if required, each query, and server reachability)"
                        "Mindwtr" -> "Mindwtr (base URL, read-only token, and server reachability)"
                        "Wakey-SITizen" -> "Wakey-SITizen export (pairing token and provider access)"
                        "Phone calendar" -> "Phone calendar (permission and selected calendars)"
                        "Phone battery" -> "Phone battery (system battery service unavailable)"
                        else -> source
                    }
                } + "."
        }
}
