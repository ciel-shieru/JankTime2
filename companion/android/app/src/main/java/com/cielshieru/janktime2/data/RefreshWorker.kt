package com.cielshieru.janktime2.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class RefreshWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        return try {
            SnapshotRefresher(applicationContext).refreshAndSend()
            // Chain the next scheduled refresh only after this work succeeds. A retry
            // remains the same WorkManager request and must not create a parallel chain.
            RefreshScheduler(applicationContext).scheduleNext()
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
