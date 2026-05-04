---
date: 2026-05-04
topic: message-audit-and-bug-sweep
tags: [handoff-archive, message, audit, bugs]
status: implemented
---

# Handoff archive — 2026-05-04

Two distinct work packages this day. Headlines preserved here so
`handoff.md` can stay under the CLAUDE.md 10KB / 120-line limit; the
actual code changes live in the commits referenced.

---

## Package 1 — Message-function 1:1 audit (rounds 9–24)

Sixteen rounds of express.e ↔ TS message subsystem audit. Started after
`do full arexx support` shipped earlier; finished with the message
function "100% complete and 1:1 with the E sources" per the loop prompt.
26+ deviations closed across enterMSG / replyToMSG / replyPrompt /
displayMessage / listMSGs / mail-scan / move / delete / EXTSEND /
captureRealAndInternetNames.

### Headlines

- **`confMailName` was the recurring bug.** Express.e uses
  `confMailName` (per-conference display name picked by NAME_TYPE_USERNAME
  / REALNAME / INTERNETNAME) for `mh.fromName` and every "is this my
  mail?" check. The TS port compared against `session.user.username`
  everywhere. In REALNAME conferences this silently broke: replies
  didn't prompt delete-original, mail scan missed messages addressed to
  the user's real name, EALL banner showed the wrong name, FORWARDMAIL
  redirect missed sysop-authored mail. Fixed at every site (rounds 9,
  10, 13, 14, 17). Added `getConfMailName(session)` and session-less
  `getConfMailNameFor(user, confId, msgBaseId)` helpers.
- **`E <name>` params branch ran a partial `skipEntry`** — only EALL,
  no sysop / chooseAName / checkConfAccess / checkToForward.
  Refactored into `processToRecipient` shared by both the interactive
  To: prompt and the params path (round 9).
- **EALL exact-match** — was `startsWith('eall')`, accepted 'eallice'
  (round 9).
- **MsgBase lock-failure paths** — saveMessage and deleteMSG now emit
  the express.e:10744 / 11940 verbatim text on lock contention, and
  deleteMSG locks BEFORE the DB mutation so disk and DB stay consistent
  (rounds 9, 19).
- **Move-message preserves source `recv`** — was zeroing read state
  on every move (round 11).
- **INTERNETNAME tooltype** — wasn't being harvested into
  ConferenceToolFlags. Added `requireInternetname` /
  `requireInternetnameMsgBases`, fixed REALNAME>INTERNETNAME priority
  (round 12). USERNAME tooltype is for TO: validation only, NOT
  confNameType.
- **replyPrompt auth gates** — K/D/F/R all compared against raw
  username; missing R reply-auth gate; missing
  ACS_READ_PRIV_EALL/ALL gates on read-mail filter; missing EALL
  clause on F (round 13).
- **listMSGs L command** — was reusing the broad msgReaderMessages
  list so users saw every readable public message instead of just
  their inbox; now applies the express.e:8854 narrow filter
  (toName=confMailName OR EALL OR ALL+MAILSCAN_ALL) plus reads the
  per-conf MAILSCAN_ALL bit (rounds 15, 18).
- **M-command `Move message (y/n)?`** — was treating CR as no
  (yesNo(2) semantics); express.e:11847 calls yesNo(0) which loops on
  CR/invalid (round 16).
- **EXTSEND save-side dump (express.e:10654-10685)** — wasn't
  implemented. Now writes `<msgBaseLocation>/EXT-OUT/<i>.msg` for
  external/UUCP gateways with per-call MSGID via the ported
  `getNextMsgId()` (express.e:10576-10624) — monotonic counter at
  `<bbsLoc>/msgidnr.nxt` under `msgidnr.lck` lockfile (rounds 22, 24).
- **`captureRealAndInternetNames` inline prompts** — was blocking with
  a notice. Implemented full express.e:28166-28225 inline prompt loop
  with two new substates, duplicate-name rejection via newly-added
  `getUserByRealname` / `getUserByInternetname`, wildcard / spaces
  rejection. E, F, R commands all migrated to the resume-callback
  form (rounds 23, 24).
- **`message-entry.handler.ts` split** — file hit 1995/2000 lines, so
  forward + reply-delete handlers extracted into
  `message-forward.handler.ts` (round 21).

### Commits (msg-audit)

