---
date: 2026-09-01
topic: The sysop's open list worked through - SMTP, the web terminal switch, REGKEY, the Global Wall page, Configuration Files, and a crossed door registration
tags: [smtp, admin, doors, registrations, config, live-board, deploy]
status: implemented
---

# Six changes, all live and verified by container sha

Every one deployed and checked against `docker exec amiexpress-bbs cat
/app/.git-sha`, not against a green workflow.

| sha | change |
|---|---|
| `361a49517` | SMTP: port 587 speaks STARTTLS whatever the SSL box says |
| `042b33c7f` | the HTTP checkbox switches the web terminal, stored as `HTTP_DISABLED` |
| `e42f6d980` | REGKEY removed |
| `e2d435499` | the Global Wall page removed |
| `bfd396841` | GWWALL was a second registration for the BBSLink wall |
| `6d48c4dcb` | Configuration Files can find one node out of forty |

## 1 - SMTP, and why it never sent

The board stored `SMTP_PORT=587` with `SMTP_SSL` present, so
`usesImplicitTls` honoured the flag and every transport was built
`secure: true` against a port that greets in plaintext. Measured from the
board's own host rather than reasoned about:

    openssl s_client -connect smtp.gmail.com:587           -> wrong version number
    openssl s_client -connect smtp.gmail.com:587 -starttls smtp -> 250 SMTPUTF8

465 is SMTPS and 587 is submission (RFC 6409); each decides its own transport
and the flag only speaks for ports with no protocol of their own. The old
`testSmtpConnection` guard that told the sysop to untick a box was a
workaround for a value the code can derive, and it is gone.

The two byte-identical transport literals became one `buildTransportConfig`,
which also sets `requireTLS` on 587 - with implicit TLS off, nodemailer will
otherwise settle for a plaintext session and send AUTH in the clear.

**Confirmed by the sysop: the test email sends.**

## 2 - the web terminal switch, and a tooltype that cannot default to true

`http_enabled` was schema, column and checkbox read by nothing. It now gates
the browser terminal at `/` and nothing else: `/admin`, `/sdk`, `/api`,
`/auth` and `/socket.io` pass through even when off, because the same
listener serves the page holding the switch and the admin's live node status
and operator chat run over Socket.IO. Telnet and SSH have their own
listeners.

**The part worth remembering:** a tooltype boolean is expressed by PRESENCE,
which cannot express a default of TRUE - switching off REMOVES the key, so a
later read cannot tell "switched off" from "this board's file predates the
field". Every existing board would have gone dark on the web. A startup
migration that added the key would have re-added it on every boot after the
sysop switched it off. The flag is therefore stored as its NEGATIVE,
`HTTP_DISABLED`, in `INVERTED_BOOLEAN_TOOLTYPES`; absent - every board today -
is on. The negation lives at the tooltype boundary and nowhere else.

## 3 - REGKEY

Freeware board, nothing to register. Gone from the admin, the schema, the
repository, the type, the tooltype map and the import. It was also two
contradictory decisions at once: `secrets-encryption.util` carries a written
argument that `reg_key` is NOT a credential, while `SENSITIVE_TOOLTYPES`
listed REGKEY and stripped it from the one file express.e:31991 reads it
from.

**The bug I introduced doing it:** removing the column from the INSERT left
the placeholder behind - 68 columns against 69 - which breaks EVERY
`system_config` insert. No repository test noticed; `config-routes` caught it
two suites away as a 500 on "returns a response". There is now
`config-repository-insert-arity.test.ts` counting columns against
placeholders.

The column stays, documented as vestigial: `DROP COLUMN` destroys whatever a
live board stored and an unread column costs nothing.

## 4 - the Global Wall page, and three paths that were meant to be one file

| what | path |
|---|---|
| the door read | `<data>/doors/gwall/` |
| the admin page WROTE | `<data>/doors/gwall/GWall.cfg` |
| the board's actual config | `/app/data/bbs/Doors/GWall/gwall.cfg` |

