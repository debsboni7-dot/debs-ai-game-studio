import { createUnifiedDiff, summarizeReviewFiles } from "./review-diff.ts";

Deno.test("unified diff marks additions, removals and unchanged lines", () => {
  const diff = createUnifiedDiff("src/example.ts", "const a = 1;\nconst b = 2;", "const a = 1;\nconst b = 3;");
  if (!diff.includes("--- a/src/example.ts") || !diff.includes(" const a = 1;") ||
      !diff.includes("-const b = 2;") || !diff.includes("+const b = 3;")) {
    throw new Error("diff preview does not show the expected changes: " + diff);
  }
});

Deno.test("new files are represented as additions", () => {
  const diff = createUnifiedDiff("src/new.ts", "", "export const ready = true;");
  if (!diff.includes("+export const ready = true;")) throw new Error("new file addition is missing");
});

Deno.test("large diffs are bounded and marked as truncated", () => {
  const original = Array.from({ length: 220 }, (_, i) => "old " + i).join("\n");
  const proposed = Array.from({ length: 220 }, (_, i) => "new " + i).join("\n");
  const diff = createUnifiedDiff("large.ts", original, proposed, 40);
  if (!diff.includes("aperçu limité") || diff.length > 20_000) throw new Error("large diff was not bounded");
});

Deno.test("review summaries expose file paths, line counts and byte sizes", () => {
  const summary = summarizeReviewFiles([{ path: "a.ts", content: "one\ntwo" }]);
  if (summary[0]?.path !== "a.ts" || summary[0]?.lines !== 2 || summary[0]?.bytes !== 7) {
    throw new Error("review file summary is incorrect");
  }
});
