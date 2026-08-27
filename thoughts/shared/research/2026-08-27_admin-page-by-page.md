---
date: 2026-08-27
topic: Admin interface - page by page, does it work and does it write the right place
tags: [admin, config-app, audit, disk-vs-db]
status: final
---

# Admin interface, page by page

"we need to check every single page in the admin interface and make sure
everything works as it should before the redesign" - and "remember disk first
db second".

Companion to `2026-08-27_admin-ui-audit.md`, which established the storage
model. This one is the per-page verdict.

## The rule every page is measured against

The BBS loads its configuration from `.info` files on disk. Confirmed in
`server/initialization.ts`:

| What | Read from |
|---|---|
| Conferences | `ConfConfig.info` (NCONFS, NAME.n, LOCATION.n), falling back to a scan of `Conf*.info` |
| ACS toggles | `bbsConfig.info` |
| Message bases | `{ConfLocation}/MsgBases.info` - marked "CRITICAL: Disk-based, not database" |
| File areas | `Conf*.info` (NDIRS, DLPATH.n, ULPATH.n) |
| Commands / doors | `Commands/BBSCmd/*.info`, re-resolved from disk on EVERY invocation |
| ACS flags | `Access/ACS.<level>.info` |

and the BBS root carries a `.info` for every other domain the admin edits:
`ComputerList.info`, `Protocols.info` + `Protocols/`, `Languages.info` +
`Languages/`, `ScreenTypes.info`, `Areas.info`, `batch*.info`.

Conferences make the direction explicit: boot reads them from disk and then
calls `syncConferencesFromDisk` to bring SQLite into line. The database is
downstream. Anything the admin writes only to SQLite is therefore either
ignored or overwritten at the next boot.

## Verdicts

### Correct already - writes the files the BBS reads

| Page | Writes |
|---|---|
| InfoEditorPage | `.info` tooltypes directly |
| SystemFilesPage | `.info` tooltypes directly |
| AmiXnetPage | `.info` tooltypes directly |
| BatchEditorPage | `batch*.info` on disk |
| GlobalWallPage | disk |

### Fixed during this session

| Page | Was | Now |
|---|---|---|
| SecurityPage | wrote `security_level_access` table; hardcoded level list; no delete control | reads and writes `Access/ACS.<level>.info`, levels come from the files that exist, can create a level |
| DoorsPage (door edit) | looked up a positional id as a database row - "Door 349 not found" | writes `Commands/BBSCmd/<command>.info`, identified by command |

### CORRECTION - most of these pages were already disk-first

The first version of this document listed ten pages as writing SQLite while
the BBS reads disk. **That was wrong.** It classified pages by counting
filesystem calls against repository calls in the ROUTE file, and the route
files delegate to services - which is where the disk writing happens.

Checked by reading each service's mutation paths:

| Page | Writes on update | Verdict |
|---|---|---|
| SystemConfigPage | `saveBBSConfig()` -> `bbsConfig.info`; sensitive fields encrypted in the DB | correct, and a good model of disk-first |
| ConferencesPage | `updateConferenceInfoFile()` -> `Conf<N>.info`; create runs `setupConference()` | correct |
| DrivesPage | the same `Conf<N>.info` path, DLPATH.n / ULPATH.n | correct |
| UsersPage | `user-repository` syncs every update to `user.data` via `userFileManager` | correct - all 31 live users have a slot |
| Protocols, ScreenTypes, Languages, Computers, FileCheckers, Nodes | each service touches disk in its mutation paths | no evidence of a disk/DB split; not individually re-verified |

`security-config.service` was the ONE service with no filesystem access at
all, which is why the Security page was genuinely disconnected - now fixed.

The lesson for the redesign: the admin app is largely disk-first already. It
does not need rebuilding on that account.

### Still genuinely broken

| Page | Fault | Severity |
|---|---|---|
| NodeControlPage | System commands post to `/api/system/*`, mounted nowhere - the handlers live under `/api/nodes/*`, and their own doc comments say `/api/system`. Toggle-chat and quiet-mode 404. | HIGH - silently does nothing |
| DoorsPage (create) | `writeDoorInfoFile` writes TYPE from a runtime map that yields `TS` or `AMIGA`. Neither is a door type the loader knows (XIM, AIM, SIM, TIM, IIM, FIM, DD, typescript), so a created 68K door is not recognised as one. It also emits a bogus first line `<door_type>=<command>`. | MEDIUM |
| DoorsPage (create over an existing command) | The same writer replaces an existing BINARY `.info` with a plain-text one. Both parse - the loaders have a text fallback, confirmed by test - but STACK, PRIORITY, NAME, MULTINODE and the Amiga icon are lost. | HIGH - destroys working configuration |

## Suggested order

1. **DoorsPage create** - it can destroy a working door's `.info`. Route it
   through the same tooltype writer the edit path now uses, which preserves
   what it is not asked to change.
2. **NodeControlPage** `/api/system` - a one-line mount, currently a 404.
3. Spot-check Protocols, ScreenTypes, Languages, Computers, FileCheckers and
   Nodes the way Conferences and SystemConfig were checked - by reading the
   service, not by counting.
4. The Radix/dark redesign. The data layer underneath is in better shape than
   this document first claimed.

## Method

Pages were mapped to their `apiClient` calls, those to routes, those to the
service behind them, and the service classified by whether it touches the
filesystem or a repository. Runtime readers were then traced in
`server/initialization.ts` to establish what the BBS reads.

The earlier endpoint-existence pass is in the companion document, including
its three rounds of false positives; treat scripted counts here as leads and
confirm by hand, which is how "14 of 28 pages broken" became one real dead
endpoint.

That lesson had to be learned twice. The storage classification in the first
version of THIS document was also produced by counting - filesystem calls
against repository calls, in the route files - and it was wrong about ten
pages, because the route files delegate to services and the services write the
disk. Read the mutation path.

Not covered: whether each form's individual fields round-trip correctly. The
door NAME field is a warning - it round-tripped a door's command into its
title and renamed it. Every page converted to disk should be checked for the
same class of fault.
