# AGENTS.md

## Project Overview

This repository contains a local-first TypeScript + React + Vite SPA for recording live No Limit Hold'em cash-game hands on a mobile device.

The product goal is a low-friction live poker recorder, not an analytics app. The app should record real table progress, keep the hand state coherent, calculate derived facts such as pots and settlements, and export completed hands as PokerStars-style text suitable for pasting into GTO Wizard.

Read [docs/design.md](docs/design.md) before making product or architecture changes. Its Completion Conditions are the source of truth for the intended behavior.

## Architecture

- Keep poker and session logic in `src/domain`.
- UI code belongs in `src/ui`.
- Browser persistence belongs in `src/storage`.
- Hand-history output belongs in `src/export`.
- UI should send user intent to `commands`; it should not manually construct low-level derived state.
- Persisted truth is a `schemaVersion` domain event log. Rebuild current state from events instead of storing derived state such as pots, legal actions, settlement, or current stacks as authoritative data.
- External poker libraries must stay behind domain/settlement boundaries. Do not leak external library types into UI, storage, events, or exported app state.

## Setup Commands

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build production bundle: `npm run build`
- Run domain/unit tests: `npm run test`
- Run Playwright E2E tests: `npm run e2e`
- Format files: `npm run format`
- Check formatting: `npm run format:check`
- Run all checks: `npm run check`

The dev server is configured for `127.0.0.1`. If a port is already in use, pass another port after `--`, for example:

```sh
npm run dev -- --port 4173
```

## Testing Instructions

- Add or update Vitest tests when changing `src/domain`, `src/export`, or command behavior.
- Use Playwright for mobile workflow coverage when changing setup, table recording, Undo, export, or viewport-sensitive UI.
- Before finishing a non-trivial change, run `npm run check` when feasible.
- If Playwright cannot start a local server because of sandbox restrictions, rerun the command with the required approval instead of weakening the test.

## Code Style

- TypeScript strict mode is enabled; keep types explicit at module boundaries.
- Use Prettier for formatting. Do not hand-format around Prettier output.
- Prefer small pure functions for domain behavior.
- Keep React components focused on rendering and user interaction.
- Do not introduce broad global state when event replay can produce the required state.
- Use existing local patterns before adding new abstractions.
- Keep generated output out of version control. `node_modules`, `dist`, Playwright results, and TypeScript build info are ignored.

## UI Guidelines

- The recording screen should remain usable on mobile without page scrolling.
- Prefer table-shaped poker UI over long vertical forms during hand recording.
- Avoid overlapping controls, unstable layout shifts, and text overflow.
- Use compact controls appropriate for repeated live-table operation.

## Domain Gotchas

- Legal action checks must include turn order, stack size, street state, folded/all-in status, and call/bet requirements.
- Undo should remove the last user-recorded domain event and replay the log.
- Do not save automatic calculations as independent authoritative events unless the user explicitly records a meaningful poker/session fact.
- Side-pot and showdown behavior must be tested with multi-player all-in fixtures.
- Export text should be generated from completed hand state, not from UI state.

## Pull Request Notes

- Summarize changed behavior, not just changed files.
- Mention which checks were run.
- Call out any unverified mobile UI behavior or skipped tests.
