import { getRikma, levConfig, type LevConfig } from './lev';
import type { Rikma } from '$lib/types';

/**
 * The rikma's own details change rarely; one read every few minutes is
 * plenty, and it keeps every page from paying for it.
 */
const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; rikma: Rikma } | null = null;

export async function rikmaOf(cfg: LevConfig = levConfig()): Promise<Rikma> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rikma;
  const rikma = await getRikma(cfg);
  cached = { at: Date.now(), rikma };
  return rikma;
}

/** A short order number a person can read over the phone: `K7Q4XM`. */
export function newDisplayNumber(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
