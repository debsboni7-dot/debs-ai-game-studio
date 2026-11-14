/**
 * Pure credit-domain rules for DEBS AI Studio.
 *
 * This module does not persist balances and must not be used as a client-side
 * source of truth. Production spending must call a server-side transactional
 * ledger that applies these same rules atomically.
 */

export interface CreditBalances {
  /** Subscription credits, including every unspent monthly rollover. */
  subscription: number;
  /** Non-subscription compensation/store credits. Standalone top-ups are disabled. */
  compensation: number;
}

export interface CreditSpendResult {
  balances: CreditBalances;
  spent: {
    subscription: number;
    compensation: number;
  };
}

export class InsufficientCreditsError extends Error {
  readonly requested: number;
  readonly availableBySource: CreditBalances;

  constructor(requested: number, availableBySource: CreditBalances) {
    super("Insufficient DEBS credits.");
    this.name = "InsufficientCreditsError";
    this.requested = requested;
    this.availableBySource = { ...availableBySource };
  }
}

function assertCreditAmount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}

function assertBalances(balances: CreditBalances): void {
  assertCreditAmount(balances.subscription, "subscription");
  assertCreditAmount(balances.compensation, "compensation");
}

/**
 * Add a new subscription grant without resetting or capping the previous
 * subscription balance. This implements full rollover and downgrade retention.
 */
export function addSubscriptionGrant(
  balances: CreditBalances,
  monthlyGrant: number,
): CreditBalances {
  assertBalances(balances);
  assertCreditAmount(monthlyGrant, "monthlyGrant");

  const subscription = balances.subscription + monthlyGrant;
  if (!Number.isSafeInteger(subscription)) {
    throw new RangeError("Subscription credit balance exceeds the safe integer range.");
  }

  return { subscription, compensation: balances.compensation };
}

/**
 * Spend subscription credits first, then compensation/store credits.
 * Compensation credits are not sold as standalone top-ups.
 */
export function spendCredits(
  balances: CreditBalances,
  amount: number,
): CreditSpendResult {
  assertBalances(balances);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("amount must be a positive safe integer.");
  }

  const fromSubscription = Math.min(balances.subscription, amount);
  const remaining = amount - fromSubscription;
  if (remaining > balances.compensation) {
    throw new InsufficientCreditsError(amount, balances);
  }

  return {
    balances: {
      subscription: balances.subscription - fromSubscription,
      compensation: balances.compensation - remaining,
    },
    spent: {
      subscription: fromSubscription,
      compensation: remaining,
    },
  };
}
