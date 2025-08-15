export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
export type Card = `${Rank}${Suit}`;

export const RANKS: Rank[] = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
export const SUITS: Suit[] = ["♠","♥","♦","♣"];

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(`${r}${s}` as Card);
  return d;
}

// deterministic shuffle from seed (simple LCG for now)
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => (x = (1664525 * x + 1013904223) >>> 0);
}
export function shuffle(deck: Card[], seed: string): Card[] {
  const next = lcg(hash(seed));
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function suitOf(card: Card): Suit {
  return card.slice(-1) as Suit;
}
export function rankIndex(card: Card): number {
  return RANKS.indexOf(card.slice(0, card.length - 1) as Rank);
}
