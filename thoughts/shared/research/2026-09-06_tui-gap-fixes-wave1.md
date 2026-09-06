---
date: 2026-09-06
topic: TUI admin (dev/console) emergency-blocking gap fixes, wave 1 - Access Levels, Users, Nodes, Global Wall, Doors
tags: [tui, admin, config-app, gap-fix, security-page, doors, nodes, users, node-reservation]
status: final
---

# TUI admin gap fixes, wave 1

Branch `fix/tui-admin-gaps`, cut from origin/main. Fixes the emergency-blocking and
one adjacent gap identified in
`thoughts/shared/research/2026-09-06_web-vs-tui-admin-gap-audit.md` (Depth Gap sections
1, 2, 3, 5, 6). Five commits, one per gap, each independently revertable:

| Commit | Gap |
|---|---|
| `b29f95666` | Depth Gap 2 - Access Levels page |
| `c138e6d25` | Depth Gap 1 - Users: password reset + create |
| `a31144a58` | Depth Gap 6 - Nodes: dead chat hotkey removed, reservation added |
| `a1b5f1f40` | Depth Gap 5 - Global Wall page removed |
| `7f153d70b` | Depth Gap 3 (partial) - Doors: delete added |

All five kept `dev/console` type-checking clean (`npx tsc --noEmit`, run after every
commit) and touched no file under `web/backend/` or `web/config-app/` - every fix
points the TUI at endpoints and contracts that already exist and that the web admin
already calls the same way.

## Verification method

`dev/console` has no test harness (`package.json` scripts: `build` (`tsc`), `start`,
`start:strip`, `dev` (`tsx`) - no `test` script, no `*.test.ts` files under
`dev/console/src/`). Verification for every change below is:

1. `npx tsc --noEmit` in `dev/console/` after each commit - strict mode, no `any` in
   any line added or changed.
