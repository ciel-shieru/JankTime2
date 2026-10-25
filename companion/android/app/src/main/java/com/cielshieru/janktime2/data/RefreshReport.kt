package com.cielshieru.janktime2.data

/** Safe-to-display refresh summary; never includes URLs, tokens, or provider response bodies. */
data class RefreshReport(val unavailableSources: List<String>) {
    fun userMessage(): String =
        if (unavailableSources.isEmpty()) {
            "Refresh complete. The latest data snapshot was sent to the watch."
        } else {
            "Watch updated where data is available. Check these sources: " +
                unavailableSources.distinct().joinToString(", ") + "."
        }
}
