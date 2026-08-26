---
date: 2026-08-27
topic: Admin UI audit - what works, what is disconnected, and what an overhaul has to fix
tags: [admin, config-app, audit, disk-vs-db, acs, doors]
status: final
---

# Admin UI audit

Prompted by: "almost nothing in the admin ui works ... i tried to add one for
users at 30, it didnt let me pick a number it just added users at 100 and now
i can't remove it, and i dont know if it uses the disk first db second
approach that we use at all."

Scale: **28 pages, 89 API client methods, 123 backend routes.**

## The finding that explains "nothing works"

**Most of the admin app writes to SQLite. The BBS reads its configuration from
disk. Nothing bridges them.**

Two cases confirmed end to end:

| Domain | Admin writes | BBS reads | Effect of an admin change |
|---|---|---|---|
| Security / ACS | `security_level_access` table (`configRepo`) | `Access/ACS.*.info` via `utils/acs-access-loader` | none |
| Doors / commands | `doors` table (`configRepo`) | `Commands/BBSCmd/*.info`, scanned per conference | none |

`door-config.service.ts` and `security-config.service.ts` contain no
filesystem access at all - every method goes through `configRepo`. Meanwhile
the live log shows the BBS scanning `/app/data/bbs/Commands/BBSCmd` and
`/app/data/bbs/Conf1/Commands/BBSCmd` for its 177 commands, and
`acs-access-loader` reading `Access/ACS.*.info` for permissions.

This is also why the door editor rejected its own data (fixed in `64031f428`):
GET serves doors loaded **from disk** (`door_type: "XIM"`), PUT validates and
stores a **database** row that used a different vocabulary entirely.

### Storage by route file

Counted as occurrences of filesystem calls vs repository calls:

| Route file | disk | db | Verdict |
|---|---|---|---|
| `config-routes.ts` | 5 | 76 | **DB-backed. Backs most of the 28 pages.** |
| `info-editor-routes.ts` | 14 | 0 | Disk-backed - correct |
| `batch-routes.ts` | 7 | 0 | Disk-backed - correct |
| `globalwall-routes.ts` | 5 | 0 | Disk-backed - correct |
| `statistics-routes.ts` | 0 | 14 | DB read-only - correct |
| `chat-routes.ts` | 0 | 2 | DB - correct, chat is not express.e config |
| `node-control-routes.ts` | 0 | 0 | Acts on the running process |
| `deployment-routes.ts` | 0 | 0 | Acts on the host |

So the parts that edit `.info` files directly (the info editor, batches, the
global wall) are built the right way already. The damage is concentrated in
`config-routes.ts` and the services behind it.

## Confirmed broken, specifically

1. **Security page has no effect on the BBS** - see above.
2. **You cannot choose level 30.** `SecurityPage.tsx:23` hardcodes
   `SECURITY_LEVELS = [10, 20, 50, 100, 200, 255]`. Disk has 10, 20, 50, 255;
   30 users sit at level 30. The list matches neither.
3. **"It just added users at 100."** `selectedLevel` defaults to 100 and the
   create form uses it, so an entry lands on whatever level is selected.
4. **You cannot delete it from the UI.** `deleteSecurityAccess` exists in the
   API client AND as a backend route; the page never renders a control for it.
5. **System-wide node commands 404.** `NodeControlPage.tsx:93` posts to
   `/api/system/${command}`, but those handlers are declared on
   `nodeControlRouter` as `router.post('/toggle-chat')` and mounted at
   `/api/nodes`, so they live at `/api/nodes/toggle-chat`. `/api/system` is
   not mounted anywhere. The route's own doc comment says
   `POST /api/system/toggle-chat`, which is what the page believed.

## What level-30 users actually get

Correcting an error made during this audit: they are NOT flagless.
`findAcsLevel` in `utils/acs-access-loader.ts` floors to a multiple of 5 and
then SCANS DOWN until it finds a file, so 30 -> 25 -> 20 finds `ACS.20.info`.

`constants/security-levels.ts` exports a SECOND `findAcsLevel` that only
floors and never scans. It is currently imported by nothing. It should be
deleted before somebody uses it and quietly changes who can do what.

## Method, and how much to trust this

Pages were cross-referenced against routes by script: page -> `apiClient.*`
call -> path template -> mounted route. The script produced **three separate
rounds of false positives** before it was right:

- it read the NEXT method's `method: 'POST'` for methods that had none
- it only matched `router.get(...)`, missing `infoEditorRouter.get(...)`
- it missed routes declared straight on `app` in `routes-setup.ts`
- it missed client methods whose return type contains braces
  (`async getBatches(): Promise<{ ... }>`)

Every remaining hit was then checked by hand, which is how the count fell from
"14 of 28 pages broken" to one real endpoint bug. **Treat any future scripted
count here as a lead, not a result.**

Not yet done: a page-by-page behavioural pass (does each form actually save,
does each list actually load). This audit establishes the storage model and
the endpoint wiring, not per-widget behaviour.

## What an overhaul has to do

The user has chosen **disk first, DB as mirror**.

1. **Config services write disk, then sync the DB.** The pattern already
   exists for users: login writes the DB and then syncs `node<N>.user` /
   `user.data` to disk. Config needs the same, in the same direction the BBS
   reads.
2. **Security page onto `Access/ACS.*.info`.** Levels offered should come from
   the files present on disk, plus a way to create a new level file (which is
   what "add a level for users at 30" was asking for).
3. **Doors onto `Commands/BBSCmd/*.info`.** The info editor already reads and
   writes these correctly - the door page should use that path rather than a
   parallel DB table.
4. **Delete `constants/security-levels.ts:findAcsLevel`** or make it delegate.
5. **Fix `/api/system/*`** by mounting it, or by pointing the page at
   `/api/nodes/*`.
6. Then the visual work: Radix, dark theme, consistent forms.

Order matters: a restyle over DB-backed writes would produce a prettier admin
app that still has no effect on the BBS.
