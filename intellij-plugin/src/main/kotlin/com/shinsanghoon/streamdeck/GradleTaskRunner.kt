package com.shinsanghoon.streamdeck

import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.externalSystem.model.execution.ExternalSystemTaskExecutionSettings
import com.intellij.openapi.externalSystem.util.ExternalSystemUtil
import com.intellij.openapi.project.Project
import org.jetbrains.plugins.gradle.util.GradleConstants

object GradleTaskRunner {
    private val taskRegex = Regex("""^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$""")

    fun isValidTask(task: String): Boolean = taskRegex.matches(task)

    fun run(project: Project, task: String) {
        require(isValidTask(task)) { "invalid Gradle task" }
        scheduleRun(
            task = task,
            schedule = { ApplicationManager.getApplication().invokeLater(it) },
            run = { runNow(project, task) },
        )
    }

    internal fun scheduleRun(
        task: String,
        schedule: (Runnable) -> Unit,
        run: () -> Unit,
    ) {
        require(isValidTask(task)) { "invalid Gradle task" }
        schedule(Runnable { run() })
    }

    private fun runNow(project: Project, task: String) {
        val basePath = project.basePath ?: error("project has no basePath")
        val settings = ExternalSystemTaskExecutionSettings().apply {
            externalProjectPath = basePath
            taskNames = listOf(task)
        }
        ExternalSystemUtil.runTask(
            settings,
            DefaultRunExecutor.EXECUTOR_ID,
            project,
            GradleConstants.SYSTEM_ID,
        )
    }
}
