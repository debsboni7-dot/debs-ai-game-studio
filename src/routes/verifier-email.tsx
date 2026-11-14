import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verifier-email")({
  head: () => ({ meta: [{ title: "Vérification e-mail — DEBS AI" }, { name: "description", content: "Saisissez le code reçu par e-mail pour activer votre compte DEBS AI." }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEmail(sessionStorage.getItem("debs-auth-email") ?? "");
  }, []);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !email) return;
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\s/g, ""), type: "email" });
      if (error) throw error;
      sessionStorage.removeItem("debs-auth-email");
      sessionStorage.removeItem("debs-auth-mode");
      toast.success("Adresse vérifiée. Bienvenue sur DEBS AI.");
      await navigate({ to: "/chat" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Code incorrect ou expiré.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email || resending) return;
    setResending(true);
    setMessage("");
    try {
      const shouldCreateUser = sessionStorage.getItem("debs-auth-mode") === "signup";
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser } });
      if (error) throw error;
      toast.success("Un nouveau code vient d'être envoyé.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de renvoyer le code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center py-10">
      <div className="w-full rounded-[28px] border border-red-100 bg-white p-6 shadow-[0_18px_60px_-30px_rgba(220,38,38,.28)] sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="glow-icon mb-4 flex size-14 items-center justify-center rounded-2xl"><MailCheck className="size-6" /></span>
          <h1 className="text-2xl font-bold text-slate-800">Vérifie ton e-mail</h1>
          <p className="mt-2 text-sm text-slate-500">Saisis le code envoyé à {email || "ton adresse e-mail"}. Vérifie aussi tes courriers indésirables.</p>
        </div>
        <form onSubmit={verify} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">Code de vérification
            <Input inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 8))} placeholder="Code reçu par e-mail" className="h-12 rounded-xl border-red-100 text-center text-xl tracking-[.35em]" />
          </label>
          {message && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          <Button type="submit" disabled={loading || !email || code.length < 6} className="h-11 w-full rounded-xl bg-gradient-brand font-semibold shadow-glow">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Vérifier le code"}
          </Button>
        </form>
        <Button type="button" variant="outline" disabled={resending || !email} onClick={resend} className="mt-3 h-11 w-full rounded-xl">
          {resending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Renvoyer un code
        </Button>
        <Link to="/connexion" className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-red-600"><ArrowLeft className="size-3.5" /> Modifier l'adresse ou revenir à la connexion</Link>
      </div>
    </div>
  );
}
