package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals

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
}
