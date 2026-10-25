package com.cielshieru.janktime2.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts provider credentials with an AES-GCM key held in Android Keystore.
 * Only the IV+ciphertext is kept in private app preferences; failures are not logged.
 */
class EncryptedSecretStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun put(name: String, secret: String?) {
        validateName(name)
        if (secret.isNullOrEmpty()) {
            preferences.edit().remove(name).apply()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val ciphertext = cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
        val encoded = cipher.iv + ciphertext
        preferences.edit()
            .putString(name, Base64.encodeToString(encoded, Base64.NO_WRAP))
            .apply()
    }

    fun get(name: String): String? {
        validateName(name)
        val stored = preferences.getString(name, null) ?: return null
        val decoded = try {
            Base64.decode(stored, Base64.NO_WRAP)
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (decoded.size <= IV_LENGTH + TAG_LENGTH_BYTES) return null

        return runCatching {
            val iv = decoded.copyOfRange(0, IV_LENGTH)
            val ciphertext = decoded.copyOfRange(IV_LENGTH, decoded.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_LENGTH_BITS, iv))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        }.getOrNull()
    }

    fun clearAll() {
        preferences.edit().clear().apply()
        runCatching {
            val keyStore = KeyStore.getInstance(KEYSTORE)
            keyStore.load(null)
            keyStore.deleteEntry(KEY_ALIAS)
        }
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun validateName(name: String) {
        require(name.matches(Regex("[a-z][a-z0-9_.-]{0,63}"))) { "Invalid secret identifier." }
    }

    companion object {
        private const val PREFS_NAME = "janktime2_encrypted_secrets"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "janktime2.provider.credentials.aes256gcm"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_LENGTH = 12
        private const val TAG_LENGTH_BITS = 128
        private const val TAG_LENGTH_BYTES = TAG_LENGTH_BITS / 8
    }
}
