import type { HandState, PlayerId, PotShare } from './types';

type SolvableHand = {
  name: string;
  descr: string;
  rank: number;
};

type PokerSolverModule = {
  Hand: {
    solve(cards: string[]): SolvableHand;
    winners(hands: SolvableHand[]): SolvableHand[];
  };
};

let solver: PokerSolverModule | null = null;

async function loadSolver(): Promise<PokerSolverModule> {
  if (solver) return solver;
  solver = (await import('pokersolver')) as unknown as PokerSolverModule;
  return solver;
}

export async function calculateShowdownSettlement(hand: HandState): Promise<PotShare[]> {
  const poker = await loadSolver();
  return calculateSettlementWithWinner(hand, (eligible) => {
    const solved = eligible.map((playerId) => ({
      playerId,
      hand: poker.Hand.solve([
        ...(hand.showdownCards[playerId] ?? hand.holeCards[playerId] ?? []),
        ...hand.board,
      ]),
    }));
    const winners = poker.Hand.winners(solved.map((entry) => entry.hand));
    return solved.filter((entry) => winners.includes(entry.hand)).map((entry) => entry.playerId);
  });
}

export function calculateSettlement(hand: HandState): PotShare[] {
  return calculateSettlementWithWinner(hand, (eligible) => {
    const openCards = eligible.filter(
      (playerId) => (hand.showdownCards[playerId] ?? hand.holeCards[playerId])?.length === 2,
    );
    return openCards.length > 0 ? [openCards[0]] : [eligible[0]];
  });
}

function calculateSettlementWithWinner(
  hand: HandState,
  chooseWinners: (eligible: PlayerId[]) => PlayerId[],
): PotShare[] {
  const entries = Object.entries(hand.contributions)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => a[1] - b[1]);
  const levels = [...new Set(entries.map(([, amount]) => amount))].sort((a, b) => a - b);
  let previous = 0;
  const shares: PotShare[] = [];
  levels.forEach((level, index) => {
    const contributors = entries
      .filter(([, amount]) => amount >= level)
      .map(([playerId]) => playerId);
    const eligible = contributors.filter((playerId) => !hand.folded.has(playerId));
    const potAmount = (level - previous) * contributors.length;
    previous = level;
    if (potAmount <= 0 || eligible.length === 0) return;
    const winners = chooseWinners(eligible);
    const base = Math.floor(potAmount / winners.length);
    let remainder = potAmount - base * winners.length;
    for (const playerId of winners) {
      shares.push({
        playerId,
        amount: base + (remainder-- > 0 ? 1 : 0),
        potName: index === 0 ? 'main' : `side ${index}`,
      });
    }
  });
  return mergeShares(shares);
}

function mergeShares(shares: PotShare[]): PotShare[] {
  const grouped = new Map<string, PotShare>();
  for (const share of shares) {
    const key = `${share.playerId}:${share.potName}`;
    const existing = grouped.get(key);
    if (existing) existing.amount += share.amount;
    else grouped.set(key, { ...share });
  }
  return [...grouped.values()];
}
