package com.shinsanghoon.streamdeck

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import java.nio.file.Path

data class ProjectInfo(val name: String, val path: String, val basePath: String)

object ProjectRegistry {
    fun openProjects(): List<ProjectInfo> =
        ProjectManager.getInstance().openProjects.mapNotNull(::infoFor)

    fun findByPath(path: String): Project? {
        val requested = normalize(path)
        return ProjectManager.getInstance().openProjects.firstOrNull { project ->
            project.basePath?.let { normalize(it) } == requested
        }
    }

    fun projectsJson(projects: List<ProjectInfo> = openProjects()): String {
        val items = projects.joinToString(",") {
            Json.obj(
                mapOf(
                    "name" to Json.string(it.name),
                    "path" to Json.string(it.path),
                    "basePath" to Json.string(it.basePath),
                ),
            )
        }
        return """{"projects":[$items]}"""
    }

    private fun infoFor(project: Project): ProjectInfo? {
        val base = project.basePath ?: return null
        val normalized = normalize(base)
        return ProjectInfo(project.name, normalized, normalized)
    }

    private fun normalize(path: String): String = Path.of(path).toAbsolutePath().normalize().toString()
}
