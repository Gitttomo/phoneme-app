"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, type Phoneme, type Progress, type ShareCode } from "@/lib/supabase";
import { getOrCreateShareCode } from "@/lib/shareCode";

type PhonemeWithProgress = Phoneme & { is_good: boolean };

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [shareCode, setShareCode] = useState<ShareCode | null>(null);
  const [phonemes, setPhonemes] = useState<PhonemeWithProgress[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const sc = await getOrCreateShareCode();
      setShareCode(sc);

      const [{ data: phonemesData }, { data: progressData }] = await Promise.all([
        supabase.from("phonemes").select("*").order("sort_order"),
        supabase.from("progress").select("*").eq("share_code_id", sc.id),
      ]);

      const progMap = new Map<number, Progress>();
      (progressData ?? []).forEach((p) => progMap.set(p.phoneme_id, p as Progress));

      const withProg = (phonemesData ?? []).map((p) => ({
        ...(p as Phoneme),
        is_good: progMap.get((p as Phoneme).id)?.is_good ?? false,
      }));
      setPhonemes(withProg);
      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PhonemeWithProgress[]>();
    phonemes.forEach((p) => {
      const arr = map.get(p.symbol) ?? [];
      arr.push(p);
      map.set(p.symbol, arr);
    });
    return Array.from(map.entries());
  }, [phonemes]);

  const goodCount = phonemes.filter((p) => p.is_good).length;
  const total = phonemes.length;
  const pct = total > 0 ? Math.round((goodCount / total) * 100) : 0;

  const shareUrl = useMemo(() => {
    if (!shareCode || typeof window === "undefined") return "";
    return `${window.location.origin}/?code=${shareCode.code}`;
  }, [shareCode]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-300">
        読み込み中...
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Phoneme Trainer</h1>
        <p className="text-slate-400 text-sm">アメリカ英語の母音音素を20人のネイティブ発音で学ぶ</p>
      </header>

      <section className="mb-8 p-5 rounded-2xl bg-slate-800/60 border border-slate-700">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-slate-400 text-xs mb-1">全体の進捗</div>
            <div className="text-3xl font-semibold">
              {goodCount}<span className="text-slate-400 text-xl"> / {total}</span>
            </div>
          </div>
          <div className="text-4xl font-bold text-emerald-400">{pct}%</div>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      <section className="mb-8 p-4 rounded-2xl bg-slate-800/40 border border-slate-700">
        <div className="text-xs text-slate-400 mb-2">URLで進捗を同期（スマホと共有）</div>
        <div className="flex gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-900 font-semibold text-sm hover:bg-emerald-400"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
      </section>

      <section className="space-y-6">
        {grouped.map(([symbol, items]) => {
          const good = items.filter((i) => i.is_good).length;
          return (
            <div key={symbol}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-2xl font-bold">{symbol}</h2>
                <div className="text-xs text-slate-400">{good}/{items.length}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/phoneme/${p.slug}`}
                    className={`p-4 rounded-xl border transition-colors ${
                      p.is_good
                        ? "bg-emerald-500/10 border-emerald-500/50"
                        : "bg-slate-800/40 border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-semibold">{p.symbol}</span>
                      {p.type_label && (
                        <span className="text-xs text-slate-400">{p.type_label}</span>
                      )}
                      {p.is_good && (
                        <span className="ml-auto text-emerald-400 text-sm">✓ Good</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{p.condition}</div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
