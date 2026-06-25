package com.shinsanghoon.streamdeck

import com.sun.net.httpserver.HttpExchange
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.Path
import java.security.SecureRandom
import java.util.Base64

object BridgeAuth {
    const val HEADER = "X-StreamDeck-Bridge-Token"

    fun isAuthorized(actual: String?, expected: String = token()): Boolean =
        expected.isNotBlank() && actual == expected

    fun isAuthorized(exchange: HttpExchange): Boolean =
        isAuthorized(exchange.requestHeaders.getFirst(HEADER))

    fun token(): String {
        val env = System.getenv("STREAMDECK_BRIDGE_TOKEN")?.trim()
        if (!env.isNullOrEmpty()) return env

        val file = tokenPath()
        if (Files.exists(file)) {
            val existing = Files.readString(file).trim()
            if (existing.isNotEmpty()) return existing
        }

        Files.createDirectories(file.parent)
        val generated = generateToken()
        return try {
            Files.writeString(file, generated, java.nio.file.StandardOpenOption.CREATE_NEW)
            generated
        } catch (_: FileAlreadyExistsException) {
            Files.readString(file).trim()
        }
    }

    private fun tokenPath(): Path =
        Path.of(System.getProperty("user.home"), "Library", "Application Support", "streamdeck-claude-bridge", "token")

    private fun generateToken(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
