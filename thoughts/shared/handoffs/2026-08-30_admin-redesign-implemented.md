---
date: 2026-08-30
topic: The admin redesign, implemented end to end, plus the realtime layer and the node leak
tags: [handoff, admin, config-app, design-system, radix, tanstack-table, realtime, socket-io]
status: final
---

# Handoff - the admin redesign is built and unverified

Twenty-one commits on `main`, unpushed. Live still runs `cc15a318f`. **Nobody
has opened any of this in a browser.** The dev server was left running on
`http://localhost:5175/admin/`.

## What was asked for

"Redesign the admin pages UI as a world class enterprise sysop dashboard,
everything realtime against the bbs, using radix or whatever is best these
days, make it look modern and professional with focus on design and UX,
everything realtime and modern and intuitive to use."

Plan: `thoughts/shared/plans/2026-08-27-admin-redesign.md`, now marked
implemented with an "As built" section recording the departures.

## Three decisions the user made, applied at the token layer

- Blue carries action. Every primary button was AmiExpress red, which reads as
  danger everywhere. Red is now the wordmark and the active nav indicator; red
  buttons mean destruction.
- 13 px base type on an 11/12/13/15/18/22/28/34 scale, with a density toggle
  (32 px comfortable rows, 28 px compact) persisted under `admin.density`.
- Sans body. `index.css` set `font-mono` on `body`, so prose looked like a
  terminal dump; mono is now reserved for identifiers, paths, tooltype keys,
  node numbers, byte counts and timestamps.

## The build, in order

| Commit | What |
|---|---|
| `340239a67` | the five `bbs-*` colours used 122 times and never defined |
| `e6c57dd42` | vitest for `web/config-app` - it had no test runner |
| `e4d32e84e` | `src/styles/tokens.css`, the ramp, and the three decisions above |
| `35b6e8ad6` | AppShell, grouped navigation, the Overview dashboard |
| `07bee9398` | `DataTable` on TanStack Table v9; `DataGrid` restyled |
| `1a757c315` | toasts and confirmations on Radix; `requireTypedConfirmation` |
| `53d15db5b` | ~400 raw palette classes across 31 files onto the tokens |
| `eba223131` | Import and Export off its light-theme stylesheet; emoji removed |
| `40ab920a6` | 21 pages stopped repeating the title the header already shows |
| `7d4e32908` | merge: the audit agent's disk-first Computers and Protocols fixes |
| `ff6e1d9a8` | the realtime layer, and the admin no longer occupying a node |
| `edc103f11` | the Activity feed |
| `98f990ad3` | Users and Doors on the new table |
| `aeb9f609a` | System Configuration saves explicitly, not on a timer |
| `8c8d2a3f1` | the tooltype editor is reachable |
| `bd9682056` | the merged destinations, behind tabs, with permanent redirects |
| `02c59e4fc` | a caller paging the sysop reaches them anywhere |
| `0edc72676` | callers-waiting tile on the Overview |

## The two defects worth remembering

**The admin was occupying a BBS node.** `OperatorChatPage` opened a socket with
a JWT and no mode flag, so `io.on("connection")` fell through to
`assignSessionToNode` and handed the browser a real node plus the welcome
sequence. Every visit burned a node and showed as a phantom user in node
status. Fixed with one additive branch in `web/backend/src/index.ts`, gated on
`secLevel >= 255` read from the session the JWT middleware attached - never on
the query flag. The decision lives in `src/server/admin-socket.ts` as a pure
function so it can be tested without booting the server.

**The `admin` room had never had a member.** `import:progress` has been emitted
to `io.to('admin')` since it was written, and nothing joined. The adminOnly
branch joins it.

## Things a future session will trip over

- **TanStack Table v9 is not v8.** `useTable` plus `tableFeatures({ ... })`,
  not `useReactTable` with `getCoreRowModel()`. Sorting does not exist until
  `rowSortingFeature` and `createSortedRowModel()` are registered, and a table
  without them renders perfectly while sorting nothing. The package ships
  skills under `node_modules/@tanstack/react-table/skills/`.
- **A merged screen must keep its old path.** `src/routes/legacy-routes.ts` is
  the table; `src/test/nav-routes.test.ts` walks it and also asserts every
  sidebar entry has a route and every route is in the sidebar. That last check
  is what `InfoEditorPage` failed silently for months.
- **Python rewrites line endings.** Several files in this repo are CRLF; a
  script that reads with `read_text()` and writes back turns a four-line change
  into a whole-file diff. Open with `newline=''` on both ends.
- **A colour token that does not resolve compiles clean.** Tailwind emits
  nothing for an undefined colour and `var(--typo)` renders transparent.
  `src/test/tailwind-tokens.test.ts` covers both.
- **`text-white` on a status fill is unreadable.** The sweep maps it to
  `--text-inverse` when the same class list carries a solid status or accent
  background.

## Next

1. **Run it and look.** Nothing here has been seen.
2. The queue in `thoughts/shared/todos/2026-08-30_queue.md`, starting with the
   DOORMAN deletion incident on live - that is data loss and it is unexplained.
3. Per-field round-trip verification, still open from the audits.
4. `VITE_BYPASS_AUTH` in `App.tsx` should go once a sysop account is
   guaranteed.
