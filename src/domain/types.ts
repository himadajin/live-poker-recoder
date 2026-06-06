export type ChipAmount = number;
export type SeatId = number;
export type PlayerId = string;
export type HandId = string;
export type CardCode = string;
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'settled';
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface Preset {
  id: string;
  name: string;
  smallBlind: ChipAmount;
  bigBlind: ChipAmount;
  ante: ChipAmount;
  currency: string;
  chipUnit: ChipAmount;
  defaultSeats: number;
}

export interface Seat {
  id: SeatId;
  playerId: PlayerId | null;
}

export interface Player {
  id: PlayerId;
  name: string;
  stack: ChipAmount;
  active: boolean;
}

export interface ActionRecord {
  seatId: SeatId;
  playerId: PlayerId;
  kind: ActionKind | 'small-blind' | 'big-blind' | 'ante';
  amount: ChipAmount;
  street: Street;
}

export interface PotShare {
  playerId: PlayerId;
  amount: ChipAmount;
  potName: string;
}

export interface HandState {
  id: HandId;
  buttonSeat: SeatId;
  street: Street;
  seatsInHand: SeatId[];
  folded: Set<PlayerId>;
  allIn: Set<PlayerId>;
  actedThisRound: Set<PlayerId>;
  contributions: Record<PlayerId, ChipAmount>;
  streetContributions: Record<PlayerId, ChipAmount>;
  actions: ActionRecord[];
  board: CardCode[];
  holeCards: Record<PlayerId, CardCode[]>;
  showdownCards: Record<PlayerId, CardCode[]>;
  settlement: PotShare[];
}

export interface AppState {
  schemaVersion: 1;
  presets: Preset[];
  selectedPresetId: string | null;
  seats: Seat[];
  players: Record<PlayerId, Player>;
  heroSeatId: SeatId | null;
  currentHand: HandState | null;
  completedHands: HandState[];
  events: DomainEvent[];
}

export interface StartSessionSeat {
  seatId: SeatId;
  name: string;
  stack: ChipAmount;
}

export type DomainEvent =
  | { type: 'PresetCreated'; preset: Preset }
  | { type: 'PresetUpdated'; preset: Preset }
  | { type: 'PresetDeleted'; presetId: string }
  | { type: 'SessionStarted'; presetId: string; seats: StartSessionSeat[]; heroSeatId: SeatId }
  | { type: 'PlayerSatIn'; seatId: SeatId; playerId: PlayerId; name: string; stack: ChipAmount }
  | { type: 'PlayerLeft'; seatId: SeatId; cashOut: ChipAmount }
  | { type: 'StackAdjusted'; playerId: PlayerId; amount: ChipAmount; reason: 'top-up' | 'cash-out' }
  | { type: 'SeatMoved'; fromSeatId: SeatId; toSeatId: SeatId }
  | { type: 'HeroSeatChanged'; seatId: SeatId }
  | { type: 'HandStarted'; handId: HandId; buttonSeat: SeatId }
  | { type: 'HoleCardsRecorded'; playerId: PlayerId; cards: CardCode[] }
  | { type: 'ActionTaken'; seatId: SeatId; kind: ActionKind; amount: ChipAmount }
  | { type: 'BoardCardsDealt'; cards: CardCode[] }
  | { type: 'ShowdownCardsRevealed'; playerId: PlayerId; cards: CardCode[] }
  | { type: 'HandSettled'; shares: PotShare[] };

export interface LegalAction {
  kind: ActionKind;
  minAmount: ChipAmount;
  callAmount: ChipAmount;
  label: string;
}

export const DEFAULT_PRESET: Preset = {
  id: 'preset-default',
  name: '2/5 Live',
  smallBlind: 2,
  bigBlind: 5,
  ante: 0,
  currency: '$',
  chipUnit: 1,
  defaultSeats: 6,
};

export function emptyState(): AppState {
  return {
    schemaVersion: 1,
    presets: [DEFAULT_PRESET],
    selectedPresetId: DEFAULT_PRESET.id,
    seats: [],
    players: {},
    heroSeatId: null,
    currentHand: null,
    completedHands: [],
    events: [],
  };
}
