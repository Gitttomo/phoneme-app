"use client";

/**
 * 20 distinct voice personas.
 *
 * Each speaker is a combination of:
 *  - gender intent (F/M)
 *  - personality (bright, serious, calm, cheerful, etc.)
 *  - explicit pitch + rate profile
 *
 * Key design decisions:
 *  - On mobile (especially iOS), the browser usually only provides a few
 *    English voices (often female-heavy). So we use aggressive pitch
 *    differences — males get pitch 0.55–0.85 (sounds masculine even on a
 *    female voice), females get 1.05–1.45.
 *  - Personality is encoded as pitch × rate combinations so each speaker
 *    sounds different even if forced to use the same base voice.
 *  - Volume is kept at 1.0 (reducing it makes voices quieter, not distinct).
 */

export type Personality =
  | "bright"    // 明るい
  | "cheerful"  // 陽気
  | "serious"   // 真面目
  | "calm"      // 落ち着いた
  | "energetic" // エネルギッシュ
  | "warm"      // 親しみやすい
  | "formal"    // フォーマル
  | "youthful"  // 若々しい
  | "mature"    // 大人びた
  | "gentle";   // 穏やか

export type VoiceProfile = {
  gender: "F" | "M";
  personality: Personality;
  pitch: number;
  rateMul: number;
};

/**
 * 20 hand-tuned profiles: 10 female, 10 male.
 *
 * Pitch range is deliberately wide (0.45–1.45) so that even on iOS where
 * only ONE voice (Samantha) exists, each speaker sounds clearly different.
 * The human ear can reliably distinguish pitch steps of ~0.10+.
 * Rate variation adds extra character beyond pitch alone.
 */
export const VOICE_PROFILES: VoiceProfile[] = [
  // Female speakers (odd indexes 1,3,5,7,9,11,13,15,17,19)
  { gender: "F", personality: "bright",    pitch: 1.45, rateMul: 1.06 }, // 1
  { gender: "M", personality: "serious",   pitch: 0.50, rateMul: 0.90 }, // 2
  { gender: "F", personality: "cheerful",  pitch: 1.35, rateMul: 1.12 }, // 3
  { gender: "M", personality: "calm",      pitch: 0.62, rateMul: 0.88 }, // 4
  { gender: "F", personality: "formal",    pitch: 1.18, rateMul: 0.94 }, // 5
  { gender: "M", personality: "warm",      pitch: 0.74, rateMul: 1.02 }, // 6
  { gender: "F", personality: "youthful",  pitch: 1.40, rateMul: 1.10 }, // 7
  { gender: "M", personality: "mature",    pitch: 0.45, rateMul: 0.86 }, // 8
  { gender: "F", personality: "warm",      pitch: 1.10, rateMul: 0.97 }, // 9
  { gender: "M", personality: "cheerful",  pitch: 0.88, rateMul: 1.10 }, // 10

  // 11–20
  { gender: "F", personality: "energetic", pitch: 1.45, rateMul: 1.14 }, // 11
  { gender: "M", personality: "gentle",    pitch: 0.80, rateMul: 0.93 }, // 12
  { gender: "F", personality: "gentle",    pitch: 1.05, rateMul: 0.90 }, // 13
  { gender: "M", personality: "bright",    pitch: 0.68, rateMul: 1.06 }, // 14
  { gender: "F", personality: "mature",    pitch: 1.00, rateMul: 0.88 }, // 15
  { gender: "M", personality: "formal",    pitch: 0.55, rateMul: 0.94 }, // 16
  { gender: "F", personality: "serious",   pitch: 1.08, rateMul: 0.92 },
  { gender: "M", personality: "energetic", pitch: 0.80, rateMul: 1.10 },
  { gender: "F", personality: "calm",      pitch: 1.12, rateMul: 0.90 },
  { gender: "M", personality: "youthful",  pitch: 0.92, rateMul: 1.05 },
];

// ── Voice pool caching ──────────────────────────────────────────────

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let cachedUsEnglish: SpeechSynthesisVoice[] | null = null;
let cachedFemalePool: SpeechSynthesisVoice[] | null = null;
let cachedMalePool: SpeechSynthesisVoice[] | null = null;

/** Fire voice loading as early as possible (called on page mount). */
export function preloadVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  // Trigger the voices-changed event
  window.speechSynthesis.getVoices();
  void loadVoices();
}

async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices && cachedVoices.length > 0) return cachedVoices;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];

  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      const handler = () => {
        synth.removeEventListener("voiceschanged", handler);
        resolve();
      };
      synth.addEventListener("voiceschanged", handler);
      setTimeout(resolve, 1500);
    });
    voices = synth.getVoices();
  }
  cachedVoices = voices;
  return voices;
}

// ── Gender heuristics ──────────────────────────────────────────────

const FEMALE_HINTS = [
  "female", "zira", "samantha", "karen", "moira", "tessa", "victoria",
  "susan", "allison", "ava", "serena", "kate", "fiona", "veena",
  "aria", "jenny", "michelle", "emily", "catherine", "libby", "hazel",
  "salli", "joanna", "kendra", "ivy", "kimberly", "amy", "heera",
  "neerja", "raveena", "linda", "heather", "vicki", "princess", "whisper",
];
const MALE_HINTS = [
  "male", "david", "mark", "fred", "alex", "daniel", "tom", "aaron",
  "junior", "james", "ryan", "brian", "joey", "matthew", "justin",
  "rodger", "william", "guy", "thomas", "hemant", "ravi", "albert",
  "bruce", "ralph", "reed", "boing", "bubbles", "bahh", "deranged",
];

