import { describe, expect, it, vi } from "vitest";
import { verifyVerifiedEmailBearer, type AuthClientFactory } from "./auth.server";

const URL = "https://project.supabase.co";
const KEY = "sb_publishable_test";
const TOKEN = "header.payload.signature";
const USER = { id: "user-a", email: "a@example.test", email_confirmed_at: "2026-11-14T10:00:00Z" };

function request(authorization?: string) {
  return new Request("https://debs.example/api/chat-stream", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

function factoryFor(user: { id: string; email?: string; email_confirmed_at?: string | null } | null, error: unknown = null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error });
  const factory = vi.fn(() => ({ auth: { getUser } }));
  return { factory: factory as unknown as AuthClientFactory, getUser };
}

describe("verified-email bearer authentication", () => {
  it("rejects missing authorization before creating an Auth client", async () => {
    const { factory } = factoryFor(USER);
    await expect(verifyVerifiedEmailBearer(request(), URL, KEY, factory))
      .resolves.toEqual({ ok: false, status: 401, message: "Connexion requise." });
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects malformed bearer tokens", async () => {
    const { factory } = factoryFor(USER);
    const result = await verifyVerifiedEmailBearer(request("Bearer not-a-jwt"), URL, KEY, factory);
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects invalid or revoked sessions", async () => {
    const { factory, getUser } = factoryFor(null, new Error("invalid token"));
    const result = await verifyVerifiedEmailBearer(request("Bearer " + TOKEN), URL, KEY, factory);
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getUser).toHaveBeenCalledWith(TOKEN);
  });

  it("rejects users whose email has not been confirmed", async () => {
    const { factory } = factoryFor({ ...USER, email_confirmed_at: null });
    const result = await verifyVerifiedEmailBearer(request("Bearer " + TOKEN), URL, KEY, factory);
    expect(result).toEqual({ ok: false, status: 403, message: "Adresse e-mail non vérifiée." });
  });

  it("returns the verified identity from Supabase, not from request data", async () => {
    const { factory, getUser } = factoryFor(USER);
    const result = await verifyVerifiedEmailBearer(request("Bearer " + TOKEN), URL, KEY, factory);
    expect(result).toEqual({ ok: true, identity: { userId: "user-a", email: "a@example.test" } });
    expect(getUser).toHaveBeenCalledWith(TOKEN);
  });

  it("fails closed when server Supabase configuration is missing", async () => {
    const { factory } = factoryFor(USER);
    await expect(verifyVerifiedEmailBearer(request("Bearer " + TOKEN), undefined, KEY, factory))
      .resolves.toEqual({ ok: false, status: 503, message: "Service d'authentification indisponible." });
    expect(factory).not.toHaveBeenCalled();
  });
});
