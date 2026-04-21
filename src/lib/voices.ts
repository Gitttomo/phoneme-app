"use client";

/**
 * 20 distinct voice profiles.
 * Each speaker gets a unique combination of:
 *   - a different base voice (round-robin across all available English voices)
 *   - a unique pitch value (spread from 0.3 to 1.8)
 *   - a unique rate multiplier (spread from 0.85 to 1.2)
 *   - a small volume offset
 * When actual audio files are uploaded to Supabase Storage, this is bypassed.
 */
export type VoiceProfile = {
  gender: "F" | "M" | "any";
  pitch: number;     // 0.3 – 1.8
  rateMul: number;   // 0.85 – 1.2
  volume: number;    // 0.8 – 1.0
  voiceGroup: number; // 0..4, used to pick which voice from the pool
};

/** 20 carefully spread profiles so every speaker sounds different. */
export const VOICE_PROFILES: VoiceProfile[] = [
  { gender: "F", pitch: 1.80, rateMul: 0.95, volume: 1.00, voiceGroup: 0 }, // 1: very high female
  { gender: "M", pitch: 0.30, rateMul: 0.90, volume: 0.95, voiceGroup: 1 }, // 2: very low male
  { gender: "F", pitch: 1.55, rateMul: 1.10, volume: 0.92, voiceGroup: 2 }, // 3: high female fast
  { gender: "M", pitch: 0.55, rateMul: 1.15, volume: 1.00, voiceGroup: 3 }, // 4: low male fast
  { gender: "F", pitch: 1.35, rateMul: 0.88, volume: 0.85, voiceGroup: 0 }, // 5: mid-high female slow quiet
  { gender: "M", pitch: 0.75, rateMul: 1.00, volume: 0.90, voiceGroup: 1 }, // 6: mid-low male
  { gender: "F", pitch: 1.65, rateMul: 0.92, volume: 1.00, voiceGroup: 4 }, // 7: high female
  { gender: "M", pitch: 0.40, rateMul: 1.05, volume: 0.88, voiceGroup: 2 }, // 8: very low male
  { gender: "F", pitch: 1.20, rateMul: 1.18, volume: 0.95, voiceGroup: 3 }, // 9: mid female fast
  { gender: "M", pitch: 0.90, rateMul: 0.87, volume: 1.00, voiceGroup: 0 }, // 10: mid male slow
  { gender: "F", pitch: 1.75, rateMul: 1.00, volume: 0.90, voiceGroup: 1 }, // 11: very high female
  { gender: "M", pitch: 0.60, rateMul: 0.93, volume: 1.00, voiceGroup: 4 }, // 12: low male
  { gender: "F", pitch: 1.45, rateMul: 1.12, volume: 0.85, voiceGroup: 2 }, // 13: high-mid female fast
  { gender: "M", pitch: 0.70, rateMul: 1.08, volume: 0.93, voiceGroup: 3 }, // 14: low-mid male
  { gender: "F", pitch: 1.10, rateMul: 0.90, volume: 1.00, voiceGroup: 0 }, // 15: mid female slow
  { gender: "M", pitch: 0.50, rateMul: 1.00, volume: 0.90, voiceGroup: 1 }, // 16: low male
  { gender: "F", pitch: 1.30, rateMul: 1.05, volume: 0.88, voiceGroup: 4 }, // 17: mid female
  { gender: "M", pitch: 0.80, rateMul: 0.95, volume: 1.00, voiceGroup: 2 }, // 18: mid male
  { gender: "F", pitch: 1.00, rateMul: 1.20, volume: 0.92, voiceGroup: 3 }, // 19: mid female very fast
  { gender: "M", pitch: 0.35, rateMul: 0.98, volume: 1.00, voiceGroup: 0 }, // 20: very low male
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
      setTimeout(resolve, 1200);
    });
    voices = synth.getVoices();
  }
  cachedVoices = voices;
  return voices;
}

const FEMALE_NAME_HINTS = [
  "female", "zira", "samantha", "karen", "moira", "tessa", "victoria",
  "susan", "allison", "ava", "serena", "kate", "fiona", "veena",
  "rishi", "aria", "jenny", "michelle", "emily", "catherine", "libby",
  "hazel", "salli", "joanna", "kendra", "ivy", "kimberly",
];
const MALE_NAME_HINTS = [
  "male", "david", "mark", "fred", "alex", "daniel", "tom", "aaron",
  "oliver", "arthur", "gordon", "ralph", "bruce", "junior", "james",
  "ryan", "brian", "joey", "matthew", "justin", "rodger", "william", "guy",
];

function classify(voice: SpeechSynthesisVoice): "F" | "M" | "any" {
  const lower = voice.name.toLowerCase();
  if (FEMALE_NAME_HINTS.some((h) => lower.includes(h))) return "F";
  if (MALE_NAME_HINTS.some((h) => lower.includes(h))) return "M";
  return "any";
}

async function prepareLists() {
  if (cachedEnList) return;
  const all = await loadVoices();
  const en = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  cachedEnList = en;
  cachedFemaleList = en.filter((v) => classify(v) === "F");
  cachedMaleList = en.filter((v) => classify(v) === "M");
}

/**
 * Pick a voice for this speaker. Each speakerIndex deterministically maps to
 * a specific voice (round-robin within the gendered pool), so the same
 * speaker always sounds the same across sessions.
 */
async function pickVoiceForSpeaker(
  speakerIndex: number,
  profile: VoiceProfile
): Promise<SpeechSynthesisVoice | null> {
  await prepareLists();
  const female = cachedFemaleList ?? [];
  const male = cachedMaleList ?? [];
  const any = cachedEnList ?? [];

  // Try the gendered pool first
  let pool: SpeechSynthesisVoice[] = [];
  if (profile.gender === "F" && female.length > 0) pool = female;
  else if (profile.gender === "M" && male.length > 0) pool = male;
  else pool = any;

  if (pool.length === 0) pool = any;
  if (pool.length === 0) return null;

  // Distribute speakers across the pool using speakerIndex (1..20)
  // so even if pool has only 1 voice, pitch/rate variations make them distinct.
  const idx = (speakerIndex - 1) % pool.length;
  return pool[idx];
}

/**
 * Speak a word using the voice profile for the given speaker index (1..20).
 * `baseRate` is the user-selected playback speed (0.3–1.5).
 */
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
  // Note: browsers clamp pitch to [0, 2] and rate to [0.1, 10].
  u.pitch = Math.max(0, Math.min(2, profile.pitch));
  u.rate = Math.max(0.1, Math.min(10, baseRate * profile.rateMul));
  u.volume = Math.max(0, Math.min(1, profile.volume));
  u.onend = () => onEnd?.();
  u.onerror = () => onError?.();
  synth.speak(u);
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Diagnostic: returns available voice counts. Useful for debugging.
 */
export async function getVoiceStats() {
  await prepareLists();
  return {
    totalEnglish: cachedEnList?.length ?? 0,
    female: cachedFemaleList?.length ?? 0,
    male: cachedMaleList?.length ?? 0,
  };
}
