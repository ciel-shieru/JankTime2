package com.cielshieru.janktime2.network

import org.json.JSONArray
import org.json.JSONObject

class PrometheusClient {
    fun instantQuery(baseUrl: String, query: String, bearerToken: String? = null): String? {
        require(query.isNotBlank() && query.length <= 512 && !query.any(Char::isISOControl)) {
            "PromQL query must be between 1 and 512 printable characters."
        }
        val response = SecureHttp.requestJson(
            baseUrl = baseUrl,
            pathSegments = listOf("api", "v1", "query"),
            query = mapOf("query" to query),
            bearerToken = bearerToken,
        )
        if (response.optString("status") != "success") {
            throw IllegalArgumentException("Prometheus returned an unsuccessful query result.")
        }
        val data = response.optJSONObject("data") ?: throw IllegalArgumentException("Prometheus response has no data.")
        return when (data.optString("resultType")) {
            "vector" -> {
                val results = data.optJSONArray("result") ?: JSONArray()
                if (results.length() == 0) null else scalarFromResult(results.optJSONObject(0))
            }
            "scalar", "string" -> scalarFromPair(data.optJSONArray("result"))
            else -> throw IllegalArgumentException("Prometheus query result type is unsupported.")
        }?.take(32)
    }

    private fun scalarFromResult(result: JSONObject?): String? =
        result?.let { scalarFromPair(it.optJSONArray("value")) }

    private fun scalarFromPair(pair: JSONArray?): String? {
        pair ?: return null
        if (pair.length() < 2) return null
        val value = pair.opt(1)?.toString() ?: return null
        if (value == "NaN" || value == "+Inf" || value == "-Inf") return null
        return value.takeIf { it.length <= 32 && !it.any(Char::isISOControl) }
    }
}
