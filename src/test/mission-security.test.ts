import { describe, expect, it } from "vitest";
import { canResumeMission, validateMissionCreateInput } from "../../supabase/functions/_shared/mission-security";

describe("validateMissionCreateInput", () => {
  it("normalizes valid input and applies safe defaults", () => {
    expect(validateMissionCreateInput({ goal: "  Build a game  " })).toEqual({
      ok: true,
      value: { goal: "Build a game", hours: 1, maxSteps: 100, title: "Build a game" },
    });
  });

  it.each([
    [{ goal: "short" }, /8 à 12 000/],
    [{ goal: "valid mission", hours: 0 }, /1 à 168/],
    [{ goal: "valid mission", hours: 169 }, /1 à 168/],
    [{ goal: "valid mission", hours: 1.5 }, /1 à 168/],
    [{ goal: "valid mission", max_steps: 0 }, /Nombre d'étapes/],
    [{ goal: "valid mission", max_steps: 2001 }, /Nombre d'étapes/],
  ])("rejects invalid payload %j", (payload, error) => {
    const result = validateMissionCreateInput(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it("trims and bounds custom titles", () => {
    const result = validateMissionCreateInput({ goal: "A sufficiently long goal", title: "  " + "x".repeat(150) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toHaveLength(120);
  });
});

describe("canResumeMission", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  it("allows only paused missions with a future deadline", () => {
    expect(canResumeMission("paused", "2026-11-07T13:00:00Z", now)).toBe(true);
    expect(canResumeMission("queued", "2026-11-07T13:00:00Z", now)).toBe(false);
    expect(canResumeMission("paused", "2026-11-07T11:00:00Z", now)).toBe(false);
    expect(canResumeMission("paused", "invalid", now)).toBe(false);
  });
});
