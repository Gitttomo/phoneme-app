"use client";

import { supabase, type ShareCode } from "./supabase";

const STORAGE_KEY = "phoneme_app_share_code";

function randomCode(len = 10) {
  const chars = "abcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

/** Get or create a share code for this browser. */
export async function getOrCreateShareCode(): Promise<ShareCode> {
  // 1. URL parameter takes priority (when user opens a shared link)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode) {
      const sc = await fetchOrCreateByCode(urlCode);
      localStorage.setItem(STORAGE_KEY, sc.code);
      return sc;
    }
  }

  // 2. Fallback to localStorage
  const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored) {
    const sc = await fetchOrCreateByCode(stored);
    return sc;
  }

  // 3. Create a new code
  const code = randomCode();
  const { data, error } = await supabase
    .from("share_codes")
    .insert({ code })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("failed to create share code");
  localStorage.setItem(STORAGE_KEY, code);
  return data as ShareCode;
}

async function fetchOrCreateByCode(code: string): Promise<ShareCode> {
  const { data } = await supabase
    .from("share_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (data) return data as ShareCode;

  const { data: inserted, error } = await supabase
    .from("share_codes")
    .insert({ code })
    .select()
    .single();
  if (error || !inserted) throw error ?? new Error("failed to create share code");
  return inserted as ShareCode;
}
