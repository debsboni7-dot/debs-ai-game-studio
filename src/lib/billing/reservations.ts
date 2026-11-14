/**
 * Pure reservation lifecycle rules for DEBS credit spending.
 *
 * This module models arithmetic only. It is not persistent, concurrent,
 * idempotent, or an authorization boundary. Production callers must execute
 * transitions inside a trusted database transaction.
 */
import type { CreditBalances } from "./credits";

export interface CreditReservation {
  status: "reserved" | "settled" | "released";
  reserved: CreditBalances;
}

export interface ReservationResult {
  balances: CreditBalances;
  reservation: CreditReservation;
}

export interface SettlementResult extends ReservationResult {
  spent: CreditBalances;
  released: CreditBalances;
}

function assertAmount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}

function assertBalances(value: CreditBalances, field: string): void {
  assertAmount(value.subscription, `${field}.subscription`);
  assertAmount(value.compensation, `${field}.compensation`);
}

function assertReserved(reservation: CreditReservation): void {
  if (!reservation || reservation.status !== "reserved") {
    throw new Error("Only an active DEBS credit reservation can be changed.");
  }
  assertBalances(reservation.reserved, "reservation.reserved");
  if (reservation.reserved.subscription + reservation.reserved.compensation <= 0) {
    throw new RangeError("A reservation must hold at least one credit.");
  }
}

/** Reserve subscription credits first, then compensation/store credits. */
export function reserveCredits(
  balances: CreditBalances,
  amount: number,
): ReservationResult {
  assertBalances(balances, "balances");
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("amount must be a positive safe integer.");
  }
  const available = balances.subscription + balances.compensation;
  if (!Number.isSafeInteger(available)) {
    throw new RangeError("Available credit balance exceeds the safe integer range.");
  }
  if (amount > available) {
    throw new RangeError("Insufficient DEBS credits for reservation.");
  }

  const subscription = Math.min(balances.subscription, amount);
  const compensation = amount - subscription;
  return {
    balances: {
      subscription: balances.subscription - subscription,
      compensation: balances.compensation - compensation,
    },
    reservation: {
      status: "reserved",
      reserved: { subscription, compensation },
    },
  };
}

/**
 * Settle actual usage against held credits. Actual usage may be lower than the
 * reservation; unused amounts return to their original credit compartments.
 * Usage exceeding the reservation is rejected without changing either input.
 */
export function settleCreditReservation(
  balances: CreditBalances,
  reservation: CreditReservation,
  actualAmount: number,
): SettlementResult {
  assertBalances(balances, "balances");
  assertReserved(reservation);
  assertAmount(actualAmount, "actualAmount");

  const reservedTotal = reservation.reserved.subscription + reservation.reserved.compensation;
  if (!Number.isSafeInteger(reservedTotal)) {
    throw new RangeError("Reserved credit amount exceeds the safe integer range.");
  }
  if (actualAmount > reservedTotal) {
    throw new RangeError("Actual usage exceeds reserved DEBS credits.");
  }

  const spentSubscription = Math.min(reservation.reserved.subscription, actualAmount);
  const spentCompensation = actualAmount - spentSubscription;
  const released = {
    subscription: reservation.reserved.subscription - spentSubscription,
    compensation: reservation.reserved.compensation - spentCompensation,
  };
  const nextBalances = {
    subscription: balances.subscription + released.subscription,
    compensation: balances.compensation + released.compensation,
  };
  assertBalances(nextBalances, "settledBalances");

  return {
    balances: nextBalances,
    reservation: { status: "settled", reserved: { ...reservation.reserved } },
    spent: { subscription: spentSubscription, compensation: spentCompensation },
    released,
  };
}

/** Release every held credit to its original compartment. */
export function releaseCreditReservation(
  balances: CreditBalances,
  reservation: CreditReservation,
): ReservationResult {
  assertBalances(balances, "balances");
  assertReserved(reservation);
  const nextBalances = {
    subscription: balances.subscription + reservation.reserved.subscription,
    compensation: balances.compensation + reservation.reserved.compensation,
  };
  assertBalances(nextBalances, "releasedBalances");
  return {
    balances: nextBalances,
    reservation: { status: "released", reserved: { ...reservation.reserved } },
  };
}