function classify(voice: SpeechSynthesisVoice): "F" | "M" | "any" {
  const n = voice.name.toLowerCase();
  if (FEMALE_HINTS.some((h) => n.includes(h)) || n.includes("female")) return "F";
  if (MALE_HINTS.some((h) => n.includes(h)) || n.includes(" male")) return "M";
  return "any";
}

function voiceQuality(voice: SpeechSynthesisVoice): number {
  const n = voice.name.toLowerCase();
  if (n.includes("google")) return 100;
  if (n.includes("natural") || n.includes("neural")) return 90;
  if (n.includes("samantha")) return 85;
  if (n.includes("alex")) return 85;
  if (n.includes("karen")) return 80;
  if (n.includes("daniel")) return 78;
  if (n.includes("moira") || n.includes("tessa") || n.includes("oliver")) return 75;
  if (n.includes("microsoft")) return 30;
  return 50;
}

function isAmericanEnglish(voice: SpeechSynthesisVoice): boolean {
  const lang = voice.lang.toLowerCase().replace("_", "-");
  if (lang === "en-us") return true;
  const n = voice.name.toLowerCase();
  if (lang.startsWith("en") && !lang.includes("-")) {
    return n.includes("us english") || n.includes("united states") || n.includes("american");
  }
  return false;
}

async function prepareLists() {
  if (cachedUsEnglish && cachedUsEnglish.length > 0) return;
  const all = await loadVoices();
  const us = all.filter(isAmericanEnglish);
  us.sort((a, b) => voiceQuality(b) - voiceQuality(a));
  cachedUsEnglish = us;
  cachedFemalePool = us.filter((v) => classify(v) === "F");
  cachedMalePool = us.filter((v) => classify(v) === "M");
}

/** Pick a base voice for a speaker deterministically. */
async function pickVoice(speakerIndex: number, gender: "F" | "M"): Promise<SpeechSynthesisVoice | null> {
  await prepareLists();
  const all = cachedUsEnglish ?? [];
  const genderPool = gender === "F" ? (cachedFemalePool ?? []) : (cachedMalePool ?? []);

  // If we have a gendered pool, use it. Otherwise fall back to any en-US voice.
  const pool = genderPool.length > 0 ? genderPool : all;
  if (pool.length === 0) return null;

  // Use the speaker index (divided appropriately) to distribute across the pool.
  // Male speakers get slots 0..9, female speakers get slots 0..9, so we map
  // the 20-wide speakerIndex down to 0..9 for each gender.
  const sameGenderSpeakers = VOICE_PROFILES
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.gender === gender)
    .map(({ i }) => i + 1);
  const slot = sameGenderSpeakers.indexOf(speakerIndex);
  const idx = (slot >= 0 ? slot : speakerIndex - 1) % pool.length;
  return pool[idx];
}

// ── Warmup ──────────────────────────────────────────────

let warmedUp = false;

/**
 * On iOS/Android, the FIRST speak call can take 500ms–1.5s to produce sound.
 * We "warm up" the engine by speaking a silent utterance on the first user
 * interaction. After that, subsequent calls are immediate.
 *
 * This MUST be triggered by a user gesture (click/tap) to satisfy autoplay
 * policies.
 */
export function warmupSpeech() {
  if (warmedUp) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;   // silent
    u.rate = 2.0;   // as fast as possible
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    warmedUp = true;
  } catch {
    /* ignore */
  }
}

// ── Main speak function ──────────────────────────────────────────────

export async function speakAsSpeaker(opts: {
  text: string;
  speakerIndex: number; // 1..20
  baseRate: number;
  onEnd?: () => void;
  onError?: () => void;
}): Promise<void> {
  const { text, speakerIndex, baseRate, onEnd, onError } = opts;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onError?.();
    return;
  }
  warmupSpeech();

  const profile = VOICE_PROFILES[(speakerIndex - 1) % VOICE_PROFILES.length];
  const voice = await pickVoice(speakerIndex, profile.gender);

  const synth = window.speechSynthesis;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; // force American English even when falling back
  if (voice) u.voice = voice;
  u.pitch = Math.max(0, Math.min(2, profile.pitch));
  u.rate = Math.max(0.1, Math.min(10, baseRate * profile.rateMul));
  u.volume = 1.0;
  u.onend = () => onEnd?.();
  u.onerror = () => onError?.();
  synth.speak(u);
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** Look up personality label for a speaker (1..20), optional UI use. */
export function getPersonality(speakerIndex: number): { gender: "F" | "M"; personality: Personality } {
  const p = VOICE_PROFILES[(speakerIndex - 1) % VOICE_PROFILES.length];
  return { gender: p.gender, personality: p.personality };
}

export async function getVoiceStats() {
  await prepareLists();
  return {
    total: cachedUsEnglish?.length ?? 0,
    female: cachedFemalePool?.length ?? 0,
    male: cachedMalePool?.length ?? 0,
    voices: (cachedUsEnglish ?? []).map((v) => ({ name: v.name, lang: v.lang })),
  };
}
