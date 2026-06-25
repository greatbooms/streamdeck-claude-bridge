package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NpmRunConfigurationRunnerTest {
    @Test
    fun matchesCommonNpmRunConfigurationNames() {
        assertTrue(NpmRunConfigurationRunner.matchesScriptName("start:dev", "start:dev"))
        assertTrue(NpmRunConfigurationRunner.matchesScriptName("npm run start:dev", "start:dev"))
        assertTrue(NpmRunConfigurationRunner.matchesScriptName("npm start:dev", "start:dev"))
        assertTrue(NpmRunConfigurationRunner.matchesScriptName("start:dev (npm)", "start:dev"))
        assertFalse(NpmRunConfigurationRunner.matchesScriptName("build", "start:dev"))
    }

    @Test
    fun createsTemporaryConfigurationWhenSavedConfigurationIsMissing() {
        var created = false

        val selected = NpmRunConfigurationRunner.selectExistingOrCreate(
            script = "start:dev",
            existingSettings = listOf("db:migrate"),
            settingName = { it },
            createTemporary = {
                created = true
                "npm run start:dev"
            },
        )

        assertTrue(created)
        assertTrue(selected == "npm run start:dev")
    }

    @Test
    fun prefersSavedConfigurationOverCreatingTemporaryConfiguration() {
        var created = false

        val selected = NpmRunConfigurationRunner.selectExistingOrCreate(
            script = "start:dev",
            existingSettings = listOf("npm run start:dev"),
            settingName = { it },
            createTemporary = {
                created = true
                "temporary"
            },
        )

        assertFalse(created)
        assertTrue(selected == "npm run start:dev")
    }
}
