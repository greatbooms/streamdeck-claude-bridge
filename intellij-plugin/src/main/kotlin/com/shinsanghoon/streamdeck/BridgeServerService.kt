package com.shinsanghoon.streamdeck

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URLDecoder
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
            val httpExecutor = Executors.newFixedThreadPool(4)
            http.executor = httpExecutor
            http.createContext("/health") { exchange ->
                exchange.json(200, """{"ok":true}""")
            }
            http.createContext("/projects") { exchange ->
                if (!BridgeAuth.isAuthorized(exchange)) {
                    exchange.json(401, """{"ok":false,"error":"unauthorized"}""")
                    return@createContext
                }
                when (exchange.requestURI.path) {
                    "/projects" -> exchange.json(200, ProjectRegistry.projectsJson())
                    "/projects/tasks" -> handleProjectTasks(exchange)
                    "/projects/run" -> handleProjectRun(exchange)
                    "/projects/npm/run" -> handleNpmRun(exchange)
                    else -> exchange.json(404, """{"ok":false,"error":"not found"}""")
                }
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

private fun handleProjectTasks(exchange: HttpExchange) {
    val path = exchange.requestURI.rawQuery
        ?.split("&")
        ?.firstOrNull { it.startsWith("path=") }
        ?.removePrefix("path=")
        ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8) }
    if (path == null || ProjectRegistry.findByPath(path) == null) {
        exchange.json(404, """{"ok":false,"error":"project not open"}""")
        return
    }
    exchange.json(200, GradleTaskDetector.tasksJson(path))
}

private fun handleProjectRun(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") {
        exchange.json(405, """{"ok":false,"error":"method not allowed"}""")
        return
    }
    val body = exchange.requestBody.bufferedReader().readText()
    val path = Json.field(body, "path")
    val task = Json.field(body, "task")
    if (path == null || task == null || !GradleTaskRunner.isValidTask(task)) {
        exchange.json(400, """{"ok":false,"error":"invalid request"}""")
        return
    }
    val project = ProjectRegistry.findByPath(path)
    if (project == null) {
        exchange.json(404, """{"ok":false,"error":"project not open"}""")
        return
    }
    GradleTaskRunner.run(project, task)
    exchange.json(200, """{"ok":true}""")
}

private fun handleNpmRun(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") {
        exchange.json(405, """{"ok":false,"error":"method not allowed"}""")
        return
    }
    val body = exchange.requestBody.bufferedReader().readText()
    val path = Json.field(body, "path")
    val script = Json.field(body, "script")
    if (path == null || script == null || !NpmRunConfigurationRunner.isValidScript(script)) {
        exchange.json(400, """{"ok":false,"error":"invalid request"}""")
        return
    }
    val project = ProjectRegistry.findByPath(path)
    if (project == null) {
        exchange.json(404, """{"ok":false,"error":"project not open"}""")
        return
    }
    if (!NpmRunConfigurationRunner.run(project, script)) {
        exchange.json(409, """{"ok":false,"error":"npm run configuration not found"}""")
        return
    }
    exchange.json(200, """{"ok":true}""")
}

fun HttpExchange.json(status: Int, body: String) {
    val bytes = body.toByteArray(StandardCharsets.UTF_8)
    responseHeaders.add("Content-Type", "application/json; charset=utf-8")
    sendResponseHeaders(status, bytes.size.toLong())
    responseBody.use { it.write(bytes) }
}
