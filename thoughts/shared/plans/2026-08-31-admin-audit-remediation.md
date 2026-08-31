---
date: 2026-08-31
topic: Fixing what a six-agent audit found in the admin app
tags: [admin, config-app, disk-vs-db, express-e-parity, info-files, plan]
status: draft
---

# Admin audit remediation

Six agents audited `/admin` on 2026-08-31: API wiring, disk-vs-database,
form fields, UI correctness, routes and realtime, and parity against
`AmiExpress-Sources/`. Their reports are the input to this plan.

**Read this first.** Every finding below is *reported*. The ones marked
**[VERIFIED]** were re-checked by hand and are facts. The rest are leads and
must be confirmed against the code and against `express.e` before a line is
changed. This repo has produced confident false positives repeatedly - an
earlier audit's "14 of 28 pages broken" became one real bug, and a later "ten
pages write only SQLite" was wrong about all ten. One finding in this very
audit ("re-ordering ACS_PERMISSION_NAMES would break the file") turned out to
be backwards: the names are tooltypes, and order matters to the enum, not to
the file.

## The one bug

Nearly everything here is a single fault wearing different clothes:

> **The writer and the reader disagree.** The admin serves a value its own
> schema rejects, or writes one store while something reads another, or
> writes a tooltype name AmiExpress does not read.

It is silent by construction: both halves work perfectly, on data that never
meets. The page looks right, the toast says saved, the board does not change.
That is why the admin has felt unfinishable for months.

## Rules for this work

1. **`express.e` is the authority.** Cite a line number for every claim about
   what the BBS reads. Do not assume a tooltype exists because its name looks
   plausible - a health check demanded three per-conference directories
   AmiExpress has never had, and offered to create them.
2. **Read the mutation path.** Route files delegate to services; the services
   do the disk work. Counting calls has been wrong here three times.
3. **Every fix ships a test that fails without it.** Revert the fix, watch it
   fail, restore. A test that cannot fail is worse than no test - two written
   on 2026-08-30 asserted a misreading of express.e as correct and passed all
   day (see Phase 0).
4. **Run `npm run typecheck:tests`, not just `npm test`.** Jest uses swc and
   strips types; a test file can pass jest and fail the typecheck.
5. **Verify on the live board before changing a schema constraint.** Three
   constraints were wrong about real data (`node_number: 0`,
   `min_access_level: 0`, a 300-character `NODESTART`). The data was right.
6. Deploy is `git push origin HEAD:main` from a worktree cut from
   `origin/main`; confirm ancestry before pushing **and** before deleting the
   branch. Then read `/app/.git-sha` on the live container - a green workflow
   has lied.

---

## Phase 0 - already done, listed so it is not redone

**[VERIFIED] `ACCESS=0` denies a door to everyone.** `express.e:4703` -
`IF access=0 THEN RETURN TRUE`, and `TRUE` is `RESULT_NOT_ALLOWED`
(`axenums.e:23`). `readToolTypeInt` answers `-1` for an absent tooltype
(`tooltypes.e:176-180`), which is never above a caller's level. So absence
means everyone, and `0` means nobody.

Fixed in `2b65f8455`: an absent level is recorded as its own sentinel and
restored as an absence; a new door with no level gets no `ACCESS` line; a
disabled door parks at 32767 rather than 255, because `access > acsLevel`
leaves a level-255 sysop able to run a door parked at 255.

Two tests from 2026-08-30 asserted the bug as correct and were rewritten.

**Not yet deployed at the time of writing.** Confirm it is live before
starting Phase 1.

---

## Phase 1 - silent corruption of the files the BBS reads

Highest severity: these damage data rather than merely failing.

### 1.1 [VERIFIED] `InfoFileParser.write()` does not produce a valid Amiga icon

`web/backend/src/services/info-file-parser.ts:136-156` returns 256 zero bytes
with a magic number, followed by raw `KEY=VALUE\0` strings. No DiskObject, no
gadget structures, no length-prefixed tooltype array.

`GetDiskObject` on that returns NIL, or succeeds with a NULL `do_ToolTypes`;
either way `FindToolType` finds nothing (`tooltypes.e:215-218`). AmiExpress
has a `.txt`/`.cfg` companion fallback (`tooltypes.e:259-270`) but only
`bbsConfig` writes one, so these files simply go silent. The original icon
image and position are destroyed in the same write.

