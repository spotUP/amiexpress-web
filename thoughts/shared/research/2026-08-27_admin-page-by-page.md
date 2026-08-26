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

### Broken in the same way - writes SQLite, BBS reads disk

Each of these needs the same treatment as SecurityPage: write the `.info`,
mirror to the database.

| Page | Should own | Severity |
|---|---|---|
| ConferencesPage | `ConfConfig.info`, `Conf<N>.info` | HIGH - boot overwrites the table from disk, so edits vanish |
| SystemConfigPage | `bbsConfig.info` | HIGH - this is the BBS's own configuration |
| DrivesPage | `Conf*.info` DLPATH.n / ULPATH.n | HIGH - upload and download paths |
| ProtocolsPage | `Protocols.info`, `Protocols/` | MEDIUM |
| ScreenTypesPage | `ScreenTypes.info` | MEDIUM |
| LanguagesPage | `Languages.info`, `Languages/` | MEDIUM |
| ComputersPage | `ComputerList.info` | LOW |
| FileCheckersPage | disk file to be identified | LOW |
| NodesPage | to be identified | MEDIUM |
| UsersPage | `user.data` slots - login already syncs DB -> disk, so the direction exists | HIGH - user edits are what a sysop reaches for first |

### Broken for other reasons

| Page | Fault |
|---|---|
| NodeControlPage | System commands post to `/api/system/*`, which is mounted nowhere. The handlers live under `/api/nodes/*` - their own doc comments say `/api/system`. Toggle-chat and quiet-mode therefore 404. |
| DoorsPage (create) | The form's defaults and dropdowns used a vocabulary nothing accepts (`68K`, `JS`, `TS`, `EXEC`, runtime `node`). Fixed for editing; creating a NEW door still writes only the database and produces no `.info`, so a door created here does not exist to the BBS. |

### Read-only or not config

`AuditLogPage`, `StatisticsPage`, `LogsPage`, `HealthCheckPage`,
`DeploymentPage`, `SessionLogsPage`, `OperatorChatPage`,
`OperatorChatSettingsPage`, `ImportExportPage`, `LoginPage`. These read, act
on the live process, or manage things that genuinely live in SQLite (operator
chat, audit log). No disk/DB conflict.

## Suggested order

1. **UsersPage** and **SystemConfigPage** - most reached for, most surprising
   when silently ineffective.
2. **ConferencesPage** and **DrivesPage** - edits are actively overwritten at
   the next boot, which is worse than being ignored.
3. **NodeControlPage** `/api/system` - a one-line mount, currently a 404.
4. **DoorsPage** create - route it through the same `.info` writer as edit.
5. Protocols, ScreenTypes, Languages, Computers, FileCheckers, Nodes.
6. Only then the Radix/dark redesign, over a data layer that tells the truth.

## Method

Pages were mapped to their `apiClient` calls, those to routes, those to the
service behind them, and the service classified by whether it touches the
filesystem or a repository. Runtime readers were then traced in
`server/initialization.ts` to establish what the BBS reads.

The earlier endpoint-existence pass is in the companion document, including
its three rounds of false positives; treat scripted counts here as leads and
confirm by hand, which is how "14 of 28 pages broken" became one real dead
endpoint.

Not covered: whether each form's individual fields round-trip correctly. The
door NAME field is a warning - it round-tripped a door's command into its
title and renamed it. Every page converted to disk should be checked for the
same class of fault.
