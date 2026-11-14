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
        { subscription: 725_000, purchased: 80_000 },
        1_000_000,
      ),
    ).toEqual({ subscription: 1_725_000, purchased: 80_000 });
  });

  it("retains all existing balances when a lower plan grant is added", () => {
    expect(
      addSubscriptionGrant(
        { subscription: 3_400_000, purchased: 250_000 },
        100_000,
      ),
    ).toEqual({ subscription: 3_500_000, purchased: 250_000 });
  });

  it("spends subscription credits before purchased credits", () => {
    expect(
      spendCredits(
        { subscription: 700, purchased: 900 },
        1_000,
      ),
    ).toEqual({
      balances: { subscription: 0, purchased: 600 },
      spent: { subscription: 700, purchased: 300 },
    });
  });

  it("does not touch purchased credits while subscription credits cover the spend", () => {
    expect(
      spendCredits(
        { subscription: 1_200, purchased: 900 },
        500,
      ),
    ).toEqual({
      balances: { subscription: 700, purchased: 900 },
      spent: { subscription: 500, purchased: 0 },
    });
  });

  it("rejects a spend that exceeds both balances without mutating either balance", () => {
    const balances = { subscription: 100, purchased: 200 };
    expect(() => spendCredits(balances, 301)).toThrow(InsufficientCreditsError);
    expect(balances).toEqual({ subscription: 100, purchased: 200 });
  });

  it("rejects invalid amounts and unsafe integer balances", () => {
    expect(() => spendCredits({ subscription: 10, purchased: 10 }, 0)).toThrow(RangeError);
    expect(() => spendCredits({ subscription: -1, purchased: 10 }, 1)).toThrow(RangeError);
    expect(() => addSubscriptionGrant({ subscription: Number.MAX_SAFE_INTEGER, purchased: 0 }, 1)).toThrow(RangeError);
  });
});
