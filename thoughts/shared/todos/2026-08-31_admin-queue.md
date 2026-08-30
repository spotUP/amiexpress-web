---
date: 2026-08-31
topic: Admin work raised while testing the redesigned pages on the live board
tags: [todo, admin, config-app, disk-vs-db, health-check]
status: in progress
---

# Queue - raised 2026-08-31, admin testing

Everything here came out of a session testing `/admin` on the live board after
the redesign. The recurring theme is one bug class: **the writer and the
reader disagree** - the admin writes a setting one place and something else
reads it from another, so both halves work perfectly on different data and
nothing ever reports a failure.

## 1. "Registered to UNREGISTERED" during login - DONE

**Reported 2026-08-31: "the bbs reports Registered to UNREGISTERED during
login, shouldn't it report my sysop name from the admin page? amiexpress is
freeware these days".**

`web/backend/src/index.ts:1659`:

    const regKey = diskConfig.reg_key || "UNREGISTERED";

and the banner prints `Registered to ${regKey}.`, matching express.e:25696
(`StringF(tempStr,'Registered to \s.\b\n',regKey)`), which printed the name
the licence was issued to.

Two things are true at once:

- **It is another instance of the split.** `reg_key` is in `SENSITIVE_FIELDS`
  (`utils/secrets-encryption.util.ts`), so the admin routes it to the
  encrypted database. The banner reads `diskConfig.reg_key` - the disk. So
  even a sysop who fills the Registration Key field in gets UNREGISTERED,
  because the value they typed went somewhere the banner never looks.

- **The question behind it is a design one.** AmiExpress is freeware now, so
  there is no registration name to print. Options:
    a. Fall back to the sysop name (`sysop_name`) rather than the literal
       "UNREGISTERED" - which is what was asked for.
    b. Fall back to the BBS name (`bbs_name`).
    c. Drop the line entirely when there is no key.

  (a) is what the sysop asked for and reads correctly on a freeware board:
  "Registered to Spot." The line still honours REG_KEY when one is set, for
  a board that carries one.

**Fixed.** The argument settled itself: express.e:25696, :28786 and :29516
print the value to every caller at login, so a value read from a plaintext
tooltype and shown to everyone who connects is not a credential. `reg_key`
left SENSITIVE_FIELDS and is disk configuration now, and the banner falls
back to `sysop_name` - option (a) - with express.e's own 'NONE' behind that.
The form's "empty means leave it alone" guard, which only made sense while it
was a secret, is gone too, so the field can be cleared.

## 2. Bulletins is a file, not a directory, in eight conferences - DONE

**Found while verifying the Health and Deployment report.**

express.e:24648 builds `<ConfLocation>Bulletins/Bull<n>`, so `Bulletins` has
to be a directory. In Conf1, 3, 6, 7, 9, 11, 12 and 13 it is an empty FILE, so
those conferences answer "No bulletins are available in this conference!"
(ERR_NO_BULLS, express.e:8544) and always have. Conf2 has it as a proper
directory containing `conftop.txt`, which is what correct looks like.

Every one of the eight is **0 bytes** - verified - so there is nothing to
preserve. The remedy, which needs a shell on the live host:

    cd /app/data/bbs
    for c in 1 3 6 7 9 11 12 13; do
      f=Conf$c/Bulletins
      if [ -f $f ] && [ ! -s $f ]; then rm -f $f && mkdir -p $f; fi
    done

The `[ ! -s ]` re-check is deliberate: it refuses to touch a Bulletins file
that has gained content since this was written.

**Run by the sysop on 2026-08-31**, all eight reported fixed and verified:
Conf1, 2, 3, 6, 7, 9, 11, 12 and 13 all carry a Bulletins DIRECTORY now, so
express.e:24648 can build Bulletins/Bull<n> and those conferences can show
bulletins for the first time.

## 3. The round-trip sweep across every domain - DONE

The contract test that closed this class for System Configuration
(`tests/services/system-config-field-coverage.test.ts`) starts from what the
API accepts and demands every field reach disk, reach the database, or name
its exemption. It caught `webhook_include_pii` within seconds of it moving.

The same test has not been written for Users, Conferences, Doors, Drives,
Nodes, Access Levels, or the five lookup tables. Until it is, those pages can
drift exactly as System Configuration did, and the next fault will be found by
a sysop rather than by the build.

Shape, per domain: take what GET serves, feed it back to PUT unchanged, assert
it validates and round-trips to disk.

**Written as `tests/services/config-round-trip-contract.test.ts`**, covering
nine domains: Nodes, Conferences, Doors, Languages, Protocols, Drives,
Computers, Screen types and File checkers. It hands each served record to the
schema that domain's own PUT validates with, field by field, so the failure
names the field. It reads only - feeding values back through a real PUT would
rewrite the .info files of whatever board the suite runs on.

It found three faults on its first run, all verified against the live board
before anything was changed:

- `node_number: 0` rejected by `min(1)`, and **Node0 exists** on this board
  and on live. The admin refused to save the first node it listed.
- `node_start` capped at 200 characters, against a real multi-line NODESTART
  block of 300+ (QUIETNODE, PRIORITY=-1, CONSOLE_OUTPUT_DEVICE and the rest).
- `min_access_level: 0` rejected by `min(1)`, and level 0 is what a
  conference open to everyone carries.

The data was right in all three; the schemas were wrong about it.

**Doors is not actually covered by this sweep.** ConfigService.getDoors()
reads the `doors` TABLE and doors live on disk, so it is empty under test and
the case passes vacuously - the file says so rather than pretending. That
domain's GET/PUT vocabulary has its own suite,
`tests/services/door-schema-roundtrip.test.ts`.

Users and Access Levels are still not swept: neither goes through
ConfigService, so both need their own case.

## 4. Pre-existing CI failures that are not admin - OPEN

`Backend Tests` has been red on `main` since long before this session. After
the config fixes it is down to two clusters, neither of them admin:

- `tests/amiga-emulation/execute-lha-extract.test.ts` - 4 tests. Passes 10/10
  on macOS, fails on Linux CI. The fixture is byte-identical and `lha.js` is
  committed, so it is platform-specific and needs a Linux repro.
- Three door suites fail to run: `Cannot find module
  '@amiexpress/bbs-door-sdk/engines/graphics/motion-trail'`. SDK build or
  export problem, in door territory.

## 5. `vite-env.d.ts` keeps being deleted - OPEN

`web/config-app/src/vite-env.d.ts` and `web/frontend/src/vite-env.d.ts` were
found deleted from the working tree twice in one day, and restored both times.
Both are committed. While they are missing the typecheck fails on
`Property 'env' does not exist on type 'ImportMeta'`, which silently drops the
gate every other check depends on. Worth finding what removes them.
