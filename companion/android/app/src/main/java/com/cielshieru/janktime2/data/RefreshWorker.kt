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
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        } finally {
            // One-minute scheduler checks the independent per-source minimum intervals.
            RefreshScheduler(applicationContext).scheduleNext()
        }
    }
}
