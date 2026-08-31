---
date: 2026-08-31
topic: TypeScript doors declare their settings; the admin edits them
tags: [doors, sdk, admin, config]
status: implemented (phases 1-4 pilot doors); the remaining doors are open
---

# A door says what it can be configured with, and the admin renders it

## Why

The board runs 42 registered TypeScript doors. The admin can edit six fields
per door (name, command, type, path, min security, enabled) plus a raw
tooltype key/value list. Anything a door actually needs configured - GWall's
style and colour preset, BBSLink's server credentials - is either unreachable
or reachable only through a screen written by hand for that one door:
`web/config-app/src/pages/GlobalWallPage.tsx` is the only per-door page in the
admin, which is why GWall is the only door that ever looked configurable.

There is no prior plan for this. `docs/superpowers/specs/2026-04-27-doorman-
upload-install-infoedit-design.md` and `..._2026-08-30-doorrepo-parity-
design.md` both cover per-door editing, but both edit `.info` TOOLTYPES and
both target the door-side UI, not the React admin.

Fourteen doors already `export const metadata` (`Doors/bbslink/index.ts`,
`Doors/livechat/config.ts:13`, and twelve more). **Nothing reads it.** There is
no call site in `web/backend/src` for `doorModule.metadata`. Registration runs
through `package.json` instead - `door-install.service.ts:63-115` writes
`BBSCMD`, `TYPE`, `LOCATION`, `DESCRIPTION` and `ACCESS` into
`Commands/BBSCmd/<CMD>.info` from `package.json` fields like `bbsCommand` and
`doorType`.

## Decisions taken here

**Settings are declared in a static JSON file, not in exported code.**
`Doors/<door>/door.settings.json`. The backend must read a door's declaration
without executing it: importing 34 door modules at admin-request time runs
their top-level code, and a door that is broken or mid-development would take
the admin down with it. A JSON file is readable before a door is ever built.

**One file, one truth.** The SDK ships the TYPE; the door ships the JSON; a
door that wants its own declaration at runtime imports its own JSON. The
existing `export const metadata` stays where it is and stays decorative -
deleting it is not this plan's job, and the fields it holds (name, version,
author, description, command, category) already reach the admin through
`package.json`.

**Values are stored per door as JSON**, `Doors/<door>/settings.json`, written
by the admin and read through one SDK helper. The doors that hand-roll their
own format keep it until they are migrated; `Doors/GWall/gwall.cfg` (three
positional lines) and `Doors/bbslink/bbslink.cfg` are not touched by this plan.

**A door with no `door.settings.json` is unchanged**, and the admin shows it
exactly what it shows today. That is what makes this shippable in phases.

## Phase 1 - the SDK type and the reader

Add to `sdk/core/types.ts`, beside `DoorConfig` (line 37):

```ts
/** One thing a sysop can set on a door. */
export interface DoorSetting {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  /** Required for type 'choice'. */
  choices?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
  help?: string;
  /** Numbers only. */
  min?: number;
  max?: number;
  /** Written to settings.json, never returned by the API. */
  secret?: boolean;
}

export interface DoorSettingsManifest {
  /** Matches the door's bbsCommand in package.json. */
  command: string;
  settings: DoorSetting[];
}
```

Add `sdk/core/settings.ts` with `readDoorSettings(doorDir)`, which merges
`door.settings.json` defaults with `settings.json` values and returns a typed
record. A door calls it once at start.

**Automated verification:** `cd sdk && npm test`; a new
`sdk/__tests__/door-settings.test.ts` covering defaults-only, values
overriding defaults, an unknown key in `settings.json` being ignored, and a
malformed manifest throwing with the door's name in the message.
**Manual:** none.

## Phase 2 - the backend serves and stores them

- `web/backend/src/doors/door-settings.service.ts` (new): `readManifest(bbsRoot,
  command)` resolves the door directory the way `resolveDoorDirectory` already
  does in `door-list.ts:79`, reads `door.settings.json`, validates it against a
  Zod mirror of `DoorSettingsManifest`, and returns null when absent.
  `readValues` / `writeValues` handle `settings.json` atomically, the way
  `atomicWrite` does in `info-file.util.ts:544`.
