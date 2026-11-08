import { APICallError } from "ai";

/** Only deliberately sanitized DEBS inference errors may cross the server boundary. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function safeGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (APICallError.isInstance(error)) {
    let message: unknown;
    try {
      const body = JSON.parse(error.responseBody ?? "{}") as {
        message?: unknown;
        error?: { message?: unknown };
      };
      message = body.message ?? body.error?.message;
    } catch {
      // Never expose SDK diagnostics, request headers, or raw response bodies.
    }
    if (typeof message === "string" && message.trim()) {
      const key = process.env.DEBS_INFERENCE_API_KEY;
      const sanitized = key ? message.split(key).join("[secret masqué]") : message;
      return new GatewayError(sanitized.slice(0, 1000), error.statusCode);
    }
    return new GatewayError(
      `Le serveur DEBS a refusé la requête (HTTP ${error.statusCode}).`,
      error.statusCode,
    );
  }
  return new GatewayError(
    "Impossible d'obtenir une réponse du serveur DEBS. Aucun nouvel essai automatique n'a été effectué.",
  );
}
