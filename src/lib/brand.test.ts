import { describe, expect, it } from "vitest";
import { CREATOR_CREDIT, CREATOR_IDENTITY_REPLY } from "./brand";

describe("DEBS product identity", () => {
  it("keeps the creator identity exact and consistent", () => {
    expect(CREATOR_IDENTITY_REPLY).toBe(
      "Mon créateur est Debs Boni. J’ai été développé par DEBS AI Studio.",
    );
    expect(CREATOR_CREDIT).toContain("Debs Boni");
    expect(CREATOR_CREDIT).toContain("DEBS AI Studio");
  });
});
