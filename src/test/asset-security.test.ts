import { describe, expect, it } from "vitest";
import { assetSlug, isAllowedAssetFile, safeAssetPath, validateAssetSourceUrl } from "../../supabase/functions/_shared/asset-security";

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
