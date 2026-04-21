"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { use as usePromise } from "react";
import { supabase, type Phoneme, type ShareCode, type Word } from "@/lib/supabase";
import { getOrCreateShareCode } from "@/lib/shareCode";

const SPEAKER_COUNT = 20;

type Params = { slug: string };

export default function PhonemePage({ params }: { params: Promise<Params> }) {
  const { slug } = usePromise(params);
  const [phoneme, setPhoneme] = useState<Phoneme | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [shareCode, setShareCode] = useState<ShareCode | null>(null);
  const [isGood, setIsGood] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sc = await getOrCreateShareCode();
      setShareCode(sc);

      const { data: ph } = await supabase
        .from("phonemes").select("*").eq("slug", slug).single();
      if (!ph) { setLoading(false); return; }
      setPhoneme(ph as Phoneme);

      const [{ data: ws }, { data: prog }] = await Promise.all([
        supabase.from("words").select("*").eq("phoneme_id", (ph as Phoneme).id).order("position"),
        supabase.from("progress").select("*")
          .eq("share_code_id", sc.id).eq("phoneme_id", (ph as Phoneme).id).maybeSingle(),
      ]);
      setWords((ws ?? []) as Word[]);
      setIsGood(prog?.is_good ?? false);
      setLoading(false);
    })();
  }, [slug]);

  async function toggleGood() {
    if (!phoneme || !shareCode) return;
    const newVal = !isGood;
    setIsGood(newVal);
    await supabase.from("progress").upsert(
      {
        share_code_id: shareCode.id,
        phoneme_id: phoneme.id,
        is_good: newVal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "share_code_id,phoneme_id" }
    );
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-300">読み込み中...</main>;
  }
  if (!phoneme) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div>音素が見つかりません</div>
        <Link href="/" className="text-emerald-400 underline">ホームに戻る</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">← ホーム</Link>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-4xl font-bold">{phoneme.symbol}</h1>
          {phoneme.type_label && (
            <span className="text-slate-400">{phoneme.type_label}</span>
          )}
          <button
            onClick={toggleGood}
            className={`ml-auto px-4 py-2 rounded-xl font-semibold text-sm transition-colors ${
              isGood
                ? "bg-emerald-500 text-slate-900"
                : "bg-slate-700 text-slate-200 hover:bg-slate-600"
            }`}
          >
            {isGood ? "✓ Good" : "Good にする"}
          </button>
        </div>
        <p className="text-slate-400 text-sm">{phoneme.condition}</p>
      </header>

      <div className="mb-6 p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
        <div className="flex items-center gap-3">
          <label htmlFor="speed" className="text-sm text-slate-400">再生速度</label>
          <input
            id="speed"
            type="range"
            min="0.3"
            max="1.5"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="flex-1 accent-emerald-400"
          />
          <span className="font-mono w-12 text-right">{speed.toFixed(1)}x</span>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        {words.map((w) => (
          <WordBlock key={w.id} phonemeSlug={phoneme.slug} word={w} speed={speed} />
        ))}
      </div>

      <Recorder />
    </main>
  );
}

function WordBlock({ phonemeSlug, word, speed }: { phonemeSlug: string; word: Word; speed: number }) {
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakers = Array.from({ length: SPEAKER_COUNT }, (_, i) => i + 1);

  function audioUrl(idx: number) {
    // Supabase public bucket URL
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${base}/storage/v1/object/public/phoneme-audio/${phonemeSlug}/${word.word}/${idx}.mp3`;
  }

  async function playSpeaker(idx: number) {
    // fallback to Web Speech API if audio file not found
    try {
      const audio = new Audio(audioUrl(idx));
      audio.playbackRate = speed;
      audioRef.current?.pause();
      audioRef.current = audio;
      setPlayingIdx(idx);
      audio.onended = () => setPlayingIdx((p) => (p === idx ? null : p));
      await audio.play();
    } catch {
      speakFallback(word.word, speed);
      setPlayingIdx(null);
    }
  }

  async function playAll() {
    for (const idx of speakers) {
      await new Promise<void>((resolve) => {
        const audio = new Audio(audioUrl(idx));
        audio.playbackRate = speed;
        audioRef.current?.pause();
        audioRef.current = audio;
        setPlayingIdx(idx);
        const done = () => { setPlayingIdx(null); resolve(); };
        audio.onended = done;
        audio.onerror = () => {
          // fallback to TTS once, then move on
          speakFallback(word.word, speed, resolve);
        };
        audio.play().catch(() => speakFallback(word.word, speed, resolve));
      });
    }
  }

  return (
    <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700">
      <div className="flex items-baseline gap-3 mb-4">
        <div className="text-3xl font-bold">{word.word}</div>
        <div className="text-slate-400 font-mono">{word.ipa}</div>
        <button
          onClick={playAll}
          className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400"
        >
          ▶ 全員再生
        </button>
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {speakers.map((idx) => (
          <button
            key={idx}
            onClick={() => playSpeaker(idx)}
            className={`aspect-square rounded-lg text-sm font-semibold transition-colors ${
              playingIdx === idx
                ? "bg-emerald-500 text-slate-900"
                : "bg-slate-700 hover:bg-slate-600"
            }`}
          >
            {idx}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        ※ 音声未アップロード時はブラウザのTTSで代替再生します
      </p>
    </div>
  );
}

function speakFallback(text: string, rate: number, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) { onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

function Recorder() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
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
    } catch (e) {
      alert("マイクへのアクセスが拒否されました");
    }
  }

  function stop() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  return (
    <section className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700">
      <h3 className="font-semibold mb-3">自分の発音を録音</h3>
      <div className="flex items-center gap-3 mb-3">
        {!recording ? (
          <button
            onClick={start}
            className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold"
          >
            ● 録音開始
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-4 py-2 rounded-lg bg-slate-200 text-slate-900 text-sm font-semibold animate-pulse"
          >
            ■ 停止
          </button>
        )}
        <span className="text-xs text-slate-400">
          {recording ? "録音中..." : "ボタンを押して自分の発音を確認"}
        </span>
      </div>
      {audioUrl && (
        <audio src={audioUrl} controls className="w-full" />
      )}
    </section>
  );
}
