---
date: 2026-08-27
topic: Admin interface redesign - enterprise sysop dashboard, realtime, dark-first
tags: [admin, config-app, ui, radix, shadcn, realtime, socket-io, design-system]
status: implemented
---

# Admin redesign - enterprise sysop dashboard

Prompted by: "redesign the admin pages ui as a world class enterprise sysop
dashboard, everything realtime against the bbs, using radix or whatever is best
these days, make it look modern and professional with focus on design and UX,
everything realtime and modern and intuitive to use".

Companion to `2026-08-27_admin-ui-audit.md` (storage model) and
`2026-08-27_admin-page-by-page.md` (per-page verdicts). Those two establish that
the admin app is **already largely disk-first**. This plan therefore changes
presentation, navigation and liveness - not where data is written.

## Non-goals, stated up front

- Disk-first, database-second is unchanged. No config service is rewritten.
- No route path, request shape or response shape changes. The only backend
  change in this plan is a new, additive handshake branch (Phase 2).
- The BBS terminal stays ASCII. This plan touches only the web admin.
- No emojis in any UI string, label, comment or commit. Icons come from
  `lucide-react`, already a dependency.
- Full English words in labels. `BPM`, `FPS`, `URL`, `HTTP`, `SSH`, `SMTP`,
  `FTP`, `ANSI` are the only abbreviations allowed, because they are standard.

---

## 1. Library decision

**Recommendation: Radix Primitives in the shadcn/ui form - vendored source under
`web/config-app/src/components/ui/` - plus TanStack Table v8 for every data
grid. Tailwind stays (bump `^3.3.6` to `^3.4`). No component library runtime.**

New dependencies:

| Package | Why |
|---|---|
| `@radix-ui/react-*` (dialog, alert-dialog, dropdown-menu, popover, select, tabs, tooltip, switch, checkbox, radio-group, scroll-area, separator, slot, toast, collapsible, toggle-group) | Accessibility, focus management, keyboard behaviour. Imported individually, 3-12 kB gzip each, tree-shaken. |
| `@tanstack/react-table` v8 | Headless sorting, filtering, column sizing, row selection, virtualisation hook. Pairs with the existing `@tanstack/react-query`. |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Variant typing for the vendored components, with no `any`. |
| `tailwindcss-animate` | The enter/exit keyframes Radix data-attributes expect. |
| `@hookform/resolvers` | `react-hook-form` and `zod` are both already dependencies but not wired together. |

### The decisive trade-off

Radix **Themes** ships its own reset, its own token system and roughly 180 kB of
CSS. Layering it over an app that is 100 % Tailwind across 28 pages and 11 847
lines means two spacing scales, two colour systems and two ways to draw a
border, live at the same time, for the whole length of a multi-phase migration.
A half-migrated tree in that state is worse than either end state, and this
migration is explicitly phased.

shadcn/ui is the *same* Radix accessibility expressed as Tailwind classes in
files we own. A converted page and an unconverted page then share exactly one
styling vocabulary and one token set, so the tree is coherent at the end of
every phase. The cost is that we own the component source and its future fixes.
That cost is accepted, because owning the source is also the only way to hold
`strict` with no `any` (we control the prop types) and to reach sysop-grade
density without fighting a vendor theme with `!important`.

### Rejected, specifically

- **Radix Themes** - the token and CSS collision above; and it has no data grid,
  so TanStack Table would be needed anyway.
- **MUI / Ant Design / Mantine** - each brings its own styling engine and a
  300 kB+ floor, and would displace Tailwind rather than sit beside it.
- **Base UI** (the Radix/MUI successor line) - probably the better long-term
  primitive set, but its canonical component recipes are not yet where shadcn's
  are, so adopting it means hand-writing every component with no reference. Not
  worth it at this project's size. The vendored-source approach is itself the
  hedge: swapping the primitive underneath later is a per-component change, not
  a rewrite.
- **Headless UI** - smaller surface, no context menu, weaker keyboard coverage
  than Radix for the menus and dialogs a dense admin needs.

### Charts

