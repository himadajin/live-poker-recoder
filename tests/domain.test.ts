import { describe, expect, it } from 'vitest';
import {
  dealBoard,
  legalActions,
  recordHoleCards,
  revealShowdown,
  settleShowdown,
  startHand,
  startSession,
  takeAction,
} from '../src/domain/commands';
import { appendEvent, replay, replayLog, undoLastUserEvent } from '../src/domain/reducer';
import { DEFAULT_PRESET, emptyState } from '../src/domain/types';
import { exportHandHistory } from '../src/export/handHistory';

function baseState() {
  let state = emptyState();
  state = appendEvent(
    state,
    startSession(
      DEFAULT_PRESET.id,
      [
        { seatId: 1, name: 'Hero', stack: 100 },
        { seatId: 2, name: 'Alice', stack: 100 },
        { seatId: 3, name: 'Bob', stack: 100 },
      ],
      1,
    ),
  );
  state = appendEvent(state, startHand(1));
  return state;
}

describe('event log reconstruction', () => {
  it('replays schema-versioned domain events and supports undo by replay', () => {
    let state = baseState();
    const event = takeAction(state, 1, 'fold');
    state = appendEvent(state, event);

    const replayed = replayLog({ schemaVersion: 1, events: state.events });
    expect(replayed.currentHand?.folded.has('hero-1')).toBe(true);

    const undone = undoLastUserEvent(state);
    expect(undone.currentHand?.folded.has('hero-1')).toBe(false);
    expect(replay(undone.events).currentHand?.actions.length).toBe(2);
  });
});

describe('commands and state machine', () => {
  it('generates only legal actions and advances streets after matched betting', () => {
    let state = baseState();
    expect(legalActions(state, 1).map((action) => action.kind)).toEqual([
      'fold',
      'call',
      'raise',
      'all-in',
    ]);
    expect(legalActions(state, 2)).toEqual([]);
    state = appendEvent(state, takeAction(state, 1, 'call'));
    state = appendEvent(state, takeAction(state, 2, 'call'));
    state = appendEvent(state, takeAction(state, 3, 'check'));
    expect(state.currentHand?.street).toBe('flop');
    expect(legalActions(state, 1)).toEqual([]);
    expect(legalActions(state, 2).map((action) => action.kind)).toContain('check');
    expect(
      Object.values(state.currentHand?.contributions ?? {}).reduce((sum, value) => sum + value, 0),
    ).toBe(15);
    expect(state.players['hero-1'].stack).toBe(95);
  });

  it('settles the pot automatically when all but one player folds', () => {
    let state = baseState();
    state = appendEvent(state, takeAction(state, 1, 'fold'));
    state = appendEvent(state, takeAction(state, 2, 'fold'));
    expect(state.currentHand).toBeNull();
    expect(state.completedHands[0].settlement[0]).toMatchObject({ playerId: 'bob-3', amount: 7 });
  });
});

describe('side pots, showdown, and export', () => {
  it('calculates multiple all-in side pots from board and showdown cards', async () => {
    let state = emptyState();
    state = appendEvent(
      state,
      startSession(
        DEFAULT_PRESET.id,
        [
          { seatId: 1, name: 'Hero', stack: 50 },
          { seatId: 2, name: 'Alice', stack: 100 },
          { seatId: 3, name: 'Bob', stack: 200 },
        ],
        1,
      ),
    );
    state = appendEvent(state, startHand(1));
    state = appendEvent(state, takeAction(state, 1, 'all-in'));
    state = appendEvent(state, takeAction(state, 2, 'all-in'));
    state = appendEvent(state, takeAction(state, 3, 'call'));
    state = appendEvent(state, dealBoard('AhKhQhJh2c'));
    state = appendEvent(state, revealShowdown('hero-1', 'Th9h'));
    state = appendEvent(state, revealShowdown('alice-2', 'AsAd'));
    state = appendEvent(state, revealShowdown('bob-3', 'KcKd'));
    state = appendEvent(state, await settleShowdown(state));

    expect(state.completedHands[0].settlement).toContainEqual({
      playerId: 'hero-1',
      amount: 150,
      potName: 'main',
    });
    expect(state.completedHands[0].settlement).toContainEqual({
      playerId: 'alice-2',
      amount: 100,
      potName: 'side 1',
    });

    const exported = exportHandHistory(state, state.completedHands[0]);
    expect(exported).toContain('PokerStars Hand #');
    expect(exported).toContain('*** SHOW DOWN ***');
    expect(exported).toContain('Hero collected $150 from main pot');
  });

  it('records hole cards and board cards in export text', () => {
    let state = baseState();
    state = appendEvent(state, recordHoleCards('hero-1', 'AcAd'));
    state = appendEvent(state, takeAction(state, 1, 'call'));
    state = appendEvent(state, takeAction(state, 2, 'call'));
    state = appendEvent(state, takeAction(state, 3, 'check'));
    state = appendEvent(state, dealBoard('2c3d4h'));
    state = appendEvent(state, takeAction(state, 2, 'check'));
    state = appendEvent(state, takeAction(state, 3, 'check'));
    state = appendEvent(state, takeAction(state, 1, 'bet', 10));
    state = appendEvent(state, takeAction(state, 2, 'fold'));
    state = appendEvent(state, takeAction(state, 3, 'fold'));
    const exported = exportHandHistory(state, state.completedHands[0]);
    expect(exported).toContain('Dealt to Hero [Ac Ad]');
    expect(exported).toContain('*** FLOP *** [2c 3d 4h]');
  });
});
