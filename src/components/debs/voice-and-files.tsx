import { useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, Languages, Mic, MicOff, Paperclip, X } from "lucide-react";

type Props = {
  onInsertText: (text: string) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function VoiceAndFiles({ onInsertText, onAttachmentsChange }: Props) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [translated, setTranslated] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translating, setTranslating] = useState(false);
  const [files, setFiles] = useState<File[]>([]);\n  const [fileError, setFileError] = useState("");
  const recognition = useRef<SpeechRecognitionLike | null>(null);\n  const filesStateRef = useRef<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  const toggleVoice = () => {
    setVoiceError("");
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("La reconnaissance vocale n'est pas disponible dans ce navigateur. Essaie Chrome.");
      return;
    }
    const engine = new SpeechRecognition();
    engine.lang = "fr-FR";
    engine.continuous = true;
    engine.interimResults = true;
    engine.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      setTranscript((previous) => previous + text);
    };
    engine.onerror = () => {
      setVoiceError("Le microphone n'a pas pu être utilisé. Vérifie son autorisation.");
      setListening(false);
    };
    engine.onend = () => setListening(false);
    recognition.current = engine;
    try {
      engine.start();
      setListening(true);
    } catch {
      setVoiceError("Impossible de démarrer le microphone. Réessaie.");
    }
  };

  const translateText = async () => {
    if (!sourceText.trim()) return;
    setTranslating(true);
    setTranslated("");
    try {
      const params = new URLSearchParams({ q: sourceText.trim(), langpair: "fr|" + targetLanguage });
      const response = await fetch("https://api.mymemory.translated.net/get?" + params.toString());
      if (!response.ok) throw new Error("translation");
      const data = await response.json() as { responseData?: { translatedText?: string }; responseStatus?: number };
      if (!data.responseData?.translatedText || data.responseStatus !== 200) throw new Error("translation");
      setTranslated(data.responseData.translatedText);
    } catch {
      setTranslated("Traduction indisponible pour le moment. Réessaie plus tard.");
    } finally {
      setTranslating(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    setFileNames((current) => [...current, ...selected.map((file) => file.name)]);
    const readable: string[] = [];
    for (const file of selected) {
      if (file.type.startsWith("text/") || /\.(txt|md|json|js|ts|tsx|jsx|html|css|xml|csv|py|java|c|cpp|h|cs|gd|sql)$/i.test(file.name)) {
        if (file.size <= 500_000) readable.push("\n\n[Fichier " + file.name + "]\n" + await file.text());
      }
    }
    if (readable.length) onInsertText(readable.join("\n"));
  };

  return (
    <div className="space-y-2 px-1">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggleVoice} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-blue-200 bg-white text-slate-700 hover:bg-blue-50"}`}>
          {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {listening ? "Arrêter la dictée" : "Dictée vocale"}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50">
          <Paperclip className="size-4" /> Ajouter un fichier ou une photo
        </button>
        <input ref={fileInput} type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.xml,.csv,.py,.java,.c,.cpp,.h,.cs,.gd,.sql" className="hidden" onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ""; }} />
      </div>
      {listening && <p className="text-xs text-blue-600">Écoute en cours… La transcription reste dans ce navigateur et n'appelle pas l'IA.</p>}
      {voiceError && <p role="status" className="text-xs text-red-600">{voiceError}</p>}
      {transcript && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2">
          <p className="mb-1 text-[11px] font-semibold text-blue-700">Transcription vocale</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{transcript}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => { onInsertText(transcript); setTranscript(""); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Insérer dans le message</button>
            <button type="button" onClick={() => setTranscript("")} className="rounded-lg border px-3 py-1.5 text-xs">Effacer</button>
          </div>
        </div>
      )}
      {fileNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fileNames.map((name, index) => <span key={name + index} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600"><FileText className="size-3 shrink-0" /><span className="truncate">{name}</span><button type="button" aria-label={"Retirer " + name} onClick={() => setFileNames((items) => items.filter((_, i) => i !== index))}><X className="size-3" /></button></span>)}
        </div>
      )}
      {fileError && <p role="status" className="text-xs text-amber-700">{fileError}</p>}\n      {files.length > 0 && <div className="flex flex-wrap gap-1.5">{files.map((file, index) => <span key={file.name + index} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{file.type.startsWith("image/") ? <ImagePlus className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}<span className="max-w-40 truncate">{file.name}</span><button type="button" aria-label={"Retirer " + file.name} onClick={() => { const next = files.filter((_, i) => i !== index); filesStateRef.current = next; setFiles(next); onAttachmentsChange(next); }}><X className="size-3" /></button></span>)}</div>}\n      <details className="rounded-xl border border-slate-200 bg-white/80 p-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-slate-700"><Languages className="size-4 text-blue-600" /> Traduction écrite (sans IA)</summary>
        <div className="mt-2 space-y-2">
          <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={2} placeholder="Texte à traduire…" className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-blue-300" />
          <div className="flex gap-2">
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
              <option value="en">Anglais</option><option value="fr">Français</option><option value="es">Espagnol</option><option value="de">Allemand</option><option value="pt">Portugais</option><option value="it">Italien</option><option value="ar">Arabe</option><option value="zh">Chinois</option><option value="ja">Japonais</option>
            </select>
            <button type="button" disabled={!sourceText.trim() || translating} onClick={() => void translateText()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{translating ? "Traduction…" : "Traduire"}</button>
          </div>
          {translated && <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700"><p className="whitespace-pre-wrap">{translated}</p><button type="button" onClick={() => onInsertText(translated)} className="mt-2 text-xs font-semibold text-blue-700">Insérer la traduction</button></div>}
          <p className="text-[10px] text-slate-400">La traduction utilise un service externe gratuit. Évite d'y saisir des informations confidentielles.</p>
        </div>
      </details>
    </div>
  );
}
