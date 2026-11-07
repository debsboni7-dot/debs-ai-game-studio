import { createServerFn } from "@tanstack/react-start";

type GitHubRepoApi = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  permissions?: { push?: boolean };
};
type GitHubFileApi = { type: string; encoding: string; content: string; size: number };

async function githubRequest<T>(token: string, path: string): Promise<T> {
  const response = await fetch("https://api.github.com" + path, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "DEBS-AI-Studio",
    },
  });
  if (response.status === 401) throw new Error("Jeton GitHub refusé. Vérifie qu'il est encore valide.");
  if (response.status === 403) throw new Error("GitHub a limité ou refusé cette requête. Vérifie les autorisations du jeton.");
  if (response.status === 404) throw new Error("Dépôt ou fichier introuvable, ou accès non autorisé.");
  if (!response.ok) throw new Error("GitHub n'a pas pu traiter la requête (HTTP " + response.status + ").");
  return response.json() as Promise<T>;
}

function readToken(input: unknown) {
  const token = (input as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || token.length < 30 || token.length > 300 ||
    !/^(github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)$/.test(token)) {
    throw new Error("Jeton invalide. Utilise un jeton GitHub finement limité (github_pat_…).");
  }
  return token;
}
function readRepoName(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error("Nom de dépôt invalide.");
  }
  return value;
}
function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function isSafeTextPath(path: string) {
  const lower = path.toLowerCase();
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";
  if (!path || path.length > 240 || path.startsWith("/") || segments.some((part) => part === "." || part === "..")) return false;
  if (name.startsWith(".env") || /secret|credential|private.?key|\.pem$|\.p12$|\.keystore$/.test(lower)) return false;
  return /\.(md|mdx|txt|json|ya?ml|toml|xml|ini|ts|tsx|js|jsx|mjs|cjs|css|scss|html|htm|cs|asmdef|unity|prefab|asset|meta|shader|hlsl|compute|cginc|cpp|c|h|hpp|gd|tscn|tres|py|rs|go|java|kt|swift|php|rb|sql|sh|ps1)$/i.test(path);
}

export const connectGitHub = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ token: readToken(input) }))
  .handler(async ({ data }) => {
    const user = await githubRequest<{ login: string; avatar_url: string }>(data.token, "/user");
    const repos = await githubRequest<GitHubRepoApi[]>(data.token, "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member");
    return {
      user: { login: user.login, avatarUrl: user.avatar_url ?? "" },
      repositories: repos.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
        canPush: Boolean(repo.permissions?.push),
      })),
    };
  });

export const listGitHubRepositoryFiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = input as { token?: unknown; fullName?: unknown };
    return { token: readToken(value), fullName: readRepoName(value.fullName) };
  })
  .handler(async ({ data }) => {
    const repo = await githubRequest<GitHubRepoApi>(data.token, "/repos/" + data.fullName);
    const branch = repo.default_branch;
    const tree = await githubRequest<{ truncated: boolean; tree: { path: string; type: string; size?: number }[] }>(
      data.token,
      "/repos/" + data.fullName + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1",
    );
    const files = tree.tree
      .filter((item) => item.type === "blob" && isSafeTextPath(item.path) && (item.size ?? 0) <= 200_000)
      .slice(0, 100)
      .map((item) => ({ path: item.path, size: item.size ?? 0 }));
    return { branch, files, truncated: tree.truncated || tree.tree.length > 100 };
  });

export const readGitHubRepositoryFiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = input as { token?: unknown; fullName?: unknown; branch?: unknown; paths?: unknown };
    const token = readToken(value);
    const fullName = readRepoName(value.fullName);
    const branch = typeof value.branch === "string" && value.branch.length <= 200 ? value.branch : "";
    if (!branch || branch.startsWith("-")) throw new Error("Branche invalide.");
    if (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > 6 ||
      !value.paths.every((path) => typeof path === "string" && isSafeTextPath(path))) {
      throw new Error("Sélection de fichiers invalide (maximum 6 fichiers texte).");
    }
    return { token, fullName, branch, paths: value.paths as string[] };
  })
  .handler(async ({ data }) => {
    let total = 0;
    const files = [];
    for (const path of data.paths) {
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const file = await githubRequest<GitHubFileApi>(
        data.token,
        "/repos/" + data.fullName + "/contents/" + encodedPath + "?ref=" + encodeURIComponent(data.branch),
      );
      if (file.type !== "file" || file.encoding !== "base64" || file.size > 200_000) {
        throw new Error("Le fichier " + path + " n'est pas un fichier texte importable.");
      }
      const content = decodeBase64(file.content);
      total += content.length;
      if (total > 60_000) throw new Error("La sélection dépasse 60 000 caractères. Importe moins de fichiers.");
      files.push({ path, content });
    }
    return { files };
  });
