package com.cielshieru.janktime2.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit

class ProviderHttpException(val statusCode: Int) : IOException("Provider request failed with HTTP $statusCode.")

object SecureHttp {
    private const val MAX_RESPONSE_BYTES = 1_048_576
    private const val MAX_REQUEST_BODY_BYTES = 64 * 1024
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .callTimeout(10, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .build()

    fun validateHttpsBaseUrl(raw: String): HttpUrl {
        require(raw.length <= 2048) { "Provider URL is too long." }
        val parsed = raw.trim().toHttpUrlOrNull() ?: throw IllegalArgumentException("Enter a valid HTTPS URL.")
        require(parsed.scheme == "https") { "Remote providers must use HTTPS." }
        require(parsed.username.isEmpty() && parsed.password.isEmpty()) {
            "Do not embed credentials in provider URLs."
        }
        require(parsed.query == null && parsed.fragment == null) {
            "Provider base URLs cannot contain a query or fragment."
        }
        return parsed.newBuilder().query(null).fragment(null).build()
    }

    fun requestJson(
        baseUrl: String,
        pathSegments: List<String>,
        query: Map<String, String> = emptyMap(),
        bearerToken: String? = null,
        method: String = "GET",
        jsonBody: JSONObject? = null,
    ): JSONObject {
        val base = validateHttpsBaseUrl(baseUrl)
        val urlBuilder = base.newBuilder()
        pathSegments.forEach { segment ->
            require(segment.isNotBlank() && segment.length <= 256) { "Invalid provider path segment." }
            urlBuilder.addPathSegment(segment)
        }
        query.forEach { (key, value) ->
            require(key.matches(Regex("[A-Za-z0-9_]+")) && value.length <= 1024) {
                "Invalid provider query parameter."
            }
            urlBuilder.addQueryParameter(key, value)
        }

        val requestBuilder = Request.Builder()
            .url(urlBuilder.build())
            .header("Accept", "application/json")
            .header("User-Agent", "JankTime2-Companion/0.1")
        if (!bearerToken.isNullOrBlank()) {
            require(bearerToken.length <= 4096 && bearerToken.none { it.isISOControl() }) {
                "Invalid provider credential."
            }
            requestBuilder.header("Authorization", "Bearer $bearerToken")
        }

        when (method) {
            "GET" -> requestBuilder.get()
            "POST" -> {
                val body = (jsonBody ?: JSONObject()).toString().toByteArray(Charsets.UTF_8)
                require(body.size <= MAX_REQUEST_BODY_BYTES) { "Provider request body is too large." }
                requestBuilder.post(body.toRequestBody(JSON_MEDIA))
            }
            else -> throw IllegalArgumentException("Unsupported provider request method.")
        }

        client.newCall(requestBuilder.build()).execute().use { response ->
            if (response.code in 300..399) throw IOException("Provider redirects are not accepted.")
            if (!response.isSuccessful) throw ProviderHttpException(response.code)
            val body = response.body ?: throw IOException("Provider response body is empty.")
            val bytes = body.byteStream().use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                var total = 0
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > MAX_RESPONSE_BYTES) throw IOException("Provider response is too large.")
                    output.write(buffer, 0, read)
                }
                output.toByteArray()
            }
            return try {
                JSONObject(String(bytes, Charsets.UTF_8))
            } catch (_: Exception) {
                throw IOException("Provider returned invalid JSON.")
            }
        }
    }
}
