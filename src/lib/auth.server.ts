export interface VerifiedEmailIdentity {
  userId: string;
  email: string | null;
}

interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

interface AuthVerifierClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: AuthUser | null };
      error: unknown;
    }>;
  };
}

export type AuthClientFactory = (url: string, key: string) => AuthVerifierClient;

export type VerifiedEmailResult =
  | { ok: true; identity: VerifiedEmailIdentity }
  | { ok: false; status: 401 | 403 | 503; message: string };

export async function verifyVerifiedEmailBearer(
  request: Request,
  supabaseUrl: string | undefined,
  supabaseKey: string | undefined,
  createAuthClient: AuthClientFactory,
): Promise<VerifiedEmailResult> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!token || token.split(".").length !== 3) {
    return { ok: false, status: 401, message: "Connexion requise." };
  }
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, status: 503, message: "Service d'authentification indisponible." };
  }

  const client = createAuthClient(supabaseUrl, supabaseKey);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, message: "Session invalide. Reconnecte-toi." };
  }
  if (!data.user.email_confirmed_at) {
    return { ok: false, status: 403, message: "Adresse e-mail non vérifiée." };
  }
  return {
    ok: true,
    identity: { userId: data.user.id, email: data.user.email ?? null },
  };
}
