package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals

class ProjectRegistryTest {
    @Test
    fun projectJsonContainsNamePathAndBasePath() {
        val json = ProjectRegistry.projectsJson(listOf(ProjectInfo("api", "/repo/api", "/repo/api")))
        assertEquals("""{"projects":[{"name":"api","path":"/repo/api","basePath":"/repo/api"}]}""", json)
    }
}
