import fs from "node:fs";
import path from "node:path";

export interface ProjectCapabilities {
  hasGradle: boolean;
  npmScripts: string[];
}

const PREFERRED_NPM_SCRIPTS = ["start:dev", "dev", "start", "test", "build", "lint"];

function fileExists(file: string): boolean {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

export function orderedNpmScripts(scripts: string[]): string[] {
  const unique = [...new Set(scripts.filter((script) => script.trim()).map((script) => script.trim()))];
  const preferred = PREFERRED_NPM_SCRIPTS.filter((script) => unique.includes(script));
  const rest = unique.filter((script) => !preferred.includes(script)).sort((a, b) => a.localeCompare(b));
  return [...preferred, ...rest];
}

export function detectProjectCapabilities(projectPath: string): ProjectCapabilities {
  const hasGradle = [
    "gradlew",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
  ].some((file) => fileExists(path.join(projectPath, file)));

  let npmScripts: string[] = [];
  const packageJsonPath = path.join(projectPath, "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: unknown };
    if (parsed.scripts && typeof parsed.scripts === "object") {
      npmScripts = orderedNpmScripts(
        Object.entries(parsed.scripts)
          .filter(([, value]) => typeof value === "string")
          .map(([key]) => key),
      );
    }
  } catch {
    npmScripts = [];
  }

  return { hasGradle, npmScripts };
}
