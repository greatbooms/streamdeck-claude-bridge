package com.shinsanghoon.streamdeck

import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.lang.javascript.buildTools.npm.rc.NpmCommand
import com.intellij.lang.javascript.buildTools.npm.rc.NpmConfigurationType
import com.intellij.lang.javascript.buildTools.npm.rc.NpmRunConfiguration
import com.intellij.lang.javascript.buildTools.npm.rc.NpmRunSettings
import java.nio.file.Files
import java.nio.file.Path

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
        val settings = selectExistingOrCreate(
            script = script,
            existingSettings = RunManager.getInstance(project).allSettings,
            settingName = { it.name },
            createTemporary = { createTemporary(project, script) },
        ) ?: return false
        ApplicationManager.getApplication().invokeLater {
            ProgramRunnerUtil.executeConfiguration(settings, DefaultRunExecutor.getRunExecutorInstance())
        }
        return true
    }

    internal fun <T> selectExistingOrCreate(
        script: String,
        existingSettings: Iterable<T>,
        settingName: (T) -> String,
        createTemporary: () -> T?,
    ): T? =
        existingSettings.firstOrNull { settings ->
            matchesScriptName(settingName(settings), script)
        } ?: createTemporary()

    private fun createTemporary(project: Project, script: String): RunnerAndConfigurationSettings? {
        val packageJsonPath = packageJsonPath(project) ?: return null
        val runManager = RunManager.getInstance(project)
        val factory = NpmConfigurationType.getInstance().configurationFactories.first()
        val settings = runManager.createConfiguration("npm run $script", factory)
        val configuration = settings.configuration as? NpmRunConfiguration ?: return null

        configuration.runSettings = NpmRunSettings.builder()
            .setPackageJsonPath(packageJsonPath)
            .setCommand(NpmCommand.RUN_SCRIPT)
            .setScriptNames(listOf(script))
            .build()
        settings.setTemporary(true)
        runManager.setTemporaryConfiguration(settings)
        return settings
    }

    private fun packageJsonPath(project: Project): String? {
        val basePath = project.basePath ?: return null
        val packageJson = Path.of(basePath, "package.json")
        return if (Files.isRegularFile(packageJson)) {
            packageJson.toString()
        } else {
            null
        }
    }
}
