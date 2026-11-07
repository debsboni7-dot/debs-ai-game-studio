import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/connexion")({
  head: () => ({ meta: [{ title: "Connexion — DEBS AI" }, { name: "description", content: "Connectez-vous pour retrouver vos conversations." }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage("Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.");
        toast.success("Vérification par e-mail requise.");
      } else {
        toast.success(mode === "login" ? "Connexion réussie." : "Compte créé.");
        await navigate({ to: "/chat" });
      }
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : "Une erreur est survenue.";
      setMessage(safeMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center py-10">
      <div className="w-full rounded-[28px] border border-blue-100 bg-white/90 p-6 shadow-[0_18px_60px_-30px_rgba(65,125,255,.35)] backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="glow-icon mb-4 flex size-14 items-center justify-center rounded-2xl"><Sparkles className="size-6" /></span>
          <h1 className="text-2xl font-bold text-slate-800">{mode === "login" ? "Ravi de te revoir" : "Créer ton compte"}</h1>
          <p className="mt-2 text-sm text-slate-500">Connecte-toi pour retrouver tes conversations sur tes appareils.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">Adresse e-mail
            <span className="relative block"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" className="h-11 rounded-xl border-blue-100 pl-10" /></span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">Mot de passe
            <span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" className="h-11 rounded-xl border-blue-100 pl-10" /></span>
          </label>
          {message && <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-gradient-brand font-semibold shadow-glow">
            {loading ? <Loader2 className="size-4 animate-spin" /> : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === "login" ? "Pas encore de compte ?" : "Tu as déjà un compte ?"}{" "}
          <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
            {mode === "login" ? "Créer un compte" : "Se connecter"}
          </button>
        </p>
        <Link to="/chat" className="mt-5 block text-center text-xs text-slate-400 hover:text-blue-600">Continuer sans compte pour le moment</Link>
      </div>
    </div>
  );
}
