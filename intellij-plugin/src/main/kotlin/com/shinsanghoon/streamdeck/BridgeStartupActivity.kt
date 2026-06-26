package com.shinsanghoon.streamdeck

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

class BridgeStartupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        service<BridgeServerService>().ensureStarted()
    }
}