```
de5a516a8 test(msg): align tooltypes default-shape test with INTERNETNAME fields
4875c949c fix(msg): close final 3 audit follow-ups (uniqueness, F/R resume, getMsgId)
d93dfa07f fix(msg): captureRealAndInternetNames inline prompts (express.e:28151-28227)
b394c593a fix(msg): EXTSEND save-side dump (express.e:10654-10685)
ac5e872c0 refactor(msg): split forward/reply-delete handlers into message-forward.handler.ts
d1a0551e3 fix(msg): displayMessage handles concurrent-delete race (express.e:8888-8892)
131874baf fix(msg): deleteMSG locks before mutating, surfaces lock-failure to user
915b572c2 fix(msg): listMSGs MAILSCAN_ALL gate matches express.e:8854
30311c75a fix(msg): mail scan filter uses confMailName per-conference (express.e:11706)
574238bc1 fix(msg): M command move-confirmation uses yesNo(0) — loop on CR
1a7fddbac fix(msg): L command (listMSGs) restricts to inbox, not full readable list
4362a6601 fix(msg): displayMessage uses confMailName for received-mark + EALL banner
a06753015 fix(msg): replyPrompt menu auth checks use confMailName + ACS gates
499ae9ad8 fix(msg): close confNameType resolution — INTERNETNAME + REALNAME priority
e533c7fb8 fix(msg): move-message preserves source recv (express.e:11879 update=FALSE)
1faf4630b fix(msg): replyToMSG/checkToForward use confMailName + slot-1 sysop match
2247cf0ed fix(msg): close enterMSG 1:1 gaps — params skipEntry, EALL, confMailName, lock
```

17 new regression tests added; 74/74 passing across `message-entry`,
`get-next-msg-id`, `conference-tooltypes`. Pre-existing
`message-pointers` / `message-scan-parity` / `message-repository`
suites also pass — they need the full DB init (NOT `SKIP_DB_INIT=1`).

---

## Package 2 — Bug-queue sweep: download / upload / expert / operator-chat

- **D command flagged files** (`b493b6802`). F-command and JH_FLAGFILE
  both push to `session.flaggedFiles` with shape `{filename, confNum}`,
  but D read from `session.tempData?.flaggedFiles` and keyed off
  `f.fileName` (camelCase) — flags from the file-listing UI never
  reached the download set. Also stopped the loud "Screen not found:
  DOWNLOAD" sysop alert by passing `silent=true`. Restored
  `Conf14/{Menu,downloadmsg,uploadmsg}.txt` from the SanctuaryBBS
  reference.
- **Expert mode (X) post-E redraw** (`1c5b18227`). `saveMessage` called
  `displayMainMenu(forceMenuDisplay=true)`, which bypassed the expert
  check (line 60). Split the flag into `forceMenuDisplay` (still
  overrides expert) and `bypassDebounce` (skips the 500ms guard but
  respects expert). saveMessage now uses `(false, true)`.
- **Operator-page cancel** (`91c18baf1`, regression test in
  `732163e2f`). The OPERATOR_CHAT_WAITING handler resolved the
  repository via tsyringe — `OperatorChatRepository` isn't
  `@injectable()`, so every cancel attempt threw "TypeInfo not known"
  and disconnected the user. Routes through
  `db.getOperatorChatRepository()` like every other caller.
- **Upload "transport error" disconnect** (`1bdef6d27`, `4c2699110`).
  socket.io's `maxHttpBufferSize` was 1MB but BBSTerminal sent
  uploads as `Array.from(new Uint8Array(buf))` which JSON-inflates
  ~3x. Migrated the uploader to multipart POST against `/api/upload`
  (multer); buffer back down to 4MB. Binary never touches the
  websocket now.
- **DOORMAN freeze under heavy mouse activity** (`b2fa20371`).
  Throttled `mouse-drag` and `mouse-hover` to 60Hz per session at the
  socket boundary; `mouse-up` and `mouse-click` NOT throttled. Gated
  the 3-per-event console.log spam in `Program._handleData` behind
  `SDK_LOG_MOUSE=1`.

### Commits (bug-sweep)

```
4c2699110 feat(upload): migrate BBSTerminal uploader to multipart HTTP, shrink buffer
1bdef6d27 fix(upload): bump socket.io maxHttpBufferSize to fit JSON-encoded uploads
732163e2f test(operator-chat): regression guard for cancel-page repository resolution
1c5b18227 fix(messages): expert mode no longer redraws full menu after E command
b493b6802 fix(download): D command picks up flagged files; restore Conf14 screens
```
