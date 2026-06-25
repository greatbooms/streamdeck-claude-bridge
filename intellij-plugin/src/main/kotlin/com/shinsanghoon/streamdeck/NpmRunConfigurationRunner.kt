package com.shinsanghoon.streamdeck

import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project

object NpmRunConfigurationRunner {
    private val scriptRegex = Regex("""^[A-Za-z0-9][A-Za-z0-9_.:-]*$""")

    fun isValidScript(script: String): Boolean = scriptRegex.matches(script)

    fun matchesScriptName(configurationName: String, script: String): Boolean {
        val normalized = configurationName.trim()
        return normalized == script ||
            normalized == "npm $script" ||
            normalized == "npm run $script" ||
            normalized == "$script (npm)"
    }

    fun run(project: Project, script: String): Boolean {
        require(isValidScript(script)) { "invalid npm script" }
        val settings = findExisting(project, script) ?: return false
        ApplicationManager.getApplication().invokeLater {
            ProgramRunnerUtil.executeConfiguration(settings, DefaultRunExecutor.getRunExecutorInstance())
        }
        return true
    }

    private fun findExisting(project: Project, script: String): RunnerAndConfigurationSettings? =
        RunManager.getInstance(project).allSettings.firstOrNull { settings ->
            matchesScriptName(settings.name, script)
        }
}