Ten call sites, all in the admin's save paths:

```
config-services/computer-config.service.ts:221
config-services/file-checker-config.service.ts:212
config-services/language-config.service.ts:218
config-services/protocol-config.service.ts:231
config-services/screen-config.service.ts:180
config-services/drive-config.service.ts:266
config-services/node-config.service.ts:324
conference-setup.service.ts:321, :407, :465
```

**Fix:** route all ten through `parseInfoFile` / `updateTooltype` /
`writeInfoFile` in `utils/info-file.util.ts` - the door path already does
exactly this and is the model - then delete `InfoFileParser.write`.

**Test:** write a tooltype through each service into a temp root, then read it
back with `parseInfoFile` and assert the value survives *and* that a
pre-existing unrelated tooltype and the icon bytes are still there. That is
the test the door path already has.

### 1.2 [REPORTED] The database mirror is injected into disk on every save

`config-merge.util.ts` `mergeForWrite` exists to stop a lagging mirror
*truncating* disk. Four services hand it the entire mirror as the "changed"
set, which lets it *overwrite and append* instead:

```
drive-config.service.ts:235-237      const changed = [...fromDb, change.entry]
protocol-config.service.ts:206-208   same
computer-config.service.ts:195-197   same
screen-config.service.ts:160-163     passes fromDb directly
```

Reported effects on this board, each needing confirmation: editing one
protocol appends `LIBRARY.12=A` … `LIBRARY.15=Z` to `XprTypes.info` (express
then offers protocols whose Amiga library is the literal string `A`); editing
a computer rewrites the sysop's `AMiGA 500` to `Amiga 500` and appends three
phantoms; editing one drive rewrites the other's path.

**Fix:** `const changed = change.entry ? [change.entry] : [];` in all four.
The mirror must never be a source for these files.

**Test:** seed a disk file and a deliberately divergent mirror, save one
entry, assert the file gained exactly that change and nothing else.

### 1.3 [REPORTED] The tooltype editor deletes what it could not display

`api/info-editor-routes.ts:87-122` has a private parser for GET that skips
valueless tooltypes, parenthesised ones, and empty values. The PUT
(`:293-304`) reads with the *real* parser and then replaces the whole array
with what the editor sent. Everything the editor could not see is dropped.

Reported measurement: 795 of 1,190 `.info` files lose tooltypes on any save;
526 display zero while holding some; 82 render fabricated rows built from
binary noise, which are then written back as real tooltypes.

**Fix:** delete the private parser; have GET use `parseInfoFile()` - the same
parser the write already uses - and return `prefix`/`commentStyle` per row.

**Test:** GET a file, PUT the exact array back, assert `parseInfoFile` returns
a byte-identical tooltype list. `tests/api/info-editor-routes.test.ts` has no
such round trip today.

Related, same area:
- **1.3a** a write that hits `InfoFileWriteError` writes a `.tooltypes.txt`
  sidecar the BBS never reads and still replies success; `SystemFilesPage`
  shows "saved successfully" unconditionally.
- **1.3b** one blank "Add Tooltype" row writes the string `"="`, after which
  every later save silently takes the sidecar path.
- **1.3c** the door `.info` editor builds `Commands/BBSCmd/${command}.info`
  with an upper-cased command, and 63 of 155 files are lower or mixed case.
  GET uses `amigafs.existsSync` then plain `fs.readFileSync`; PUT uses plain
  `fs.existsSync`. Invisible on macOS, broken in the Linux container - the
  same case-sensitivity shape as the archiver fixed in `7006ce568`.

---

## Phase 2 - settings that cannot be saved

### 2.1 [REPORTED] Six mapped tooltypes are stripped by zod before the writer sees them

`SystemConfigSchema` is a plain `z.object`, so `.partial().parse()` drops
unknown keys silently. These are in `TOOLTYPE_MAP` and absent from the schema:

`password_expiry_days` (express.e:29785), `hold_access_level`
(express.e:31804), `system_password` (ACP.e:2630), `capitalize_filenames`,
`credit_by_kb`, `arexx_engine`.

