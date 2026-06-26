package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GradleTaskRunnerTest {
    @Test
    fun validatesGradleTaskPaths() {
        assertTrue(GradleTaskRunner.isValidTask("bootRun"))
        assertTrue(GradleTaskRunner.isValidTask(":api:bootRun"))
        assertFalse(GradleTaskRunner.isValidTask("bootRun --scan"))
        assertFalse(GradleTaskRunner.isValidTask("test; bad"))
    }

    @Test
    fun schedulesGradleRunInsteadOfRunningOnTheCallerThread() {
        var scheduled: Runnable? = null
        var executed = false

        GradleTaskRunner.scheduleRun(
            task = "bootRun",
            schedule = { scheduled = it },
            run = { executed = true },
        )

        assertFalse(executed)
        scheduled?.run()
        assertTrue(executed)
    }

    @Test
    fun buildsGradleExecutionSettingsWithSystemId() {
        val settings = GradleTaskRunner.buildSettings("/repo/api", "bootRun")

        assertEquals("GRADLE", settings.externalSystemIdString)
        assertEquals("/repo/api", settings.externalProjectPath)
        assertEquals(listOf("bootRun"), settings.taskNames)
    }
}
