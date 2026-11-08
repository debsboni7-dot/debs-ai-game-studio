const STOP_WORDS = new Set([
  "avec", "dans", "pour", "plus", "moins", "faire", "faut", "cette", "cela",
  "from", "that", "this", "with", "have", "your", "into", "then", "when",
  "where", "which", "what", "should", "could", "would", "there", "their",
  "the", "and", "for", "are", "was", "were", "will", "can", "not", "all",
]);

function tokenize(value: string): string[] {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export type RepositoryPath = { path: string; size: number };
export type RankedRepositoryPath = RepositoryPath & { score: number };

export function selectRelevantRepositoryFiles(
  paths: RepositoryPath[],
  goal: string,
  annotations: string[] = [],
  maxFiles = 8,
): RankedRepositoryPath[] {
  const goalTokens = [...new Set(tokenize(goal))];
  const annotated = new Set(annotations);
  const ranked = paths.map((file) => {
    const normalizedPath = file.path.toLowerCase();
    const pathTokens = new Set(tokenize(file.path.replace(/[._/-]/g, " ")));
    let score = annotated.has(file.path) ? 1000 : 0;
    for (const token of goalTokens) if (pathTokens.has(token)) score += 18;
    const base = file.path.split("/").pop()?.toLowerCase() ?? "";
    if (/^(readme|package\.json|tsconfig\.json|deno\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json|vite\.config\.[^/]+)$/.test(base)) score += 12;
    if (/^(src|app|lib|supabase|inference|training)\//.test(normalizedPath)) score += 4;
    if (/\.(tsx?|jsx?|py|rs|go|cs|cpp|h|sql)$/.test(base)) score += 3;
    if (/\.md$/.test(base)) score += 2;
    if (file.size > 18_000) score -= 3;
    return { ...file, score };
  });
  return ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, Math.max(1, Math.min(12, maxFiles)));
}
