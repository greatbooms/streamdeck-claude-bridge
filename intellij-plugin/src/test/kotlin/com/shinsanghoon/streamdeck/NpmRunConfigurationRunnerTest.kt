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
}