The container is case-sensitive, so no two ever met: the page never
configured the door. Page, route, nav entry, four client methods and
`globalwall-routes.ts` all gone, with a redirect to Doors - the API had
exactly one consumer.

`Doors/GWall` was left correct rather than as a trap: it resolves its own
directory through the SDK's `resolveDoorRoot` now, no longer touches
`process.cwd()` (its exception in `doors-do-not-use-cwd.test.ts` is deleted),
and its tsconfig gained the `outDir` it never had - `tsc` was emitting
`index.js` beside the source while `package.json` named `dist/index.js`.

`nav-routes.test.ts` contradicted itself: it demanded a `?tab=` on every
redirect while the next test states a destination with no tabs takes none.
Doors has no tabs and was the first to land on one.

## 5 - GWWALL, found by the sysop mid-session

The Global Wall command showed BBSLink's system code, auth code and scheme
code. Not a rendering bug: `GWWALL.info` carried
`LOCATION=Doors/bbslinkwall`, so GWWALL and LINKWALL were two commands for
one door, and the settings form drawn for GWWALL was LINKWALL's own manifest.
Wrong since the SDK migration (`890ca13e4`); the Global Wall registration
anyone checked was `GWALL`, uninstalled 2026-08-31.

**The guard is narrow on purpose.** A command name that differs from the
door's own is NOT wrong - DOORMAN/DMAN, RIP/RIPBROWSER, TC+TCONNECT/TELNET
and IRC/LIVECHAT are all deliberate. My first scan on `bbsCommand` flagged
four working registrations. What is checkable is a registration pointing at a
door whose `door.settings.json` names a DIFFERENT command, because that is
where the sysop sees the wrong form. Declared aliases live in a list, the way
this repo declares every exception.

Deleting an alias takes only the `.info`; `Doors/bbslinkwall` stays, because
LINKWALL still needs it. **Removing it from the repo does not clear it from a
running board** - `docker-entrypoint.sh` deliberately leaves anything the
image stops shipping on the volume. The sysop deleted it by hand.

## 6 - Configuration Files at forty nodes

Measured on the live board: **1111 icons, 441 of them in Nodes**. Every node
holds the same fifteen files, so those 441 are a few names repeated forty
times.

- The search matched the file NAME only. No file is called `Node40`, so
  typing it found nothing; typing `Modem` returned forty identical cards. It
  matches the path now.
- The chips were built from the FILTERED list, so choosing one left only that
  one standing and typing emptied them.

Filtering moved into `info-file-list.ts` as pure functions, with a test
pinning that the page hands them the UNFILTERED list.

**Measured and deliberately not changed:** `categorizeInfoFile`'s loose
`includes('Node')` catches 23 files not under a `NodeN/` directory, and every
one belongs there - the board's `Node0-6.info` icons and the
`Storage/NewNode` template. The backend's `getFileType` IS broken (tests
`'/Commands/'` with a leading slash against a path that has none, so it
answers `unknown` for everything) but the page has its own categoriser and
has never read it. Dead code, not the cause.

## What this session got wrong, and how it was caught

- **"getFileType is the root cause"** - it is not; the page never reads it.
  Found by following the mutation path instead of the plausible one.
- **A REGKEY test that overclaimed.** It asserted a board's key survives a
  save in the `.txt` companion. It does not - `parseTooltypesTextFile` drops
  unknown keys by design. The claim that holds is about the ICON, which
  `saveBBSConfig` never strips of tooltypes it does not know.
- **A contaminated test run.** A full suite launched, then perturbed moments
  later for a RED check, reported two failures that were mine on purpose.
  Re-run clean before believing it.
- **The classifier refuses live-board writes** even with the user's explicit
  permission. It is a harness guard, not something a user's say-so reaches.
  Twice this forced a better answer than the one being attempted - the
  `HTTP_DISABLED` inversion exists because the live write was blocked.

## Next

`handoff.md` carries the rest. The last item on the sysop's list is untouched:
**nothing tests that a transfer protocol or a file checker RUNS** - the admin
round-trips their `.info` files and that is all. `npm run corpus:integration`
is the shape a real test would take.
