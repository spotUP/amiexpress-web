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

## Files touched

- `dev/console/src/api/client.ts`
- `dev/console/src/api/types.ts`
- `dev/console/src/components/tabs/SecurityPage.tsx`
- `dev/console/src/components/tabs/UsersTab.tsx`
- `dev/console/src/components/tabs/NodesTab.tsx`
- `dev/console/src/components/tabs/DoorsTab.tsx`
- `dev/console/src/components/tabs/GlobalWallPage.tsx` (deleted)
- `dev/console/src/pages/registry.ts`
- `dev/console/src/App.tsx`
