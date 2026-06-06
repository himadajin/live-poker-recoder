import {
  CircleDollarSign,
  Download,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  adjustStack,
  changeHeroSeat,
  createPreset,
  dealBoard,
  deletePreset,
  leaveSeat,
  legalActions,
  moveSeat,
  recordHoleCards,
  revealShowdown,
  settleShowdown,
  sitIn,
  startHand,
  startSession,
  takeAction,
  updatePreset,
} from '../domain/commands';
import { appendEvent, undoLastUserEvent } from '../domain/reducer';
import type { AppState, ChipAmount, DomainEvent, PlayerId, Preset, SeatId } from '../domain/types';
import { DEFAULT_PRESET } from '../domain/types';
import { exportHandHistory } from '../export/handHistory';
import { clearEvents, loadState, saveEvents } from '../storage/eventStore';

type View = 'setup' | 'table' | 'export';

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [view, setView] = useState<View>(() => (loadState().seats.length ? 'table' : 'setup'));
  const [message, setMessage] = useState('');

  useEffect(() => saveEvents(state.events), [state.events]);

  const dispatch = (event: DomainEvent) => {
    setState((current) => appendEvent(current, event));
    setMessage('');
  };

  const safeDispatch = (factory: () => DomainEvent | Promise<DomainEvent>) => {
    Promise.resolve()
      .then(factory)
      .then(dispatch)
      .catch((error: Error) => setMessage(error.message));
  };

  const reset = () => {
    clearEvents();
    setState(loadState());
    setView('setup');
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Live NLH</p>
          <h1>Recorder</h1>
        </div>
        <nav className="segmented" aria-label="Views">
          <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>
            Setup
          </button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
            Table
          </button>
          <button className={view === 'export' ? 'active' : ''} onClick={() => setView('export')}>
            Export
          </button>
        </nav>
      </header>
      {message && <div className="toast">{message}</div>}
      {view === 'setup' && (
        <SetupView state={state} dispatch={dispatch} onStart={() => setView('table')} />
      )}
      {view === 'table' && (
        <TableView
          state={state}
          dispatch={dispatch}
          safeDispatch={safeDispatch}
          onUndo={() => setState((current) => undoLastUserEvent(current))}
          onReset={reset}
        />
      )}
      {view === 'export' && <ExportView state={state} />}
    </main>
  );
}