No chart library. Two small SVG components (`Sparkline`, `BarSeries`) in the
design system cover every tile the Overview needs. There is no time-series
endpoint today - `/api/stats/system` returns scalars
(`statistics-routes.ts:190-260`) - so a 100 kB charting runtime would be paid
for data that does not exist. Revisit only when a real series endpoint lands.

### Bundle budget

Admin bundle after Phase 1: **400 kB gzip or less**, checked by reading the
`vite build` output at the end of each phase. Heavy leaves (Operator Chat with
xterm, Import & Export, Session Logs) are `React.lazy` from Phase 1.

---

## 2. Information architecture

Today: a flat 27-item sidebar (`components/Layout.tsx:37-64`) with no grouping,
landing on `SystemConfigPage` - a 1 729-line form - as the home page. That is
backwards: the first screen a sysop sees should be the state of the board.

**Landing page becomes a new Overview dashboard at `/admin`.**

### Primary navigation - grouped

**Live**
| Destination | Composed from |
|---|---|
| Overview | new `OverviewPage` |
| Nodes | `NodeControlPage` + `NodesPage` merged. Tabs: "Live" (default) and "Configuration". Both write what they wrote before. |
| Activity | new `ActivityPage` - the live `bbs:event` feed, seeded from the last-callers / last-uploads / last-downloads endpoints |
| Operator Chat | `OperatorChatPage`, with `OperatorChatSettingsPage` demoted to a "Settings" tab inside it |

**People**
| Destination | Composed from |
|---|---|
| Users | `UsersPage` |
| Access Levels | `SecurityPage` (already disk-backed onto `Access/ACS.<level>.info`) |

**Content**
| Destination | Composed from |
|---|---|
| Conferences | `ConferencesPage`, with `DrivesPage` as a "File areas" tab. Both write `Conf<N>.info` - Drives writes `DLPATH.n` / `ULPATH.n` on the same file the Conferences form already edits, so they belong on one screen. |
| Doors | `DoorsPage` |
| Global Wall | `GlobalWallPage` |

**System**
| Destination | Composed from |
|---|---|
| Configuration | `SystemConfigPage`, sectioned |
| Configuration Files | `InfoEditorPage` + `SystemFilesPage` + `AmiXnetPage` + `BatchEditorPage` merged behind one file tree with scope filters |
| Lookup Tables | `ComputersPage` + `ScreenTypesPage` + `LanguagesPage` + `ProtocolsPage` + `FileCheckersPage` as five tabs |
| Health and Deployment | `HealthCheckPage` + `DeploymentPage` as two panels |

### Secondary navigation - collapsed section at the foot of the sidebar

Statistics (the historical view, once the live parts move to Overview and
Activity), System Logs, Session Logs, Audit Log, Import and Export.

### Why these merges

- **Configuration Files**: `InfoEditorPage`, `SystemFilesPage` and `AmiXnetPage`
  are literally the same tooltype editor over three hardcoded file lists - all
  three declare the identical `interface Tooltype { key, value, commented,
  originalLine }` and all three call `apiClient.updateInfoFile`. `AmiXnetPage`
  hardcodes its list in `AMIXNET_FILES` (`AmiXnetPage.tsx:20`). One tree with a
  scope filter replaces all three. `BatchEditorPage` is a text editor with
  validation over `batch*.info`; it becomes a second editor mode chosen by file
  type, so a sysop reaches every disk file from one place.
- **Lookup Tables**: five small CRUD lists of the same shape (id, name, a
  handful of fields, create/update/delete). Five sidebar slots for five tables
  nobody edits twice a year is the definition of a flat menu that hides the
  important things.
- **Nodes**: the live view and the configuration of the same object should not
  be two sidebar entries.

Result: 13 primary destinations plus 5 secondary, down from 27 flat entries.

### Route compatibility - mandatory

Every existing path keeps working, permanently, as a redirect carrying the right
tab. `/admin/node-control` to `/admin/nodes?tab=live`, `/admin/drives` to
`/admin/conferences?tab=file-areas`, `/admin/computers` to
`/admin/lookup-tables?tab=computers`, and so on. Bookmarks and any link written
into a runbook stay valid. A test asserts the full legacy table resolves.

---

## 3. The realtime story

