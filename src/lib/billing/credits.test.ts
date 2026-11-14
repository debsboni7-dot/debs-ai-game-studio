import { describe, expect, it } from "vitest";
import {
  addSubscriptionGrant,
  InsufficientCreditsError,
  spendCredits,
} from "./credits";

describe("DEBS credit domain", () => {
  it("adds monthly grants without expiring or capping rolled-over subscription credits", () => {
    expect(
      addSubscriptionGrant(
        { subscription: 725_000, compensation: 80_000 },
        1_000_000,
      ),
    ).toEqual({ subscription: 1_725_000, compensation: 80_000 });
  });

  it("retains all existing balances when a lower plan grant is added", () => {
    expect(
      addSubscriptionGrant(
        { subscription: 3_400_000, compensation: 250_000 },
        100_000,
      ),
    ).toEqual({ subscription: 3_500_000, compensation: 250_000 });
  });

  it("spends subscription credits before compensation credits", () => {
    expect(
      spendCredits(
        { subscription: 700, compensation: 900 },
        1_000,
      ),
    ).toEqual({
      balances: { subscription: 0, compensation: 600 },
      spent: { subscription: 700, compensation: 300 },
    });
  });

  it("does not touch compensation credits while subscription credits cover the spend", () => {
    expect(
      spendCredits(
        { subscription: 1_200, compensation: 900 },
        500,
      ),
    ).toEqual({
      balances: { subscription: 700, compensation: 900 },
      spent: { subscription: 500, compensation: 0 },
    });
  });

  it("rejects a spend that exceeds both balances without mutating either balance", () => {
    const balances = { subscription: 100, compensation: 200 };
    expect(() => spendCredits(balances, 301)).toThrow(InsufficientCreditsError);
    expect(balances).toEqual({ subscription: 100, compensation: 200 });
  });

  it("rejects invalid amounts and unsafe integer totals", () => {
    expect(() => spendCredits({ subscription: 10, compensation: 10 }, 0)).toThrow(RangeError);
    expect(() => spendCredits({ subscription: -1, compensation: 10 }, 1)).toThrow(RangeError);
    expect(() => addSubscriptionGrant({ subscription: Number.MAX_SAFE_INTEGER, compensation: 0 }, 1)).toThrow(RangeError);
    expect(() => spendCredits({ subscription: Number.MAX_SAFE_INTEGER, compensation: 1 }, 1)).toThrow(RangeError);
  });
});
