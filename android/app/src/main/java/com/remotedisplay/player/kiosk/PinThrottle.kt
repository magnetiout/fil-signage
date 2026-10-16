package com.remotedisplay.player.kiosk

/** Persist both fields after every attempt so Activity/process restarts do not reset the budget. */
class PinThrottle(var failures: Int = 0, var blockedUntil: Long = 0L) {
    enum class Result { ALLOWED, DENIED, LOCKED }
    fun attempt(now: Long, correct: Boolean): Result {
        if (now < blockedUntil) return Result.LOCKED
        if (blockedUntil != 0L) { failures = 0; blockedUntil = 0 }
        if (correct) { failures = 0; return Result.ALLOWED }
        failures++
        if (failures >= 5) { blockedUntil = now + 30000; return Result.LOCKED }
        return Result.DENIED
    }
}
