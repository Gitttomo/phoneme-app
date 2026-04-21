import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon, {
  auth: { persistSession: false },
});

export type Phoneme = {
  id: number;
  slug: string;
  symbol: string;
  type_label: string | null;
  condition: string;
  sort_order: number;
};

export type Word = {
  id: number;
  phoneme_id: number;
  word: string;
  ipa: string;
  position: number;
};

export type ShareCode = {
  id: string;
  code: string;
  display_name: string | null;
};

export type ReviewStatus = "one_more" | "good" | "great";

export type Progress = {
  id: number;
  share_code_id: string;
  phoneme_id: number;
  status: ReviewStatus | null;
  review_at: string | null;
  updated_at: string;
};

export type SpeakerPlay = {
  id: number;
  share_code_id: string;
  word_id: number;
  speaker_index: number;
  played_at: string;
};
