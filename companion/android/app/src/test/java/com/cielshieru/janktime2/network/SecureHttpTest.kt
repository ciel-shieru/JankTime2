package com.cielshieru.janktime2.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SecureHttpTest {
    @Test
    fun acceptsHttpsBaseUrlWithoutQuery() {
        val parsed = SecureHttp.validateHttpsBaseUrl("https://ha.example.test/api/")
        assertEquals("https", parsed.scheme)
        assertEquals("ha.example.test", parsed.host)
    }

    @Test
    fun rejectsCleartextCredentialsAndQueryStringsInBaseUrl() {
        assertThrows(IllegalArgumentException::class.java) {
            SecureHttp.validateHttpsBaseUrl("http://ha.example.test")
        }
        assertThrows(IllegalArgumentException::class.java) {
            SecureHttp.validateHttpsBaseUrl("https://token:secret@ha.example.test")
        }
        assertThrows(IllegalArgumentException::class.java) {
            SecureHttp.validateHttpsBaseUrl("https://ha.example.test?token=secret")
        }
    }
}