Two have a visible form field *and* a `<TooltypeKey>` badge naming the key
they claim to write (`SystemConfigPage.tsx:894` and `:1157`).

**Fix:** add the six to the schema. `system_password` must also go in
`DISK_ONLY_FIELDS` (it contains "password", so `isSensitiveField` would route
it to the encrypted DB while the login gate reads disk).
`password_expiry_days` additionally needs an entry in `getDefaultConfig()` -
`loadBBSConfig` infers a field's type from `typeof` its default, and without
one it comes back as a string while `login-post.service.ts:351` tests for a
number.

**Test:** the mirror of the existing contract test - assert
`Object.values(TOOLTYPE_MAP)` is a subset of `Object.keys(SystemConfigSchema.shape)`,
and assert the parsed *output* still contains the key.

### 2.2 [REPORTED] Five domains list from disk and edit by database row id

Two different namespaces, so the update either throws or edits the wrong
record. Reported live counts:

| Domain | Disk | Mirror rows | Result |
|---|---|---|---|
| Conferences | `Conf1..14.info` | 3 | conferences 4-14 cannot be edited |
| Nodes | 8 node icons | 1 (`node_number=1`) | only Node1 is editable |
| Languages | 4 files | ids 1,3,4,5 | id 2 fails; others edit the wrong row |
| File checkers | 15 files | 2 | ids 3-15 fail |
| Screen types | 2 entries | 4 | edits the wrong record |

`node-config.service.ts:216-234` is the clearest: the mirror write throws
*before* the `.info` write, so nothing reaches disk. `NodesPage` is the only
page in the admin with no `onError` on any mutation, so it fails in complete
silence.

**Fix:** copy `ComputerConfigService.getComputerType`
(`computer-config.service.ts:79-85`) - resolve the id against the disk listing
first, fall back to the mirror - and make the mirror write best-effort,
*after* the disk write. Add `onError` to the three `NodesPage` mutations.

### 2.3 [REPORTED] "Add Door" can never succeed

`DoorsPage` builds a payload with no `door_path` and `min_security_level: 0`;
`door-config.service.ts:38` validates with the non-partial `DoorSchema`, which
requires `door_path` and `min(1)`. There is no Path field on the form.

**Fix:** add the Path input, and relax `min_security_level` to `.min(0)` -
the API's own `doorNormalAccessLevel` serves 0 for a door with no ACCESS, so
the schema currently rejects its own output.

### 2.4 [REPORTED] SMTP username is written to the database and read from disk

`smtp_username` is in `SENSITIVE_FIELDS`, so it goes to the encrypted DB.
`mail-notification.service.ts:81-82` merges only `smtp_password` back out, so
`getMailOptions()` reads the disk value, which is always empty. SMTP
authenticates with no username. One field short of the fix made in
`32f329389`.

---

## Phase 3 - wrong against AmiExpress

Each needs its express.e line confirmed before changing.

### 3.1 [REPORTED] `PASSWORD_SECURITY` offers values express.e does not accept

The schema offers `bcrypt|sha256|md5|legacy`. `express.e:938-952` accepts
`LEGACY`, `PBKDF2_5`, `PBKDF2_50`, `PBKDF2_100`, `PBKDF2_1000`,
`PBKDF2_10000`, and falls through to `PWD_LEGACY` for anything else. So every
choice degrades the board to legacy hashing while the admin claims bcrypt.

**Fix:** replace the enum with the six real values, remove
`password_security` from `LOWERCASE_VALUE_FIELDS` (express.e compares the
value), and pick a default that is one of them.

### 3.2 [REPORTED] Node `TELNET` is inverted, and `NO_TELNET` is invented

`ACP.e:2675` enables a node's telnet by the *presence* of `TELNET`.
`node-config.service.ts:318` writes `NO_TELNET` when telnet is off and nothing
when it is on - so saving a node with telnet enabled removes its `TELNET`
tooltype. `FTP` on the adjacent line is handled correctly.

### 3.3 [REPORTED] An ACS flag written `=NO` is granted

`checkToolTypeExists` (`tooltypes.e:204-218`) looks only at key presence; the
value is never inspected. So `ACS.DOWNLOAD=NO` grants download. The
parenthesised form genuinely denies. The admin reads `=NO` as denied.

