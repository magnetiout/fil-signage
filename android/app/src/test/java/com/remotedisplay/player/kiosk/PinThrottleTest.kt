package com.remotedisplay.player.kiosk
import org.junit.Assert.*
import org.junit.Test
class PinThrottleTest {
    @Test fun `five wrong attempts lock even a correct PIN until cooldown and persist across reconstruction`() {
        val gate=PinThrottle()
        repeat(4){ assertEquals(PinThrottle.Result.DENIED,gate.attempt(1000,false)) }
        assertEquals(PinThrottle.Result.LOCKED,gate.attempt(1000,false))
        val restored=PinThrottle(gate.failures,gate.blockedUntil)
        assertEquals(PinThrottle.Result.LOCKED,restored.attempt(2000,true))
        assertEquals(PinThrottle.Result.ALLOWED,restored.attempt(31000,true))
        assertEquals(0,restored.failures)
    }
}
