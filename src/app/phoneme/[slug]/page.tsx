"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use as usePromise } from "react";
import {
  supabase,
  type Phoneme,
  type ReviewStatus,
  type Word,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { cancelSpeech, preloadVoices, speakAsSpeaker, warmupSpeech } from "@/lib/voices";

const SPEAKER_COUNT = 20;

const REVIEW_INTERVAL_MS: Record<ReviewStatus, number> = {
  one_more: 1 * 24 * 60 * 60 * 1000, // 1 day
  good: 3 * 24 * 60 * 60 * 1000,     // 3 days
  great: 3 * 24 * 60 * 60 * 1000,    // 3 days
};

type Params = { slug: string };

export default function PhonemePage({ params }: { params: Promise<Params> }) {
  const { slug } = usePromise(params);
  const user = useAuth();
  const router = useRouter();
  const [phoneme, setPhoneme] = useState<Phoneme | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [speed, setSpeed] = useState(0.3);
  const [loading, setLoading] = useState(true);
  const [played, setPlayed] = useState<Record<number, Set<number>>>({});

  // Preload voices as early as possible so first playback is instant
  useEffect(() => {
    preloadVoices();
  }, []);

  useEffect(() => {
    if (user === null) router.replace("/login");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ph } = await supabase
        .from("phonemes").select("*").eq("slug", slug).single();
      if (!ph) { setLoading(false); return; }
      setPhoneme(ph as Phoneme);

      const { data: ws } = await supabase
        .from("words").select("*")
        .eq("phoneme_id", (ph as Phoneme).id).order("position");
      const wordList = (ws ?? []) as Word[];
      setWords(wordList);

      const wordIds = wordList.map((w) => w.id);
      if (wordIds.length > 0) {
        const { data: plays } = await supabase
          .from("speaker_plays")
          .select("word_id, speaker_index")
          .eq("user_id", user.id)
          .in("word_id", wordIds);
        const map: Record<number, Set<number>> = {};
        wordIds.forEach((id) => { map[id] = new Set(); });
        (plays ?? []).forEach((p: { word_id: number; speaker_index: number }) => {
          map[p.word_id]?.add(p.speaker_index);
        });
        setPlayed(map);
      }

      setLoading(false);
    })();

    return () => cancelSpeech();
  }, [slug, user]);

  async function markPlayed(wordId: number, speakerIndex: number) {
    if (!user) return;
    setPlayed((prev) => {
      const next = { ...prev };
      const set = new Set(next[wordId] ?? []);
      set.add(speakerIndex);
      next[wordId] = set;
      return next;
    });
    await supabase.from("speaker_plays").upsert(
      {
        user_id: user.id,
        word_id: wordId,
        speaker_index: speakerIndex,
      },
      { onConflict: "user_id,word_id,speaker_index" }
    );
  }

  async function setStatus(status: ReviewStatus) {
    if (!phoneme || !user) return;
    const reviewAt = new Date(Date.now() + REVIEW_INTERVAL_MS[status]).toISOString();
    await supabase.from("progress").upsert(
      {
        user_id: user.id,
        phoneme_id: phoneme.id,
        status,
        review_at: reviewAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,phoneme_id" }
    );
  }

  if (user === undefined || (user && loading)) {
    return <main className="min-h-screen flex items-center justify-center text-stone-500 bg-white">読み込み中...</main>;
  }
  if (user === null) return null;
  if (!phoneme) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
        <div>音素が見つかりません</div>
        <Link href="/" className="text-purple-600 underline">ホームに戻る</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-6 bg-white text-stone-800">
      <div className="mb-6">
        <Link href="/" className="text-sm text-stone-500 hover:text-purple-700">← ホーム</Link>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-4xl font-bold text-purple-900">{phoneme.symbol}</h1>
          {phoneme.type_label && (
            <span className="text-stone-500">{phoneme.type_label}</span>
          )}
        </div>
        <p className="text-stone-500 text-sm">{phoneme.condition}</p>
      </header>

      <div className="mb-6 p-4 rounded-2xl bg-purple-50 border border-purple-100">
        <div className="flex items-center gap-3">
          <label htmlFor="speed" className="text-sm text-stone-600 whitespace-nowrap">再生速度</label>
          <input
            id="speed"
            type="range"
            min="0.3"
            max="1.5"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="flex-1 accent-purple-500"
          />
          <span className="font-mono w-12 text-right text-stone-700">{speed.toFixed(1)}x</span>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        {words.map((w) => (
          <WordBlock
            key={w.id}
            word={w}
            speed={speed}
            playedSet={played[w.id] ?? new Set()}
            onPlayed={(idx) => markPlayed(w.id, idx)}
          />
        ))}
      </div>

      <Recorder onRate={setStatus} />
    </main>
  );
}

