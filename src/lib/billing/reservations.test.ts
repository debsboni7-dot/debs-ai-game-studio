import { describe, expect, it } from "vitest";
import {
  releaseCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "./reservations";

describe("DEBS credit reservation lifecycle", () => {
  it("reserves subscription credits before compensation credits", () => {
    expect(reserveCredits({ subscription: 700, compensation: 900 }, 1_000)).toEqual({
      balances: { subscription: 0, compensation: 600 },
      reservation: { status: "reserved", reserved: { subscription: 700, compensation: 300 } },
    });
  });

  it("settles actual usage and returns the unused amount to its original source", () => {
    const reserved = reserveCredits({ subscription: 700, compensation: 900 }, 1_000);
    expect(settleCreditReservation(reserved.balances, reserved.reservation, 850)).toEqual({
      balances: { subscription: 0, compensation: 750 },
      reservation: { status: "settled", reserved: { subscription: 700, compensation: 300 } },
      spent: { subscription: 700, compensation: 150 },
      released: { subscription: 0, compensation: 150 },
    });
  });

  it("releases the full reservation without losing either compartment", () => {
    const reserved = reserveCredits({ subscription: 250, compensation: 750 }, 600);
    expect(releaseCreditReservation(reserved.balances, reserved.reservation)).toEqual({
      balances: { subscription: 250, compensation: 750 },
      reservation: { status: "released", reserved: { subscription: 250, compensation: 350 } },
    });
  });

  it("supports zero actual usage and releases the full reservation", () => {
    const reserved = reserveCredits({ subscription: 20, compensation: 30 }, 50);
    const settled = settleCreditReservation(reserved.balances, reserved.reservation, 0);
    expect(settled.balances).toEqual({ subscription: 20, compensation: 30 });
    expect(settled.spent).toEqual({ subscription: 0, compensation: 0 });
  });

  it("rejects a reservation larger than the available balance", () => {
    expect(() => reserveCredits({ subscription: 10, compensation: 20 }, 31))
      .toThrow(/Insufficient/);
  });

  it("rejects settlement above the reserved amount without mutating inputs", () => {
    const reserved = reserveCredits({ subscription: 10, compensation: 20 }, 25);
    const beforeBalances = { ...reserved.balances };
    const beforeReservation = structuredClone(reserved.reservation);
    expect(() => settleCreditReservation(
      reserved.balances,
      reserved.reservation,
      26,
    )).toThrow(/exceeds reserved/);
    expect(reserved.balances).toEqual(beforeBalances);
    expect(reserved.reservation).toEqual(beforeReservation);
  });

  it("rejects duplicate settlement or release transitions", () => {
    const reserved = reserveCredits({ subscription: 10, compensation: 20 }, 20);
    const settled = settleCreditReservation(reserved.balances, reserved.reservation, 10);
    expect(() => settleCreditReservation(settled.balances, settled.reservation, 1))
      .toThrow(/active/);
    const released = releaseCreditReservation(reserved.balances, reserved.reservation);
    expect(() => releaseCreditReservation(released.balances, released.reservation))
      .toThrow(/active/);
  });

  it("rejects invalid balances, amounts, and unsafe released totals", () => {
    expect(() => reserveCredits({ subscription: -1, compensation: 10 }, 1)).toThrow(RangeError);
    expect(() => reserveCredits({ subscription: 10, compensation: 10 }, 0)).toThrow(RangeError);
    const reserved = reserveCredits({ subscription: 10, compensation: 10 }, 10);
    expect(() => settleCreditReservation(reserved.balances, reserved.reservation, -1))
      .toThrow(RangeError);
    expect(() => releaseCreditReservation(
      { subscription: Number.MAX_SAFE_INTEGER, compensation: 0 },
      reserved.reservation,
    )).toThrow(RangeError);
  });
});
