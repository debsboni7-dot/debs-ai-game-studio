const ALLOWED_HOSTS = [
  "kenney.nl", "quaternius.com", "itch.io", "itch.zone",
  "polyhaven.com", "ambientcg.com", "catenarius.com", "cartenarius.com",
  "github.com", "githubusercontent.com",
];

export function validateAssetSourceUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("URL de ressource invalide."); }
  if (url.protocol !== "https:") throw new Error("Seules les URL HTTPS sont autorisées.");
  if (url.username || url.password || url.port) throw new Error("URL avec identifiants ou port personnalisé refusée.");
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith("." + domain))) {
    throw new Error("Source non autorisée. Utilise Kenney, Quaternius, Poly Haven, ambientCG, itch.io ou une source approuvée.");
  }
  if (host === "github.com" && !url.pathname.includes("/releases/download/")) {
    throw new Error("Pour GitHub, seuls les fichiers de releases sont acceptés.");
  }
  return url;
}

export function safeAssetPath(name: string): string | null {
  const normalized = name.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  if (parts.some((part) => part.length > 100 || /[<>:"|?*\x00-\x1f]/.test(part))) return null;
  return parts.join("/");
}

const ALLOWED_EXTENSIONS = new Set([
  "glb", "gltf", "fbx", "obj", "mtl", "stl", "usd", "usdz", "blend",
  "png", "jpg", "jpeg", "webp", "tga", "hdr", "exr",
  "wav", "ogg", "mp3", "flac", "mp4", "webm",
  "json", "txt", "md", "xml", "bin", "ktx", "ktx2", "glsl", "vert", "frag", "vsh", "fsh", "shader", "atlas", "ase", "aseprite",
]);

export function isAllowedAssetFile(path: string): boolean {
  const safe = safeAssetPath(path);
  if (!safe) return false;
  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

export function assetSlug(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  if (slug.length < 2) throw new Error("Nom de pack invalide.");
  return slug;
}
