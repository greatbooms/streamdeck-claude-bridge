type MaybePromise = Promise<void> | void;

export interface DeckQuestion {
  source?: "claude" | "codex" | string;
}

export interface DeckSyncDeps {
  active: DeckQuestion | null;
  switcher: {
    enter(profileName?: string): MaybePromise;
    leave(): MaybePromise;
  };
  answerAction: { refreshAll(): MaybePromise };
  questionAction: { refreshAll(): MaybePromise };
  log: (msg: string) => void;
}

const PROFILE_BY_SOURCE = {
  claude: "Claude Bridge",
  codex: "Codex Bridge",
} as const;

async function runStep(label: string, fn: () => MaybePromise, log: (msg: string) => void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log(`${label} failed: ${String(e)}`);
  }
}

export async function syncDeckState(deps: DeckSyncDeps): Promise<void> {
  const profileName = deps.active
    ? PROFILE_BY_SOURCE[deps.active.source as keyof typeof PROFILE_BY_SOURCE] ?? "Claude Bridge"
    : null;

  await Promise.all([
    runStep(
      profileName ? "profile enter" : "profile leave",
      () => profileName ? deps.switcher.enter(profileName) : deps.switcher.leave(),
      deps.log,
    ),
    runStep("answer refresh", () => deps.answerAction.refreshAll(), deps.log),
    runStep("question refresh", () => deps.questionAction.refreshAll(), deps.log),
  ]);
}
