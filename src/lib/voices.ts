"use client";

/**
 * 20 distinct voice profiles.
 *
 * Design goals:
 *  - Sound as human as possible (Web Speech API has limits, but...)
 *  - Still sound like 20 different people
 *
 * Approach:
 *  1. Use ALL available English voices (en-US, en-GB, en-AU, en-IN, en-CA, etc.)
 *     round-robin so each speaker gets a different base voice when possible.
 *  2. Prefer "Google" voices (much more natural than Microsoft default TTS).
 *  3. Keep pitch in a subtle natural range (0.85 – 1.15) to avoid
 *     the "chipmunk" or "robot" artifact that Web Speech produces when
 *     pitch is pushed far from 1.0.
 *  4. Vary rate modestly (0.9 – 1.05).
 *  5. Full volume — reducing volume doesn't make it sound different, just quiet.
 */

export type VoiceProfile = {
  gender: "F" | "M" | "any";
  pitch: number;   // 0.85 – 1.15 (subtle, natural)
  rateMul: number; // 0.9 – 1.05
};

/** 20 subtle-but-distinct profiles. The big differentiator is the voice itself. */
export const VOICE_PROFILES: VoiceProfile[] = [
  { gender: "F", pitch: 1.10, rateMul: 0.98 }, // 1
  { gender: "M", pitch: 0.92, rateMul: 0.95 }, // 2
  { gender: "F", pitch: 1.05, rateMul: 1.02 }, // 3
  { gender: "M", pitch: 0.88, rateMul: 1.00 }, // 4
  { gender: "F", pitch: 1.15, rateMul: 0.95 }, // 5
  { gender: "M", pitch: 0.95, rateMul: 1.05 }, // 6
  { gender: "F", pitch: 1.08, rateMul: 1.00 }, // 7
  { gender: "M", pitch: 0.90, rateMul: 0.98 }, // 8
  { gender: "F", pitch: 1.12, rateMul: 1.03 }, // 9
  { gender: "M", pitch: 0.93, rateMul: 0.92 }, // 10
  { gender: "F", pitch: 1.02, rateMul: 0.97 }, // 11
  { gender: "M", pitch: 0.87, rateMul: 1.02 }, // 12
  { gender: "F", pitch: 1.14, rateMul: 0.92 }, // 13
  { gender: "M", pitch: 0.96, rateMul: 1.00 }, // 14
  { gender: "F", pitch: 1.00, rateMul: 1.05 }, // 15
  { gender: "M", pitch: 0.89, rateMul: 0.95 }, // 16
  { gender: "F", pitch: 1.06, rateMul: 0.90 }, // 17
  { gender: "M", pitch: 0.94, rateMul: 1.03 }, // 18
  { gender: "F", pitch: 1.10, rateMul: 0.95 }, // 19
  { gender: "M", pitch: 0.91, rateMul: 1.00 }, // 20
];

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let cachedFemaleList: SpeechSynthesisVoice[] | null = null;
let cachedMaleList: SpeechSynthesisVoice[] | null = null;
let cachedEnList: SpeechSynthesisVoice[] | null = null;

async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices) return cachedVoices;
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

const FEMALE_HINTS = [
  "female", "zira", "samantha", "karen", "moira", "tessa", "victoria",
  "susan", "allison", "ava", "serena", "kate", "fiona", "veena",
  "aria", "jenny", "michelle", "emily", "catherine", "libby", "hazel",
  "salli", "joanna", "kendra", "ivy", "kimberly", "amy", "heera",
  "neerja", "raveena", "sabina", "linda", "heather",
];
const MALE_HINTS = [
  "male", "david", "mark", "fred", "alex", "daniel", "tom", "aaron",
  "oliver", "arthur", "gordon", "ralph", "bruce", "junior", "james",
  "ryan", "brian", "joey", "matthew", "justin", "rodger", "william", "guy",
  "george", "thomas", "hemant", "ravi", "lee", "liam",
];

function classify(voice: SpeechSynthesisVoice): "F" | "M" | "any" {
  const lower = voice.name.toLowerCase();
  if (FEMALE_HINTS.some((h) => lower.includes(h))) return "F";
  if (MALE_HINTS.some((h) => lower.includes(h))) return "M";
  // Heuristic: voices with "Google UK English Female" explicitly, etc.
  if (lower.includes("female")) return "F";
  if (lower.includes("male")) return "M";
  return "any";
}

/**
 * Quality score: prefer natural-sounding voices (Google Neural, Apple, etc.)
 * over Microsoft's default robotic TTS.
 */
function voiceQuality(voice: SpeechSynthesisVoice): number {
  const n = voice.name.toLowerCase();
  if (n.includes("google")) return 100;           // Google voices are the most natural
  if (n.includes("natural")) return 90;           // Microsoft "Natural" voices
  if (n.includes("neural")) return 90;
  if (n.includes("samantha")) return 80;          // Apple Samantha is natural
  if (n.includes("karen") || n.includes("moira")) return 75;
  if (n.includes("daniel") || n.includes("tessa") || n.includes("oliver")) return 75;
  if (n.includes("alex") || n.includes("victoria")) return 70;
  if (n.includes("microsoft")) return 30;         // default Windows TTS is robotic
  return 50;
}

async function prepareLists() {
  if (cachedEnList) return;
  const all = await loadVoices();
  const en = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  // Sort by quality descending so best voices are picked first
  en.sort((a, b) => voiceQuality(b) - voiceQuality(a));
  cachedEnList = en;
  cachedFemaleList = en.filter((v) => classify(v) === "F");
  cachedMaleList = en.filter((v) => classify(v) === "M");
}

/**
 * Deterministically pick a voice for this speakerIndex. The same
 * speakerIndex always gets the same voice across sessions.
 *
 * We spread speakers across the available pool using speakerIndex so each
 * speaker sounds as different from the others as possible.
 */
async function pickVoiceForSpeaker(
  speakerIndex: number,
  profile: VoiceProfile
): Promise<SpeechSynthesisVoice | null> {
  await prepareLists();
  const female = cachedFemaleList ?? [];
  const male = cachedMaleList ?? [];
  const all = cachedEnList ?? [];

  let pool: SpeechSynthesisVoice[];
  if (profile.gender === "F" && female.length > 0) pool = female;
  else if (profile.gender === "M" && male.length > 0) pool = male;
  else pool = all;

  if (pool.length === 0) pool = all;
  if (pool.length === 0) return null;

  const idx = (speakerIndex - 1) % pool.length;
  return pool[idx];
}

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
  const profile = VOICE_PROFILES[(speakerIndex - 1) % VOICE_PROFILES.length];
  const voice = await pickVoiceForSpeaker(speakerIndex, profile);

  const synth = window.speechSynthesis;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? "en-US";
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

export async function getVoiceStats() {
  await prepareLists();
  return {
    totalEnglish: cachedEnList?.length ?? 0,
    female: cachedFemaleList?.length ?? 0,
    male: cachedMaleList?.length ?? 0,
    voices: (cachedEnList ?? []).map((v) => ({
      name: v.name,
      lang: v.lang,
      quality: voiceQuality(v),
    })),
  };
}
