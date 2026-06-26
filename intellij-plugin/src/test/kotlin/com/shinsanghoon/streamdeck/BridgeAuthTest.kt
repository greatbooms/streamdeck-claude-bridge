package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import java.nio.file.Files
import java.nio.file.Path

class BridgeAuthTest {
    @Test
    fun validatesSharedTokenHeader() {
        assertTrue(BridgeAuth.isAuthorized("secret", "secret"))
        assertFalse(BridgeAuth.isAuthorized(null, "secret"))
        assertFalse(BridgeAuth.isAuthorized("wrong", "secret"))
    }

    @Test
    fun cachesSharedTokenAfterFirstLoad() {
        val originalHome = System.getProperty("user.home")
        val home = Files.createTempDirectory("bridge-auth-home")
        val tokenFile = home.resolve(Path.of("Library", "Application Support", "streamdeck-claude-bridge", "token"))
        Files.createDirectories(tokenFile.parent)
        Files.writeString(tokenFile, "first-token")

        try {
            System.setProperty("user.home", home.toString())

            assertEquals("first-token", BridgeAuth.token())
            Files.writeString(tokenFile, "second-token")
            assertEquals("first-token", BridgeAuth.token())
        } finally {
            System.setProperty("user.home", originalHome)
        }
    }
}
