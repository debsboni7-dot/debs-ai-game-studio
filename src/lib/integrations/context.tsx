import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type GitHubUser = { login: string; avatarUrl: string };
export type GitHubRepository = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  canPush: boolean;
};
type IntegrationContextValue = {
  githubToken: string | null;
  githubUser: GitHubUser | null;
  repositories: GitHubRepository[];
  selectedRepository: GitHubRepository | null;
  repositoryContext: string;
  contextFiles: string[];
  connectGitHub: (token: string, user: GitHubUser, repos: GitHubRepository[]) => void;
  disconnectGitHub: () => void;
  selectRepository: (repo: GitHubRepository | null) => void;
  setRepositoryContext: (content: string, files: string[]) => void;
  clearRepositoryContext: () => void;
};
const IntegrationContext = createContext<IntegrationContextValue | null>(null);

/** Connection credentials deliberately live only in React memory: no localStorage, cookies or chat history. */
export function IntegrationProvider({ children }: { children: ReactNode }) {
  const [githubToken, setGitHubToken] = useState<string | null>(null);
  const [githubUser, setGitHubUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<GitHubRepository | null>(null);
  const [repositoryContext, setRepositoryContextState] = useState("");
  const [contextFiles, setContextFiles] = useState<string[]>([]);

  const value = useMemo<IntegrationContextValue>(() => ({
    githubToken,
    githubUser,
    repositories,
    selectedRepository,
    repositoryContext,
    contextFiles,
    connectGitHub: (token, user, repos) => {
      setGitHubToken(token);
      setGitHubUser(user);
      setRepositories(repos);
      setSelectedRepository(repos[0] ?? null);
      setRepositoryContextState("");
      setContextFiles([]);
    },
    disconnectGitHub: () => {
      setGitHubToken(null);
      setGitHubUser(null);
      setRepositories([]);
      setSelectedRepository(null);
      setRepositoryContextState("");
      setContextFiles([]);
    },
    selectRepository: setSelectedRepository,
    setRepositoryContext: (content, paths) => {
      setRepositoryContextState(content);
      setContextFiles(paths);
    },
    clearRepositoryContext: () => {
      setRepositoryContextState("");
      setContextFiles([]);
    },
  }), [githubToken, githubUser, repositories, selectedRepository, repositoryContext, contextFiles]);

  return <IntegrationContext.Provider value={value}>{children}</IntegrationContext.Provider>;
}

export function useIntegrations() {
  const value = useContext(IntegrationContext);
  if (!value) throw new Error("useIntegrations doit être utilisé dans IntegrationProvider.");
  return value;
}
