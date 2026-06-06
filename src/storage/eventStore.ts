import { replayLog, type EventLog, SCHEMA_VERSION } from '../domain/reducer';
import type { AppState, DomainEvent } from '../domain/types';
import { emptyState } from '../domain/types';

const STORAGE_KEY = 'live-poker-recorder:event-log';

export function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    return replayLog(JSON.parse(raw) as EventLog);
  } catch {
    return emptyState();
  }
}

export function saveEvents(events: DomainEvent[]): void {
  const log: EventLog = { schemaVersion: SCHEMA_VERSION, events };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

export function clearEvents(): void {
  localStorage.removeItem(STORAGE_KEY);
}
