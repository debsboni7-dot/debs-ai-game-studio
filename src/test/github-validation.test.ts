import { describe, expect, it } from "vitest";
import { validateProposedFiles } from "../../supabase/functions/_shared/github-validation";

describe("validateProposedFiles", () => {
  it("accepts a small set of ordinary source files", () => {
    expect(validateProposedFiles([
      { path: "src/App.tsx", content: "export default function App() { return null; }" },
      { path: "README.md", content: "# Project" },
    ])).toHaveLength(2);
  });

  it.each([
    "../outside.ts",
    "/absolute.ts",
    "src\\\\escape.ts",
    ".env",
    "config/.env.production",
    "secrets/token.txt",
    "src/private/key.txt",
    "id_rsa",
    ".github/workflows/ci.yml",
  ])("rejects unsafe path %s", (path) => {
    expect(() => validateProposedFiles([{ path, content: "safe" }])).toThrow();
  });

  it("rejects duplicate paths", () => {
    expect(() => validateProposedFiles([
      { path: "src/a.ts", content: "one" },
      { path: "src/a.ts", content: "two" },
    ])).toThrow(/dupliqué/);
  });

  it("rejects more than twelve files", () => {
    const files = Array.from({ length: 13 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      content: "x",
    }));
    expect(() => validateProposedFiles(files)).toThrow(/Nombre de fichiers/);
  });

  it("enforces per-file and total UTF-8 byte limits", () => {
    expect(() => validateProposedFiles([{ path: "large.ts", content: "x".repeat(80_001) }])).toThrow(/volumineux/);
    expect(() => validateProposedFiles([
      { path: "a.ts", content: "é".repeat(80_000) },
      { path: "b.ts", content: "é".repeat(80_000) },
    ])).toThrow(/300 Ko/);
  });

  it("rejects common private-key and token patterns", () => {
    expect(() => validateProposedFiles([
      { path: "config.ts", content: "const key = 'github_pat_abcdefghijklmnopqrstuvwxyz123456';" },
    ])).toThrow(/secret|clé privée/);
  });
});
