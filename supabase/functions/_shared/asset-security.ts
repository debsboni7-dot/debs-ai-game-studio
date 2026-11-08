function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19));
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  return value !== "::" && value !== "::1" &&
    !value.startsWith("fc") && !value.startsWith("fd") &&
    !/^fe[89ab]/.test(value) && !value.startsWith("::ffff:") &&
    !value.startsWith("2001:db8:");
}

type DnsResolver = (hostname: string, recordType: "A" | "AAAA") => Promise<string[]>;

async function assertPublicHost(hostname: string, resolveDns: DnsResolver): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host === "metadata.google.internal" ||
      host === "metadata" || host.endsWith(".test") || host.endsWith(".invalid")) {
    throw new Error("Les domaines locaux ou réservés ne sont pas autorisés.");
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIpv4(host)) throw new Error("Les adresses IP privées ou réservées sont interdites.");
    throw new Error("Utilise le nom de domaine public du site, pas une adresse IP.");
  }
  if (host.includes(":")) throw new Error("Les adresses IPv6 littérales ne sont pas autorisées.");
  let addresses: string[] = [];
  try { addresses.push(...await resolveDns(host, "A")); } catch { /* no A record */ }
  try { addresses.push(...await resolveDns(host, "AAAA")); } catch { /* no AAAA record */ }
  if (!addresses.length) throw new Error("Le domaine ne possède pas d'adresse DNS publique vérifiable.");
  for (const address of addresses) {
    if (address.includes(":") ? !isPublicIpv6(address) : isPrivateIpv4(address)) {
      throw new Error("Le domaine pointe vers une adresse réseau privée ou réservée.");
    }
  }
}

export async function validateAssetSourceUrl(
  raw: string,
  resolveDns: DnsResolver = (hostname, recordType) => Deno.resolveDns(hostname, recordType),
): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("URL de ressource invalide."); }
  if (url.protocol !== "https:") throw new Error("Seules les URL HTTPS sont autorisées.");
  if (url.username || url.password || url.port) throw new Error("URL avec identifiants ou port personnalisé refusée.");
  await assertPublicHost(url.hostname, resolveDns);
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
  "glb", "gltf", "fbx", "obj", "mtl", "stl", "usd", "usdz", "blend", "ply", "dae", "3ds", "abc", "3mf",
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic", "heif", "tga", "tif", "tiff", "dds", "hdr", "exr", "svg", "psd", "ai", "eps", "xcf", "kra",
  "wav", "ogg", "mp3", "flac", "aac", "m4a", "aiff", "opus", "mp4", "webm", "mov", "mkv",
  "json", "txt", "md", "xml", "pdf", "bin", "ktx", "ktx2", "glsl", "vert", "frag", "vsh", "fsh", "shader", "atlas", "ase", "aseprite", "ttf", "otf", "woff", "woff2", "unity", "prefab", "asset", "mat", "controller", "anim", "meta", "uasset", "umap", "tscn", "tres", "gdshader", "hlsl", "compute", "shadergraph", "shadersubgraph", "vfx",
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
