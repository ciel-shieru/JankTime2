package com.cielshieru.janktime2.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException

class RefreshWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        var stage = "refresh_and_send"
        SyncDiagnostics.info("worker_started", mapOf("run_attempt" to runAttemptCount.toString()))
        return try {
            SnapshotRefresher(applicationContext).refreshAndSend()
            // Chain the next scheduled refresh only after this work succeeds. A retry
            // remains the same WorkManager request and must not create a parallel chain.
            stage = "schedule_next"
            RefreshScheduler(applicationContext).scheduleNext()
            SyncDiagnostics.info("worker_completed", mapOf("run_attempt" to runAttemptCount.toString()))
            Result.success()
        } catch (cancelled: CancellationException) {
            SyncDiagnostics.warning(
                "worker_cancelled",
                mapOf("stage" to stage, "run_attempt" to runAttemptCount.toString()),
            )
            throw cancelled
        } catch (failure: Exception) {
            SyncDiagnostics.failure(
                "worker_retry",
                failure,
                mapOf("stage" to stage, "run_attempt" to runAttemptCount.toString()),
            )
            Result.retry()
        }
    }
}