function SetupView({
  state,
  dispatch,
  onStart,
}: {
  state: AppState;
  dispatch: (event: DomainEvent) => void;
  onStart: () => void;
}) {
  const [preset, setPreset] = useState<Preset>(state.presets[0] ?? DEFAULT_PRESET);
  const [seatCount, setSeatCount] = useState(preset.defaultSeats);
  const [heroSeat, setHeroSeat] = useState(1);
  const [names, setNames] = useState<Record<number, string>>({
    1: 'Hero',
    2: 'Villain 1',
    3: 'Villain 2',
  });
  const [stacks, setStacks] = useState<Record<number, number>>({ 1: 500, 2: 500, 3: 500 });

  const presetOptions = state.presets;

  const start = () => {
    dispatch(
      startSession(
        preset.id,
        Array.from({ length: seatCount }, (_, index) => index + 1)
          .map((seatId) => ({
            seatId,
            name: names[seatId]?.trim(),
            stack: Number(stacks[seatId] ?? 0),
          }))
          .filter((seat) => seat.name && seat.stack > 0) as Array<{
          seatId: number;
          name: string;
          stack: number;
        }>,
        heroSeat,
      ),
    );
    onStart();
  };

  const savePreset = () => {
    const event = state.presets.some((item) => item.id === preset.id)
      ? updatePreset(preset)
      : createPreset(preset);
    dispatch(event);
  };

  return (
    <section className="setup-grid">
      <div className="panel">
        <h2>Preset</h2>
        <label>
          Saved preset
          <select
            value={preset.id}
            onChange={(event) => {
              const selected =
                state.presets.find((item) => item.id === event.target.value) ?? DEFAULT_PRESET;
              setPreset(selected);
              setSeatCount(selected.defaultSeats);
            }}
          >
            {presetOptions.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="two-col">
          <TextInput
            label="Name"
            value={preset.name}
            onChange={(name) => setPreset({ ...preset, name })}
          />
          <TextInput
            label="Currency"
            value={preset.currency}
            onChange={(currency) => setPreset({ ...preset, currency })}
          />
          <NumberInput
            label="SB"
            value={preset.smallBlind}
            onChange={(smallBlind) => setPreset({ ...preset, smallBlind })}
          />
          <NumberInput
            label="BB"
            value={preset.bigBlind}
            onChange={(bigBlind) => setPreset({ ...preset, bigBlind })}
          />
          <NumberInput
            label="Ante"
            value={preset.ante}
            onChange={(ante) => setPreset({ ...preset, ante })}
          />
          <NumberInput
            label="Chip unit"
            value={preset.chipUnit}
            onChange={(chipUnit) => setPreset({ ...preset, chipUnit })}
          />
          <NumberInput
            label="Seats"
            value={preset.defaultSeats}
            onChange={(defaultSeats) => setPreset({ ...preset, defaultSeats })}
          />
        </div>
        <div className="button-row">
          <button className="primary" onClick={savePreset}>
            <Save size={16} /> Save
          </button>
          <button
            onClick={() => dispatch(deletePreset(preset.id))}
            disabled={state.presets.length <= 1}
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>
      <div className="panel">
        <h2>Session</h2>
        <div className="two-col">
          <NumberInput label="Table seats" value={seatCount} onChange={setSeatCount} />
          <NumberInput label="Hero seat" value={heroSeat} onChange={setHeroSeat} />
        </div>
        <div className="seat-list">
          {Array.from({ length: seatCount }, (_, index) => index + 1).map((seatId) => (
            <div className="seat-row" key={seatId}>
              <span>Seat {seatId}</span>
              <input
                value={names[seatId] ?? ''}
                onChange={(event) => setNames({ ...names, [seatId]: event.target.value })}
              />
              <input
                type="number"
                value={stacks[seatId] ?? ''}
                onChange={(event) => setStacks({ ...stacks, [seatId]: Number(event.target.value) })}
              />
            </div>
          ))}
        </div>
        <button className="primary wide" onClick={start}>
          <CircleDollarSign size={16} /> Start session
        </button>
      </div>
    </section>
  );
}

function TableView({
  state,
  dispatch,
  safeDispatch,
  onUndo,
  onReset,
}: {
  state: AppState;
  dispatch: (event: DomainEvent) => void;
  safeDispatch: (factory: () => DomainEvent | Promise<DomainEvent>) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const [selectedSeat, setSelectedSeat] = useState<SeatId>(state.heroSeatId ?? 1);
  const [amount, setAmount] = useState<ChipAmount>(10);
  const [cards, setCards] = useState('');
  const [board, setBoard] = useState('');
  const selectedPlayerId = state.seats.find((seat) => seat.id === selectedSeat)?.playerId ?? null;
  const hand = state.currentHand;
  const actions = hand && selectedPlayerId ? legalActions(state, selectedSeat) : [];
  const pot = hand ? Object.values(hand.contributions).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <section className="table-page">
      <div className="table-toolbar">
        <button
          className="primary"
          onClick={() => dispatch(startHand(state.heroSeatId ?? 1))}
          disabled={Boolean(hand) || state.seats.length === 0}
        >
          <Plus size={16} /> Hand
        </button>
        <button onClick={onUndo} disabled={state.events.length === 0}>
          <RotateCcw size={16} /> Undo
        </button>
        <button onClick={onReset}>
          <Trash2 size={16} /> Reset
        </button>
      </div>
      <div className="felt" data-testid="felt">
        <div className="pot-display">
          <span>Pot</span>
          <strong>{pot}</strong>
          <small>{hand?.street ?? 'between hands'}</small>
        </div>
        {state.seats.map((seat, index) => (
          <button
            className={`seat-chip seat-${index + 1} ${selectedSeat === seat.id ? 'selected' : ''} ${state.heroSeatId === seat.id ? 'hero' : ''}`}
            key={seat.id}
            onClick={() => setSelectedSeat(seat.id)}
          >
            <span>{seat.playerId ? state.players[seat.playerId].name : `Seat ${seat.id}`}</span>
            <strong>{seat.playerId ? state.players[seat.playerId].stack : 'Open'}</strong>
          </button>
        ))}
      </div>
      <div className="action-dock">
        <div className="dock-head">
          <strong>
            {selectedPlayerId ? state.players[selectedPlayerId].name : `Seat ${selectedSeat}`}
          </strong>
          <span>{hand ? `Street ${hand.street}` : 'Hand between actions'}</span>
        </div>
        {hand ? (
          <>
            <div className="action-grid">
              {actions.map((action) => (
                <button
                  key={action.kind}
                  onClick={() => dispatch(takeAction(state, selectedSeat, action.kind, amount))}
                  disabled={!selectedPlayerId}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <NumberInput label="Bet/raise to" value={amount} onChange={setAmount} />
            <div className="card-row">
              <input
                value={cards}
                placeholder="AhKd"
                onChange={(event) => setCards(event.target.value)}
              />
              <button
                disabled={!selectedPlayerId}
                onClick={() =>
                  selectedPlayerId && dispatch(recordHoleCards(selectedPlayerId, cards))
                }
              >
                Hole
              </button>
              <button
                disabled={!selectedPlayerId}
                onClick={() =>
                  selectedPlayerId && dispatch(revealShowdown(selectedPlayerId, cards))
                }
              >
                Show
              </button>
            </div>
            <div className="card-row">
              <input
                value={board}
                placeholder="AhKdQs"
                onChange={(event) => setBoard(event.target.value)}
              />
              <button onClick={() => dispatch(dealBoard(board))}>Board</button>
              <button className="primary" onClick={() => safeDispatch(() => settleShowdown(state))}>
                Settle
              </button>
            </div>
          </>
        ) : (
          <BetweenHands
            state={state}
            selectedSeat={selectedSeat}
            selectedPlayerId={selectedPlayerId}
            dispatch={dispatch}
          />
        )}
      </div>
    </section>
  );
}

function BetweenHands({
  state,
  selectedSeat,
  selectedPlayerId,
  dispatch,
}: {
  state: AppState;
  selectedSeat: SeatId;
  selectedPlayerId: PlayerId | null;
  dispatch: (event: DomainEvent) => void;
}) {
  const [name, setName] = useState('');
  const [stack, setStack] = useState(500);
  const [amount, setAmount] = useState(100);
  const [toSeat, setToSeat] = useState(1);
  return (
    <div className="between-grid">
      {!selectedPlayerId ? (
        <>
          <TextInput label="Name" value={name} onChange={setName} />
          <NumberInput label="Stack" value={stack} onChange={setStack} />
          <button onClick={() => dispatch(sitIn(selectedSeat, name, stack))}>
            <UserRoundPlus size={16} /> Sit in
          </button>
        </>
      ) : (
        <>
          <NumberInput label="Amount" value={amount} onChange={setAmount} />
          <button onClick={() => dispatch(adjustStack(selectedPlayerId, amount, 'top-up'))}>
            Top up
          </button>
          <button onClick={() => dispatch(adjustStack(selectedPlayerId, amount, 'cash-out'))}>
            Cash out
          </button>
          <button onClick={() => dispatch(leaveSeat(selectedSeat, amount))}>Leave</button>
          <NumberInput label="Move to" value={toSeat} onChange={setToSeat} />
          <button onClick={() => dispatch(moveSeat(selectedSeat, toSeat))}>Move</button>
          <button onClick={() => dispatch(changeHeroSeat(selectedSeat))}>Hero</button>
        </>
      )}
      <span className="muted">{state.completedHands.length} completed hands</span>
    </div>
  );
}

function ExportView({ state }: { state: AppState }) {
  const text = useMemo(
    () => state.completedHands.map((hand) => exportHandHistory(state, hand)).join('\n\n'),
    [state],
  );
  return (
    <section className="panel export-panel">
      <div className="button-row">
        <h2>Hand history</h2>
        <button onClick={() => navigator.clipboard?.writeText(text)}>
          <Download size={16} /> Copy
        </button>
      </div>
      <textarea readOnly value={text} aria-label="Exported hand history" />
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
