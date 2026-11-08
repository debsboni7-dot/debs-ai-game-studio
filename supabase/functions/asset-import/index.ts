import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { assetSlug, isAllowedAssetFile, validateAssetSourceUrl } from "../_shared/asset-security.ts";
import { extractPublicDownloadLinks } from "../_shared/asset-catalog.ts";

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

function inspectZipLimits(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Archive ZIP invalide : répertoire central absent.");
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("Les archives ZIP64 ne sont pas prises en charge par cette version.");
  }
  if (entries > 200 || centralOffset + centralSize > eocd) throw new Error("Archive trop complexe ou répertoire ZIP invalide.");
  let cursor = centralOffset;
  let totalExpanded = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Entrée ZIP mal formée.");
    const expanded = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if (expanded === 0xffffffff) throw new Error("Les fichiers ZIP64 ne sont pas pris en charge.");
    if (expanded > 5 * 1024 * 1024) throw new Error("Un fichier extrait dépasse 5 Mo.");
    totalExpanded += expanded;
    if (totalExpanded > MAX_EXTRACTED) throw new Error("Archive compressée suspecte : extraction supérieure à 18 Mo.");
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor > centralOffset + centralSize) throw new Error("Répertoire central ZIP invalide.");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

type DownloadedAssetArchive = { bytes: Uint8Array; downloadUrl: URL };


async function fetchFollowingRedirects(start: URL): Promise<{ response: Response; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= 4; hop++) {
    await validateAssetSourceUrl(url.toString());
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "DEBS-AI-AssetImporter/1.0",
        Accept: "application/zip,application/octet-stream,text/html;q=0.9,*/*;q=0.8",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop === 4) throw new Error("Redirection de téléchargement invalide ou trop longue.");
      url = new URL(location, url);
      continue;
    }
    return { response, finalUrl: url };
  }
  throw new Error("Téléchargement impossible.");
}

async function downloadZip(start: URL): Promise<DownloadedAssetArchive> {
  const visited = new Set<string>();
  const tryUrl = async (url: URL, depth: number): Promise<DownloadedAssetArchive> => {
    if (visited.has(url.toString())) throw new Error("Lien de téléchargement déjà exploré.");
    visited.add(url.toString());
    const { response, finalUrl } = await fetchFollowingRedirects(url);
    if (!response.ok) throw new Error("La source a refusé la requête (HTTP " + response.status + ").");
    const length = Number(response.headers.get("content-length") ?? 0);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (length > MAX_ARCHIVE) throw new Error("Fichier trop volumineux (maximum 12 Mo).");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_ARCHIVE) throw new Error("Fichier trop volumineux (maximum 12 Mo).");
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { bytes, downloadUrl: finalUrl };
    const looksLikeHtml = contentType.includes("text/html") || contentType.includes("application/xhtml") || /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(new TextDecoder().decode(bytes.subarray(0, 512)));
    if (depth >= 2 || !looksLikeHtml) {
    }
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Page de catalogue trop volumineuse (maximum 2 Mo).");
    const html = new TextDecoder().decode(bytes);
    const links = extractPublicDownloadLinks(html, finalUrl).filter((candidate) => !visited.has(candidate.toString()));
    if (!links.length) throw new Error("Aucun lien de téléchargement public exploitable n'a été trouvé sur cette page.");
    let lastError = "Aucune archive ZIP accessible n'a été trouvée dans les liens de téléchargement.";
    for (const candidate of links) {
      try { return await tryUrl(candidate, depth + 1); }
      catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (/trop volumineux|réseau privé|DNS|redirection invalide/i.test(lastError)) throw error;
      }
    }
    throw new Error(lastError);
  };
  return tryUrl(start, 0);
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
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
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
  try { sourceUrl = await validateAssetSourceUrl(source); } catch (error) { return json({ error: error instanceof Error ? error.message : "Source refusée." }, 400); }
  const token = env("ai-game") || env("GITHUB_TOKEN");
  const repository = env("GITHUB_REPOSITORY") || "debsboni7-dot/debs-ai-game-studio";
  const baseBranch = env("GITHUB_BASE_BRANCH") || "main";
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return json({ error: "GitHub n'est pas configuré côté serveur." }, 503);

  try {
    const archive = await downloadZip(sourceUrl);
    inspectZipLimits(archive.bytes);
    const entries = unzipSync(archive.bytes);
    const slug = assetSlug(packName);
    const files: Array<{ path: string; bytes: Uint8Array }> = [];
    let total = 0;
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith("/")) continue;
      const path = name.replace(/^\.\//, "");
      if (!isAllowedAssetFile(path)) continue;
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Un fichier dépasse la limite de 5 Mo : " + path.slice(0, 100));
      total += bytes.length;
      if (total > MAX_EXTRACTED) throw new Error("Contenu extrait supérieur à 18 Mo.");
      files.push({ path, bytes });
      if (files.length > MAX_FILES) throw new Error("Archive trop complexe : maximum 60 fichiers exploitables.");
    }
    if (!files.length) throw new Error("Aucun fichier de ressource autorisé dans cette archive.");

    const manifest = [
      "# " + packName, "", "- Page source: " + sourceUrl.toString(),
      "- Download URL: " + archive.downloadUrl.toString(),
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
      const blob = await githubCall(api, token, "/git/blobs", { content: bytesToBase64(file.bytes), encoding: "base64" });
      treeEntries.push({ path: "game-assets/" + slug + "/" + file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const manifestBlob = await githubCall(api, token, "/git/blobs", { content: manifest, encoding: "utf-8" });
    treeEntries.push({ path: "game-assets/" + slug + "/ASSET_MANIFEST.md", mode: "100644", type: "blob", sha: manifestBlob.sha });
    const tree = await githubCall(api, token, "/git/trees", { base_tree: base.tree.sha, tree: treeEntries });
    const commit = await githubCall(api, token, "/git/commits", { message: "DEBS AI: import asset pack " + slug, tree: tree.sha, parents: [baseSha] });
    await githubCall(api, token, "/git/refs", { ref: "refs/heads/" + branchName, sha: commit.sha });
    const pr = await githubCall(api, token, "/pulls", {
      title: "[DEBS AI] Import asset pack: " + packName.slice(0, 70), head: branchName, base: baseBranch, draft: true,
      body: "Import d'archive demandé par un utilisateur authentifié.\n\nPage source: " + sourceUrl + "\nFichier téléchargé: " + archive.downloadUrl + "\nLicence déclarée: " + licenseName + " (" + licenseUrl + ")\n\n" + files.length + " fichiers, " + total + " octets extraits.\n\nVérifier la licence, les formats et l'intégration dans le moteur avant fusion.",
    });
    return json({ ok: true, imported: files.length, bytes: total, branch: branchName, pull_request: pr.html_url, manifest: "game-assets/" + slug + "/ASSET_MANIFEST.md", download_url: archive.downloadUrl.toString(), formats: [...new Set(files.map((file) => file.path.split(".").pop()?.toLowerCase()).filter(Boolean))] });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Import interrompu." }, 400);
  }
});
