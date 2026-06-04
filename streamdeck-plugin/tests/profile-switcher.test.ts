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

  it("no device → no switch, but state still tracked", async () => {
    const { sw, calls } = make(null);
    await sw.enter();
    expect(calls).toEqual([]);
  });
});