### What already exists on the wire

| Event | Source | Scope | Payload |
|---|---|---|---|
| `bbs:event` | `services/bbs-event-emitter.ts:226` | `io.emit`, every socket | `{ type, username, nodeId, timestamp, data }` where `type` is `user_login \| user_logout \| upload \| download \| door_activity \| custom_door_event` |
| `operator:page` | `handlers/operator-chat.handler.ts:480` | room `sysops` | new sysop page request |
| `operator:page-accepted` | `operator-chat.handler.ts:691` | `io.emit` | page claimed by a sysop |
| `operator:message`, `operator:chat-started`, `operator:chat-ended`, `operator:typing-status` | `operator-chat.handler.ts` | room `page:<id>` | operator chat traffic |
| `operator:pending-pages` | reply to `operator:get-pending-pages` | per socket | backlog |
| `import:progress` | `bbs-event-emitter.ts:213` | room `admin` | `{ sessionId, progress, message }` |
| `active-users` | reply to `get-active-users`, `server/socket-handlers.ts:204` | per socket | node number, username, location, IP |
| `supervisor:command` | `api/node-control-routes.ts:86` | server to node | not for the dashboard; the dashboard *causes* these over HTTP |

### Genuinely live - subscribe

- **Node occupancy and who is online.** `bbs:event` `user_login` / `user_logout`
  both carry `nodeId`. On receipt, invalidate `['nodes','status']`.
- **Door activity.** `door_activity` (`entered` / `exited`) and
  `custom_door_event` drive the "current door" line on each node card and the
  Activity feed.
- **Transfers.** `upload` / `download` drive the Activity feed and the "today"
  counters, and invalidate `['stats','system']`.
- **Operator pages.** `operator:page` raises a toast and a sidebar badge from
  anywhere in the app, not only while the Operator Chat page is open. This is
  the single most valuable realtime feature for a sysop and today it only works
  if you happen to be on that page.
- **Import progress.** Works once something actually joins the `admin` room -
  see Phase 2.

### Not live - poll with TanStack Query, deliberately

- **Node detail** (`state`, `subState`, `timeRemaining`, `baud`, `reservedFor`)
  has no push source; it is read from the in-memory `sessions` map by
  `GET /api/nodes/status` (`node-control-routes.ts:342`). Poll at 10 s while a
  node surface is mounted, 60 s otherwise, and invalidate immediately on any
  `bbs:event` carrying a `nodeId`. The socket makes the poll feel instant
  without a new endpoint; that is the point.
- **Statistics aggregates** - 30 s. They are `COUNT(*)` queries.
- **Health check** - on mount and on demand only. `runFullHealthCheck()` walks
  the filesystem; polling it would be a self-inflicted load.
- **Log tail** - keep the existing 3 s poll (`LogsPage.tsx:40`). It reads files
  from disk and there is no socket source. Make the interval visible and give it
  a pause control instead of hiding it.
- **All configuration data** - no polling at all. `staleTime: Infinity`,
  invalidated on mutation. Config does not change behind your back, and a poll
  that refetches a form you are typing into is a bug.

### Degradation when the socket drops

A `RealtimeProvider` exposes `status: 'live' | 'reconnecting' | 'offline'`.

- `live`: intervals sit at the slow background rate; the header shows a "Live"
  pill with a green dot and the seconds since the last event.
- `reconnecting` / `offline`: every realtime-backed query drops to its fast rate
  (node status 10 s to 3 s), and the pill reads "Polling" in the warning colour.
  Nothing goes blank; the app keeps working, just slower and dumber.
- On reconnect: one batched invalidation of all realtime-backed keys, then back
  to the slow rate.

Invalidations from `bbs:event` are coalesced on a 250 ms trailing window. A busy
board can emit several events a second and a naive
`invalidateQueries`-per-event would hammer `/api/nodes/status`.

### Typing

`src/types/realtime.ts` mirrors `BBSEventPayload` as a discriminated union on
`type`, so `data` narrows per event (`upload` has `fileName`, `fileSize`,
`conferenceId`; `door_activity` has `doorName`, `action`). No `any` crosses the
socket boundary.

---

