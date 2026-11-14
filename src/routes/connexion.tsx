import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CREATOR_CREDIT } from "@/lib/brand";

export const Route = createFileRoute("/connexion")({
  head: () => ({ meta: [{ title: "Connexion — DEBS AI" }, { name: "description", content: "Connectez-vous et vérifiez votre adresse e-mail pour utiliser DEBS AI." }] }),
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
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: undefined },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Adresse e-mail vérifiée.");
          await navigate({ to: "/chat" });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
      }

      sessionStorage.setItem("debs-auth-email", normalizedEmail);
      sessionStorage.setItem("debs-auth-otp-type", mode === "signup" ? "signup" : "email");
      await navigate({ to: "/verifier-email" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'envoyer le code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center py-10">
      <div className="w-full rounded-[28px] border border-red-100 bg-white/90 p-6 shadow-[0_18px_60px_-30px_rgba(220,38,38,.28)] backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="glow-icon mb-4 flex size-14 items-center justify-center rounded-2xl"><Sparkles className="size-6" /></span>
          <h1 className="text-2xl font-bold text-slate-800">{mode === "login" ? "Ravi de te revoir" : "Créer ton compte"}</h1>
          <p className="mt-2 text-sm text-slate-500">Un code sera envoyé à ton adresse e-mail pour confirmer ton identité.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">Adresse e-mail
            <span className="relative block"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" className="h-11 rounded-xl border-red-100 pl-10" /></span>
          </label>
          {mode === "signup" && <label className="block space-y-1.5 text-sm font-medium text-slate-700">Mot de passe
            <span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" className="h-11 rounded-xl border-red-100 pl-10" /></span>
          </label>}
          {message && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-gradient-brand font-semibold shadow-glow">
            {loading ? <Loader2 className="size-4 animate-spin" /> : mode === "login" ? "Recevoir mon code" : "Créer mon compte"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === "login" ? "Pas encore de compte ?" : "Tu as déjà un compte ?"}{" "}
          <button type="button" className="font-semibold text-red-600 hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
            {mode === "login" ? "Créer un compte" : "Se connecter"}
          </button>
        </p>
        <p className="mt-4 text-center text-xs font-medium text-red-500">{CREATOR_CREDIT}</p>
      </div>
    </div>
  );
}
