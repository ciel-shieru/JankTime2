package com.cielshieru.janktime2.data

import android.util.Log
import com.cielshieru.janktime2.network.ProviderHttpException
import com.cielshieru.janktime2.pebble.PebbleDeliveryException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Structured, privacy-safe sync diagnostics.
 *
 * Never log exception messages, URLs, response bodies, provider values, task titles,
 * calendar content, credentials, or arbitrary user-entered values. Root-cause classes
 * and stack frames identify the failing code path without leaking request payloads.
 */
internal object SyncDiagnostics {
    private const val TAG = "JankTime2Sync"

    fun info(event: String, fields: Map<String, String> = emptyMap()) {
        Log.i(TAG, format(event, fields))
    }

    fun debug(event: String, fields: Map<String, String> = emptyMap()) {
        Log.d(TAG, format(event, fields))
    }

    fun warning(event: String, fields: Map<String, String> = emptyMap()) {
        Log.w(TAG, format(event, fields))
    }

    fun failure(
        event: String,
        failure: Throwable,
        fields: Map<String, String> = emptyMap(),
        includeStack: Boolean = true,
    ) {
        val details = fields + mapOf(
            "error_code" to classify(failure),
            "exception" to failure.javaClass.simpleName,
        )
        Log.e(TAG, format(event, details))
        if (!includeStack) return

        var current: Throwable? = failure
        val seen = java.util.Collections.newSetFromMap(
            java.util.IdentityHashMap<Throwable, Boolean>(),
        )
        var depth = 0
        while (current != null && depth < MAX_CAUSE_DEPTH && seen.add(current)) {
            Log.e(TAG, "event=exception_cause depth=" + depth + " type=" + safe(current.javaClass.name))
            current.stackTrace.take(MAX_FRAMES_PER_CAUSE).forEachIndexed { index, frame ->
                Log.e(
                    TAG,
                    "event=exception_frame depth=" + depth + " frame=" + index +
                        " class=" + safe(frame.className) + " method=" + safe(frame.methodName) +
                        " file=" + safe(frame.fileName ?: "unknown") + " line=" + frame.lineNumber,
                )
            }
            current = current.cause
            depth++
        }
    }

    private fun classify(failure: Throwable): String {
        var current: Throwable? = failure
        val seen = java.util.Collections.newSetFromMap(
            java.util.IdentityHashMap<Throwable, Boolean>(),
        )
        repeat(MAX_CAUSE_DEPTH) {
            val candidate = current ?: return "unknown_exception"
            if (!seen.add(candidate)) return "unknown_exception"
            when (candidate) {
                is PebbleDeliveryException -> return candidate.failure.logCode
                is ProviderHttpException -> return "http_" + candidate.statusCode
                is SSLException -> return "tls_failure"
                is SocketTimeoutException -> return "timeout"
                is UnknownHostException -> return "dns_failure"
                is ConnectException -> return "connection_failure"
                is SecurityException -> return "permission_failure"
                is IllegalArgumentException -> return "invalid_argument"
                is IllegalStateException -> return "invalid_state"
                is IOException -> return "io_failure"
            }
            current = candidate.cause
        }
        return "unexpected_exception"
    }

    private fun format(event: String, fields: Map<String, String>): String = buildString {
        append("event=").append(safe(event))
        fields.toSortedMap().forEach { (key, value) ->
            append(' ').append(safe(key)).append('=').append(safe(value))
        }
    }

    private fun safe(value: String): String =
        value.replace(UNSAFE_FIELD_CHARACTERS, "_").take(MAX_FIELD_LENGTH).ifBlank { "unknown" }

    private const val MAX_CAUSE_DEPTH = 5
    private const val MAX_FRAMES_PER_CAUSE = 8
    private const val MAX_FIELD_LENGTH = 100
    private val UNSAFE_FIELD_CHARACTERS = Regex("[^A-Za-z0-9_.-]")
}
