import type { CardCode } from './types';

const RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
const SUITS = new Set(['c', 'd', 'h', 's']);

export function normalizeCards(input: string): CardCode[] {
  const compact = input.replace(/\s+/g, '').replace(/10/g, 'T');
  if (compact.length === 0) return [];
  if (compact.length % 2 !== 0) throw new Error('Cards must use two-character codes like AhKd.');
  const cards: CardCode[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    const rank = compact[i].toUpperCase();
    const suit = compact[i + 1].toLowerCase();
    if (!RANKS.has(rank) || !SUITS.has(suit))
      throw new Error(`Invalid card code ${compact.slice(i, i + 2)}.`);
    cards.push(`${rank}${suit}`);
  }
  const unique = new Set(cards);
  if (unique.size !== cards.length) throw new Error('Duplicate cards are not allowed.');
  return cards;
}

export function formatCards(cards: CardCode[]): string {
  return cards.join(' ');
}