## 4. Design system

Dark-first, single theme. Tokens live in `web/config-app/src/styles/tokens.css`
as CSS custom properties and are mapped in `tailwind.config.js`. The existing
`bbs-*` names are kept as **aliases onto the new ramp** so the 28 unconverted
pages inherit the improvement without a rename diff.

### Surfaces

```
--surface-0      #0b0e14   page background
--surface-1      #11151d   panel, card
--surface-2      #171c26   raised: table header, popover, sidebar
--surface-3      #1e2431   hover, selected row
--border         #232a38   hairline
--border-strong  #313a4d   input border, focused panel
```

No drop shadows on cards. On a dark UI, depth comes from the surface ramp.
Shadows are for true overlays only: `--shadow-overlay: 0 16px 32px -8px rgb(0 0
0 / 0.6)`.

### Text

```
--text-primary    #e6e9ef
--text-secondary  #a3adbf
--text-muted      #6b768a
--text-inverse    #0b0e14
```

### Brand and action

```
--brand         #e94560   AmiExpress red - wordmark and active nav indicator only
--accent        #4d9dff   primary action, focus ring
--accent-hover  #6cb0ff
```

The current app paints every primary button in `bbs-accent` red
(`index.css:.btn-primary`). Red on every button reads as danger and is a real
part of why the interface feels alarming. Red retires to the wordmark; blue
carries action; red is reclaimed for destruction only.

### Status

```
--status-ok       #3fb950   node online, healthy check
--status-warn     #d29922   degraded, reserved, idle
--status-danger   #f85149   offline with error, failed check, destructive
--status-info     #4d9dff
--status-neutral  #6b768a   configured but not connected
```

Each has a `-bg` companion at 12 % alpha for chips.

`StatusDot` is an 8 px circle **always accompanied by a text label**. Colour is
never the only channel - a hard requirement, not a nicety. Node states: Online
(ok), Idle (neutral), Reserved (warn), Offline (hollow neutral ring), Error
(danger). User online is a dot plus the node number in mono.

The header carries one **system pill**: uptime, nodes online over total, socket
status.

### Type

Base is **13 px**, not 16. Sysop dashboards are dense.

```
--text-2xs  11 / 16
--text-xs   12 / 16
--text-sm   13 / 18   body default
--text-base 15 / 22
--text-lg   18 / 24
--text-xl   22 / 28
--text-2xl  28 / 34
```

Body copy is sans (system stack). Every identifier, path, tooltype key, node
number, byte count and timestamp is mono with `font-variant-numeric:
tabular-nums`.

**Reverse the current default.** `index.css` sets `font-mono` on `body`, so the
entire admin is monospace. That single line is a large part of "it looks like
shit" - it makes prose look like a terminal dump and removes the mono/sans
contrast that should mark what is a real filesystem value.

### Spacing, radius, density

4 px base: `--space-1..8` = 4, 8, 12, 16, 20, 24, 32, 40. Card padding drops
from the current 24 px (`.card { p-6 }`) to 16 px.

Radius: `--radius-sm 4`, `--radius-md 6`, `--radius-lg 8`. Nothing is fully
rounded except avatars and status dots.

Density toggle in the header, persisted in `localStorage` under
`admin.density`: comfortable rows 32 px, compact rows 28 px.

### Table conventions

- Sticky header on `--surface-2` with a 1 px `--border` underline.
- No zebra striping. Hover is `--surface-3`; the selected row gets a 2 px
  `--accent` left border.
- Numeric, byte and duration columns right-aligned, tabular numerals.
- Row actions in a trailing column as icon buttons, revealed on hover via
  `opacity` - never `display: none`, so keyboard order survives.
- Sorting through TanStack Table; header buttons carry `aria-sort`.
- Destructive actions are never an inline primary button. They open a Radix
  `AlertDialog` naming the object, and for the irreversible ones (overwriting a
  door `.info`, deleting a user) the name must be typed back.

### Form conventions

- Single column, labels above, 13 px label in `--text-secondary`, help text
  below in `--text-muted`.
- Field width follows content: a port number gets an 8-character input, not a
  full-width one. Prose fields cap at 42 rem.
