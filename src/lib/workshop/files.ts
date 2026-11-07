export interface WorkFile {
  path: string;
  content: string;
}

/** Demo files, clearly labeled. Code is only displayed and edited, never executed. */
export const demoFiles: WorkFile[] = [
  {
    path: "README.md",
    content: "# Projet de démonstration\n\nFichiers d'exemple de l'atelier DEBS AI.\nLe code n'est jamais exécuté.\n",
  },
  {
    path: "scripts/player.gd",
    content:
      'extends CharacterBody2D\n\nconst SPEED := 220.0\n\nfunc _physics_process(delta: float) -> void:\n\tvar dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")\n\tvelocity = dir * SPEED\n\tmove_and_slide()\n',
  },
  {
    path: "src/main.ts",
    content:
      'import * as THREE from "three";\n\nconst scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);\ncamera.position.z = 3;\n',
  },
];

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", json: "json",
    md: "markdown", css: "css", html: "markup", py: "python", gd: "python",
    cs: "csharp", cpp: "cpp", h: "cpp", ini: "ini",
  };
  return map[ext] ?? "text";
}

export function normalizePath(p: string): string | null {
  const clean = p.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!clean || clean.endsWith("/") || clean.split("/").some((s) => s === ".." || s === ".")) return null;
  return clean;
}

export async function exportZip(files: WorkFile[], name = "debs-projet") {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.path, f.content));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
