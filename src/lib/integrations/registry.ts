/**
 * Integrations / tools layer, separate from the language model.
 * Every action that writes or executes something must be explicitly approved
 * by the user (requiresConfirmation) and run server-side or in a future isolated sandbox.
 */
export type IntegrationStatus = "ready" | "connected" | "planned";

export interface ToolAction {
  id: string;
  label: string;
  kind: "read" | "write" | "execute";
  requiresConfirmation: boolean;
}

export interface Integration {
  id: string;
  name: string;
  category: "code" | "engine" | "3d" | "ai";
  status: IntegrationStatus;
  description: string;
  plannedAuth: string;
  actions: ToolAction[];
}

const w = (id: string, label: string, kind: ToolAction["kind"]): ToolAction => ({
  id,
  label,
  kind,
  requiresConfirmation: kind !== "read",
});

export const integrations: Integration[] = [
  {
    id: "github",
    name: "GitHub",
    category: "code",
    status: "ready",
    description: "Lire vos dépôts, proposer des branches et des pull requests.",
    plannedAuth: "OAuth GitHub, jeton stocké côté serveur uniquement",
    actions: [w("repo.read", "Lire un dépôt", "read"), w("pr.create", "Créer une pull request", "write")],
  },
  {
    id: "lovable-ai",
    name: "Modèles IA (passerelle Lovable)",
    category: "ai",
    status: "ready",
    description: "Brancher un modèle de code via une fonction serveur sécurisée.",
    plannedAuth: "Clé gérée côté serveur, jamais dans le navigateur",
    actions: [w("chat.complete", "Générer une réponse", "read")],
  },
  {
    id: "byo-model",
    name: "Autres fournisseurs IA",
    category: "ai",
    status: "planned",
    description: "Adaptateurs pour d'autres fournisseurs via la même interface.",
    plannedAuth: "Secrets serveur dédiés",
    actions: [w("chat.complete", "Générer une réponse", "read")],
  },
  {
    id: "godot",
    name: "Godot",
    category: "engine",
    status: "planned",
    description: "Générer scènes et scripts GDScript, lancer des builds en sandbox.",
    plannedAuth: "Agent local ou sandbox de build isolée",
    actions: [w("project.write", "Écrire des fichiers projet", "write"), w("build.run", "Lancer un build", "execute")],
  },
  {
    id: "unity",
    name: "Unity",
    category: "engine",
    status: "planned",
    description: "Scripts C#, prefabs et builds automatisés.",
    plannedAuth: "Licence Unity + sandbox de build",
    actions: [w("project.write", "Écrire des fichiers projet", "write"), w("build.run", "Lancer un build", "execute")],
  },
  {
    id: "unreal",
    name: "Unreal Engine",
    category: "engine",
    status: "planned",
    description: "Blueprints, C++ et packaging.",
    plannedAuth: "Agent local + sandbox de build",
    actions: [w("project.write", "Écrire des fichiers projet", "write"), w("build.run", "Lancer un build", "execute")],
  },
  {
    id: "blender",
    name: "Blender",
    category: "3d",
    status: "planned",
    description: "Préparer et exporter des assets 3D.",
    plannedAuth: "Agent local, scripts validés par l'utilisateur",
    actions: [w("asset.export", "Exporter un asset", "execute")],
  },
];
