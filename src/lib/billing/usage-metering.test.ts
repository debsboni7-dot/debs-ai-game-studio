import { describe, expect, it } from "vitest";
import {
  calculateUsageCredits,
  resolveModelRateCard,
  type ModelRateCard,
} from "./usage-metering";

const card: ModelRateCard = {
  provider: "test-provider",
  model: "test-model",
  version: "2026-01",
  effectiveFrom: 1_000,
  effectiveUntil: 2_000,
  inputCreditsPerMillion: 2_000,
  outputCreditsPerMillion: 8_000,
  cachedInputCreditsPerMillion: 500,
};

describe("DEBS versioned usage metering", () => {
  it("calculates input, output, and cached input using one final ceiling", () => {
    expect(calculateUsageCredits(card, {
      inputTokens: 1_000_000,
      cachedInputTokens: 200_000,
      outputTokens: 100_000,
    })).toEqual({
      provider: "test-provider",
      model: "test-model",
      rateCardVersion: "2026-01",
      inputTokens: 1_000_000,
      nonCachedInputTokens: 800_000,
      cachedInputTokens: 200_000,
      outputTokens: 100_000,
      credits: 2_500,
    });
  });

  it("rounds a fractional credit charge up exactly once", () => {
    expect(calculateUsageCredits(card, {
      inputTokens: 1,
      outputTokens: 0,
    }).credits).toBe(1);
  });

  it("returns zero for zero usage", () => {
    expect(calculateUsageCredits(card, {
      inputTokens: 0,
      outputTokens: 0,
    }).credits).toBe(0);
  });

  it("resolves the rate card active at the usage timestamp", () => {
    const newer = { ...card, version: "2026-02", effectiveFrom: 2_000, effectiveUntil: null };
    expect(resolveModelRateCard([card, newer], card.provider, card.model, 2_000))
      .toEqual(newer);
    expect(resolveModelRateCard([card, newer], card.provider, card.model, 1_999))
      .toEqual(card);
  });

  it("rejects missing and ambiguous active rate cards", () => {
    expect(() => resolveModelRateCard([], card.provider, card.model, 1_500))
      .toThrow(/No active/);
    expect(() => resolveModelRateCard(
      [card, { ...card, version: "duplicate" }],
      card.provider,
      card.model,
      1_500,
    )).toThrow(/Ambiguous/);
  });

  it("rejects invalid usage and invalid rate cards", () => {
    expect(() => calculateUsageCredits(card, { inputTokens: -1, outputTokens: 0 }))
      .toThrow(RangeError);
    expect(() => calculateUsageCredits(card, {
      inputTokens: 2,
      cachedInputTokens: 3,
      outputTokens: 0,
    })).toThrow(RangeError);
    expect(() => calculateUsageCredits({ ...card, outputCreditsPerMillion: 1.5 }, {
      inputTokens: 0,
      outputTokens: 1,
    })).toThrow(RangeError);
    expect(() => calculateUsageCredits({ ...card, effectiveUntil: card.effectiveFrom }, {
      inputTokens: 0,
      outputTokens: 0,
    })).toThrow(RangeError);
  });

  it("rejects unsafe results instead of silently losing precision", () => {
    const expensive = {
      ...card,
      inputCreditsPerMillion: Number.MAX_SAFE_INTEGER,
    };
    expect(() => calculateUsageCredits(expensive, {
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: 0,
    })).toThrow(RangeError);
  });
});
