package com.cielshieru.janktime2

import android.app.Application
import androidx.work.ExistingWorkPolicy
import com.cielshieru.janktime2.data.RefreshScheduler

class JankTime2Application : Application() {
    override fun onCreate() {
        super.onCreate()
        RefreshScheduler(this).scheduleNext(1L, ExistingWorkPolicy.KEEP)
    }
}