- `config-routes.ts`: `GET /api/config/doors/:command/settings` returns
  `{ manifest, values }` (secrets redacted to `''`), and `PUT` validates each
  incoming key against the manifest and rejects unknown keys by name - the
  same shape of guard as `flagsToTooltypes` uses for ACS keys.
- `config-routes.ts:449` stops hardcoding `door_options: []` and reports
  `hasSettings: boolean` so the list can show which doors are configurable.

**Automated verification:** `npm run typecheck:tests`; a new
`web/backend/tests/api/door-settings-round-trip.test.ts` that writes a manifest
into a temp BBS root, PUTs a value, and asserts it lands in
`Doors/<door>/settings.json` **and** reads back through the SDK helper - the
round-trip pattern from `tests/services/file-checker-rename-keeps-icon.test.ts`,
not a mock.
**Manual:** none.

## Phase 3 - the admin renders the form

`web/config-app/src/pages/DoorsPage.tsx` gains a Settings tab in the door
modal, shown only when `hasSettings`. One control per `type`; `help` under the
control; a secret renders as a password field that saves only when changed.
No door-specific code in the admin - if the form cannot render a door, the
door's manifest is wrong and the API says so.

**Automated verification:** `cd web/config-app && npm test` with a test that
renders a three-setting manifest and asserts the controls and the PUT payload.
**Manual (sysop):** open a door with settings, change one, save, reopen, see
the new value; open a door without settings and see no tab.

## Phase 4 - the doors

Pilot two, in this order, because both already have real configuration living
in a hand-rolled file: `Doors/livechat` (it already defines its own
`DoorMetadata` interface, so it is the closest to this shape) and
`Doors/bbslink` (credentials, currently `bbslink.cfg` parsed at
`index.ts:173`). Each gets a `door.settings.json`, reads through
`readDoorSettings`, and keeps reading its old file as a fallback for one
release.

Then the rest, one PR per door, no rush: a door without a manifest keeps
working exactly as it does now.

**Automated verification per door:** the door's own tests, plus
`.claude/skills/door-sdk-freshness/SKILL.md` after any `sdk/` or door edit.
**Manual (sysop):** run the door on the board after its settings move.

## Success criteria

- A door ships `door.settings.json` and the admin renders a form for it with
  no admin-side code for that door.
- Saving writes `Doors/<door>/settings.json` and the door reads the new value
  on its next run.
- A door with no manifest is byte-for-byte unaffected in the admin and on disk.
- `door_options` stops being a hardcoded empty array.

## What this does not do

- It does not migrate `.info` tooltypes. `ACCESS`, `TYPE`, `LOCATION` and the
  rest stay where AmiExpress reads them, edited where they are edited today.
- It does not touch 68K doors. They have no place to put a manifest and their
  configuration is tooltypes.
- It does not delete `GlobalWallPage.tsx`. That page can be retired once GWall
  itself is wired up again - the command was uninstalled on 2026-08-31 because
  its registration pointed at a 68K binary that does not exist.


## What was built, and where it deviated (2026-08-31, `5bd5df113`)

Phases 1-3 are in. Phase 4 - the doors themselves - is untouched, and every
door behaves exactly as it did before until someone writes one a manifest.

**The deviation: the backend does not import the SDK.** The plan had one
implementation shared by both sides. Two things stopped it, both measured
rather than assumed:

- `web/backend/tsconfig.build.json` sets `rootDir: ./src`, so a relative import
  of `sdk/core/settings.ts` fails the build with TS6059.
- The package root (`@amiexpress/bbs-door-sdk`) re-exports the server bundle,
  which imports the audio engine, which imports Tone.js - ESM that jest cannot
  parse. A settings read has no business loading it. A `./settings` subpath
  export was added and works at runtime, but does not resolve for `tsc` through
  a worktree's symlinked `node_modules`, so it could not be verified here.

So the door-side reader is `sdk/core/settings.ts` and the admin-side reader is
`web/backend/src/doors/door-settings.service.ts`, and
`web/backend/tests/services/door-settings-round-trip.test.ts` writes with one
and reads back with the other. The duplication is about forty lines of
validation; the alternative was a build that only works in Docker.

