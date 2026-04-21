"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  supabase,
  type Phoneme,
  type Progress,
  type ReviewStatus,
} from "@/lib/supabase";
import { signOut, useAuth } from "@/lib/auth";

type PhonemeRow = Phoneme & {
  status: ReviewStatus | null;
  review_at: string | null;
};

const STATUS_COLORS: Record<ReviewStatus, { bg: string; text: string; label: string }> = {
  one_more: { bg: "bg-red-500", text: "text-white", label: "One more" },
  good: { bg: "bg-orange-400", text: "text-white", label: "Good" },
  great: { bg: "bg-yellow-300", text: "text-stone-800", label: "Great" },
};

export default function HomePage() {
  const user = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [phonemes, setPhonemes] = useState<PhonemeRow[]>([]);

  // Route guard
  useEffect(() => {
    if (user === null) router.replace("/login");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: phonemesData }, { data: progressData }] = await Promise.all([
        supabase.from("phonemes").select("*").order("sort_order"),
        supabase.from("progress").select("*").eq("user_id", user.id),
      ]);

      const progMap = new Map<number, Progress>();
      (progressData ?? []).forEach((p) => progMap.set(p.phoneme_id, p as Progress));

      const withProg = (phonemesData ?? []).map((p) => {
        const prog = progMap.get((p as Phoneme).id);
        return {
          ...(p as Phoneme),
          status: prog?.status ?? null,
          review_at: prog?.review_at ?? null,
        };
      });
      setPhonemes(withProg);
      setLoading(false);
    })();
  }, [user]);

  const grouped = useMemo(() => {
    const map = new Map<string, PhonemeRow[]>();
    phonemes.forEach((p) => {
      const arr = map.get(p.symbol) ?? [];
      arr.push(p);
      map.set(p.symbol, arr);
    });
    return Array.from(map.entries());
  }, [phonemes]);

  const counts = useMemo(() => {
    let one = 0, good = 0, great = 0;
    phonemes.forEach((p) => {
      if (p.status === "one_more") one++;
      else if (p.status === "good") good++;
      else if (p.status === "great") great++;
    });
    return { one, good, great, total: phonemes.length };
  }, [phonemes]);

  const reviewDue = useMemo(() => {
    const now = Date.now();
    return phonemes
      .filter((p) => p.status && p.review_at && new Date(p.review_at).getTime() <= now)
      .sort((a, b) => new Date(a.review_at!).getTime() - new Date(b.review_at!).getTime());
  }, [phonemes]);

  if (user === undefined || (user && loading)) {
    return (
      <main className="min-h-screen flex items-center justify-center text-stone-500 bg-white">
        読み込み中...
      </main>
    );
  }
  if (user === null) return null; // redirecting

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 bg-white text-stone-800">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 text-purple-900">Phoneme Trainer</h1>
          <p className="text-stone-500 text-sm">アメリカ英語の母音音素を20人の発音で学ぶ</p>
          <p className="text-[11px] text-stone-400 mt-1">{user.email}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="text-xs text-stone-500 hover:text-purple-700 px-3 py-1.5 rounded-lg border border-stone-200 hover:border-purple-300"
        >
          ログアウト
        </button>
      </header>

      {/* Progress summary */}
      <section className="mb-6 p-5 rounded-2xl bg-purple-50 border border-purple-100">
        <div className="text-xs text-purple-700 mb-3 font-medium">進捗状況</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="未評価" count={counts.total - counts.one - counts.good - counts.great} colorClass="bg-stone-100 text-stone-600" />
          <Stat label="One more" count={counts.one} colorClass="bg-red-500 text-white" />
          <Stat label="Good" count={counts.good} colorClass="bg-orange-400 text-white" />
          <Stat label="Great" count={counts.great} colorClass="bg-yellow-300 text-stone-800" />
        </div>
      </section>

      {/* Review corner */}
      <section className="mb-8 p-5 rounded-2xl bg-white border-2 border-purple-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-purple-900">📚 復習コーナー</h2>
          <span className="text-xs text-stone-500">{reviewDue.length} 件</span>
        </div>
        {reviewDue.length === 0 ? (
          <p className="text-sm text-stone-400">いまは復習対象がありません 🎉</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {reviewDue.map((p) => {
              const s = STATUS_COLORS[p.status!];
              return (
                <Link
                  key={p.id}
                  href={`/phoneme/${p.slug}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-purple-100 hover:bg-purple-50 transition-colors"
                >
                  <span className={`w-3 h-3 rounded-full ${s.bg}`} />
                  <span className="font-semibold">{p.symbol}</span>
                  {p.type_label && (
                    <span className="text-xs text-stone-500">{p.type_label}</span>
                  )}
                  <span className="ml-auto text-[10px] text-stone-400">{s.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Phoneme groups */}
      <section className="space-y-6">
        {grouped.map(([symbol, items]) => (
          <div key={symbol}>
            <h2 className="text-xl font-bold mb-2 text-stone-700">{symbol}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((p) => {
                const colorCls = p.status ? STATUS_COLORS[p.status] : null;
                return (
                  <Link
                    key={p.id}
                    href={`/phoneme/${p.slug}`}
                    className="p-4 rounded-xl border border-purple-100 bg-white hover:border-purple-300 hover:bg-purple-50 transition-colors relative"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-semibold text-stone-800">{p.symbol}</span>
                      {p.type_label && (
                        <span className="text-xs text-stone-500">{p.type_label}</span>
                      )}
                      {colorCls && (
                        <span
                          className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold ${colorCls.bg} ${colorCls.text}`}
                        >
                          {colorCls.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500">{p.condition}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function Stat({ label, count, colorClass }: { label: string; count: number; colorClass: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-full py-2 rounded-lg font-bold text-lg ${colorClass}`}>{count}</div>
      <div className="text-[10px] text-stone-500">{label}</div>
    </div>
  );
}
