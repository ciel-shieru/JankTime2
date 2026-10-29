package com.cielshieru.janktime2.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Test

class RefreshExecutionLockTest {
    @Test
    fun concurrentCallersNeverEnterRefreshPipelineAtTheSameTime() = runBlocking {
        val active = AtomicInteger(0)
        val maximumActive = AtomicInteger(0)

        coroutineScope {
            (1..8).map {
                async(Dispatchers.Default) {
                    RefreshExecutionLock.withLock {
                        val current = active.incrementAndGet()
                        maximumActive.updateAndGet { previous -> maxOf(previous, current) }
                        try {
                            delay(10)
                        } finally {
                            active.decrementAndGet()
                        }
                    }
                }
            }.awaitAll()
        }

        assertEquals("refresh pipeline must be serialized", 1, maximumActive.get())
    }
}
