import { useMemo, useState } from "react";
import JSZip from "jszip";
import { Download, Gamepad2, MonitorPlay } from "lucide-react";

type GameFile = { path: string; content: string };
const FILE_BLOCK = new RegExp("\\x60\\x60\\x60file:([^\\n]+)\\n([\\s\\S]*?)\\n\\x60\\x60\\x60", "g");

export function parseGameFiles(markdown: string): GameFile[] {
  const files: GameFile[] = [];
  let match: RegExpExecArray | null;
  FILE_BLOCK.lastIndex = 0;
  while ((match = FILE_BLOCK.exec(markdown)) && files.length < 30) {
    const path = match[1].trim().replace(/^\.\//, "");
    if (!path || path.startsWith("/") || path.split("/").some((part) => part === "..") || path.includes("\\\\") || path.length > 180) continue;
    if (match[2].length <= 1_000_000) files.push({ path, content: match[2] });
  }
  FILE_BLOCK.lastIndex = 0;
  return files;
}

function buildPreview(files: GameFile[]) {
  const htmlFile = files.find((file) => file.path.toLowerCase() === "index.html") ?? files.find((file) => file.path.toLowerCase().endsWith("/index.html"));
  if (!htmlFile) return null;
  const base = htmlFile.path.includes("/") ? htmlFile.path.slice(0, htmlFile.path.lastIndexOf("/") + 1) : "";
  const resolve = (src: string) => files.find((file) => file.path === src || file.path === base + src || file.path === src.replace(/^\.\//, ""));
  let html = htmlFile.content;
  html = html.replace(/<link\b([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (tag, _before: string, href: string) => {
    const file = resolve(href);
    return file ? "<style>\n" + file.content + "\n</style>" : tag;
  });
  html = html.replace(/<script\b([^>]*?)src=["']([^"']+\.js)["']([^>]*)>\s*<\/script>/gi, (tag, _before: string, src: string) => {
    const file = resolve(src);
    return file ? "<script>\n" + file.content.replace(/<\/script/gi, "<\\/script") + "\n<\/script>" : tag;
  });
  return html;
}

export function GameArtifact({ markdown }: { markdown: string }) {
  const files = useMemo(() => parseGameFiles(markdown), [markdown]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const preview = useMemo(() => buildPreview(files), [files]);
  if (!files.length) return null;

  const download = async () => {
    setDownloadError("");
    try {
      const zip = new JSZip();
      files.forEach((file) => zip.file(file.path, file.content));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "debs-ai-game.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Impossible de préparer l'archive. Réessaie.");
    }
  };

  return <section className="my-3 space-y-3 rounded-2xl border border-blue-200 bg-white p-3 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Gamepad2 className="size-4 text-blue-600" /> Projet de jeu généré <span className="text-xs font-normal text-slate-500">{files.length} fichier(s)</span></div>
      <button type="button" onClick={() => void download()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Download className="size-3.5" /> Télécharger le jeu (.zip)</button>
    </div>
    <div className="flex flex-wrap gap-1.5">{files.map((file) => <span key={file.path} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">{file.path}</span>)}</div>
    {preview ? <>
      <button type="button" onClick={() => setPreviewOpen((open) => !open)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"><MonitorPlay className="size-3.5" /> {previewOpen ? "Fermer l'aperçu" : "Tester dans l'aperçu"}</button>
      {previewOpen && <iframe title="Aperçu du jeu généré par DEBS AI" sandbox="allow-scripts" srcDoc={preview} className="h-[480px] w-full rounded-xl border border-slate-200 bg-slate-950" />}
    </> : <p className="text-xs text-amber-700">Le téléchargement est disponible. Pour activer l'aperçu, le projet doit contenir index.html.</p>}
    {downloadError && <p role="status" className="text-xs text-red-600">{downloadError}</p>}
    <p className="text-[10px] text-slate-400">L'aperçu est isolé dans un cadre sécurisé. Les projets exportés sont des fichiers locaux ; les moteurs natifs comme Unity ou Unreal nécessitent leur éditeur pour être lancés.</p>
  </section>;
}
