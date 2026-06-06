import { normalizeCards } from './cards';
import { calculateShowdownSettlement } from './settlement';
import type { AppState, ChipAmount, DomainEvent, LegalAction, Preset, SeatId } from './types';
import { ensureHand, orderSeats, requireSeatPlayer } from './reducer';

export function createPreset(input: Omit<Preset, 'id'>): DomainEvent {
  return { type: 'PresetCreated', preset: { ...input, id: makeId('preset') } };
}

export function updatePreset(preset: Preset): DomainEvent {
  return { type: 'PresetUpdated', preset };
}

export function deletePreset(presetId: string): DomainEvent {
  return { type: 'PresetDeleted', presetId };
}

export function startSession(
  presetId: string,
  seats: Array<{ seatId: SeatId; name: string; stack: ChipAmount }>,
  heroSeatId: SeatId,
): DomainEvent {
  return { type: 'SessionStarted', presetId, seats, heroSeatId };
}

export function sitIn(seatId: SeatId, name: string, stack: ChipAmount): DomainEvent {
  return { type: 'PlayerSatIn', seatId, playerId: makeId('player'), name, stack };
}

export function leaveSeat(seatId: SeatId, cashOut: ChipAmount): DomainEvent {
  return { type: 'PlayerLeft', seatId, cashOut };
}

export function adjustStack(
  playerId: string,
  amount: ChipAmount,
  reason: 'top-up' | 'cash-out',
): DomainEvent {
  return { type: 'StackAdjusted', playerId, amount, reason };
}

export function moveSeat(fromSeatId: SeatId, toSeatId: SeatId): DomainEvent {
  return { type: 'SeatMoved', fromSeatId, toSeatId };
}

export function changeHeroSeat(seatId: SeatId): DomainEvent {
  return { type: 'HeroSeatChanged', seatId };
}

export function startHand(buttonSeat: SeatId): DomainEvent {
  return { type: 'HandStarted', handId: makeId('hand'), buttonSeat };
}

export function recordHoleCards(playerId: string, input: string): DomainEvent {
  const cards = normalizeCards(input);
  if (cards.length !== 2) throw new Error('Hole cards require exactly two cards.');
  return { type: 'HoleCardsRecorded', playerId, cards };
}

export function dealBoard(input: string): DomainEvent {
  return { type: 'BoardCardsDealt', cards: normalizeCards(input) };
}

export function revealShowdown(playerId: string, input: string): DomainEvent {
  const cards = normalizeCards(input);
  if (cards.length !== 2) throw new Error('Showdown cards require exactly two cards.');
  return { type: 'ShowdownCardsRevealed', playerId, cards };
}

export async function settleShowdown(state: AppState): Promise<DomainEvent> {
  return { type: 'HandSettled', shares: await calculateShowdownSettlement(ensureHand(state)) };
}

export function legalActions(state: AppState, seatId: SeatId): LegalAction[] {
  const hand = ensureHand(state);
  const playerId = requireSeatPlayer(state, seatId);
  const player = state.players[playerId];
  if (nextActorPlayerId(state) !== playerId) return [];
  if (
    hand.folded.has(playerId) ||
    hand.allIn.has(playerId) ||
    player.stack <= 0 ||
    hand.street === 'showdown'
  )
    return [];
  const maxBet = Math.max(...Object.values(hand.streetContributions));
  const playerBet = hand.streetContributions[playerId] ?? 0;
  const toCall = Math.max(0, maxBet - playerBet);
  const actions: LegalAction[] = [];
  if (toCall === 0) {
    actions.push({ kind: 'check', minAmount: 0, callAmount: 0, label: 'Check' });
    if (player.stack > 0) actions.push({ kind: 'bet', minAmount: 1, callAmount: 0, label: 'Bet' });
  } else {
    actions.push({ kind: 'fold', minAmount: 0, callAmount: toCall, label: 'Fold' });
    actions.push({
      kind: 'call',
      minAmount: Math.min(toCall, player.stack),
      callAmount: toCall,
      label: `Call ${toCall}`,
    });
    if (player.stack > toCall) {
      actions.push({ kind: 'raise', minAmount: toCall + 1, callAmount: toCall, label: 'Raise' });
    }
  }
  actions.push({
    kind: 'all-in',
    minAmount: player.stack,
    callAmount: toCall,
    label: `All-in ${player.stack}`,
  });
  return actions;
}

export function nextActorPlayerId(state: AppState): string | null {
  const hand = ensureHand(state);
  if (hand.street === 'showdown' || hand.street === 'settled') return null;
  const orderedSeats = orderSeats(state, hand.buttonSeat).filter((seat) =>
    hand.seatsInHand.includes(seat.id),
  );
  if (orderedSeats.length === 0) return null;
  const startOffset =
    hand.street === 'preflop' ? Math.min(3, orderedSeats.length) : Math.min(1, orderedSeats.length);
  const orderedToAct = [...orderedSeats.slice(startOffset), ...orderedSeats.slice(0, startOffset)];
  const maxBet = Math.max(...Object.values(hand.streetContributions), 0);
  for (const seat of orderedToAct) {
    const playerId = seat.playerId;
    if (!playerId) continue;
    const player = state.players[playerId];
    if (!player || hand.folded.has(playerId) || hand.allIn.has(playerId) || player.stack <= 0)
      continue;
    const playerBet = hand.streetContributions[playerId] ?? 0;
    if (!hand.actedThisRound.has(playerId) || playerBet < maxBet) return playerId;
  }
  return null;
}

export function takeAction(
  state: AppState,
  seatId: SeatId,
  kind: LegalAction['kind'],
  enteredAmount?: ChipAmount,
): DomainEvent {
  const legal = legalActions(state, seatId);
  const chosen = legal.find((action) => action.kind === kind);
  if (!chosen) throw new Error(`${kind} is not legal for seat ${seatId}.`);
  const playerId = requireSeatPlayer(state, seatId);
  const stack = state.players[playerId].stack;
  let amount = 0;
  if (kind === 'call') amount = Math.min(chosen.callAmount, stack);
  if (kind === 'bet' || kind === 'raise') amount = enteredAmount ?? chosen.minAmount;
  if (kind === 'all-in') amount = stack;
  if ((kind === 'bet' || kind === 'raise') && amount < chosen.minAmount) {
    throw new Error(`${kind} amount must be at least ${chosen.minAmount}.`);
  }
  return { type: 'ActionTaken', seatId, kind, amount };
}

function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}
