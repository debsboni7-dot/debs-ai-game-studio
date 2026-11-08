export type ReviewFile = { path: string; content: string };

export function createUnifiedDiff(path: string, original: string, proposed: string, maxLines = 180): string {
  const oldLines = original.replace(/\r\n/g, "\n").split("\n");
  const newLines = proposed.replace(/\r\n/g, "\n").split("\n");
  const oldCount = Math.min(oldLines.length, maxLines);
  const newCount = Math.min(newLines.length, maxLines);
  const oldSlice = oldLines.slice(0, oldCount);
  const newSlice = newLines.slice(0, newCount);
  const truncated = oldLines.length > maxLines || newLines.length > maxLines;
  const width = newSlice.length + 1;
  const cells = (oldSlice.length + 1) * width;
  const lcs = new Uint16Array(cells);
  for (let i = oldSlice.length - 1; i >= 0; i--) {
    for (let j = newSlice.length - 1; j >= 0; j--) {
      lcs[i * width + j] = oldSlice[i] === newSlice[j]
        ? 1 + lcs[(i + 1) * width + j + 1]
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const changes: string[] = [];
  let i = 0, j = 0;
  while (i < oldSlice.length && j < newSlice.length) {
    if (oldSlice[i] === newSlice[j]) {
      changes.push(" " + oldSlice[i]); i++; j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      changes.push("-" + oldSlice[i++]);
    } else {
      changes.push("+" + newSlice[j++]);
    }
  }
  while (i < oldSlice.length) changes.push("-" + oldSlice[i++]);
  while (j < newSlice.length) changes.push("+" + newSlice[j++]);
  const header = [
    "--- a/" + path,
    "+++ b/" + path,
    "@@ -1," + oldCount + " +1," + newCount + " @@",
  ];
  const body = changes.slice(0, 240);
  if (changes.length > 240) body.push("... aperçu tronqué ...");
  if (truncated) body.push("... aperçu limité à " + maxLines + " lignes par version ...");
  return [...header, ...body].join("\n");
}

export function summarizeReviewFiles(files: ReviewFile[]) {
  return files.map((file) => ({
    path: file.path,
    lines: file.content.split(/\r?\n/).length,
    bytes: new TextEncoder().encode(file.content).byteLength,
  }));
}
