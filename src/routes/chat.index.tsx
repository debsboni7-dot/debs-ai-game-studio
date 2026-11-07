import { useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Code2, Gamepad2, GitBranch, Lightbulb, MessageSquarePlus, Send, Sparkles, Wrench } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { VoiceAndFiles } from "@/components/debs/voice-and-files";
import { setPendingAttachments } from "@/lib/chat/pending-attachments";
import { STORAGE_KEYS, uid, usePersistentState } from "@/lib/storage";
import { seedThreads, type Thread } from "@/lib/chat/threads";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "DEBS AI — Assistant de création" },
      { name: "description", content: "Discute avec DEBS AI pour concevoir, programmer et améliorer tes jeux." },
    ],
  }),
  component: ChatHome,
});

const suggestions = [
  { icon: Gamepad2, title: "Créer un jeu vidéo", prompt: "/game-dev Aide-moi à concevoir et développer un jeu vidéo. Commençons par définir le concept, le gameplay, l’architecture technique et une première version jouable." },
  { icon: Code2, title: "Écrire du code", prompt: "/code Aide-moi à écrire du code propre, robuste et testé. Je vais te décrire ce que je veux construire." },
  { icon: Wrench, title: "Corriger un bug", prompt: "/debug Aide-moi à diagnostiquer et corriger un bug. Je vais te donner le comportement attendu et le problème rencontré." },
  { icon: GitBranch, title: "Travailler avec GitHub", prompt: "/github Aide-moi à analyser mon dépôt GitHub et à planifier les prochaines modifications." },
];

function ChatHome() {
  const [threads, setThreads] = usePersistentState<Thread[]>(STORAGE_KEYS.threads, seedThreads);
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const handleAttachmentsChange = useCallback((files: File[]) => setAttachments(files), []);

  const start = async (draft = "") => {
    let id = uid("t_");
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data, error } = await supabase.from("conversations")
        .insert({ user_id: auth.user.id, title: draft ? draft.slice(0, 52) : "Nouvelle conversation" })
        .select("id").single();
      if (!error && data) id = data.id;
    }
    setThreads((previous) => [{
      id,
      title: draft ? draft.slice(0, 52) : "Nouvelle conversation",
      updatedAt: Date.now(),
      messages: [],
    }, ...previous]);
    setPendingAttachments(attachments);
    await navigate({
      to: "/chat/$threadId",
      params: { threadId: id },
      search: draft ? { draft } : {},
    });
  };

  return (
    <section className="flex min-h-[calc(100dvh-7rem)] flex-1 flex-col items-center justify-center px-1 pb-8">
      <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-red-100 bg-white shadow-[0_8px_30px_-18px_rgba(220,38,38,.55)]">
        <Sparkles className="size-7 text-red-600" />
      </div>
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-100 bg-white/90 px-3 py-1 text-[11px] font-semibold text-red-700 shadow-[0_4px_20px_-16px_rgba(220,38,38,.6)]"><span className="size-1.5 rounded-full bg-red-500" /> Assistant IA · DEBS 1.1</div>
      <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">Bienvenue sur DEBS AI 1.1</h1>
      <p className="mt-3 max-w-xl text-center text-sm leading-6 text-slate-500 sm:text-base">
        Je suis DEBS 1.1, ton assistant IA de création et de développement. Je peux t’aider à imaginer, programmer, tester et améliorer tes projets. Que souhaites-tu construire aujourd’hui ?
      </p>

      <form onSubmit={(event) => { event.preventDefault(); if (input.trim() || attachments.length) void start(input.trim()); }} className="mt-8 w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-3 shadow-[0_10px_36px_-22px_rgba(220,38,38,.5)] ring-1 ring-red-50">
        <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à DEBS 1.1…" rows={2} className="min-h-[64px] max-h-48 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span className="px-2 text-[11px] text-slate-400">Décris ton idée, dicte-la ou joins un fichier</span>
          <div className="ml-auto flex items-center gap-2">
            <VoiceAndFiles onInsertText={(text) => setInput((current) => current ? current + "\\n" + text : text)} onAttachmentsChange={handleAttachmentsChange} resetKey={0} initialFiles={attachments} />
            <button type="submit" disabled={!input.trim() && attachments.length === 0} aria-label="Continuer vers la conversation" className="flex size-10 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-200"><Send className="size-4" /></button>
          </div>
        </div>
      </form>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map(({ icon: Icon, title, prompt }) => (
          <button key={title} onClick={() => start(prompt)} className="group flex min-h-[76px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-red-300 hover:bg-red-50/40">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition group-hover:bg-red-100 group-hover:text-red-700"><Icon className="size-[18px]" /></span>
            <span className="min-w-0"><span className="block text-sm font-medium text-slate-700">{title}</span><span className="mt-0.5 block text-xs text-slate-400">Démarrer avec DEBS 1.1</span></span>
          </button>
        ))}
      </div>
      <p className="mt-8 flex items-center gap-2 text-[11px] text-slate-400"><Lightbulb className="size-3.5" /> Les réponses de l’IA peuvent contenir des erreurs. Vérifie les changements importants.</p>
    </section>
  );
}
