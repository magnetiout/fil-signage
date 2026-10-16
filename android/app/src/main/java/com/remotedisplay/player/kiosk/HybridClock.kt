package com.remotedisplay.player.kiosk

/** Monotonic visitor clock. Signage media never keeps a session alive; only user-started menu video does. */
class HybridClock(private val idleMs: Long, private val warningMs: Long) {
    private val idle = KioskIdle(idleMs, warningMs)
    private var videoSince: Long? = null
    fun touch(now: Long) = idle.onTouch(now)
    fun video(playing: Boolean, now: Long) {
        if (!playing) { videoSince = null; return }
        if (!idle.inSession) return
        val start = videoSince ?: now.also { videoSince = it }
        // A looping/stalled external video can never hold a terminal indefinitely.
        if (now - start < 15 * 60000L) idle.keepAlive(now)
    }
    fun tick(now: Long) = idle.tick(now)
    fun end() { idle.end(); videoSince = null }
}