**Fix:** always write the parenthesised form, and on read stop treating `=NO`
as off - or surface it as a warning.

### 3.4 [REPORTED] Twelve ACS flags are not read from the ACS file at all

`express.e:8466-8485` resolves them before any ACS lookup: eight come from the
node icon or the user record, and four (`MSG_LEVEL`, `MSG_EXPERATION`,
`CUSTOMCOMMANDS`, `JOIN_SUB_CONFERENCE`) always return TRUE. A further six are
declared and never checked anywhere - express.e's own header says
`FREE_RESUMING` is "not implemented in /X3 or 4" (`express.e:14`).

**Fix:** annotate them in `acs-permission-groups.ts` - "always granted", or
the node setting that really controls it. A checkbox that cannot do anything
must not read as a live control.

### 3.5 [REPORTED] Tooltype names that AmiExpress does not read

- `MENUPROMPT` should be `MENU_PROMPT` (express.e:5013) - one character.
- `HTTP_PORT` should be `HTTPPORT` (express.e:15707); `HTTP_HOST` is
  `HTTPHOST` and lives in the protocol icon, not bbsConfig (express.e:15002).
- `LVL_CAPITOLS_in_FILE` is an array index (`axcommon.e:53`), not a tooltype;
  the real one is `CAPITOL_FILES` in the node icon (ACP.e:2651).
- `CREDITBYKB` is an index (`axcommon.e:385`); the tooltype is
  `CREDIT_BY_KBYTES` (ACP.e:3030).
- A conference's `NAME`/`LOCATION` live in `ConfConfig.info` as `NAME.n` /
  `LOCATION.n` (express.e:31852, :31861), not in `Conf<N>.info`.
  `conference-setup.service.ts:391` already does this correctly; the update
  path does not.
- Four conference fields are declared "database only, no tooltype exists" and
  all four have one: `FREEDOWNLOADS` (express.e:5010), `USERNAME` (:4081),
  `REALNAME` (:4083), `INTERNETNAME` (:5022).
- Reported as invented: `MIN_ACCESS`, `MAX_ACCESS`, `PRIVATE`, `READ_ONLY` -
  AmiExpress gates conferences by the per-user `conferenceAccess` mask
  (express.e:8499-8512), not a level range.

### 3.6 [REPORTED] Ranges

`max_nodes`/`node_number` allow 255; `axcommon.e:28` is `MAX_NODES=32`.
`max_conferences` allows 256; the per-user access mask holds 9
(`axobjects.e:38`). `security_level` rejects 0 and accepts non-multiples of 5,
but `express.e:3025-3034` only ever looks up multiples of 5, walking down, and
falls back to 0.

---

## Phase 4 - dead controls

### 4.1 [REPORTED] Import and Export is entirely dead

Eight fetches read `localStorage.getItem('token')`; the JWT is stored under
`authToken`. Every request 401s. The same bug exists in the BBS frontend copy.
The export download also puts the token in a query string, which the auth
middleware never reads.

### 4.2 [REPORTED] Nine of eleven Node Control buttons have no listener

`node-control-routes.ts:86` emits `supervisor:command`; nothing subscribes to
it. The route still returns success. Only Reserve and Clear do real work. The
Chat and Quiet Mode toggles show local state the server never told them.

### 4.3 [REPORTED] Door form fields that no writer handles

`description`, `time_limit` and `runtime_env` - two of them marked required.
`time_limit` is served hardcoded as 30 and `runtime_env` derived from
`door_type`, so both read back wrong whatever is typed. Either remove them or
carry them, but they must stop claiming to save.

### 4.4 [REPORTED] Smaller dead controls

Batch editor "Reload" sets state to its current value. The Operator Chat
"Allowed Security Levels" checkboxes store strings and are compared against
numbers, so *no non-sysop can page the sysop* - reported as proven from the
live database, and worth confirming first because it is user-facing.

---

## Phase 5 - states and correctness

### 5.1 [REPORTED] Eighteen pages render "nothing configured" when a request fails

`apiClient` throws on non-2xx, so `data` is undefined and the page shows its
empty copy as a positive claim: "No doors configured", "No protocols
configured. Add transfer protocols like ZMODEM…". Compounded by
`AuthContext` validating the token once at mount, so an expired session
presents as an empty BBS.