- **Every disk-backed field shows its tooltype key in mono in the help line**,
  for example `bbsConfig.info : SYSOP_NAME`. This is the highest-value
  affordance in the whole redesign - it makes the disk-first model visible and
  lets a sysop cross-check against the file.
- Dirty state is a page-level sticky footer: changed-field count, "Save
  changes", "Discard".
- **Autosave is removed** from `SystemConfigPage` (`autoSaveTimer`,
  `SystemConfigPage.tsx:67`). A debounced write to `bbsConfig.info` while the
  BBS is reading that file is a footgun.
- Validation via `zod` plus `react-hook-form` with `@hookform/resolvers` - both
  base libraries are already dependencies and currently unwired.
- Errors inline under the field, plus a summary at the top of the form linking
  to the first error.

### Four states, for every data surface

- **Loading** - skeleton rows at the final row height. Never a centred
  "Loading..." string (which is what `App.tsx:47` does today).
- **Empty** - a component: icon, one sentence in `--text-secondary`, and the
  action that would create the first row.
- **Error** - inline panel carrying the actual API message and a Retry button
  wired to `refetch()`.
- **Stale** - last known data at 60 % opacity with a "Last updated HH:MM:SS"
  caption, used whenever the socket is down.

---

## 5. Phased delivery

### Phase 0 - Unblock the typecheck gate and the free wins

Half a day. Nothing here is design work; all of it is required before design
work can be verified.

Files:
- `web/config-app/src/vite-env.d.ts` (new): `/// <reference types="vite/client" />`.
  This clears both pre-existing errors - `App.tsx(38,34)` and
  `OperatorChatPage.tsx(73,19)`, `Property 'env' does not exist on type
  'ImportMeta'` - without editing either file.
- `web/config-app/tailwind.config.js`: add the five colour tokens that are used
  but do not exist. Across `src/` there are **78 uses of `bbs-border`, 23 of
  `bbs-secondary`, 14 of `bbs-background`, 6 of `bbs-hover` and 1 of
  `bbs-error`** - 122 class names that compile to nothing, in 14 files including
  `components/DataGrid.tsx` (whose table header border is invisible),
  `UsersPage`, `SystemConfigPage`, `DoorsPage`, `LogsPage`. Neither audit
  records this. It is the cheapest visible improvement available.
- `web/config-app/src/pages/NodeControlPage.tsx:93`: change
  `` `/api/system/${command}` `` to `` `/api/nodes/${command}` ``. The handlers
  are `router.post('/toggle-chat')` and `router.post('/quiet-mode')` on
  `nodeControlRouter` (`node-control-routes.ts:383`, `:406`), mounted at
  `/api/nodes` (`server/routes-setup.ts:161`). Frontend-only, so no backend
  contract moves.
- `web/backend/src/api/node-control-routes.ts:16-17`: correct the two doc
  comments that claim `POST /api/system/toggle-chat`. Those comments are what
  the page believed.
- `web/config-app/package.json`: add `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` and a
  `test` script, mirroring `web/frontend/package.json` exactly. No tests yet -
  the runner is the gate for later phases.

User-visible at the end: the Node Control chat and quiet-mode toggles stop
silently 404ing, and 14 pages get their borders and panel backgrounds back.

Verified by: `cd web/config-app && npx tsc --noEmit` prints nothing (this is the
gate for every later phase); `npm run build` succeeds; manually, toggling chat
logs `[Node Control] Chat enabled globally` on the backend.

### Phase 1 - Shell, design system, and the Overview dashboard end to end

Files touched:
- new `src/styles/tokens.css`; rewritten `tailwind.config.js`, `src/index.css`
- new `src/components/ui/*` - the vendored primitives, `components.json`
- new `src/components/AppShell/` - `AppShell.tsx`, `Sidebar.tsx`, `Header.tsx`,
  `Breadcrumbs.tsx`, `nav-config.ts`
- replaced `src/components/Layout.tsx`
- rebuilt `src/components/DataGrid.tsx` on TanStack Table
- reimplemented `src/contexts/NotificationContext.tsx`,
  `src/components/Toast.tsx`, `src/components/ConfirmModal.tsx`
