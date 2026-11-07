import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { unzipSync } from "npm:fflate@0.8.2";
import { assetSlug, isAllowedAssetFile, validateAssetSourceUrl } from "../_shared/asset-security.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
const MAX_ARCHIVE = 12 * 1024 * 1024;
const MAX_EXTRACTED = 18 * 1024 * 1024;
const MAX_FILES = 60;

async function downloadZip(start: URL): Promise<Uint8Array> {
  let url = start;
  for (let hop = 0; hop <= 4; hop++) {
    validateAssetSourceUrl(url.toString());
    const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": "DEBS-AI-AssetImporter/1.0", Accept: "application/zip,application/octet-stream,*/*" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop === 4) throw new Error("Redirection de téléchargement invalide ou trop longue.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error("Téléchargement refusé par la source (HTTP " + response.status + ").");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_ARCHIVE) throw new Error("Archive trop volumineuse (maximum 12 Mo).");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_ARCHIVE) throw new Error("Archive trop volumineuse (maximum 12 Mo).");
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Le lien doit pointer directement vers une archive ZIP.");
    return bytes;
  }
  throw new Error("Téléchargement impossible.");
}

async function githubCall(api: string, token: string, route: string, body?: unknown) {
  const response = await fetch(api + route, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("GitHub HTTP " + response.status + " : " + String(data.message ?? "requête refusée").slice(0, 180));
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const authHeader = request.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\\s+/i, "");
  if (!jwt || jwt === authHeader) return json({ error: "Connexion requise." }, 401);
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Configuration Supabase incomplète." }, 503);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !user) return json({ error: "Session invalide." }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "JSON invalide." }, 400); }
  const source = typeof body.source_url === "string" ? body.source_url : "";
  const packName = typeof body.pack_name === "string" ? body.pack_name.trim() : "";
  const licenseName = typeof body.license_name === "string" ? body.license_name.trim() : "";
  const licenseUrl = typeof body.license_url === "string" ? body.license_url.trim() : "";
  const licenseEvidence = typeof body.license_evidence === "string" ? body.license_evidence.trim() : "";
  if (packName.length < 2 || packName.length > 100) return json({ error: "Nom du pack requis (2 à 100 caractères)." }, 400);
  if (!licenseName || !licenseUrl.startsWith("https://") || licenseEvidence.length < 20) {
    return json({ error: "Indique la licence exacte, son URL officielle et un court extrait de preuve. L'import ne doit pas deviner les droits d'utilisation." }, 400);
  }
  let sourceUrl: URL;
  try { sourceUrl = validateAssetSourceUrl(source); } catch (error) { return json({ error: error instanceof Error ? error.message : "Source refusée." }, 400); }
  const token = env("GITHUB_TOKEN");
  const repository = env("GITHUB_REPOSITORY");
  const baseBranch = env("GITHUB_BASE_BRANCH") || "main";
  if (!token || !/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(repository)) return json({ error: "GitHub n'est pas configuré côté serveur." }, 503);

  try {
    const archive = await downloadZip(sourceUrl);
    const entries = unzipSync(archive);
    const slug = assetSlug(packName);
    const files: Array<{ path: string; bytes: Uint8Array }> = [];
    let total = 0;
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith("/")) continue;
      const path = name.replace(/^\\.\\//, "");
      if (!isAllowedAssetFile(path)) continue;
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Un fichier dépasse la limite de 5 Mo : " + path.slice(0, 100));
      total += bytes.length;
      if (total > MAX_EXTRACTED) throw new Error("Contenu extrait supérieur à 18 Mo.");
      files.push({ path, bytes });
      if (files.length > MAX_FILES) throw new Error("Archive trop complexe : maximum 60 fichiers exploitables.");
    }
    if (!files.some((file) => /\\.(glb|gltf|fbx|obj|stl|blend|usd|usdz)$/i.test(file.path))) {
      throw new Error("Aucun modèle 3D reconnu dans cette archive. Les packs uniquement audio/VFX/2D ne sont pas encore importables par cette première version.");
    }
    if (!files.length) throw new Error("Aucun fichier de ressource autorisé dans cette archive.");

    const manifest = [
      "# " + packName, "", "- Source: " + sourceUrl.toString(),
      "- Importé le: " + new Date().toISOString(),
      "- Demandeur authentifié: " + user.id,
      "- Licence déclarée: " + licenseName,
      "- Licence officielle: " + licenseUrl,
      "- Preuve fournie: " + licenseEvidence,
      "", "Vérifier les conditions de la licence et les fichiers d'origine avant toute publication du jeu.",
      "Les fichiers sources ne doivent pas être revendus ou redistribués séparément si leur licence l'interdit.",
      "", "## Fichiers importés", ...files.map((file) => "- " + file.path),
    ].join("\n");
    const branchName = "debs-ai/assets-" + slug + "-" + crypto.randomUUID().slice(0, 8);
    const api = "https://api.github.com/repos/" + repository;
    const ref = await githubCall(api, token, "/git/ref/heads/" + encodeURIComponent(baseBranch));
    const baseSha = String(ref.object.sha);
    const base = await githubCall(api, token, "/git/commits/" + baseSha);
    const treeEntries = [];
    for (const file of files) {
      const blob = await githubCall(api, token, "/git/blobs", { content: encodeBase64(file.bytes), encoding: "base64" });
      treeEntries.push({ path: "game-assets/" + slug + "/" + file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const manifestBlob = await githubCall(api, token, "/git/blobs", { content: manifest, encoding: "utf-8" });
    treeEntries.push({ path: "game-assets/" + slug + "/ASSET_MANIFEST.md", mode: "100644", type: "blob", sha: manifestBlob.sha });
    const tree = await githubCall(api, token, "/git/trees", { base_tree: base.tree.sha, tree: treeEntries });
    const commit = await githubCall(api, token, "/git/commits", { message: "DEBS AI: import asset pack " + slug, tree: tree.sha, parents: [baseSha] });
    await githubCall(api, token, "/git/refs", { ref: "refs/heads/" + branchName, sha: commit.sha });
    const pr = await githubCall(api, token, "/pulls", {
      title: "[DEBS AI] Import asset pack: " + packName.slice(0, 70), head: branchName, base: baseBranch, draft: true,
      body: "Import d'archive demandé par un utilisateur authentifié.\n\nSource: " + sourceUrl + "\nLicence déclarée: " + licenseName + " (" + licenseUrl + ")\n\n" + files.length + " fichiers, " + total + " octets extraits.\n\nVérifier la licence, les formats et l'intégration dans le moteur avant fusion.",
    });
    return json({ ok: true, imported: files.length, bytes: total, branch: branchName, pull_request: pr.html_url, manifest: "game-assets/" + slug + "/ASSET_MANIFEST.md", formats: [...new Set(files.map((file) => file.path.split(".").pop()?.toLowerCase()).filter(Boolean))] });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Import interrompu." }, 400);
  }
});
