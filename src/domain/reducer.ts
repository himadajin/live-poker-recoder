import { calculateSettlement } from './settlement';
import type {
  ActionRecord,
  AppState,
  ChipAmount,
  DomainEvent,
  HandState,
  Player,
  PlayerId,
  Preset,
  SeatId,
} from './types';
import { emptyState } from './types';

export const SCHEMA_VERSION = 1;

export interface EventLog {
  schemaVersion: 1;
  events: DomainEvent[];
}

export function replay(events: DomainEvent[]): AppState {
  return events.reduce(applyEvent, { ...emptyState(), events: [] });
}

export function replayLog(log: EventLog): AppState {
  if (log.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`Unsupported schemaVersion ${log.schemaVersion}.`);
  return replay(log.events);
}

export function appendEvent(state: AppState, event: DomainEvent): AppState {
  return applyEvent({ ...state, events: [...state.events] }, event);
}

export function undoLastUserEvent(state: AppState): AppState {
  const events = state.events.slice(0, -1);
  return replay(events);
}

function applyEvent(state: AppState, event: DomainEvent): AppState {
  const next = cloneState(state);
  next.events.push(event);
  switch (event.type) {
    case 'PresetCreated':
      next.presets = [
        ...next.presets.filter((preset) => preset.id !== event.preset.id),
        event.preset,
      ];
      next.selectedPresetId = event.preset.id;
      return next;
    case 'PresetUpdated':
      next.presets = next.presets.map((preset) =>
        preset.id === event.preset.id ? event.preset : preset,
      );
      return next;
    case 'PresetDeleted':
      next.presets = next.presets.filter((preset) => preset.id !== event.presetId);
      next.selectedPresetId = next.presets[0]?.id ?? null;
      return next;
    case 'SessionStarted':
      return startSession(next, event.presetId, event.seats, event.heroSeatId);
    case 'PlayerSatIn':
      next.players[event.playerId] = {
        id: event.playerId,
        name: event.name,
        stack: event.stack,
        active: true,
      };
      setSeat(next, event.seatId, event.playerId);
      return next;
    case 'PlayerLeft':
      return leaveSeat(next, event.seatId, event.cashOut);
    case 'StackAdjusted':
      next.players[event.playerId].stack +=
        event.reason === 'top-up' ? event.amount : -event.amount;
      return next;
    case 'SeatMoved':
      return moveSeat(next, event.fromSeatId, event.toSeatId);
    case 'HeroSeatChanged':
      next.heroSeatId = event.seatId;
      return next;
    case 'HandStarted':
      next.currentHand = startHand(next, event.handId, event.buttonSeat);
      postForcedBets(next);
      return next;
    case 'HoleCardsRecorded':
      ensureHand(next).holeCards[event.playerId] = event.cards;
      return next;
    case 'ActionTaken':
      applyAction(next, event.seatId, event.kind, event.amount);
      maybeAutoAdvance(next);
      return next;
    case 'BoardCardsDealt':
      dealBoard(next, event.cards);
      return next;
    case 'ShowdownCardsRevealed':
      ensureHand(next).showdownCards[event.playerId] = event.cards;
      return next;
    case 'HandSettled':
      settleHand(next, event.shares);
      return next;
  }
}

function cloneState(state: AppState): AppState {
  return {
    ...state,
    presets: state.presets.map((preset) => ({ ...preset })),
    seats: state.seats.map((seat) => ({ ...seat })),
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [id, { ...player }]),
    ),
    currentHand: state.currentHand ? cloneHand(state.currentHand) : null,
    completedHands: state.completedHands.map(cloneHand),
  };
}

function cloneHand(hand: HandState): HandState {
  return {
    ...hand,
    folded: new Set(hand.folded),
    allIn: new Set(hand.allIn),
    actedThisRound: new Set(hand.actedThisRound),
    contributions: { ...hand.contributions },
    streetContributions: { ...hand.streetContributions },
    actions: hand.actions.map((action) => ({ ...action })),
    board: [...hand.board],
    holeCards: Object.fromEntries(
      Object.entries(hand.holeCards).map(([id, cards]) => [id, [...cards]]),
    ),
    showdownCards: Object.fromEntries(
      Object.entries(hand.showdownCards).map(([id, cards]) => [id, [...cards]]),
    ),
    settlement: hand.settlement.map((share) => ({ ...share })),
  };
}

