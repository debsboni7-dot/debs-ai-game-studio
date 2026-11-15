import { getRequest } from "@tanstack/react-start/server";

/**
 * Read server-only secrets from the active deployment runtime.
 * Cloudflare Workers exposes them on request.runtime.cloudflare.env.
 * process.env remains a local Node/test fallback only.
 */
export function getServerEnv(name: string): string | undefined {
  try {
    const request = getRequest() as Request & {
      runtime?: { cloudflare?: { env?: Record<string, string | undefined> } };
    };
    const runtimeValue = request.runtime?.cloudflare?.env?.[name]?.trim();
    if (runtimeValue) return runtimeValue;
  } catch {
    // No active request context in local tests or non-request code.
  }
  const processValue = process.env[name]?.trim();
  return processValue || undefined;
}
