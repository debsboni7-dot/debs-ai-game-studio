import { useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, Mic, MicOff, Paperclip, X } from "lucide-react";

type Props = {
  onInsertText: (text: string) => void;
  onAttachmentsChange: (files: File[]) => void;
  resetKey: number;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const SPEECH_LANGUAGES = [
  { value: "device", label: "Langue de mon appareil" },
  { value: "fr-FR", label: "Français" },
  { value: "en-US", label: "Anglais" },
  { value: "es-ES", label: "Espagnol" },
  { value: "pt-PT", label: "Portugais" },
  { value: "de-DE", label: "Allemand" },
  { value: "it-IT", label: "Italien" },
  { value: "ar-SA", label: "Arabe" },
  { value: "ja-JP", label: "Japonais" },
  { value: "zh-CN", label: "Chinois" },
];

export function VoiceAndFiles({ onInsertText, onAttachmentsChange, resetKey }: Props) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [language, setLanguage] = useState("device");
  const [transcript, setTranscript] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFiles([]);
    setFileError("");
    onAttachmentsChange([]);
  }, [resetKey, onAttachmentsChange]);

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
      setVoiceError("La dictée vocale n'est pas disponible dans ce navigateur. Essaie Chrome et vérifie l'autorisation du microphone.");
      return;
    }
    transcriptRef.current = "";
    setTranscript("");
    const engine = new SpeechRecognition();
    engine.lang = language === "device" ? (navigator.language || "fr-FR") : language;
    engine.continuous = true;
    engine.interimResults = true;
    engine.onresult = (event) => {
      let fullText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        fullText += event.results[i][0].transcript;
      }
      transcriptRef.current = fullText.trim();
      setTranscript(transcriptRef.current);
    };
    engine.onerror = () => {
      setVoiceError("Le microphone n'a pas pu être utilisé. Vérifie son autorisation.");
      setListening(false);
    };
    engine.onend = () => {
      setListening(false);
      const finalText = transcriptRef.current.trim();
      if (finalText) onInsertText(finalText);
      transcriptRef.current = "";
      setTranscript("");
    };
    recognition.current = engine;
    try {
      engine.start();
      setListening(true);
    } catch {
      setVoiceError("Impossible de démarrer le microphone. Réessaie.");
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const selected = Array.from(fileList);
    const attachable = selected.filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");
    const textFiles = selected.filter((file) =>
      file.type.startsWith("text/") ||
      /\.(txt|md|json|js|ts|tsx|jsx|html|css|xml|csv|py|java|c|cpp|h|cs|gd|sql)$/i.test(file.name)
    );
    const unsupported = selected.filter((file) => !attachable.includes(file) && !textFiles.includes(file));
    const next = [...files, ...attachable];
    if (next.length > 5 || next.reduce((sum, file) => sum + file.size, 0) > 15 * 1024 * 1024 || attachable.some((file) => file.size > 8 * 1024 * 1024)) {
      setFileError("Limite : 5 pièces jointes, 8 Mo par fichier et 15 Mo au total.");
      return;
    }
    setFileError(unsupported.length ? "Certains formats ne sont pas pris en charge." : "");
    setFiles(next);
    onAttachmentsChange(next);
    const readable: string[] = [];
    for (const file of textFiles) {
      if (file.size > 500_000) {
        setFileError("Un fichier texte dépasse la limite de 500 Ko et n'a pas été ajouté.");
        continue;
      }
      readable.push("\n\n[Fichier " + file.name + "]\n" + await file.text());
    }
    if (readable.length) onInsertText(readable.join("\n"));
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    onAttachmentsChange(next);
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
      <div className="flex items-center gap-2">
        <label htmlFor="speech-language" className="text-[11px] text-slate-500">Langue parlée :</label>
        <select id="speech-language" value={language} onChange={(event) => setLanguage(event.target.value)} disabled={listening} className="max-w-52 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
          {SPEECH_LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {listening && <p className="text-xs text-blue-600">Écoute en cours… Le texte reconnu sera ajouté à ton message lorsque tu arrêteras la dictée.</p>}
      {transcript && <p aria-live="polite" className="rounded-lg bg-blue-50/70 px-3 py-2 text-xs text-slate-600">{transcript}</p>}
      {voiceError && <p role="status" className="text-xs text-red-600">{voiceError}</p>}
      {fileError && <p role="status" className="text-xs text-amber-700">{fileError}</p>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <span key={file.name + index} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
              {file.type.startsWith("image/") ? <ImagePlus className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
              <span className="max-w-40 truncate">{file.name}</span>
              <button type="button" aria-label={"Retirer " + file.name} onClick={() => removeFile(index)}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