**Verified:** SDK 9 tests, backend 6771 passing with the round trip among them,
admin 127 across 22 files including a five-case render test. `tsconfig.build`
and `tsconfig.tests` both clean.

**Phase 4 stays as written.** `Doors/livechat` and `Doors/bbslink` first.


## Phase 4, the pilot doors (2026-08-31)

`Doors/bbslink` and `Doors/livechat` ship a manifest, read it, and are
covered by tests that fail when the wiring is undone. What phase 4 found was
that the plan's own instruction - "reads through `readDoorSettings(__dirname)`"
- could not work on the board.

**`__dirname` is not one place.** `door.handler.ts` imports a door's
`index.ts` in development and its `dist/index.js` in production, so the same
call arrives from `Doors/<door>` in one and `Doors/<door>/dist` in the other,
while the admin only ever writes to `Doors/<door>`. Every compiled door would
have read an empty settings object and silently run on its defaults. The SDK
resolves the door root now (`resolveDoorRoot`, walking up for the manifest)
and both the declaration and the values are read from it.

**BBSLink was already broken by that same split.** It resolved its
credentials with `path.resolve(__dirname, 'bbslink.cfg')` and `dist/` does not
carry the file, so on the live board every launch died on
"syscode/authcode/schemecode missing from bbslink.cfg" with the credentials
one directory up. `Doors/bbslink/config.ts` resolves the door root for the cfg
too; `tests/doors/bbslink-config-layering.test.ts` covers it.

**A default cannot be allowed to overwrite the old file.** The plan says a
door keeps reading its old config for one release. `readDoorSettings` merges
declared defaults with the sysop's values and cannot tell them apart, so a
manifest default would silently overwrite what `bbslink.cfg` set - the live
board's `TIMEOUT=5` would have become the declared 10. The SDK gained
`readDoorSettingOverrides`, which returns only keys the sysop actually set,
and BBSLink layers defaults -> bbslink.cfg -> overrides.

**A door importing settings must not load the whole SDK.** Doors compile with
`moduleResolution: node`, which ignores the `exports` map, so the subpath the
backend uses (`@amiexpress/bbs-door-sdk/settings`) resolved for node and not
for `tsc`. `sdk/settings.ts` is that subpath as a real file now, and the
package's `./settings` export points at its build, so the compiler and the
runtime mean the same module - and neither reaches the audio engine.

**BBSLink's package.json named a command the board does not run.**
`bbsCommand` was `LINKMENU`; the live registration is `Commands/BBSCmd/bbslink.info`
(`BBSCMD=BBSLINK`, `TYPE=TS`), which is also what the door's own `metadata`
says. It is `BBSLINK` now. **Still open, for the sysop:**
`Commands/BBSCmd/linkmenu.info` is a second registration for the same door -
`TYPE=XIM`, `LOCATION=Doors:bbslink/bbslink`, a 68K binary that is not on the
board. That is the GWALL case again and it is a live data change, so it is
not made here.

**What each door declares.** BBSLink: the three BBSLink credentials (two of
them secrets), server host, both ports, timeout, default game. The per-game
door codes stay in `bbslink.cfg` - they are a map, and a manifest declares
fields. LiveChat: default channel (auto-join, the channel created on an empty
board, and the one that cannot be left), sound effects, sidebar width,
reconnect attempts - each one replacing a literal that was in `server.ts`
or `handlers/room-socket-handlers.ts`.

`Doors/*/settings.json` is gitignored: the declaration ships, the values do
not.

**Verified:** SDK 427 tests across 36 suites; backend 6789 passing including
the three new door suites (`bbslink-config-layering`, `livechat-settings`,
`shipped-door-manifests`); `typecheck:tests` clean; both doors rebuilt, and
LiveChat's client bundle is byte-identical. Each new suite was checked by
breaking the fix and watching it fail.

**Manual (sysop):** open Doors -> BBSLINK -> Settings, set the codes, run the
door; open LIVECHAT -> Settings, change the default channel, and see the next
launch land there.
