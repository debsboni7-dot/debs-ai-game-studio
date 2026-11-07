import type { CodeModelProvider } from "./types";

/**
 * Server-only list of model adapters. Empty in the MVP: no provider is wired.
 * To add one: implement CodeModelProvider reading its key from process.env
 * inside complete(), then push it here. Never import this file from the browser.
 */
const adapters: CodeModelProvider[] = [];

export function resolveProvider(): CodeModelProvider | null {
  return adapters.find((a) => a.isConfigured()) ?? null;
}
