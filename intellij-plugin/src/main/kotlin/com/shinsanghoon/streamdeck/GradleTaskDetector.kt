package com.shinsanghoon.streamdeck

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

object GradleTaskDetector {
    private val taskLine = Regex("""^\s*(:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*)\s+-\s+.+$""")

    fun detect(projectPath: String): List<String> {
        val dir = Path.of(projectPath)
        val wrapper = dir.resolve("gradlew")
        if (!Files.exists(wrapper)) return emptyList()
        val process = ProcessBuilder("./gradlew", "tasks", "--all", "--console=plain", "--quiet")
            .directory(dir.toFile())
            .redirectErrorStream(true)
            .start()
        if (!process.waitFor(15, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            return emptyList()
        }
        return parseTasks(process.inputStream.bufferedReader().readText())
    }

    fun parseTasks(output: String): List<String> =
        output.lineSequence()
            .mapNotNull { line -> taskLine.matchEntire(line)?.groupValues?.get(1) }
            .distinct()
            .toList()

    fun tasksJson(path: String, tasks: List<String> = detect(path)): String {
        val items = tasks.joinToString(",") { Json.string(it) }
        return """{"path":${Json.string(path)},"tasks":[$items]}"""
    }
}
