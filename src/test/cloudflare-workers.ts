// Vitest-only stand-in for the Cloudflare Workers runtime binding.
// Production builds resolve `cloudflare:workers` through Nitro's Cloudflare preset.
export const env: Record<string, string | undefined> = {};
