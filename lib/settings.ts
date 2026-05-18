import {
  getStoredApiKey as dbGetStored,
  setStoredApiKey as dbSetStored,
} from "@/lib/db";

/** Prefer server env for ops; UI-stored key for team convenience. */
export function getEffectiveKieApiKey(): string | null {
  const fromEnv = process.env.KIE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return dbGetStored()?.trim() || null;
}

export function getStoredApiKey(): string | null {
  return dbGetStored();
}

export function setStoredApiKey(key: string) {
  dbSetStored(key);
}
