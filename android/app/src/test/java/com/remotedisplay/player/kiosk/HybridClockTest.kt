package com.remotedisplay.player.kiosk
import org.junit.Assert.*
import org.junit.Test
class HybridClockTest {
    @Test fun `first touch opens session, warning cancels on touch, reset at 70 seconds`() {
        val c=HybridClock(60000,10000)
        assertEquals(KioskIdle.Action.None,c.tick(999999))
        assertEquals(KioskIdle.Action.Started,c.touch(1000000))
        assertEquals(KioskIdle.Action.Warn(10),c.tick(1060000))
        assertEquals(KioskIdle.Action.Resumed,c.touch(1061000))
        assertEquals(KioskIdle.Action.None,c.tick(1120999))
        assertEquals(KioskIdle.Action.Reset,c.tick(1131000))
        assertEquals(KioskIdle.Action.Started,c.touch(1132000))
        c.end();assertEquals(KioskIdle.Action.None,c.tick(9999999))
    }
    @Test fun `signage video cannot create a kiosk session and menu video has a bounded hold`() {
        val c=HybridClock(60000,10000)
        c.video(true,0);assertEquals(KioskIdle.Action.None,c.tick(70000))
        c.touch(100000)
        for(i in 0..899) {c.video(true,100000+i*1000L);assertEquals(KioskIdle.Action.None,c.tick(100000+i*1000L))}
        c.video(true,1000000)
        assertEquals(KioskIdle.Action.Reset,c.tick(1070000))
    }
    @Test fun `video ending restarts normal inactivity timeout`() {
        val c=HybridClock(60000,10000);c.touch(0);c.video(true,50000);c.video(false,51000)
        assertEquals(KioskIdle.Action.Warn(10),c.tick(110000));assertEquals(KioskIdle.Action.Reset,c.tick(120000))
    }
    @Test fun `presentation profile resets after 20 plus 5 seconds and supports 100 clean sessions`() {
        val c=HybridClock(20000,5000)
        for (i in 0..99) {
            val start=i*100000L
            assertEquals(KioskIdle.Action.Started,c.touch(start))
            assertEquals(KioskIdle.Action.Warn(5),c.tick(start+20000))
            assertEquals(KioskIdle.Action.Resumed,c.touch(start+21000))
            assertEquals(KioskIdle.Action.None,c.tick(start+40999))
            assertEquals(KioskIdle.Action.Warn(5),c.tick(start+41000))
            assertEquals(KioskIdle.Action.Reset,c.tick(start+46000))
            c.end()
        }
    }
}
