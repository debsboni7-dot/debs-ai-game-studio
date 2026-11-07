export type MessageKind = "user" | "assistant" | "notice" | "example";

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  content: string;
  createdAt: number;
  provider?: string;
}

export interface Thread {
  id: string;
  title: string;
  updatedAt: number;
  demo?: boolean;
  messages: ChatMessage[];
}

/** A static example thread so Markdown/code rendering can be seen. Not AI-generated. */
export const seedThreads: Thread[] = [
  {
    id: "demo-rendu",
    title: "Exemple : déplacement d'un joueur Godot",
    updatedAt: 0,
    demo: true,
    messages: [
      { id: "d1", kind: "user", content: "Comment déplacer un personnage 2D dans Godot 4 ?", createdAt: 0 },
      {
        id: "d2",
        kind: "example",
        createdAt: 0,
        content:
          "Voici une approche simple avec `CharacterBody2D` :\n\n```python\nextends CharacterBody2D\n\nconst SPEED := 200.0\n\nfunc _physics_process(_delta):\n    var dir := Input.get_vector(\"ui_left\", \"ui_right\", \"ui_up\", \"ui_down\")\n    velocity = dir * SPEED\n    move_and_slide()\n```\n\n- `get_vector` normalise la direction\n- `move_and_slide` gère les collisions",
      },
    ],
  },
];

export function titleFrom(text: string) {
  const s = text.trim().replace(/\s+/g, " ");
  return s.length > 48 ? s.slice(0, 48) + "…" : s || "Nouvelle conversation";
}
