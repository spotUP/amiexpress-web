---
date: 2026-08-31
topic: TypeScript doors declare their settings; the admin edits them
tags: [doors, sdk, admin, config]
status: draft
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
