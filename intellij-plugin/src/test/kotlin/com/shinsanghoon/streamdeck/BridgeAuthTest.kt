package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BridgeAuthTest {
    @Test
    fun validatesSharedTokenHeader() {
        assertTrue(BridgeAuth.isAuthorized("secret", "secret"))
        assertFalse(BridgeAuth.isAuthorized(null, "secret"))
        assertFalse(BridgeAuth.isAuthorized("wrong", "secret"))
    }
}