- new `src/pages/OverviewPage.tsx`
- `src/App.tsx` - route table, index route, lazy leaves

Constraints on this phase:
- `NotificationContext`'s public surface - `showSuccess`, `showError`,
  `confirm` - keeps its exact signatures while the implementation moves onto
  Radix Toast and AlertDialog, so none of the 28 pages change.
- `DataGrid` keeps the existing `DataGridColumn<T>` prop shape as a
  compatibility layer (it is consumed by `NodesPage` and others) and gains a
  richer API for converted pages.
- The `bbs-*` names stay as aliases. **Do not rename tokens across 11 847
  lines** - that diff is unreviewable.

Overview composition, all from endpoints that exist today:
- Tiles: nodes online over total, users online now, calls today, uploads today,
  downloads today, health summary, sysop pages waiting.
- Node strip: one card per node - StatusDot, username, current activity, time
  remaining, reservation badge, quick actions.
- Recent activity list, seeded from the last-callers / last-uploads /
  last-downloads endpoints.
- Health summary panel.
- Sources: `GET /api/nodes/status`, `/api/stats/system`, `/api/stats/last-callers`,
  `/api/stats/last-uploads`, `/api/stats/last-downloads`, `/api/config/health`,
  `/api/deployment/system-info`. **Polling only in this phase** - no socket yet,
  so the phase stays purely frontend and ships independently.

User-visible at the end: logging in lands on a real dashboard showing the board
at a glance, in a dense dark theme with a grouped sidebar; every old page is
still reachable and looks better because the tokens now resolve.

Verified by: `tsc --noEmit` clean; `npm run build` with the gzip figure recorded
against the 400 kB budget; vitest unit tests for the `StatusDot` state mapping
and the tile formatters (bytes, durations, relative times); manually, with two
telnet sessions connected the Overview shows two nodes online with the correct
usernames.

### Phase 2 - The realtime layer, Nodes, Activity

**The one additive backend change.** In `web/backend/src/index.ts`
`io.on("connection")` (line 1385), add a branch for
`socket.handshake.query.adminOnly === 'true'`, placed beside the existing
`chatOnly` branch at line 1448 and **before** the node assignment at line 1533.
It joins `admin` and `user:<id>`, skips
`nodeManager.assignSessionToNode(socket.id, socket.id)`, skips the CONNECT and
welcome sequence, and returns. It gates on the authenticated sysop session the
JWT middleware already attaches at `index.ts:794-802` - `secLevel >= 100`
checked server-side, never trusting the query flag.

This is additive: no client sends `adminOnly` today, no route moves, no payload
changes, nothing is written anywhere new.

It also fixes two defects neither audit records:

1. **The admin app currently consumes a BBS node.** `OperatorChatPage.tsx:76`
   opens a plain socket with a JWT and no `chatOnly` flag. The JWT middleware
   attaches a session object but does not register it, so
   `io.on("connection")` falls all the way through to
   `assignSessionToNode` at line 1533 and hands the admin browser a real node
   plus the full `/X Native Telnet: Searching for free node...` welcome. Every
   visit to Operator Chat burns a node and shows up as a phantom user in node
   status. A realtime dashboard on a permanent socket would make this permanent.
2. **The `admin` room has never had a member.**
   `bbs-event-emitter.ts:213` emits `import:progress` to `io.to('admin')` and
   nothing anywhere joins that room. Import progress has never reached a
   browser.

`initOperatorChatHandler` registers its own independent `io.on('connection')`
listener (`handlers/operator-chat.handler.ts:77`), so the early return does not
disturb operator chat - the sysop socket still joins `sysops` and gets its
`operator:*` handlers.

Frontend:
- new `src/realtime/RealtimeProvider.tsx` - one socket for the whole admin app,
  `io(origin, { auth: { token }, query: { adminOnly: 'true' } })`, exposing
  `status`, `lastEventAt` and a typed `useBbsEvents()`.
- new `src/types/realtime.ts` - the discriminated union described in section 3.
- new `src/realtime/query-bridge.ts` - the coalesced event-to-query-key mapping.
- `src/pages/NodesPage.tsx` rebuilt as the merged Live plus Configuration page;
  `NodeControlPage.tsx` retired behind a redirect.
