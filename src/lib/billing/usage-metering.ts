/**
 * Deterministic DEBS credit metering from provider-reported token usage.
 *
 * This is a pure calculation layer, not a wallet, price publisher, or provider
 * adapter. Production callers must supply a trusted, server-selected rate card
 * and provider-reported usage. Never accept either from an untrusted browser.
 */

const TOKENS_PER_MILLION = 1_000_000n;

export interface ModelRateCard {
  provider: string;
  model: string;
  version: string;
  effectiveFrom: number;
  effectiveUntil?: number | null;
  /** DEBS credits charged per 1,000,000 non-cached input tokens. */
  inputCreditsPerMillion: number;
  /** DEBS credits charged per 1,000,000 output tokens. */
  outputCreditsPerMillion: number;
  /** DEBS credits charged per 1,000,000 cached input tokens. */
  cachedInputCreditsPerMillion: number;
}

export interface ReportedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Cached tokens are a subset of inputTokens, never an additional count. */
  cachedInputTokens?: number;
}

export interface UsageCharge {
  provider: string;
  model: string;
  rateCardVersion: string;
  inputTokens: number;
  nonCachedInputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  credits: number;
}

function assertLabel(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}

export function validateModelRateCard(card: ModelRateCard): void {
  assertLabel(card.provider, "provider");
  assertLabel(card.model, "model");
  assertLabel(card.version, "version");
  assertNonNegativeSafeInteger(card.effectiveFrom, "effectiveFrom");
  if (card.effectiveUntil !== undefined && card.effectiveUntil !== null) {
    assertNonNegativeSafeInteger(card.effectiveUntil, "effectiveUntil");
    if (card.effectiveUntil <= card.effectiveFrom) {
      throw new RangeError("effectiveUntil must be later than effectiveFrom.");
    }
  }
  assertNonNegativeSafeInteger(card.inputCreditsPerMillion, "inputCreditsPerMillion");
  assertNonNegativeSafeInteger(card.outputCreditsPerMillion, "outputCreditsPerMillion");
  assertNonNegativeSafeInteger(card.cachedInputCreditsPerMillion, "cachedInputCreditsPerMillion");
}

/** Select exactly one rate card valid at the supplied trusted timestamp. */
export function resolveModelRateCard(
  cards: readonly ModelRateCard[],
  provider: string,
  model: string,
  at: number,
): ModelRateCard {
  assertLabel(provider, "provider");
  assertLabel(model, "model");
  assertNonNegativeSafeInteger(at, "at");

  const matches = cards.filter((card) => {
    validateModelRateCard(card);
    return card.provider === provider &&
      card.model === model &&
      card.effectiveFrom <= at &&
      (card.effectiveUntil == null || at < card.effectiveUntil);
  });

  if (matches.length === 0) {
    throw new Error(`No active DEBS rate card for ${provider}/${model} at the requested time.`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous DEBS rate cards for ${provider}/${model} at the requested time.`);
  }
  const selected = matches[0];
  if (!selected) {
    throw new Error("No active DEBS rate card was selected.");
  }
  return selected;
}

/**
 * Calculate a single rounded-up charge from trusted, reported token counts.
 * BigInt arithmetic avoids floating-point rounding and unsafe intermediate sums.
 */
export function calculateUsageCredits(
  card: ModelRateCard,
  usage: ReportedTokenUsage,
): UsageCharge {
  validateModelRateCard(card);
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  assertNonNegativeSafeInteger(usage.inputTokens, "inputTokens");
  assertNonNegativeSafeInteger(usage.outputTokens, "outputTokens");
  assertNonNegativeSafeInteger(cachedInputTokens, "cachedInputTokens");
  if (cachedInputTokens > usage.inputTokens) {
    throw new RangeError("cachedInputTokens cannot exceed inputTokens.");
  }

  const nonCachedInputTokens = usage.inputTokens - cachedInputTokens;
  const weightedCredits =
    BigInt(nonCachedInputTokens) * BigInt(card.inputCreditsPerMillion) +
    BigInt(cachedInputTokens) * BigInt(card.cachedInputCreditsPerMillion) +
    BigInt(usage.outputTokens) * BigInt(card.outputCreditsPerMillion);
  const roundedCredits = (weightedCredits + TOKENS_PER_MILLION - 1n) / TOKENS_PER_MILLION;
  const credits = Number(roundedCredits);
  if (!Number.isSafeInteger(credits)) {
    throw new RangeError("Calculated DEBS credit charge exceeds the safe integer range.");
  }

  return {
    provider: card.provider,
    model: card.model,
    rateCardVersion: card.version,
    inputTokens: usage.inputTokens,
    nonCachedInputTokens,
    cachedInputTokens,
    outputTokens: usage.outputTokens,
    credits,
  };
}
