export type ProposedFile = { path: string; content: string };
export type CheckSummary = {
  state: "pending" | "success" | "failure" | "unknown";
  head_sha: string;
  checks: Array<{ name: string; status: string; conclusion: string | null; details_url: string | null; output_title: string | null; output_summary: string | null }>;
  failed_checks: string[];
};

export async function inspectPullRequestChecks(
  headSha: string,
  waitSeconds = 0,
): Promise<CheckSummary> {
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  const repository = Deno.env.get("GITHUB_REPOSITORY")?.trim();
  if (!token || !repository) throw new Error("GitHub non configuré pour lire les vérifications.");
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const deadline = Date.now() + Math.min(Math.max(waitSeconds, 0), 30) * 1000;
  let checks: CheckSummary["checks"] = [];
  let state: CheckSummary["state"] = "unknown";
  do {
    const response = await fetch("https://api.github.com/repos/" + repository + "/commits/" + encodeURIComponent(headSha) + "/check-runs?per_page=100", { headers });
    if (!response.ok) throw new Error("Lecture des vérifications GitHub impossible (HTTP " + response.status + ").");
    const data = await response.json();
    checks = (data.check_runs ?? []).map((item: { name?: string; status?: string; conclusion?: string | null; html_url?: string; output?: { title?: string | null; summary?: string | null } }) => ({
      name: String(item.name ?? "Vérification"),
      status: String(item.status ?? "unknown"),
      conclusion: item.conclusion ?? null,
      details_url: item.html_url ?? null,
      output_title: item.output?.title?.slice(0, 300) ?? null,
      output_summary: item.output?.summary?.slice(0, 3000) ?? null,
    }));
    if (!checks.length) state = "pending";
    else if (checks.some((item) => item.status !== "completed")) state = "pending";
    else if (checks.some((item) => item.conclusion !== "success" && item.conclusion !== "skipped" && item.conclusion !== "neutral")) state = "failure";
    else state = "success";
    if (state !== "pending" || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (Date.now() < deadline);
  return {
    state,
    head_sha: headSha,
    checks,
    failed_checks: checks.filter((item) => item.status === "completed" && item.conclusion !== "success" && item.conclusion !== "skipped" && item.conclusion !== "neutral").map((item) => item.name),
  };
}



export async function readCheckAnnotations(headSha: string) {
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  const repository = Deno.env.get("GITHUB_REPOSITORY")?.trim();
  if (!token || !repository) throw new Error("GitHub non configuré.");
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const response = await fetch("https://api.github.com/repos/" + repository + "/commits/" + encodeURIComponent(headSha) + "/check-runs?per_page=100", { headers });
  if (!response.ok) throw new Error("Lecture des vérifications impossible (HTTP " + response.status + ").");
  const data = await response.json();
  const failed = (data.check_runs ?? []).filter((run: {status?:string;conclusion?:string}) => run.status === "completed" && run.conclusion !== "success" && run.conclusion !== "skipped" && run.conclusion !== "neutral");
  const annotations = [];
  for (const run of failed.slice(0, 10)) {
    const r = await fetch("https://api.github.com/repos/" + repository + "/check-runs/" + run.id + "/annotations?per_page=50", { headers });
    if (!r.ok) continue;
    const items = await r.json().catch(() => []);
    for (const a of (Array.isArray(items) ? items : []).slice(0, 50)) annotations.push({
      check: String(run.name ?? "CI"),
      path: String(a.path ?? ""),
      line: a.start_line ?? null,
      level: String(a.annotation_level ?? "warning"),
      message: String(a.message ?? "").slice(0, 1000),
    });
  }
  return annotations.slice(0, 100);
}

export async function updateMissionPullRequestBranch(branch: string, files: ProposedFile[], title: string) {
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  const repository = Deno.env.get("GITHUB_REPOSITORY")?.trim();
  if (!token || !repository || !/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("GitHub non configuré côté serveur.");
  if (!/^debs-ai\\/mission-[a-f0-9-]{6,40}$/.test(branch)) throw new Error("Branche de réparation non autorisée.");
  if (!files.length || files.length > 12) throw new Error("Nombre de fichiers invalide.");
  const seen = new Set<string>(); let totalBytes = 0;
  for (const file of files) {
    const path = file.path;
    if (!path || path.length > 220 || path.startsWith("/") || path.includes("\\\\") || path.split("/").some((part) => !part || part === "." || part === "..") ||
      /(^|\\/)(\\.env[^/]*|secrets?|credentials|private)(\\/|$)/i.test(path) || /(^|\\/)id_rsa(\\.pub)?$/i.test(path) || /^\\.github\\/workflows\\//i.test(path)) throw new Error("Chemin refusé : " + path);
    if (file.content.length > 80000) throw new Error("Fichier trop volumineux : " + path);
    totalBytes += new TextEncoder().encode(file.content).byteLength;
    if (totalBytes > 300000) throw new Error("Proposition trop volumineuse : limite totale de 300 Ko.");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}/i.test(file.content)) throw new Error("Contenu refusé : secret ou clé privée détecté.");
    if (seen.has(path)) throw new Error("Chemin dupliqué : " + path); seen.add(path);
  }
  const api = "https://api.github.com/repos/" + repository;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const call = async (route: string, body?: unknown) => {
    const response = await fetch(api + route, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("GitHub " + response.status + ": " + String(data.message ?? "requête refusée").slice(0, 200));
    return data;
  };
  const ref = await call("/git/ref/heads/" + encodeURIComponent(branch));
  const parentSha = String(ref.object.sha);
  const parent = await call("/git/commits/" + parentSha);
  const entries = [];
  for (const file of files) {
    const blob = await call("/git/blobs", { content: file.content, encoding: "utf-8" });
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await call("/git/trees", { base_tree: parent.tree.sha, tree: entries });
  const commit = await call("/git/commits", { message: "DEBS AI: correction CI - " + title.slice(0, 70), tree: tree.sha, parents: [parentSha] });
  await call("/git/refs/heads/" + encodeURIComponent(branch), { sha: commit.sha, force: false });
  const checks = await inspectPullRequestChecks(String(commit.sha), 20);
  return { branch, head_sha: commit.sha, files: files.map((file) => file.path), checks };
}

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
  let totalBytes = 0;
  for (const file of files) {
    const path = file.path;
    if (!path || path.length > 220 || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      /(^|\/)(\.env[^/]*|secrets?)(\/|$)/i.test(path) ||
      /(^|\/)id_rsa(\.pub)?$/i.test(path) ||
      /^\.github\/workflows\//i.test(path) ||
      /(^|\/)(credentials|private)(\/|$)/i.test(path)) throw new Error("Chemin refusé : " + path);
    if (file.content.length > 80000) throw new Error("Fichier trop volumineux : " + path);
    totalBytes += new TextEncoder().encode(file.content).byteLength;
    if (totalBytes > 300000) throw new Error("Proposition trop volumineuse : limite totale de 300 Ko.");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}/i.test(file.content)) {
      throw new Error("Contenu refusé : un secret ou une clé privée semble présent.");
    }
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
  const checks = await inspectPullRequestChecks(String(commit.sha), 20);
  return { repository, branch, url: pr.html_url, number: pr.number, head_sha: commit.sha, files: files.map((file) => file.path), checks };
}