- new `src/pages/ActivityPage.tsx` - live feed, type filters, pause, 500-event
  ring buffer, seeded on mount so it is not empty on first paint.
- `OperatorChatPage.tsx` drops its own `io()` call and consumes the shared
  socket; `OperatorChatSettingsPage.tsx` becomes its Settings tab.

User-visible at the end: the dashboard updates the instant somebody logs on,
enters a door or transfers a file; a sysop page raises a toast from any screen;
the header shows Live or Polling honestly; and opening the admin no longer
occupies a node.

Verified by: `cd web/backend && npx tsc --noEmit && npm test`; a new backend jest
test asserting a socket handshaking with `adminOnly=true` never appears in
`sessions` and does not reduce the free node count; frontend vitest for the
coalescing bridge (N events inside the window produce one invalidation);
manually, open Overview, log in on the BBS from another browser, the node strip
flips to online in under a second with no refresh, and `/api/nodes/status`
reports the same free-node count with the dashboard open as with it closed.

### Phase 3 - The dense pages: Users, Access Levels, Doors, Conferences

- **Users** on TanStack Table - column sorting, a text filter, a detail sheet,
  the flag and level editors. Data path untouched (`user-repository` already
  syncs `user.data`).
- **Access Levels** - the already-fixed disk-backed ACS editor restyled, with
  the permission list grouped and searchable, and the "create a level by copying
  an existing one" flow given a proper dialog.
- **Doors** - the edit path already writes `Commands/BBSCmd/<command>.info`.
  This phase fixes the two create-path defects the page-by-page audit records:
  `writeDoorInfoFile` emits a `TYPE` from a runtime map yielding `TS` or
  `AMIGA`, neither of which the loader knows (it knows XIM, AIM, SIM, TIM, IIM,
  FIM, DD, typescript), and it emits a bogus first line
  `<door_type>=<command>`; and creating over an existing command replaces a
  binary `.info` with plain text, losing STACK, PRIORITY, NAME, MULTINODE and
  the Amiga icon. Route create through the same preserving tooltype writer the
  edit path uses, and put a hard typed confirmation in front of any create whose
  target `.info` already exists.
- **Conferences** absorbs Drives as a File areas tab.

Verified by: `tsc --noEmit`; backend jest tests asserting (a) create-door writes
a `TYPE` the loader accepts and (b) creating over an existing `.info` preserves
STACK, PRIORITY, NAME and MULTINODE; manually, round-trip one door and one ACS
level and confirm the result with a tooltype dump of the file on disk.

### Phase 4 - Configuration and configuration files

- `SystemConfigPage` split into a sectioned layout driven by the category map
  that already exists at `SystemConfigPage.tsx:84-89`, with a left section rail
  instead of a filter dropdown, an explicit sticky save bar in place of the
  debounced autosave, and every field annotated with its `bbsConfig.info`
  tooltype key.
- New `ConfigFilesPage` merging the four editors behind one tree with scope
  filters (All, System, AmiXnet, Batch, Commands, Conferences).
  **Note: `InfoEditorPage.tsx` is currently orphaned** - 351 lines, not imported
  by `App.tsx`, not in the sidebar, unreachable. Its features (per-tooltype
  comment toggling via `toggleTooltypeComment`, add and remove tooltype) are
  therefore not available to a sysop today, despite the page-by-page audit
  listing it under "Correct already". The merge is what brings them back.

Verified by: `tsc --noEmit`; manually edit one tooltype in each of the four
scopes and diff the `.info` before and after.

### Phase 5 - Lookup tables, health, diagnostics, and retirement

- One `LookupTablesPage` with five tabs over a shared generic CRUD table typed
  by a per-tab descriptor.
- `HealthPage` merging Health Check and Deployment.
- Diagnostics restyled: System Logs, Session Logs, Audit Log, Import and Export
  (now with working live progress from Phase 2), Statistics as the historical
  view.
- Delete old page files **only after** their replacements ship and are verified.
  Keep every legacy `<Route>` redirect permanently.
