/**
 * Pure subscription lifecycle decisions for DEBS AI Studio.
 *
 * These helpers do not process payments, grant credits, or persist subscription
 * state. Production decisions must use authenticated server data and a verified
 * provider webhook. Refund eligibility is deliberately not inferred here.
 */

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "expired";

export interface SubscriptionLifecycle {
  status: SubscriptionStatus;
  /** End of the paid billing period, as Unix milliseconds. */
  currentPeriodEnd: number;
  /** End of the explicitly configured grace period, if payment is past due. */
  gracePeriodEndsAt?: number | null;
  /** User requested cancellation at the end of the already-paid period. */
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionAccess {
  canUsePaidEntitlements: boolean;
  reason: "active_period" | "grace_period" | "period_ended" | "subscription_expired";
  renewsAutomatically: boolean;
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer timestamp.`);
  }
}

/**
 * Evaluate access to subscription-only features at a given server timestamp.
 * Purchased credits are independent and are intentionally outside this result.
 */
export function evaluateSubscriptionAccess(
  subscription: SubscriptionLifecycle,
  now: number,
): SubscriptionAccess {
  assertTimestamp(now, "now");
  assertTimestamp(subscription.currentPeriodEnd, "currentPeriodEnd");

  const periodIsOpen = now < subscription.currentPeriodEnd;
  const renewsAutomatically =
    subscription.status === "active" && subscription.cancelAtPeriodEnd !== true;

  if (subscription.status === "expired") {
    return {
      canUsePaidEntitlements: false,
      reason: "subscription_expired",
      renewsAutomatically: false,
    };
  }

  if (subscription.status === "active" || subscription.status === "canceled") {
    return {
      canUsePaidEntitlements: periodIsOpen,
      reason: periodIsOpen ? "active_period" : "period_ended",
      renewsAutomatically,
    };
  }

  const graceEnd = subscription.gracePeriodEndsAt;
  if (graceEnd !== undefined && graceEnd !== null) {
    assertTimestamp(graceEnd, "gracePeriodEndsAt");
    if (now < graceEnd) {
      return {
        canUsePaidEntitlements: true,
        reason: "grace_period",
        renewsAutomatically: false,
      };
    }
  }

  return {
    canUsePaidEntitlements: false,
    reason: "period_ended",
    renewsAutomatically: false,
  };
}

/** Whether a cancellation request should stop the next automatic renewal. */
export function shouldStopAutomaticRenewal(
  subscription: SubscriptionLifecycle,
): boolean {
  return (
    subscription.status === "canceled" ||
    subscription.status === "expired" ||
    subscription.cancelAtPeriodEnd === true
  );
}