function WordBlock({
  word,
  speed,
  playedSet,
  onPlayed,
}: {
  word: Word;
  speed: number;
  playedSet: Set<number>;
  onPlayed: (speakerIndex: number) => void;
}) {
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const speakers = Array.from({ length: SPEAKER_COUNT }, (_, i) => i + 1);

  async function playSpeaker(idx: number) {
    warmupSpeech(); // no-op after first call; reduces latency on mobile
    cancelSpeech();
    setPlayingIdx(idx);
    await speakAsSpeaker({
      text: word.word,
      speakerIndex: idx,
      baseRate: speed,
      onEnd: () => {
        setPlayingIdx((p) => (p === idx ? null : p));
        onPlayed(idx);
      },
      onError: () => {
        setPlayingIdx((p) => (p === idx ? null : p));
      },
    });
  }

  return (
    <div className="p-5 rounded-2xl bg-white border border-purple-100">
      <div className="flex items-baseline gap-3 mb-4">
        <div className="text-3xl font-bold text-stone-900">{word.word}</div>
        <div className="text-stone-500 font-mono">{word.ipa}</div>
        <div className="ml-auto text-xs text-stone-400">
          {playedSet.size}/{SPEAKER_COUNT}
        </div>
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {speakers.map((idx) => {
          const isPlayed = playedSet.has(idx);
          const isPlaying = playingIdx === idx;
          return (
            <button
              key={idx}
              onClick={() => playSpeaker(idx)}
              className={`aspect-square rounded-lg text-sm font-semibold transition-colors border ${
                isPlaying
                  ? "bg-purple-600 text-white border-purple-700 animate-pulse"
                  : isPlayed
                  ? "bg-purple-300 text-white border-purple-400"
                  : "bg-stone-50 text-stone-500 border-stone-200 hover:border-purple-300"
              }`}
            >
              {idx}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Recorder({ onRate }: { onRate: (status: ReviewStatus) => Promise<void> }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<ReviewStatus | null>(null);
  const [saving, setSaving] = useState<ReviewStatus | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setSavedStatus(null);
    } catch {
      alert("マイクへのアクセスが拒否されました");
    }
  }

  function stop() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function rate(status: ReviewStatus) {
    setSaving(status);
    try {
      await onRate(status);
      setSavedStatus(status);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="p-5 rounded-2xl bg-purple-50 border border-purple-100">
      <h3 className="font-semibold mb-3 text-purple-900">自分の発音を録音</h3>
      <div className="flex items-center gap-3 mb-3">
        {!recording ? (
          <button
            onClick={start}
            className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold"
          >
            ● 録音開始
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-4 py-2 rounded-lg bg-stone-800 text-white text-sm font-semibold animate-pulse"
          >
            ■ 停止
          </button>
        )}
        <span className="text-xs text-stone-500">
          {recording ? "録音中..." : "ボタンを押して自分の発音を確認"}
        </span>
      </div>

      {audioUrl && (
        <audio src={audioUrl} controls className="w-full mb-4" />
      )}

      {audioUrl && !recording && (
        <div className="mt-3">
          <div className="text-xs text-stone-600 mb-2">自己評価（復習間隔）</div>
          <div className="grid grid-cols-3 gap-2">
            <RateButton
              label="One more"
              hint="1日後に復習"
              color="bg-red-500 hover:bg-red-600"
              active={savedStatus === "one_more"}
              saving={saving === "one_more"}
              onClick={() => rate("one_more")}
            />
            <RateButton
              label="Good"
              hint="3日後に復習"
              color="bg-orange-400 hover:bg-orange-500"
              active={savedStatus === "good"}
              saving={saving === "good"}
              onClick={() => rate("good")}
            />
            <RateButton
              label="Great"
              hint="3日後に復習"
              color="bg-yellow-300 hover:bg-yellow-400 !text-stone-800"
              active={savedStatus === "great"}
              saving={saving === "great"}
              onClick={() => rate("great")}
            />
          </div>
          {savedStatus && (
            <div className="text-xs text-purple-700 mt-2">
              ✓ 評価を保存しました
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RateButton({
  label,
  hint,
  color,
  active,
  saving,
  onClick,
}: {
  label: string;
  hint: string;
  color: string;
  active: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`rounded-xl p-3 text-white font-semibold transition-transform ${color} ${
        active ? "ring-4 ring-purple-300 scale-[1.02]" : ""
      } ${saving ? "opacity-60" : ""}`}
    >
      <div className="text-sm">{label}</div>
      <div className="text-[10px] opacity-90 font-normal mt-0.5">{hint}</div>
    </button>
  );
}