function startSession(
  state: AppState,
  presetId: string,
  seats: Array<{ seatId: SeatId; name: string; stack: ChipAmount }>,
  heroSeatId: SeatId,
): AppState {
  const preset = getPreset(state, presetId);
  state.selectedPresetId = preset.id;
  state.seats = Array.from({ length: preset.defaultSeats }, (_, index) => ({
    id: index + 1,
    playerId: null,
  }));
  state.players = {};
  for (const seat of seats) {
    const playerId = makePlayerId(seat.name, seat.seatId);
    state.players[playerId] = { id: playerId, name: seat.name, stack: seat.stack, active: true };
    setSeat(state, seat.seatId, playerId);
  }
  state.heroSeatId = heroSeatId;
  state.currentHand = null;
  state.completedHands = [];
  return state;
}

function startHand(state: AppState, handId: string, buttonSeat: SeatId): HandState {
  const activeSeats = state.seats.filter(
    (seat) => seat.playerId && state.players[seat.playerId]?.active,
  );
  return {
    id: handId,
    buttonSeat,
    street: 'preflop',
    seatsInHand: activeSeats.map((seat) => seat.id),
    folded: new Set(),
    allIn: new Set(),
    actedThisRound: new Set(),
    contributions: Object.fromEntries(activeSeats.map((seat) => [seat.playerId!, 0])),
    streetContributions: Object.fromEntries(activeSeats.map((seat) => [seat.playerId!, 0])),
    actions: [],
    board: [],
    holeCards: {},
    showdownCards: {},
    settlement: [],
  };
}

function postForcedBets(state: AppState): void {
  const hand = ensureHand(state);
  const preset = getSelectedPreset(state);
  const ordered = orderSeats(state, hand.buttonSeat).filter((seat) =>
    hand.seatsInHand.includes(seat.id),
  );
  if (preset.ante > 0) {
    for (const seat of ordered)
      contribute(
        state,
        seat.id,
        'ante',
        Math.min(preset.ante, state.players[seat.playerId!].stack),
      );
  }
  const smallBlindSeat = ordered[1 % ordered.length];
  const bigBlindSeat = ordered[2 % ordered.length];
  contribute(
    state,
    smallBlindSeat.id,
    'small-blind',
    Math.min(preset.smallBlind, state.players[smallBlindSeat.playerId!].stack),
  );
  contribute(
    state,
    bigBlindSeat.id,
    'big-blind',
    Math.min(preset.bigBlind, state.players[bigBlindSeat.playerId!].stack),
  );
}

function applyAction(
  state: AppState,
  seatId: SeatId,
  kind: ActionRecord['kind'],
  amount: ChipAmount,
): void {
  const hand = ensureHand(state);
  const playerId = requireSeatPlayer(state, seatId);
  if (kind === 'fold') {
    hand.folded.add(playerId);
    hand.actedThisRound.add(playerId);
    hand.actions.push({ seatId, playerId, kind, amount: 0, street: hand.street });
    return;
  }
  if (kind === 'check') {
    hand.actedThisRound.add(playerId);
    hand.actions.push({ seatId, playerId, kind, amount: 0, street: hand.street });
    return;
  }
  contribute(state, seatId, kind, amount);
  hand.actedThisRound.add(playerId);
  if (state.players[playerId].stack === 0 || kind === 'all-in') hand.allIn.add(playerId);
}

function contribute(
  state: AppState,
  seatId: SeatId,
  kind: ActionRecord['kind'],
  amount: ChipAmount,
): void {
  const hand = ensureHand(state);
  const playerId = requireSeatPlayer(state, seatId);
  const paid = Math.max(0, Math.min(amount, state.players[playerId].stack));
  state.players[playerId].stack -= paid;
  hand.contributions[playerId] = (hand.contributions[playerId] ?? 0) + paid;
  hand.streetContributions[playerId] = (hand.streetContributions[playerId] ?? 0) + paid;
  hand.actions.push({ seatId, playerId, kind, amount: paid, street: hand.street });
  if (state.players[playerId].stack === 0) hand.allIn.add(playerId);
}

