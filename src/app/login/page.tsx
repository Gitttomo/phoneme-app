"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const user = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, bounce to home
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
          shouldCreateUser: true, // new emails auto-create an account
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "送信に失敗しました";
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-white text-stone-800">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-purple-900 mb-1 text-center">
          Phoneme Trainer
        </h1>
        <p className="text-sm text-stone-500 mb-8 text-center">
          メールアドレスでログイン
        </p>

        {sent ? (
          <div className="p-5 rounded-2xl bg-purple-50 border border-purple-100">
            <h2 className="font-semibold text-purple-900 mb-2">
              ✉️ メールを送信しました
            </h2>
            <p className="text-sm text-stone-600 mb-3">
              <span className="font-mono text-purple-800">{email}</span> 宛にログインリンクを送りました。
              メールを開いてリンクをタップするとログインできます。
            </p>
            <p className="text-xs text-stone-500">
              メールが届かない場合は迷惑メールフォルダもご確認ください。
            </p>
            <button
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="mt-4 text-xs text-purple-700 underline"
            >
              別のアドレスで送り直す
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-stone-600">メールアドレス</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </label>
            <button
              type="submit"
              disabled={sending || !email}
              className="w-full py-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-semibold disabled:opacity-50"
            >
              {sending ? "送信中..." : "ログインリンクを送る"}
            </button>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <p className="text-xs text-stone-500 text-center">
              初めての方もこのまま送信すれば、自動でアカウントが作成されます。
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
