package com.shinsanghoon.streamdeck

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class BridgeServerService : Disposable {
    private val started = AtomicBoolean(false)
    private var server: HttpServer? = null
    private var executor: ExecutorService? = null

    fun ensureStarted() {
        if (!started.compareAndSet(false, true)) return
        try {
            val http = HttpServer.create(InetSocketAddress("127.0.0.1", 8788), 0)
            val httpExecutor = Executors.newSingleThreadExecutor()
            http.executor = httpExecutor
            http.createContext("/health") { exchange ->
                exchange.json(200, """{"ok":true}""")
            }
            http.start()
            server = http
            executor = httpExecutor
        } catch (e: Exception) {
            started.set(false)
            thisLogger().warn("Failed to start Stream Deck companion server", e)
        }
    }

    override fun dispose() {
        server?.stop(0)
        server = null
        executor?.shutdownNow()
        executor = null
        started.set(false)
    }
}

fun HttpExchange.json(status: Int, body: String) {
    val bytes = body.toByteArray(StandardCharsets.UTF_8)
    responseHeaders.add("Content-Type", "application/json; charset=utf-8")
    sendResponseHeaders(status, bytes.size.toLong())
    responseBody.use { it.write(bytes) }
}