**Fix:** add an `error` prop to `DataTable`, render the existing `ErrorPanel`
in place of the empty branch, and log out on a 401 from any query.

### 5.2 [REPORTED] `SystemConfigPage` reverts other fields while you type

`useEffect(... reset(data.data), [data])` fires on the refetch that a
per-field save triggers, defeating the `resetField` two lines below it whose
comment says exactly that. `useForm({ values })` already syncs; delete the
effect.

### 5.3 [REPORTED] Nine of nine `DataTable` callers rebuild `columns` each render

Wasted work rather than a visible bug - sorting state survives - but it is the
one stability rule the component asks for. `useMemo` each.

### 5.4 [REPORTED] Accessibility

Six `<label>`s with no `htmlFor`, ~15 icon-only buttons with no `aria-label`,
toggles without `aria-pressed`, and nine hand-rolled modals with no
`role="dialog"`, focus trap or Escape handler. `ConfirmDialog` and `Toast`
moved to Radix for this reason; these did not.

---

## Phase 6 - close the gaps that let this happen

The contract tests written on 2026-08-30/31 do not see the primary bug class.

### 6.1 The round-trip contract test cannot detect a stripped field

`config-round-trip-contract.test.ts` does
`schema.partial().safeParse({ [field]: value })`. **Zod strips unknown keys
and succeeds**, so a field the API serves and the schema does not declare
passes silently. It catches wrong types on known keys - which is how it caught
three real range bugs - and would not have caught the fourteen stripped
System Configuration fields.

**Fix:** compare key sets as well as parsing values - `Object.keys(record)`
minus exemptions must be a subset of `Object.keys(schema.shape)`.

### 6.2 The coverage test only runs schema → map

`system-config-field-coverage.test.ts` walks the schema and checks each field
is mapped. A field the *form* offers that the schema lacks is invisible - which
is how `hold_access_level` and `password_expiry_days` survived.

**Fix:** the mirror - scrape `register\('([a-z_0-9]+)'` from
`SystemConfigPage.tsx` and assert every name is in the schema.
`users-acs-write-contract.test.ts` already does this shape for Users and is
the model.

### 6.3 The config-source guard is evaded by optional-call syntax

`config-read-source.test.ts` matches
`getConfigRepository\(\)\s*\.\s*getSystemConfig\(`. Four live consumers use
`getConfigRepository?.()` and slip past, and one value has already diverged:
disk `MIN_PASSWORD_STRENGTH=0` against DB `1`, so the admin shows "no check"
while the BBS enforces 1.

**Fix:** widen the regex, and switch the four to `getBoardConfig()`.

### 6.4 No test drives a write path

None of Phase 1 is visible to any current test, because the contract tests
read only. At least one round-trip-to-disk test per domain is needed - write
through the service, read back with `parseInfoFile`, assert the unrelated
tooltypes survived.

---

## Suggested order

1. **Phase 0** - confirm deployed.
2. **1.1** - it corrupts files on every lookup-table save.
3. **1.2**, **1.3** - same class, same blast radius.
4. **2.1**, **2.2** - the settings a sysop will try first.
5. **6.1-6.3** - widen the guards *before* the rest, so the remaining fixes
   are checked by something.
6. **3.x** - parity, one tooltype at a time, each with its express.e line.
7. **4.x**, **5.x** - dead controls and states.

Phases 1 and 2 change what is written to a live board's configuration files.
Take a copy of `/app/data/bbs` before deploying either.

## What is not in this plan

- The 34 `TOOLTYPE_MAP` entries reported as having no express.e reader. Many
  are legitimately this port's own (`TELNET_PORT`, `SSH_PORT`, `AREXX_ENGINE`,
  the logging trio, web push). Splitting the map into express-backed and
  web-only halves is worth doing, but it is a labelling exercise, not a bug.
- Settings express.e reads that the admin does not offer at all
  (`DEFAULT_MENUNAME`, `HISTORY`, `USERNOTES`, `TIMEOUT_LC`, the sixteen
  `EXECUTE_ON_*` events). That is a feature gap, not a defect.
- The two pre-existing CI clusters, now green.