2. Read the corresponding web admin page/client method and backend route in full
   before writing the TUI equivalent (never inferred from the audit's summary alone),
   confirming exact endpoint path, HTTP method, body shape, and field names.
3. Manual trace of each new key handler's state transitions against the existing
   ConfirmDialog/InlineEdit/CrudList patterns already in `dev/console/src/components/`.

No `web/backend/` changes were made, so its own test/typecheck suite is unaffected and
was not run (out of scope: the task said touch nothing outside this worktree and no
backend file was edited).

## Gap 1 - Access Levels page (Depth Gap 2, commit `b29f95666`)

**What changed:** `dev/console/src/components/tabs/SecurityPage.tsx` rewritten from a
`CrudList` over `getSecurity/createSecurity/updateSecurity/deleteSecurity`
(`/api/config/security/:level`, CRUD on the SQLite `security_level_access` table) to a
level-stepper + flat, filterable, toggleable permission list backed by
`getAcsLevels/getAcsLevelFlags/saveAcsLevelFlags/createAcsLevel`
(`/api/config/security/levels*`), added to `dev/console/src/api/client.ts`. The old
`getSecurity`/`createSecurity`/`updateSecurity`/`deleteSecurity` functions and the
`SecurityRow` type (`dev/console/src/api/types.ts`) were deleted outright rather than
left dead, since nothing else referenced them (confirmed by repo-wide grep before
deleting).

**Matched against:** `web/config-app/src/pages/SecurityPage.tsx` and
`web/config-app/src/api/client.ts:617-636` (`getAcsLevels`/`getAcsLevelFlags`/
`saveAcsLevelFlags`/`createAcsLevel`), which hit
`web/backend/src/api/config-routes.ts:1034-1166`, backed by
`web/backend/src/services/config-services/acs-level-file.service.ts`. Same paths, same
HTTP verbs, same body shapes (`{ flags: Record<string, boolean> }` for save,
`{ copyFrom? }` for create).

**Deliberately not ported:** the web's permission grouping/labeling
(`web/config-app/src/pages/acs-permission-groups.ts`, ~90 permissions across labeled
sections with human-readable descriptions, 293 lines) and the "ambiguous =NO flags"
warning box are reduced to a flat list plus a compact warning line. The audit's effort
estimate for this gap called the grouped UI "real design work... but skipping the
redesign and just wiring the right endpoints with a flat togglable list would already
fix the 'does nothing' bug, which is the more urgent half" - taken at face value. The
`inUse`/`servedBy` concept (which ACS file actually serves a given user level, since
express.e rounds down to the nearest multiple of five) IS carried over as a one-line
summary, since dropping it silently would reintroduce a smaller version of the same
"looks like it worked, wasn't" problem the file-vs-database bug was.

**Verified:** `tsc --noEmit` clean. Manually traced: level stepping via arrow keys
reads `info.levels` (from `getAcsLevels()`), flag toggle via space/enter flips
`flags[name]` client-side and sets `dirty`, save requires a ConfirmDialog naming the
target file (`ACS.<level>.info`, plus any levels it also serves) before calling
`saveAcsLevelFlags`, new-level creation validates 0-255 client-side (server rejects
non-multiples-of-5, per `config-routes.ts:1146-1149`; error surfaces through the
existing `status` line since it comes back from the awaited promise's rejection).

## Gap 2 - Users: password reset and creation (Depth Gap 1, commit `c138e6d25`)

**What changed:** `dev/console/src/components/tabs/UsersTab.tsx` gained two new modes:
`password-form` (bound to `[p]` on a selected user) and `create-form` (bound to `[a]`).
Both are sequential-field editors (username/password/confirm/realname/email/location/
phone/secLevel/timeLimit/expert for create; password/confirm only for reset) navigated
with up/down/tab/enter, matching the field-by-field pattern `DoorsTab.tsx`'s inline
editor already uses rather than introducing a new form primitive. Password fields
render as asterisks matching typed length rather than the raw text.
`dev/console/src/api/client.ts` gained `createUser()` and widened `updateUser()`'s
type to accept an optional `password` field (the wire format was already correct -
this was a type-only gap, since `password` is intentionally excluded from
`UserRecord`, which mirrors what `GET /users` actually returns after stripping
`passwordHash`).

**Matched against:** `web/config-app/src/pages/UsersPage.tsx:32-189` (form fields,
validation order: username required, password required only for new users, password
must equal confirmPassword, confirmPassword stripped before send) and
`web/backend/src/api/config-routes.ts:1699-1948` (`POST /api/config/users`,
`PUT /api/config/users/:id`) - read in full before writing the TUI form, including the
disk-then-database write order and the reason password resets and secLevel edits both
went through `applyUserEditsToDisk`/direct database update (a prior incident where a
disk-only or database-only write left login checking the old value).

**Verified:** `tsc --noEmit` clean. Manually traced both submit paths: password-reset
validates non-empty and matching before calling `updateUser(id, { password })`;
create validates username non-empty, password non-empty, password match, then calls
`createUser` with `secLevel`/`timeLimit` parsed as integers (falling back to
`undefined` so the backend's own defaulting logic in `config-routes.ts:1696-1760`
applies, rather than the TUI inventing its own defaults).

## Gap 3 - Nodes: dead chat hotkey removed, reservation added (Depth Gap 6, commit `a31144a58`)

**What changed:** `dev/console/src/components/tabs/NodesTab.tsx`: removed the `[c]hat`
hotkey and `chatNode` import/call; removed the now-unused `chatNode` client function
entirely (confirmed unused elsewhere by grep before deleting). Added `[v]` reserve:
opens a username-input prompt (reusing the exact `chat-input`-style text-entry state
machine the old chat flow used) that calls a corrected `reserveNode(nodeId, username)`.
Node selection was changed to span ALL nodes (online and offline), not just online
ones, because reserving a node for an expected caller is inherently something done to
an offline node ahead of their call - `kickNode` still gates on `selected.online`.
Nodes with an active reservation show a `reserved: <username>` badge and pressing `[v]`
on one clears it immediately (matching the web's "Clear Reservation" button, which
also has no confirmation step - clearing is a toggle, not new destructive state).
`NodeStatus` (`dev/console/src/api/types.ts`) gained the `reservedFor` field the
backend already returns on `GET /api/nodes/status`.

**Matched against:** `web/backend/src/api/node-control-routes.ts:150-197`
(`POST /:nodeId/reserve`, body `{ username }` to set or `{}` to clear; note the
route does NOT require the node to be online) and
`web/config-app/src/pages/NodeControlPage.tsx:96-122` (reserve/clear handlers, and the
fact that the Reserve control is rendered for BOTH the online and offline node card
branches - confirmed by reading past line 340 to the `!node.online` block before
assuming reserve was online-only). The prior `reserveNode(nodeId)` TUI client function
took no username parameter at all, so wiring it to any UI (even the dead `SystemTab.tsx`
that imported it) could only ever hit the backend's clear-reservation branch or a 400 -
it was not just unwired, it could not have worked once wired.

**Verified:** `tsc --noEmit` clean. Manually confirmed `reserveNode`'s new optional
`username` parameter remains structurally assignable everywhere it was previously used
(the dead `SystemTab.tsx`'s `Record<NodeAction, (id: number) => Promise<unknown>>`
still type-checks against a function with an added optional parameter).

**Not addressed:** the Nodes Configuration tab (per-node settings CRUD) from the same
Depth Gap 6 - the audit ranks this "Inconvenient," not emergency-blocking, and it was
out of this wave's five in-scope items.

## Gap 4 - Global Wall page removed (Depth Gap 5, commit `a1b5f1f40`)

**What changed:** Deleted `dev/console/src/components/tabs/GlobalWallPage.tsx`, its
registry entry (`dev/console/src/pages/registry.ts`), its import/mapping in
`dev/console/src/App.tsx`, and the three now-orphaned client functions/types
(`getGlobalWallComments`, `updateGlobalWallComment`, `deleteGlobalWallComment`,
`GlobalWallComment`) from `dev/console/src/api/client.ts`.

**Decision: delete, not wire up.** Confirmed by a repo-wide case-insensitive grep for
`globalwall` across `web/backend/src/` that zero backend routes exist under that name
in any form - not a missing implementation, a retired one. `web/config-app/src/routes/
legacy-routes.ts:36` documents the feature was deliberately folded into per-door
`door.settings.json`. There is no real endpoint to point this at without inventing new
backend surface, which is outside a TUI-parity fix and outside this worktree's scope
(no `web/backend/` files were touched). Matches the instruction: "If any part cannot
be made real, REMOVE that control rather than leave it looking functional."

**Verified:** `tsc --noEmit` clean; post-deletion repo-wide grep for
`globalwall`/`GlobalWall`/`global-wall` inside `dev/console/src/` returns nothing.

## Gap 5 - Doors: delete added (Depth Gap 3, partial, commit `7f153d70b`)

**What changed:** `dev/console/src/components/tabs/DoorsTab.tsx` gained `[d]elete` on
the selected door, opening a `ConfirmDialog` naming both the door's display name and
its command before calling a new `deleteDoor(command)` client function. Added to
`dev/console/src/pages/registry.ts`'s footer hint and help keys.

**Matched against:** `web/config-app/src/api/client.ts:545-548`'s `deleteDoor(command)`
and `web/backend/src/api/config-routes.ts:704-778` (`DELETE /api/config/doors/:command`)
- read in full, including the comment documenting a prior bug where the door list's
array-position `id` was mistaken for a stable identifier and used to delete the wrong
door. The TUI's delete deliberately takes `selected.door_command ?? String(selected.id)`
as the identifier sent to the backend (falling back to `id` only if a door somehow has
no command, which the type allows but the data in practice always provides), matching
the web's identify-by-command approach rather than reusing the position-based `id` the
TUI's own (pre-existing, unmodified) `updateDoor` still keys off of.

**Verified:** `tsc --noEmit` clean.

**Not addressed, out of this wave:** create-door, upload-archive (correctly ruled
impractical over SSH per the audit's "Not gaps" section - install-by-path already
covers the terminal-shaped equivalent), and the per-door `settings.json` editor. All
three are the remainder of Depth Gap 3 and were not asked for in this wave's five
items.

## Not touched / explicitly out of scope for this wave

- **Admin Roles page** (destination-table gap, ranked Significant, not
  emergency-blocking) - not in the five assigned items.
- **Screen Files revisions/repair/MCI catalog**, **Conferences create/delete**, **log
  search/clear**, **Sprite Manager** - all ranked Significant or Inconvenient by the
  audit, none in scope.
- **Sprite Manager as a like-for-like port** - the audit's own "Not gaps" section calls
  bitmap preview/upload genuinely impractical in a blessed terminal; a reduced
  list/delete-by-name version would be a different, smaller feature and was not
  requested.
- Nothing in this wave required backend changes; every fix pointed the TUI at an
  endpoint the web admin (or, for reservation, the backend route directly) already
  exercises correctly.

## Files touched (wave 1, initial pass)

- `dev/console/src/api/client.ts`
- `dev/console/src/api/types.ts`
- `dev/console/src/components/tabs/SecurityPage.tsx`
- `dev/console/src/components/tabs/UsersTab.tsx`
- `dev/console/src/components/tabs/NodesTab.tsx`
- `dev/console/src/components/tabs/DoorsTab.tsx`
- `dev/console/src/components/tabs/GlobalWallPage.tsx` (deleted)
- `dev/console/src/pages/registry.ts`
- `dev/console/src/App.tsx`

---

## Review round: 10 findings addressed, plus a test harness

The coordinator's review of the initial pass verified every endpoint contract
correct (paths, verbs, body keys, `reserveNode`'s signature, door-identity-by-command)
but found two CRITICAL and eight Important defects in the TUI-specific behavior
around those contracts, plus asked for a test harness. All ten are fixed; the harness
is in place. Commits, in order:

| Commit | Addresses |
|---|---|
| `9e67b5179` | #1 (CRITICAL) - shared text-entry lock |
| `4aea714e2` | #1 cont. (Users) + #8 (Escape swallowed mid-submit) |
| `40673eda7` | #1 cont. (Security) + #2 (CRITICAL, footer/help) + #3 (dead-flag annotation) + #4 (served/unserved math) + #7 (error never clears) |
| `cc003802b` | #1 cont. (Nodes) + #5 (stale-index race) + #10c (empty reserve gives no feedback) |
| `b71cd8ee7` | #6 (click retargets delete / wedge) + #9 (typed confirmation, fuller message) |
| `f57f8d28d` | #8 cont. (client timeout) + #10a (stale comment) + #10b (raw JSON errors) |
| `ecd87f018` | test harness |

### #1 (CRITICAL) - free text and arrows collided with global hotkeys and sidebar nav

Root cause: Ink calls every mounted component's `useInput` for every keypress
regardless of which panel "looks" focused - there's no DOM focus model underneath it.
`App.tsx`'s `q`/`?` and `Sidebar.tsx`'s up/down/digit handlers fired unconditionally, so
a password containing "q" quit the console mid-reset, "?" swapped in the help overlay
over an open form, and - since `focusPanel` defaults to `'sidebar'` before the first
Tab - up/down inside a page's own form also cycled the sidebar's page selection and
unmounted the form under it.

Fix: `dev/console/src/state/text-entry-lock.ts` is a module-level flag (not React
state, for the same reason `Sidebar.tsx` already uses refs - "Ink registers the
handler once"), read/written through `dev/console/src/hooks/useTextEntryLock.ts`.
`App.tsx` gates `q`/`?` on it; `Sidebar.tsx` gates its entire input handler (arrows AND
the digit-driven category jump - both suffer the identical defect, digits especially
since secLevel/timeLimit fields are typed as digits) on it. Ctrl-Q was added as an
unconditional quit, independent of the lock, so a future page that fails to release it
can never make the console unquittable. Wired into all four pages this wave touches:

- UsersTab: locked whenever `mode !== 'list' || searching`.
- SecurityPage: locked whenever the page is past loading/error with levels present -
  its OWN idle state uses up/down and left/right, so unlike the other three pages the
  base "list" mode needs the lock too, not just its sub-modes.
- NodesTab: locked whenever `mode !== 'list'`.
- DoorsTab: locked whenever `editing || confirming || confirmingDelete`.

**Not retrofitted:** other existing pages (ConfsTab, LogsTab, the various CrudList-
based lookup-table pages) likely carry the same latent defect in their own search/edit
modes - this fix only covers the four pages this wave's scope touches. Flagging for a
future pass rather than expanding this wave's diff.

### #2 (CRITICAL) - Access Levels footer/help described a page that no longer exists

`registry.ts`'s `security` entry still said `[n]ew [e]dit [d]el [/]search [r]efresh`
with "Delete the selected row" - stale from the CRUD-table page this replaced. `e` and
`d` did nothing on the new flag-toggle list, and `[s]ave` - the one key that matters -
was never mentioned, so a sysop toggling flags with no visible save key would
reasonably conclude there wasn't one. Fixed to list the keys the page actually has:
toggle/save/new-level/filter/level-switch/reload.

### #3 (Important) - 19 permissions can't actually be changed through this file

Ported `ACS_NOT_FROM_THIS_FILE` from `web/config-app/src/pages/acs-permission-groups.ts`
into `dev/console/src/components/tabs/acs-not-from-file.ts` (same 19 keys, same
wording) and annotate those rows with a dim warning line under the toggle. No shared
package exists between `dev/console` and `web/config-app` to import this from a single
source - see the note at the end of this section.

### #4 (Important) - served/unserved level math

`inUse.filter(row => row.servedBy === level)` never excluded `row.level === level`
(a level always "serves itself"), so viewing level 20 showed "Also serves: level 20"
and the save confirmation read "for level 20 and level 20". Fixed to
`row.servedBy === level && row.level !== level`. Also added the case that was never
surfaced at all - `servedBy === null`, meaning NO ACS file grants that level anything -
which is the literal incident that got this page rewritten in the first place ("i tried
to add one for users at 30, it didn't let me pick a number"). Both web
(`SecurityPage.tsx`'s `inUse` rendering block) and the fixed TUI now show this.

### #5 (Important) - Nodes kick/reserve could act on the wrong node

`useNodes.ts` re-polls every 3s; `selected` was `nodes[selectedIdx]`, re-derived on
every render. A caller connecting/dropping while a kick or reserve dialog was open
could shift the array between the keypress that opened it and the confirm that acted -
kicking or reserving whoever now sits at that index, not who was shown. Fixed by
capturing `targetNodeId` at the moment `k`/`v` is pressed; the dialog, the prompt, and
the eventual `kickNode`/`reserveNode` calls all resolve through the captured id.
Display text (username) is still read live for niceness; only the id is load-bearing.

### #6 (Important) - Doors delete: click retargeting and a wedge

`useGridClick` was gated only on `!confirming` (the reload-all dialog), not
`!confirmingDelete` - a stray click while the delete confirmation was open could move
`selectedIdx`, and since the old code derived both the message and the delete target
from `selected` fresh on every render, the click could retarget which door gets
deleted. Also: the boolean `confirmingDelete` plus a render condition of
`confirmingDelete && selected` meant that if `selected` ever stopped resolving while
the boolean stayed true, the dialog would vanish while `useInput`'s
`if (confirming || confirmingDelete) return` kept blocking all input - a wedge with
nothing on screen to interact with. Fixed by replacing the boolean with
`deleteTarget: DoorInfo | null`, captured by value on `d`; the dialog's render
condition and the delete call no longer depend on the live selection at all. Click
gating extended to `!confirming && !confirmingDelete && !editing`.

### #7 (Important) - Access Levels error state had no way back

`error` was set on failure and never cleared on a later success, and `r` was gated on
`level !== null` - so a failed INITIAL load (before any level was ever set) left a bare
error line with no key that did anything. `loadLevels`/`loadFlags` now clear `error` at
the start of each attempt; `r` reloads unconditionally; the error view shows
`[r] retry`.

### #8 (Important) - a hung backend could trap the Users form permanently

`if (submitting) return` in the password-form/create-form handler sat above the
Escape check, swallowing it - the only way out of a form waiting on a
never-responding backend was killing the console. Escape now short-circuits before
the `submitting` guard. Paired with a root-cause fix at the layer that actually owns
the network call: `client.ts`'s `request()` now wraps every fetch in a 15s
`AbortController` timeout, so a hang resolves (with a clear "Request timed out"
error) even without the Escape fix.

### #9 (Important) - door delete undersold what it does, and a stray 'y' was enough

The confirmation said only "removes its .info registration"; `amigaDoorManager.ts`'s
delete (`amigaDoorManager.ts:1604-1633`) also removes every alias registration
pointing at the same directory and the directory itself if nothing else claims it -
undersold on the single most destructive action in this wave. Message updated.
`ConfirmDialog.tsx` (the shared component, used elsewhere for plain y/n) gained an
optional `requireTypedConfirmation` prop mirroring
`web/config-app/src/components/ui/ConfirmDialog.tsx`'s prop of the same name and same
exact-match-after-trim semantics; the door-delete dialog now requires typing the door's
command back rather than a single keypress.

### #10 (Minor) - three small ones

- `client.ts` had a stray "Global wall" mention in a section-header comment, left over
  from the page removed earlier in this wave. Deleted.
- HTTP error bodies surfaced as raw response text - `HTTP 400: {"success":false,
  "message":"..."}` under time pressure. `request()` now extracts `message`/`error`
  when the body is JSON shaped that way.
- Enter on an empty reserve-username field in NodesTab did nothing and said nothing,
  indistinguishable from a hang. It now sets a status line asking for a username.

### Test harness

`dev/console` had no test script and no test files. Added
`"test": "node --test --import tsx src/**/*.test.ts"` to `package.json` (`tsx` was
already a devDependency) and `dev/console/src/api/client.test.ts`: `globalThis.fetch`
is stubbed per test; each test asserts the recorded URL, method, and parsed body for
`saveAcsLevelFlags`, `createUser`, `updateUser`, `deleteDoor` (including URL-encoding a
command with a space), and `reserveNode` (both the reserve and the clear/empty-body
case), plus one test that a JSON `{message}` error body surfaces just the message
rather than the raw JSON.

Also ports `web/config-app/src/test/security-endpoints.test.ts`'s source-level guard:
reads `client.ts` as text and asserts it never constructs a `/config/security/${...}`
call outside the `levels` path - the dead mirror this whole wave started by removing.
Verified the guard actually catches a regression: temporarily reintroduced a call to
the dead path, confirmed the new test failed with the expected assertion diff, then
reverted (`git diff` showed only the 34-line legitimate change afterward).

9 tests, all passing. `npx tsc --noEmit` and `npm test` both clean at HEAD.

### Two things flagged, not fixed here (per coordinator's instruction)

1. **`timeLimit`/`expert` handling copied from the web carries a web bug into a
   second client.** `createUser`'s payload sends `timeLimit` as whatever the sysop
   typed in minutes, but `web/backend/src/api/config-routes.ts`'s user-creation
   default path treats `new_user_time_limit` as minutes and converts to seconds
   before writing (`(defaults.timeLimit ?? 1440) * 60`) while `users.timelimit` is
   read everywhere at runtime as SECONDS (`utils/time-tracking.util.ts`) - a value
   supplied directly by the caller (as both `UsersPage.tsx` and this TUI's create-user
   form do) bypasses that conversion and is written straight through as if it were
   already seconds, producing a much shorter limit than intended (typing "60" for "60
   minutes" gives a 60-SECOND session). `-1` (this project's "unlimited" sentinel,
   per `database/types.ts`) is also not special-cased anywhere in the create path -
   nothing stops a sysop from typing it, and nothing confirms it round-trips as
   "unlimited" rather than being clamped or misread. Separately, `expert` in this
   TUI's `createUser` call sends a plain boolean (`formValues.expert === 'true'`),
   but the backend's own default path writes it as `'X'`/`'N'`
   (`userData.expert === 'X' ? 'X' : (defaults.expert ? 'X' : 'N')`) - the boolean
   spread through `...userData` bypasses that normalization the same way the web's
   own form does. All three are pre-existing web behavior this port faithfully
   copied, not something introduced here; not fixed in this wave per the
   coordinator's explicit instruction to flag rather than fix.
2. **The server still mounts the dead `security_level_access` routes**
   (`/api/config/security/:level`, `/api/config/security`, `/api/config/security/:id`
   in `web/backend/src/api/config-routes.ts:1182-1251`, backed by
   `web/backend/src/database/config-repository.ts:1276-1334`). Nothing reaches them
   from the TUI as of this wave (confirmed by the new source-level guard test), and
   the web admin already moved off them, but the routes themselves are untouched and
   remain for some future caller - a new admin surface, a script, a stray curl - to
   trip over the exact bug this whole wave started by fixing. Also worth noting:
   `web/config-app/src/test/security-endpoints.test.ts`'s own comment ("The mirror
   routes stay on the backend - dev/console uses them") is now stale, since this wave
   moved the TUI off them too - not fixed here since it's a comment in
   `web/config-app`, outside this worktree's scope.

## Files touched (review round)

- `dev/console/package.json`
- `dev/console/src/App.tsx`
- `dev/console/src/api/client.ts`
- `dev/console/src/api/client.test.ts` (new)
- `dev/console/src/components/Sidebar.tsx`
- `dev/console/src/components/shared/ConfirmDialog.tsx`
- `dev/console/src/components/tabs/DoorsTab.tsx`
- `dev/console/src/components/tabs/NodesTab.tsx`
- `dev/console/src/components/tabs/SecurityPage.tsx`
- `dev/console/src/components/tabs/UsersTab.tsx`
- `dev/console/src/components/tabs/acs-not-from-file.ts` (new)
- `dev/console/src/hooks/useTextEntryLock.ts` (new)
- `dev/console/src/pages/registry.ts`
- `dev/console/src/state/text-entry-lock.ts` (new)

---

## Closing round: CI wiring and the F2 gap

Re-review verified all ten findings above and passed the change as safe to land,
with two non-blocking items requested closed before push.

### 1. dev/console had no CI coverage at all

`dev/console` appeared in no file under `.github/workflows/`, and the root
`package.json`'s `test` script only ran `test:sdk`, `test:backend` and `test:doors` -
so the guard added this wave against a regression back to the `security_level_access`
mirror (`client.test.ts`'s source-level check) only ran when a human remembered to
`cd dev/console && npm test`.

Added a `console-tests` job to `.github/workflows/backend-tests.yml`, placed after
`config-app-typecheck` and mirroring its shape (checkout, `actions/setup-node@v4`
with `node-version: '20'` and the npm cache keyed on
`dev/console/package-lock.json`, then `npm ci --no-audit --no-fund`), followed by a
`Type-check` step (`npx tsc --noEmit`) and a `Test` step. **The exact command CI will
execute is `npm test`, run with `working-directory: dev/console`; per
`dev/console/package.json` that resolves to:**

```
node --test --import tsx src/**/*.test.ts
```

Also added `"test:console": "cd dev/console && npm test"` to the root
`package.json` and appended it to the `test` script's chain
(`test:sdk && test:backend && test:doors && test:console`).

Verified, not assumed:
- `actionlint .github/workflows/backend-tests.yml` exits 0.
- Parsed the workflow with `js-yaml` (already in the repo's root `node_modules`) and
  confirmed `console-tests` appears as a fourth job alongside `backend-tests`,
  `config-app-typecheck`, `doorrepo-c-tests`, with the exact steps intended.
- Ran the CI sequence for real, not against the worktree's already-installed
  `node_modules`: backed up `dev/console/node_modules`, ran a clean
  `npm ci --no-audit --no-fund` in `dev/console` (succeeded, 119 packages), then
  `npx tsc --noEmit` (clean) and `npm test` (9/9 passing) against that clean install.
- Ran `npm run test:console` from the repo root - resolves and passes (9/9).

### 2. F2 still bypassed the lock

`App.tsx`'s raw-stdin listener (a separate code path from Ink's `useInput`, needed
because Ink cannot see F2 at all - see the comment above it) toggled `showRestart`
unconditionally. `showRestart` swaps in `RestartDialog` and unmounts the active page
exactly like `showHelp` does for `'?'`, so F2 pressed mid-password-reset or
mid-user-creation still discarded the form - the identical failure class closed for
`q`, `?` and the sidebar's arrows earlier this wave, just reached through a listener
that isn't part of the `useInput` handler the lock was already wired into.

Fixed with the same guard: `if (isTextEntryActive()) return;` before the toggle.
Since `showRestart` only ever becomes true after the page holding the lock has
unmounted (releasing it via `useTextEntryLock`'s cleanup), this can only ever block
*opening* the dialog while a form is up - never closing an already-open one.

**Not covered by an automated test**, stated plainly rather than claimed: the current
harness (`client.test.ts`) stubs `globalThis.fetch` for pure client-function contract
tests and does not render Ink components or simulate stdin at all. Reaching this path
would require an Ink-rendering integration test (`ink-testing-library` or equivalent,
not currently a dependency) that mounts `<App>` with a mock stdin stream and asserts
on rendered output - a materially different and larger kind of test than this wave's
request/response contract tests, and out of the scope the coordinator drew for this
round. Verified manually instead: read `App.tsx`'s render branch confirming
`RestartDialog` unmounts the active page exactly as `HelpOverlay` does, and confirmed
via `useTextEntryLock`'s unmount cleanup that the lock cannot still be active by the
time `showRestart` flips true.

### Final verification

```
cd dev/console && npx tsc --noEmit   # clean
cd dev/console && npm test           # 9 pass, 0 fail
```

Both run clean at HEAD (commit `d53c760f3`), after the clean `npm ci` described above.

## Files touched (closing round)

- `.github/workflows/backend-tests.yml`
- `package.json` (repo root)
- `dev/console/src/App.tsx`
