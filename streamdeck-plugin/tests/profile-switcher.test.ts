import { describe, it, expect } from "vitest";
import { ProfileSwitcher, type ProfileApi } from "../src/profile-switcher.js";

function make(deviceId: string | null = "DEV1") {
  const calls: Array<[string, string | undefined]> = [];
  const api: ProfileApi = {
    switchToProfile: (id, name) => { calls.push([id, name]); },
  };
  const sw = new ProfileSwitcher(api, () => deviceId, "Claude Answers");
  return { sw, calls };
}

describe("ProfileSwitcher", () => {
  it("enter switches to named profile once; second enter is a no-op", async () => {
    const { sw, calls } = make();
    await sw.enter();
    await sw.enter();
    expect(calls).toEqual([["DEV1", "Claude Answers"]]);
  });

  it("leave switches back with no name; second leave is a no-op", async () => {
    const { sw, calls } = make();
    await sw.enter();
    await sw.leave();
    await sw.leave();
    expect(calls).toEqual([["DEV1", "Claude Answers"], ["DEV1", undefined]]);
  });

  it("enter/leave/enter cycles correctly", async () => {
    const { sw, calls } = make();
    await sw.enter();
    await sw.leave();
    await sw.enter();
    expect(calls).toEqual([
      ["DEV1", "Claude Answers"], ["DEV1", undefined], ["DEV1", "Claude Answers"],
    ]);
  });

  it("can switch to a requested profile name", async () => {
    const { sw, calls } = make();
    await sw.enter("Codex Bridge");
    await sw.enter("Codex Bridge");
    await sw.enter("Claude Bridge");
    expect(calls).toEqual([
      ["DEV1", "Codex Bridge"],
      ["DEV1", "Claude Bridge"],
    ]);
  });

  it("no device → no switch, but state still tracked", async () => {
    const { sw, calls } = make(null);
    await sw.enter();
    expect(calls).toEqual([]);
  });
});

describe("ProfileSwitcher failure handling", () => {
  it("swallows switch failure and resets state so a later call can retry", async () => {
    let calls = 0;
    const api: ProfileApi = {
      switchToProfile: () => { calls++; return Promise.reject(new Error("timed out")); },
    };
    const sw = new ProfileSwitcher(api, () => "DEV1", "Claude Answers");
    await sw.enter(); // 던지지 않아야 함 (미처리 거부 방지)
    await sw.enter(); // 실패로 상태 초기화됐으니 재시도 → 두 번째 호출
    expect(calls).toBe(2);
  });
});
