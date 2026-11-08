import { describe, expect, it } from "vitest";
import { assetSlug, isAllowedAssetFile, safeAssetPath, validateAssetSourceUrl } from "../../supabase/functions/_shared/asset-security";
import { extractPublicDownloadLinks } from "../../supabase/functions/_shared/asset-catalog";

const publicDns = async (_host: string, recordType: "A" | "AAAA") =>
  recordType === "A" ? ["93.184.216.34"] : ["2606:2800:220:1:248:1893:25c8:1946"];

describe("asset source security", () => {
  it("accepts HTTPS downloads from any publicly hosted asset publisher", async () => {
    expect((await validateAssetSourceUrl("https://kenney.nl/assets/nature-kit.zip", publicDns)).hostname).toBe("kenney.nl");
    expect((await validateAssetSourceUrl("https://cdn.quaternius.com/download/pack.zip", publicDns)).hostname).toBe("cdn.quaternius.com");
    expect((await validateAssetSourceUrl("https://new-asset-market.example/download.zip", publicDns)).hostname).toBe("new-asset-market.example");
  });
  it.each([
    "http://kenney.nl/a.zip",
    "https://user:pass@kenney.nl/a.zip",
    "https://kenney.nl:8443/a.zip",
    "https://localhost/a.zip",
    "https://127.0.0.1/a.zip",
  ])("rejects unsafe source %s", async (url) => {
    await expect(validateAssetSourceUrl(url, publicDns)).rejects.toThrow();
  });
  it("rejects domains resolving to private networks", async () => {
    await expect(validateAssetSourceUrl("https://attacker.example/a.zip", async () => ["10.0.0.7"])).rejects.toThrow();
  });
  it("blocks zip-slip and hidden paths", () => {
    expect(safeAssetPath("../secret.txt")).toBeNull();
    expect(safeAssetPath("/absolute.glb")).toBeNull();
    expect(safeAssetPath("models/../secret.glb")).toBeNull();
    expect(safeAssetPath("models/knight.glb")).toBe("models/knight.glb");
  });
  it("allows game asset formats but not executables or archives", () => {
    expect(isAllowedAssetFile("models/knight.glb")).toBe(true);
    expect(isAllowedAssetFile("textures/atlas.png")).toBe(true);
    expect(isAllowedAssetFile("effects/fire.wav")).toBe(true);
    expect(isAllowedAssetFile("payload.exe")).toBe(false);
    expect(isAllowedAssetFile("nested/pack.zip")).toBe(false);
  });
  it("creates stable safe slugs", () => {
    expect(assetSlug("Medieval Props Pack")).toBe("medieval-props-pack");
    expect(() => assetSlug("!!!")).toThrow();
  });
});

describe("public catalog download discovery", () => {
  it("finds ZIP download links on an arbitrary catalog page", () => {
    const page = new URL("https://assets.example/catalog/medieval-pack");
    const html = `
      <a href="/details">Details</a>
      <a href="/files/medieval-pack.zip">Download pack</a>
      <a href="https://cdn.example/files/textures.zip?token=abc&amp;download=1">Textures</a>
      <a href="javascript:alert(1)">Download</a>
      <a href="http://insecure.example/pack.zip">Download insecure</a>
    `;
    const links = extractPublicDownloadLinks(html, page).map((url) => url.toString());
    expect(links).toContain("https://assets.example/files/medieval-pack.zip");
    expect(links).toContain("https://cdn.example/files/textures.zip?token=abc&download=1");
    expect(links.some((url) => url.startsWith("javascript:"))).toBe(false);
    expect(links.some((url) => url.startsWith("http:"))).toBe(false);
  });

  it("ranks direct ZIP files ahead of generic download pages and removes duplicates", () => {
    const page = new URL("https://catalog.example/assets");
    const html = `
      <a href="/download?id=42">Download</a>
      <a href="/packs/complete.zip">Complete asset pack</a>
      <a href="/packs/complete.zip">Download duplicate</a>
    `;
    const links = extractPublicDownloadLinks(html, page);
    expect(links[0]?.pathname).toBe("/packs/complete.zip");
    expect(links).toHaveLength(2);
  });

  it("resolves relative links and caps candidate discovery", () => {
    const page = new URL("https://catalog.example/assets");
    const anchors = Array.from({ length: 12 }, (_, i) => `<a href="/download/${i}">Download ${i}</a>`).join("");
    expect(extractPublicDownloadLinks(anchors, page)).toHaveLength(8);
  });
});
