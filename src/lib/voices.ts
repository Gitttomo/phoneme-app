"use client";

/**
 * 20 distinct voice profiles.
 * Mix of male/female with varied pitch and rate to sound like 20 people.
 * When actual audio files are uploaded to Supabase Storage, this is bypassed.
 */
export type VoiceProfile = {
  gender: "F" | "M";
  pitch: number; // 0.5 – 1.5
  rateMul: number; // multiplier applied on top of user-selected rate
};

export const VOICE_PROFILES: VoiceProfile[] = [
  { gender: "F", pitch: 1.35, rateMul: 1.0 },
  { gender: "M", pitch: 0.75, rateMul: 0.95 },
  { gender: "F", pitch: 1.15, rateMul: 1.05 },
  { gender: "M", pitch: 0.9, rateMul: 1.0 },
  { gender: "F", pitch: 1.5, rateMul: 1.1 },
  { gender: "M", pitch: 0.6, rateMul: 1.05 },
  { gender: "F", pitch: 1.25, rateMul: 0.95 },
  { gender: "M", pitch: 0.85, rateMul: 0.9 },
  { gender: "F", pitch: 1.45, rateMul: 1.0 },
  { gender: "M", pitch: 1.0, rateMul: 1.1 },
  { gender: "F", pitch: 1.2, rateMul: 0.9 },
  { gender: "M", pitch: 0.7, rateMul: 1.0 },
  { gender: "F", pitch: 1.4, rateMul: 1.0 },
  { gender: "M", pitch: 0.8, rateMul: 1.1 },
  { gender: "F", pitch: 1.3, rateMul: 0.95 },
  { gender: "M", pitch: 0.65, rateMul: 1.0 },
  { gender: "F", pitch: 1.1, rateMul: 1.05 },
  { gender: "M", pitch: 0.95, rateMul: 0.9 },
  { gender: "F", pitch: 1.05, rateMul: 1.0 },
  { gender: "M", pitch: 0.55, rateMul: 1.05 },
];

let cachedVoices: SpeechSynthesisVoice[] | null = null;

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
      setTimeout(resolve, 800);
    });
    voices = synth.getVoices();
  }
  cachedVoices = voices;
  return voices;
}

function isFemaleName(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.includes("female") ||
    lower.includes("zira") ||
    lower.includes("samantha") ||
    lower.includes("karen") ||
    lower.includes("moira") ||
    lower.includes("tessa") ||
    lower.includes("victoria") ||
    lower.includes("susan") ||
    lower.includes("allison") ||
    lower.includes("ava")
  );
}

function isMaleName(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.includes("male") ||
    lower.includes("david") ||
    lower.includes("mark") ||
    lower.includes("fred") ||
    lower.includes("alex") ||
    lower.includes("daniel") ||
    lower.includes("tom") ||
    lower.includes("aaron")
  );
}

async function pickVoice(gender: "F" | "M"): Promise<SpeechSynthesisVoice | null> {
  const all = await loadVoices();
  const english = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (english.length === 0) return null;

  const genderMatch = english.filter((v) =>
    gender === "F" ? isFemaleName(v.name) : isMaleName(v.name)
  );
  if (genderMatch.length > 0) {
    // Prefer en-US > en-GB > other en
    const us = genderMatch.filter((v) => v.lang.toLowerCase() === "en-us");
    return (us[0] ?? genderMatch[0]) ?? null;
  }
  // Fallback: any English voice
  return english[0] ?? null;
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
  const voice = await pickVoice(profile.gender);

  const synth = window.speechSynthesis;
  synth.cancel(); // stop any previous utterance

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (voice) u.voice = voice;
  u.pitch = Math.max(0, Math.min(2, profile.pitch));
  u.rate = Math.max(0.1, Math.min(10, baseRate * profile.rateMul));
  u.onend = () => onEnd?.();
  u.onerror = () => onError?.();
  synth.speak(u);
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
