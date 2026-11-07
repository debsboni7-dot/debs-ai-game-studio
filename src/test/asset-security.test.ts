import { describe, expect, it } from "vitest";
import { assetSlug, isAllowedAssetFile, safeAssetPath, validateAssetSourceUrl } from "../../supabase/functions/_shared/asset-security";

describe("asset source security", () => {
  it("accepts HTTPS downloads from known asset publishers", () => {
    expect(validateAssetSourceUrl("https://kenney.nl/assets/nature-kit.zip").hostname).toBe("kenney.nl");
    expect(validateAssetSourceUrl("https://cdn.quaternius.com/download/pack.zip").hostname).toBe("cdn.quaternius.com");
  });
  it.each(["http://kenney.nl/a.zip", "https://evil.example/kenney.zip", "https://kenney.nl.evil.example/a.zip", "https://user:pass@kenney.nl/a.zip", "https://github.com/owner/repo/archive/main.zip"])("rejects unsafe source %s", (url) => {
    expect(() => validateAssetSourceUrl(url)).toThrow();
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
