import { formatCards } from '../domain/cards';
import type { AppState, HandState } from '../domain/types';

export function exportHandHistory(state: AppState, hand: HandState): string {
  const preset = state.presets.find((item) => item.id === state.selectedPresetId);
  const currency = preset?.currency ?? '';
  const lines: string[] = [];
  lines.push(
    `PokerStars Hand #${hand.id}: Hold'em No Limit (${currency}${preset?.smallBlind ?? 0}/${currency}${preset?.bigBlind ?? 0})`,
  );
  lines.push(
    `Table 'Live Poker Recorder' ${state.seats.length}-max Seat #${hand.buttonSeat} is the button`,
  );
  for (const seat of state.seats) {
    if (!seat.playerId) continue;
    const player = state.players[seat.playerId];
    lines.push(`Seat ${seat.id}: ${player.name} (${currency}${player.stack} in chips)`);
  }
  for (const action of hand.actions) {
    const name = state.players[action.playerId]?.name ?? action.playerId;
    if (action.kind === 'small-blind')
      lines.push(`${name}: posts small blind ${currency}${action.amount}`);
    if (action.kind === 'big-blind')
      lines.push(`${name}: posts big blind ${currency}${action.amount}`);
    if (action.kind === 'ante') lines.push(`${name}: posts the ante ${currency}${action.amount}`);
  }
  lines.push('*** HOLE CARDS ***');
  for (const [playerId, cards] of Object.entries(hand.holeCards)) {
    lines.push(`Dealt to ${state.players[playerId]?.name ?? playerId} [${formatCards(cards)}]`);
  }
  emitStreet(lines, state, hand, 'preflop', currency);
  if (hand.board.length >= 3) lines.push(`*** FLOP *** [${formatCards(hand.board.slice(0, 3))}]`);
  emitStreet(lines, state, hand, 'flop', currency);
  if (hand.board.length >= 4)
    lines.push(`*** TURN *** [${formatCards(hand.board.slice(0, 3))}] [${hand.board[3]}]`);
  emitStreet(lines, state, hand, 'turn', currency);
  if (hand.board.length >= 5)
    lines.push(`*** RIVER *** [${formatCards(hand.board.slice(0, 4))}] [${hand.board[4]}]`);
  emitStreet(lines, state, hand, 'river', currency);
  if (Object.keys(hand.showdownCards).length > 0) {
    lines.push('*** SHOW DOWN ***');
    for (const [playerId, cards] of Object.entries(hand.showdownCards)) {
      lines.push(`${state.players[playerId]?.name ?? playerId}: shows [${formatCards(cards)}]`);
    }
  }
  lines.push('*** SUMMARY ***');
  lines.push(
    `Total pot ${currency}${Object.values(hand.contributions).reduce((sum, value) => sum + value, 0)}`,
  );
  for (const share of hand.settlement) {
    lines.push(
      `${state.players[share.playerId]?.name ?? share.playerId} collected ${currency}${share.amount} from ${share.potName} pot`,
    );
  }
  return lines.join('\n');
}

function emitStreet(
  lines: string[],
  state: AppState,
  hand: HandState,
  street: string,
  currency: string,
): void {
  for (const action of hand.actions.filter((item) => item.street === street)) {
    if (action.kind === 'small-blind' || action.kind === 'big-blind' || action.kind === 'ante')
      continue;
    const name = state.players[action.playerId]?.name ?? action.playerId;
    if (action.kind === 'fold') lines.push(`${name}: folds`);
    if (action.kind === 'check') lines.push(`${name}: checks`);
    if (action.kind === 'call') lines.push(`${name}: calls ${currency}${action.amount}`);
    if (action.kind === 'bet') lines.push(`${name}: bets ${currency}${action.amount}`);
    if (action.kind === 'raise') lines.push(`${name}: raises to ${currency}${action.amount}`);
    if (action.kind === 'all-in')
      lines.push(`${name}: raises ${currency}${action.amount} and is all-in`);
  }
}
