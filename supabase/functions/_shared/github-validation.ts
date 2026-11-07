export type ProposedFile = { path: string; content: string };

const SECRET_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}/i;

export function validateProposedFiles(input: unknown, maxFiles = 12): ProposedFile[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > maxFiles) {
    throw new Error("Nombre de fichiers invalide.");
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const files: ProposedFile[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") throw new Error("Fichier invalide.");
    const candidate = entry as Record<string, unknown>;
    const path = typeof candidate.path === "string" ? candidate.path : "";
    const content = typeof candidate.content === "string" ? candidate.content : "";

    if (
      !path || path.length > 220 || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) =>
        !part || part === "." || part === ".." || /^\.env/i.test(part) ||
        /^(secrets?|credentials|private)$/i.test(part) || /^id_rsa(\.pub)?$/i.test(part)
      ) ||
      path.startsWith(".github/workflows/")
    ) {
      throw new Error("Chemin refusé : " + path);
    }

    if (seen.has(path)) throw new Error("Chemin dupliqué : " + path);
    seen.add(path);

    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > 80_000) throw new Error("Fichier trop volumineux : " + path);
    totalBytes += bytes;
    if (totalBytes > 300_000) throw new Error("Proposition trop volumineuse : limite totale de 300 Ko.");
    if (SECRET_PATTERN.test(content)) throw new Error("Contenu refusé : secret ou clé privée détecté.");

    files.push({ path, content });
  }

  return files;
}
