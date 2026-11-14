import { describe, expect, it } from "vitest";
import {
  evaluateSubscriptionAccess,
  shouldStopAutomaticRenewal,
  type SubscriptionLifecycle,
} from "./lifecycle";

const periodEnd = 2_000_000;

describe("evaluateSubscriptionAccess", () => {
  it("allows access during an active paid period", () => {
    const sub: SubscriptionLifecycle = { status: "active", currentPeriodEnd: periodEnd };
    expect(evaluateSubscriptionAccess(sub, periodEnd - 1)).toEqual({
      canUsePaidEntitlements: true,
      reason: "active_period",
      renewsAutomatically: true,
    });
  });

  it("keeps access until period end after cancellation is scheduled", () => {
    const sub: SubscriptionLifecycle = {
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
    };
    expect(evaluateSubscriptionAccess(sub, periodEnd - 1)).toMatchObject({
      canUsePaidEntitlements: true,
      renewsAutomatically: false,
    });
  });

  it("does not renew a canceled subscription but preserves paid-period access", () => {
    const sub: SubscriptionLifecycle = { status: "canceled", currentPeriodEnd: periodEnd };
    expect(evaluateSubscriptionAccess(sub, periodEnd - 1)).toMatchObject({
      canUsePaidEntitlements: true,
      reason: "active_period",
      renewsAutomatically: false,
    });
  });

  it("denies access after the paid period ends", () => {
    const sub: SubscriptionLifecycle = { status: "canceled", currentPeriodEnd: periodEnd };
    expect(evaluateSubscriptionAccess(sub, periodEnd)).toMatchObject({
      canUsePaidEntitlements: false,
      reason: "period_ended",
    });
  });

  it("allows only the configured grace period after a failed renewal", () => {
    const sub: SubscriptionLifecycle = {
      status: "past_due",
      currentPeriodEnd: periodEnd,
      gracePeriodEndsAt: periodEnd + 60_000,
    };
    expect(evaluateSubscriptionAccess(sub, periodEnd + 1)).toMatchObject({
      canUsePaidEntitlements: true,
      reason: "grace_period",
      renewsAutomatically: false,
    });
    expect(evaluateSubscriptionAccess(sub, periodEnd + 60_000).canUsePaidEntitlements).toBe(false);
  });

  it("denies access for expired subscriptions", () => {
    const sub: SubscriptionLifecycle = { status: "expired", currentPeriodEnd: periodEnd };
    expect(evaluateSubscriptionAccess(sub, 1)).toMatchObject({
      canUsePaidEntitlements: false,
      reason: "subscription_expired",
    });
  });

  it("rejects invalid timestamps", () => {
    expect(() =>
      evaluateSubscriptionAccess({ status: "active", currentPeriodEnd: -1 }, 0),
    ).toThrow(RangeError);
  });
});

describe("shouldStopAutomaticRenewal", () => {
  it("stops renewal for canceled, expired, or scheduled cancellation", () => {
    expect(shouldStopAutomaticRenewal({ status: "canceled", currentPeriodEnd: periodEnd })).toBe(true);
    expect(shouldStopAutomaticRenewal({ status: "expired", currentPeriodEnd: periodEnd })).toBe(true);
    expect(shouldStopAutomaticRenewal({
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
    })).toBe(true);
  });

  it("keeps renewal enabled for active subscriptions", () => {
    expect(shouldStopAutomaticRenewal({ status: "active", currentPeriodEnd: periodEnd })).toBe(false);
  });
});
