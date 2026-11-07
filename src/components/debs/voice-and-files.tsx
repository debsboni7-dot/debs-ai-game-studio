import { useEffect, useRef, useState } from "react";
import { FileText, Mic, MicOff, Paperclip, X } from "lucide-react";

type Props = { onInsertText: (text: string) => void; onAttachmentsChange: (files: File[]) => void; resetKey: number };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function VoiceAndFiles({ onInsertText, onAttachmentsChange, resetKey }: Props) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const transcript = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { setFiles([]); setFileError(""); onAttachmentsChange([]); }, [resetKey, onAttachmentsChange]);
  useEffect(() => () => recognition.current?.stop(), []);

  const toggleVoice = () => {
    setVoiceError("");
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const speech = window as SpeechWindow;
    const SpeechRecognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceError("Dictée indisponible ici. Essaie Chrome et autorise le microphone."); return; }
    transcript.current = "";
    const engine = new SpeechRecognition();
    engine.lang = navigator.language || "fr-FR";
    engine.continuous = true;
    engine.interimResults = true;
    engine.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      transcript.current = text.trim();
    };
    engine.onerror = () => { setVoiceError("Le microphone n'a pas pu être utilisé. Vérifie son autorisation."); setListening(false); };
    engine.onend = () => { setListening(false); if (transcript.current) onInsertText(transcript.current); transcript.current = ""; };
    recognition.current = engine;
    try { engine.start(); setListening(true); } catch { setVoiceError("Impossible de démarrer le microphone. Réessaie."); }
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const selected = Array.from(list);
    const attachable = selected.filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");
    const textFiles = selected.filter((file) => file.type.startsWith("text/") || /\.(txt|md|json|js|ts|tsx|jsx|html|css|xml|csv|py|java|c|cpp|h|cs|gd|sql)$/i.test(file.name));
    const unsupported = selected.filter((file) => !attachable.includes(file) && !textFiles.includes(file));
    const next = [...files, ...attachable];
    if (next.length > 5 || next.reduce((sum, file) => sum + file.size, 0) > 15 * 1024 * 1024 || attachable.some((file) => file.size > 8 * 1024 * 1024)) {
      setFileError("Limite : 5 pièces jointes, 8 Mo par fichier et 15 Mo au total."); return;
    }
    setFileError(unsupported.length ? "Certains formats ne sont pas pris en charge." : "");
    setFiles(next); onAttachmentsChange(next);
    const readable: string[] = [];
    for (const file of textFiles) {
      if (file.size > 500_000) { setFileError("Un fichier texte dépasse 500 Ko."); continue; }
      readable.push("\n\n[Fichier " + file.name + "]\n" + await file.text());
    }
    if (readable.length) onInsertText(readable.join("\n"));
  };
  const removeFile = (index: number) => { const next = files.filter((_, i) => i !== index); setFiles(next); onAttachmentsChange(next); };

  return <div className="flex min-w-0 flex-col items-end gap-1">
    <div className="flex items-center gap-1">
      <button type="button" onClick={toggleVoice} title={listening ? "Arrêter la dictée" : "Dicter un message"} aria-label={listening ? "Arrêter la dictée" : "Dicter un message"} className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-blue-200 bg-white text-slate-700 hover:bg-blue-50"}`}>
        {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      </button>
      <button type="button" onClick={() => fileInput.current?.click()} title="Joindre un fichier" aria-label="Joindre un fichier" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-slate-700 hover:bg-blue-50"><Paperclip className="size-4" /></button>
      <input ref={fileInput} type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.xml,.csv,.py,.java,.c,.cpp,.h,.cs,.gd,.sql" className="hidden" onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ""; }} />
    </div>
    {(listening || files.length > 0 || voiceError || fileError) && <div className="max-w-56 space-y-1 text-right">
      {listening && <p className="text-[10px] text-blue-600">Écoute en cours…</p>}
      {files.length > 0 && <div className="flex flex-wrap justify-end gap-1">{files.map((file, index) => <span key={file.name + index} className="inline-flex max-w-36 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600"><FileText className="size-3 shrink-0" /><span className="truncate">{file.name}</span><button type="button" aria-label={"Retirer " + file.name} onClick={() => removeFile(index)}><X className="size-3" /></button></span>)}</div>}
      {voiceError && <p role="status" className="text-[10px] text-red-600">{voiceError}</p>}
      {fileError && <p role="status" className="text-[10px] text-amber-700">{fileError}</p>}
    </div>}
  </div>;
}
