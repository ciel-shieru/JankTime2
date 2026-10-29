package com.cielshieru.janktime2.data

import kotlinx.coroutines.sync.Mutex

/**
 * Serializes refresh-and-send pipelines across Activity and WorkManager callers.
 *
 * The lock is process-wide and surrounds both provider fetches and the complete watch
 * transfer, preventing two snapshots from interleaving AppMessage packets.
 */
internal object RefreshExecutionLock {
    private val mutex = Mutex()

    suspend fun <T> withLock(block: suspend () -> T): T {
        mutex.lock()
        try {
            return block()
        } finally {
            mutex.unlock()
        }
    }
}
