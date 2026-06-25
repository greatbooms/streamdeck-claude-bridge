package com.shinsanghoon.streamdeck

import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GradleTaskDetectorTest {
    @Test
    fun parsesGradleTasksOutput() {
        val output = """
            Application tasks
            -----------------
            bootRun - Runs this project as a Spring Boot application.
            :api:bootRun - Runs api.
            build - Assembles and tests this project.
        """.trimIndent()

        assertEquals(listOf("bootRun", ":api:bootRun", "build"), GradleTaskDetector.parseTasks(output))
    }

    @Test
    fun drainsLargeGradleTaskOutputBeforeWaitingForExit() {
        val dir = Files.createTempDirectory("streamdeck-gradle-tasks")
        val wrapper = dir.resolve("gradlew")
        Files.writeString(
            wrapper,
            """
            #!/bin/sh
            i=0
            while [ ${'$'}i -lt 12000 ]; do
              echo "task${'$'}i - Description"
              i=${'$'}((i + 1))
            done
            """.trimIndent(),
        )
        Files.setPosixFilePermissions(
            wrapper,
            setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_EXECUTE),
        )

        val tasks = GradleTaskDetector.detect(dir.toString())

        assertTrue("task11999" in tasks)
    }
}
