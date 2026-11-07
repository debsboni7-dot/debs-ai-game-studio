export type ProposedFile = { path: string; content: string };

export async function createMissionPullRequest(
  files: ProposedFile[],
  title: string,
  summary: string,
) {
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  const repository = Deno.env.get("GITHUB_REPOSITORY")?.trim();
  const baseBranch = Deno.env.get("GITHUB_BASE_BRANCH")?.trim() || "main";
  if (!token || !repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GitHub non configuré côté serveur.");
  }
  if (!files.length || files.length > 12) throw new Error("Nombre de fichiers invalide.");
  const seen = new Set<string>();
  for (const file of files) {
    const path = file.path;
    if (!path || path.length > 220 || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      /(^|\/)(\.env|secrets?)(\/|$)/i.test(path) ||
      /(^|\/)id_rsa(\.pub)?$/i.test(path)) throw new Error("Chemin refusé : " + path);
    if (file.content.length > 80000) throw new Error("Fichier trop volumineux : " + path);
    if (seen.has(path)) throw new Error("Chemin dupliqué : " + path);
    seen.add(path);
  }
  const api = "https://api.github.com/repos/" + repository;
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const call = async (route: string, body?: unknown) => {
    const response = await fetch(api + route, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("GitHub " + response.status + ": " + String(data.message ?? "requête refusée").slice(0, 200));
    return data;
  };
  const ref = await call("/git/ref/heads/" + encodeURIComponent(baseBranch));
  const baseSha = ref.object.sha as string;
  const base = await call("/git/commits/" + baseSha);
  const entries = [];
  for (const file of files) {
    const blob = await call("/git/blobs", { content: file.content, encoding: "utf-8" });
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await call("/git/trees", { base_tree: base.tree.sha, tree: entries });
  const commit = await call("/git/commits", {
    message: "DEBS AI: " + title.slice(0, 90),
    tree: tree.sha,
    parents: [baseSha],
  });
  const branch = "debs-ai/mission-" + crypto.randomUUID().slice(0, 12);
  await call("/git/refs", { ref: "refs/heads/" + branch, sha: commit.sha });
  const pr = await call("/pulls", {
    title: "[DEBS AI] " + title.slice(0, 90),
    head: branch,
    base: baseBranch,
    draft: true,
    body: "Proposition générée par DEBS AI.\n\n" + summary.slice(0, 3000) +
      "\n\nFichiers :\n" + files.map((file) => "- " + file.path).join("\n") +
      "\n\nÀ examiner et tester avant fusion.",
  });
  return { repository, branch, url: pr.html_url, number: pr.number, files: files.map((file) => file.path) };
}
