import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isAllowedAssetFile, safeAssetPath, validateAssetSourceUrl } from "../_shared/asset-security.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = "chat-files";

function cleanFilename(value: string): string {
  const name = value.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!name || name.length > 120 || !safeAssetPath(name) || (!isAllowedAssetFile(name) && !name.toLowerCase().endsWith(".zip"))) {
    throw new Error("Nom ou format de fichier non pris en charge.");
  }
  return name;
}

async function fetchPublicFile(rawUrl: string): Promise<{ bytes: Uint8Array; filename: string; contentType: string; sourceUrl: string }> {
  let url = await validateAssetSourceUrl(rawUrl);
  for (let hop = 0; hop <= 4; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "DEBS-AI-ChatFiles/1.0", Accept: "*/*" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop === 4) throw new Error("Redirection invalide ou trop longue.");
      url = await validateAssetSourceUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error("Téléchargement refusé (HTTP " + response.status + ").");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BYTES) throw new Error("Fichier trop volumineux (maximum 15 Mo).");
    if (!response.body) throw new Error("Le serveur source n'a fourni aucun flux de fichier.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error("Fichier supérieur à 15 Mo.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!total) throw new Error("Fichier vide.");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const disposition = response.headers.get("content-disposition") ?? "";
    const match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i) ?? disposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    const fromHeader = match ? decodeURIComponent(match[1] ?? match[2] ?? "") : "";
    const fallback = url.pathname.split("/").pop() || "download.bin";
    const filename = cleanFilename(fromHeader || fallback);
    const contentType = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    return { bytes, filename, contentType, sourceUrl: url.toString() };
  }
  throw new Error("Téléchargement impossible.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const authHeader = request.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === authHeader) return json({ error: "Connexion requise." }, 401);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Stockage de fichiers non configuré sur le serveur." }, 503);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !user) return json({ error: "Session invalide." }, 401);

  try {
    const body = await request.json();
    const action = body.action === "download" ? "download" : body.action === "generate" ? "generate" : "";
    if (!action) return json({ error: "Action attendue : generate ou download." }, 400);

    let bytes: Uint8Array;
    let filename: string;
    let contentType = typeof body.content_type === "string" ? body.content_type.slice(0, 120) : "application/octet-stream";
    let sourceUrl: string | undefined;
    if (action === "download") {
      if (typeof body.source_url !== "string") return json({ error: "URL source manquante." }, 400);
      const downloaded = await fetchPublicFile(body.source_url);
      bytes = downloaded.bytes;
      filename = cleanFilename(typeof body.filename === "string" && body.filename.trim() ? body.filename : downloaded.filename);
      contentType = downloaded.contentType || contentType;
      sourceUrl = downloaded.sourceUrl;
    } else {
      filename = cleanFilename(String(body.filename ?? ""));
      if (typeof body.base64 === "string" && body.base64.length) {
        const raw = body.base64.replace(/^data:[^,]*;base64,/, "");
        if (raw.length > Math.ceil(MAX_BYTES * 4 / 3) + 8) return json({ error: "Fichier généré supérieur à 15 Mo." }, 413);
        const binary = atob(raw);
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      } else if (typeof body.content === "string") {
        bytes = new TextEncoder().encode(body.content);
      } else return json({ error: "Contenu du fichier manquant." }, 400);
      if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: "Fichier vide ou supérieur à 15 Mo." }, 413);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const objectPath = user.id + "/" + crypto.randomUUID() + "/" + filename;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType, upsert: false, cacheControl: "3600",
    });
    if (uploadError) throw new Error("Enregistrement du fichier impossible : " + uploadError.message.slice(0, 180));
    const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 7, { download: filename });
    if (signedError || !signed?.signedUrl) throw new Error("Lien de téléchargement impossible à créer.");
    return json({
      ok: true, action, filename, content_type: contentType, bytes: bytes.length,
      download_url: signed.signedUrl, expires_in_seconds: 604800,
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Création du fichier interrompue." }, 400);
  }
});
