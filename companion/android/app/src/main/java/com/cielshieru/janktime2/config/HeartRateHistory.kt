package com.cielshieru.janktime2.config

/** Validated, minute-resolution historical window for the Pebble heart-rate graph. */
object HeartRateHistory {
    const val DEFAULT_MINUTES = 120
    const val MIN_MINUTES = 5
    const val MAX_MINUTES = 24 * 60

    fun validate(minutes: Int): Int {
        require(minutes in MIN_MINUTES..MAX_MINUTES) {
            "Heart-rate history must be between 5 minutes and 24 hours."
        }
        return minutes
    }

    fun fromHoursAndMinutes(hours: Int, minutes: Int): Int {
        require(hours in 0..24) { "Heart-rate history hours must be between 0 and 24." }
        require(minutes in 0..59) { "Heart-rate history minutes must be between 0 and 59." }
        return validate(hours * 60 + minutes)
    }

    /** Missing field means an older schema-v1 backup; malformed present values are rejected. */
    fun decodeBackupValue(hasField: Boolean, value: Any?): Int {
        if (!hasField) return DEFAULT_MINUTES
        require(value is Number) { "Invalid heart-rate history setting." }
        val number = value.toDouble()
        require(number.isFinite() && number == number.toInt().toDouble()) {
            "Invalid heart-rate history setting."
        }
        return validate(number.toInt())
    }

    /** Never let a corrupt local preference prevent the companion from starting. */
    fun storedOrDefault(minutes: Int): Int =
        minutes.takeIf { it in MIN_MINUTES..MAX_MINUTES } ?: DEFAULT_MINUTES
}