- Remove the emoji present in `src/components/import/FileUploader.tsx`,
  `ImportResults.tsx`, `ValidationResults.tsx` and `ImportExport.css` - the only
  emoji in the admin app, and a project-rule violation.

Verified by: `tsc --noEmit`; full build with the bundle figure recorded; a route
table test asserting every legacy path still resolves to the right destination
and tab; a click-through of all 18 destinations.

---

## 6. Risks

1. **28 pages is a lot of surface to regress.** Mitigated by the token alias
   layer - unconverted pages keep rendering throughout - by never deleting a
   page before its replacement is verified, and by permanent legacy redirects.
2. **Several pages are the only route to a piece of BBS configuration.** Before
   any merge, produce a route-to-capability inventory and assert in a test that
   each capability is still reachable. Known singletons: Access Levels is the
   only `Access/ACS.<level>.info` editor; Batch Editor the only `batch*.info`
   editor; Drives the only `DLPATH.n` / `ULPATH.n` editor; Configuration Files
   will be the only generic tooltype editor. `InfoEditorPage` is already a case
   of this failing silently and nobody noticing.
3. **Behaviour is not fully verified.** The page-by-page audit states explicitly
   that per-field round-tripping was not checked, and flags the door NAME field
   as a confirmed instance of a field round-tripping wrong (it wrote a door's
   command into its title and renamed it). Rule for every phase: **never
   restyle a form and change its data path in the same commit.** Restyle first
   with the handlers untouched, verify on disk, then change behaviour.
4. **The audits' own method warning applies to this plan.** Both documents
   record that scripted counting produced three rounds of false positives and
   then, in a second document, was wrong about ten more pages. Every claim in
   this plan that a page "just needs restyling" is a lead, not a result -
   confirm by reading the mutation path before touching it.
5. **Realtime feedback loops.** `bbs:event` is a global `io.emit` and fires
   often on a busy board. Coalesce invalidations on a 250 ms trailing window and
   cap the Activity ring buffer at 500 entries.
6. **Socket authentication is a security surface.** The `adminOnly` branch must
   read `secLevel` from the JWT-derived session server-side. A non-sysop passing
   `adminOnly=true` must fall through to the normal BBS path, not get a silent
   privileged socket. `VITE_BYPASS_AUTH` (`App.tsx:38`) exists and bypasses the
   frontend guard entirely - it must not gain any influence over the socket
   handshake, and it should be removed as soon as a sysop account is guaranteed.
7. **Bundle and first paint.** Budget 400 kB gzip, checked per phase; lazy-load
   Operator Chat (xterm), Import and Export, and Session Logs.
8. **Removing autosave changes muscle memory** for anyone used to
   `SystemConfigPage` saving itself. Call it out in the release note. It is
   still the right change: a debounced write to a file the running BBS reads is
   not a feature.

---

## As built, 2026-08-30

Phases 0 to 5 are implemented, with two deliberate departures:

1. **TanStack Table v9, not v8.** v9 is what installs today, and its API is
   different: `useTable` with explicit `tableFeatures` registration instead of
   `useReactTable` with row-model options. A v9 table missing its feature
   registration renders correctly and sorts nothing, so
   `web/config-app/src/test/data-table.test.tsx` drives the rendered table and
   asserts the row order changes.
2. **Configuration Files is four tabs, not one tree with scope filters.** Tabs
   preserve each editor exactly; the tree meant rewriting three pages that are
   each the only route to their files. The tree is still the better end state.

Also delivered beyond the plan:

- A caller paging the sysop raises a toast and a header badge from any screen,
  seeded from `operator:get-pending-pages` and corrected when a page is
  accepted or a chat ends.
- `confirm()` gained `requireTypedConfirmation`, used for deleting a user and
  deleting a door.
- Computers and Protocols were given the screen-types disk-first fix, and
  `mergeForWrite` gained a `rename` argument - without it an edit that changes
  the key leaves the entry in the file twice.

Not done:

- Per-field round-trip verification, which the audits also left open.
- The `VITE_BYPASS_AUTH` escape hatch in `App.tsx` is still there.
- Nothing here has been opened in a browser.
