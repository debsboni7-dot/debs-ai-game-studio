import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (key: string) => Deno.env.get(key)?.trim() ?? "";
const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Méthode non autorisée." }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supabaseUrl || !anonKey || !token) return reply({ error: "Connexion requise." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) return reply({ error: "Session utilisateur invalide." }, 401);

  const githubToken = env("GITHUB_TOKEN");
  const repository = env("GITHUB_REPOSITORY");
  const baseBranch = env("GITHUB_BASE_BRANCH") || "main";
  if (!githubToken || !repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return reply({ error: "Intégration GitHub non configurée côté serveur." }, 503);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "JSON invalide." }, 400); }
  const action = typeof body.action === "string" ? body.action : "";
  const api = `https://api.github.com/repos/${repository}`;
  const gh = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(api + path, { ...init, headers: { ...ghHeaders(githubToken), ...(init.headers ?? {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : `GitHub HTTP ${response.status}`);
    return payload;
  };

  try {
    if (action === "inspect") {
      const branch = typeof body.branch === "string" && /^[A-Za-z0-9._/-]{1,120}$/.test(body.branch) ? body.branch : baseBranch;
      const tree = await gh(`/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      const entries = Array.isArray(tree.tree) ? tree.tree : [];
      return reply({
        ok: true, repository, branch, truncated: Boolean(tree.truncated),
        files: entries.filter((item: { type?: string; path?: string }) => item.type === "blob")
          .slice(0, 500).map((item: { path: string; size?: number }) => ({ path: item.path, size: item.size ?? null })),
      });
    }

    if (action !== "propose") return reply({ error: "Action inconnue." }, 400);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 4000) : "";
    const files = Array.isArray(body.files) ? body.files : [];
    if (!title || files.length < 1 || files.length > 20) return reply({ error: "Titre requis et 1 à 20 fichiers attendus." }, 400);

    let totalBytes = 0;
    const normalized = files.map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("Fichier invalide.");
      const file = entry as Record<string, unknown>;
      const path = typeof file.path === "string" ? file.path : "";
      const content = typeof file.content === "string" ? file.content : "";
      if (!path || path.length > 220 || path.startsWith("/") || path.includes("\\") ||
          path.split("/").some((part) => !part || part === "." || part === ".." || /^\.env/i.test(part) || /^(secrets?|credentials|private)$/i.test(part) || /^id_rsa(\.pub)?$/i.test(part)) ||
          path.startsWith(".github/workflows/")) {
        throw new Error("Chemin refusé : " + path);
      }
      const bytes = new TextEncoder().encode(content).byteLength;
      if (bytes > 80_000) throw new Error("Fichier trop volumineux : " + path);
      totalBytes += bytes;
      if (totalBytes > 300_000) throw new Error("Proposition trop volumineuse : limite totale de 300 Ko.");
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}/i.test(content)) throw new Error("Contenu refusé : secret ou clé privée détecté.");
      return { path, content };
    });
    if (new Set(normalized.map((file) => file.path)).size !== normalized.length) {
      return reply({ error: "Chemins de fichiers dupliqués." }, 400);
    }

    const base = await gh(`/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    const baseSha = base.object.sha as string;
    const baseCommit = await gh(`/git/commits/${baseSha}`);
    const treeEntries = [];
    for (const file of normalized) {
      const blob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: file.content, encoding: "utf-8" }) });
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }) });
    const commit = await gh("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: `DEBS AI: ${title}`, tree: tree.sha, parents: [baseSha] }),
    });
    const branchName = `debs-ai/${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commit.sha }) });
    const pr = await gh("/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: `[DEBS AI] ${title}`,
        head: branchName,
        base: baseBranch,
        draft: true,
        body: `## Proposition générée par DEBS AI\n\n${summary || "Modifications proposées par l'agent."}\n\nFichiers :\n${normalized.map((file) => `- \`${file.path}\``).join("\n")}\n\nÀ vérifier et tester avant fusion. Aucun changement n'a été poussé sur la branche principale.`,
      }),
    });
    return reply({ ok: true, repository, branch: branchName, pull_request: pr.html_url, number: pr.number, files: normalized.map((file) => file.path) });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Erreur GitHub inconnue." }, 502);
  }
});
