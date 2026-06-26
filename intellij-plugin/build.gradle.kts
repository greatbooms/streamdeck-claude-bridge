plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.3.0"
    id("org.jetbrains.intellij.platform") version "2.16.0"
}

group = "com.shinsanghoon.streamdeck"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    testImplementation(kotlin("test"))
    testRuntimeOnly("junit:junit:4.13.2")
    intellijPlatform {
        intellijIdea("2026.1.3")
        bundledPlugin("com.intellij.java")
        bundledPlugin("com.intellij.gradle")
        bundledPlugin("JavaScript")
        bundledPlugin("org.jetbrains.plugins.gradle")
        testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)
    }
}

intellijPlatform {
    pluginConfiguration {
        id = "com.shinsanghoon.streamdeck.intellij-companion"
        name = "Stream Deck IntelliJ Companion"
        version = project.version.toString()
        ideaVersion { sinceBuild = "261" }
    }
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "21"
        targetCompatibility = "21"
    }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) }
    }
    named("instrumentCode") {
        enabled = false
    }
    named("instrumentTestCode") {
        enabled = false
    }
    test {
        useJUnitPlatform()
    }
}
