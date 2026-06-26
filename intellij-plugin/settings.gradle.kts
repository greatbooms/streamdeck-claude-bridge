pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven("https://www.jetbrains.com/intellij-repository/releases")
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories {
        mavenCentral()
        maven("https://www.jetbrains.com/intellij-repository/releases")
    }
}

rootProject.name = "streamdeck-intellij-companion"
