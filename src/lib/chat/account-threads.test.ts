import { describe, expect, it } from "vitest";
import { accountThreadsStorageKey } from "./account-threads";

describe("account-scoped conversation storage", () => {
  it("uses a distinct storage namespace for every account", () => {
    expect(accountThreadsStorageKey("user-a")).not.toBe(accountThreadsStorageKey("user-b"));
  });

  it("does not use email addresses as storage identifiers", () => {
    expect(accountThreadsStorageKey("user-a")).toBe("debs.threads.v1.account.user-a");
  });

  it("keeps signed-out demo state separate from every authenticated account", () => {
    expect(accountThreadsStorageKey(null)).toBe("debs.threads.v1.account.signed-out");
    expect(accountThreadsStorageKey(null)).not.toBe(accountThreadsStorageKey("user-a"));
  });
});