function maybeAutoAdvance(state: AppState): void {
  const hand = ensureHand(state);
  const contenders = activeContenders(hand);
  if (contenders.length <= 1) {
    const winner = contenders[0];
    if (winner) settleHand(state, [{ playerId: winner, amount: totalPot(hand), potName: 'main' }]);
    return;
  }
  const live = contenders.filter((playerId) => !hand.allIn.has(playerId));
  if (live.length === 0) {
    hand.street = 'showdown';
    return;
  }
  const maxBet = Math.max(...live.map((playerId) => hand.streetContributions[playerId] ?? 0), 0);
  const complete = live.every(
    (playerId) =>
      hand.actedThisRound.has(playerId) && (hand.streetContributions[playerId] ?? 0) === maxBet,
  );
  if (!complete) return;
  if (hand.street === 'river') {
    hand.street = 'showdown';
    return;
  }
  hand.street = hand.street === 'preflop' ? 'flop' : hand.street === 'flop' ? 'turn' : 'river';
  hand.streetContributions = Object.fromEntries(
    Object.keys(hand.contributions).map((playerId) => [playerId, 0]),
  );
  hand.actedThisRound = new Set();
}

function dealBoard(state: AppState, cards: string[]): void {
  const hand = ensureHand(state);
  hand.board = [...hand.board, ...cards];
  if (hand.board.length >= 5) hand.street = 'river';
}

function settleHand(
  state: AppState,
  shares: Array<{ playerId: PlayerId; amount: ChipAmount; potName: string }>,
): void {
  const hand = ensureHand(state);
  hand.settlement = shares;
  hand.street = 'settled';
  for (const share of shares) state.players[share.playerId].stack += share.amount;
  state.completedHands = [...state.completedHands, cloneHand(hand)];
  state.currentHand = null;
}

export function autoSettlement(
  state: AppState,
): Array<{ playerId: PlayerId; amount: ChipAmount; potName: string }> {
  return calculateSettlement(ensureHand(state));
}

function leaveSeat(state: AppState, seatId: SeatId, cashOut: ChipAmount): AppState {
  const playerId = requireSeatPlayer(state, seatId);
  state.players[playerId].stack = Math.max(0, state.players[playerId].stack - cashOut);
  state.players[playerId].active = false;
  setSeat(state, seatId, null);
  return state;
}

function moveSeat(state: AppState, fromSeatId: SeatId, toSeatId: SeatId): AppState {
  const playerId = requireSeatPlayer(state, fromSeatId);
  setSeat(state, fromSeatId, null);
  setSeat(state, toSeatId, playerId);
  return state;
}

function setSeat(state: AppState, seatId: SeatId, playerId: PlayerId | null): void {
  const existing = state.seats.find((seat) => seat.id === seatId);
  if (existing) existing.playerId = playerId;
  else state.seats.push({ id: seatId, playerId });
}

function getPreset(state: AppState, presetId: string): Preset {
  const preset = state.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown preset ${presetId}.`);
  return preset;
}

function getSelectedPreset(state: AppState): Preset {
  if (!state.selectedPresetId) throw new Error('No preset selected.');
  return getPreset(state, state.selectedPresetId);
}

export function ensureHand(state: AppState): HandState {
  if (!state.currentHand) throw new Error('No hand is in progress.');
  return state.currentHand;
}

export function requireSeatPlayer(state: AppState, seatId: SeatId): PlayerId {
  const playerId = state.seats.find((seat) => seat.id === seatId)?.playerId;
  if (!playerId) throw new Error(`Seat ${seatId} has no player.`);
  return playerId;
}

export function orderSeats(state: AppState, buttonSeat: SeatId) {
  const sorted = [...state.seats].sort((a, b) => a.id - b.id);
  const index = sorted.findIndex((seat) => seat.id === buttonSeat);
  return [...sorted.slice(index), ...sorted.slice(0, index)].filter((seat) => seat.playerId);
}

function activeContenders(hand: HandState): PlayerId[] {
  return Object.keys(hand.contributions).filter((playerId) => !hand.folded.has(playerId));
}

function totalPot(hand: HandState): ChipAmount {
  return Object.values(hand.contributions).reduce((sum, amount) => sum + amount, 0);
}

function makePlayerId(name: string, seatId: SeatId): PlayerId {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'player'}-${seatId}`;
}
