export type Engine = "godot" | "unity" | "unreal" | "threejs";

export interface GameInput {
  name: string;
  engine: Engine;
  genre: string;
  platform: string;
}

export interface GameProject extends GameInput {
  id: string;
  createdAt: number;
  spec: string;
  structure: string[];
  checklist: { label: string; done: boolean }[];
  notes: string;
}

export const engineLabels: Record<Engine, string> = {
  godot: "Godot",
  unity: "Unity",
  unreal: "Unreal Engine",
  threejs: "Three.js",
};

const structures: Record<Engine, string[]> = {
  godot: ["project.godot", "scenes/main.tscn", "scenes/player.tscn", "scripts/player.gd", "scripts/game_manager.gd", "assets/sprites/.gitkeep", "assets/audio/.gitkeep"],
  unity: ["Assets/Scenes/Main.unity", "Assets/Scripts/PlayerController.cs", "Assets/Scripts/GameManager.cs", "Assets/Prefabs/.gitkeep", "Assets/Art/.gitkeep", "ProjectSettings/.gitkeep"],
  unreal: ["Config/DefaultGame.ini", "Content/Maps/.gitkeep", "Content/Blueprints/.gitkeep", "Source/Game/PlayerCharacter.h", "Source/Game/PlayerCharacter.cpp"],
  threejs: ["index.html", "src/main.ts", "src/scene.ts", "src/player.ts", "public/assets/.gitkeep", "package.json"],
};

/**
 * Deterministic TEMPLATE (not AI): builds an example spec from the form.
 * Replace with a model call through the provider layer once one is configured.
 */
export function generateGameTemplate(input: GameInput) {
  const name = input.name.trim() || "Projet sans nom";
  const engine = engineLabels[input.engine];
  const spec = `> **Exemple généré par modèle de document** — aucune IA n'a écrit ce texte.

# ${name}

## Vision
Un jeu **${input.genre || "à définir"}** pour **${input.platform || "plateforme à définir"}**, développé avec **${engine}**.

## Boucle de jeu (à préciser)
1. Le joueur explore / agit
2. Il obtient une récompense ou un obstacle
3. Il progresse vers l'objectif suivant

## Périmètre MVP
- Un niveau jouable
- Contrôles de base du personnage
- Écran titre et écran de fin

## Hors périmètre
- Multijoueur, boutique, sauvegarde cloud
`;
  const checklist = [
    "Définir la boucle de jeu principale",
    `Créer le projet ${engine}`,
    "Prototyper les contrôles du joueur",
    "Construire un premier niveau",
    "Ajouter interface et sons",
    "Tester sur la plateforme cible",
  ].map((label) => ({ label, done: false }));
  return { spec, structure: structures[input.engine], checklist };
}
