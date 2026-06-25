export function launcherCommandErrorMessage(err: unknown): string {
  return `Launcher command failed: ${err instanceof Error ? err.message : String(err)}`;
}
