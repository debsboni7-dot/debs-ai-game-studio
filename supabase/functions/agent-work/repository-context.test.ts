import { resolveRelativeRepositoryImports, selectRelevantRepositoryFiles } from "./repository-context.ts";

Deno.test("repository context ranks files matching the mission goal", () => {
  const ranked = selectRelevantRepositoryFiles([
    { path: "src/lib/auth/session.ts", size: 2000 },
    { path: "src/game/combat/damage.ts", size: 3000 },
    { path: "README.md", size: 1000 },
    { path: "src/game/world/map.ts", size: 3000 },
  ], "Corriger le calcul des dégâts de combat");
  if (ranked[0]?.path !== "src/game/combat/damage.ts") {
    throw new Error("the goal-relevant file was not ranked first");
  }
});

Deno.test("CI annotation paths always outrank ordinary relevance", () => {
  const ranked = selectRelevantRepositoryFiles([
    { path: "src/app.ts", size: 1000 },
    { path: "supabase/functions/agent-work/index.ts", size: 1000 },
  ], "Modifier la page d'accueil", ["supabase/functions/agent-work/index.ts"]);
  if (ranked[0]?.path !== "supabase/functions/agent-work/index.ts") {
    throw new Error("annotated CI path did not receive priority");
  }
});

Deno.test("important project manifests remain in the context shortlist", () => {
  const ranked = selectRelevantRepositoryFiles([
    { path: "package.json", size: 1000 },
    { path: "src/features/editor.ts", size: 1000 },
    { path: "docs/guide.md", size: 1000 },
  ], "Ajouter un éditeur");
  if (!ranked.some((item) => item.path === "package.json")) {
    throw new Error("package manifest was omitted");
  }
});

Deno.test("ranking is deterministic and respects maximum file count", () => {
  const paths = Array.from({ length: 30 }, (_, index) => ({ path: "src/module/file-" + index + ".ts", size: 100 }));
  const first = selectRelevantRepositoryFiles(paths, "refactor module", [], 6);
  const second = selectRelevantRepositoryFiles(paths, "refactor module", [], 6);
  if (first.length !== 6 || first.map((x) => x.path).join("|") !== second.map((x) => x.path).join("|")) {
    throw new Error("ranking must be deterministic and bounded");
  }
});

Deno.test("relative imports resolve to real repository files", () => {
  const paths = ["src/features/editor.ts", "src/lib/store.ts", "src/lib/types/index.ts", "src/app.ts"];
  const resolved = resolveRelativeRepositoryImports(
    "src/features/editor.ts",
    'import { store } from "../lib/store";\\nexport type { State } from "../lib/types";\\nimport React from "react";',
    paths,
  );
  if (resolved.join("|") !== "src/lib/store.ts|src/lib/types/index.ts") {
    throw new Error("relative dependencies were not resolved correctly: " + resolved.join(", "));
  }
});

Deno.test("relative import resolution rejects unknown and external modules", () => {
  const resolved = resolveRelativeRepositoryImports(
    "src/app.ts",
    'import React from "react"; import "./missing"; import "../outside";',
    ["src/app.ts", "src/known.ts"],
  );
  if (resolved.length !== 0) throw new Error("unknown or external modules were included");
});

Deno.test("dependency resolution stays bounded and deterministic", () => {
  const paths = Array.from({ length: 10 }, (_, i) => "src/lib/file" + i + ".ts");
  const source = paths.map((path) => 'import "../lib/' + path.split("/").pop()?.replace(".ts", "") + '";').join("\n");
  const first = resolveRelativeRepositoryImports("src/app.ts", source, paths, 2);
  const second = resolveRelativeRepositoryImports("src/app.ts", source, paths, 2);
  if (first.length !== 2 || first.join("|") !== second.join("|")) throw new Error("dependency expansion is not bounded and deterministic");
});
