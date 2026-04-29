---
date: 2026-04-29
topic: message-subsystem-deviations
tags: [audit, messaging, mailstats, headerfile, express-e]
status: draft
---

# Message Subsystem Deviations from express.e — Round 5 Audit

Audit of `web/backend/src/handlers/message/*.ts` and supporting services
(`MessageIndexManager.ts`, `MessageFileManager.ts`, `utils/message-file.util.ts`)
against express.e source. Documents what IS, not what should be.

## 1. Three competing message-write paths

Three TS modules independently manage message storage:

| Module | Path used | Format |
|--------|-----------|--------|
| `utils/message-file.util.ts` | `Conf{N}/Messages/<id>.msg` | text, `.msg` ext |
| `services/MessageFileManager.ts` | `Conf{N}/Messages/<id>.msg` | text, `.msg` ext |
| `services/MessageIndexManager.ts` | `Conf{N}/MsgBase/HeaderFile`, `Conf{N}/MsgBase/MailStats` | binary index only |

express.e expects all message I/O at `<msgBaseLocation>` which defaults to
`<conf>/MsgBase/` (express.e:2068, `getMsgBaseLocation`). Message text files
are written via `Open(<msgBaseLocation><msgNum>, MODE_NEWFILE)` —
**no `.msg` extension, in MsgBase dir, not Messages dir**
(express.e:10694, 8953).

On-disk evidence in the project:
- `Conf1/MsgBase/{32,33,34,35,36,139}` — orphans (express.e-style)
- `Conf1/Messages/{38..91}.msg` — current writer output
- `Conf1/MsgBase/MailStats` — index for the `Messages/` files (mismatched dir)
- `Conf1/MsgBase/HeaderFile` — 21,780 bytes (~198 entries at 110 bytes each,
  but only 56 .msg files exist in `Messages/`)

**Severity: HIGH** — 4000+ Amiga doors that read `<conf>/MsgBase/<msgnum>`
will not find current-era messages. AquaScan, MAIL.SCAN, BBSREAD, etc. will
miss everything posted after the dir-layout migration.

## 2. `mailStat.highMsgNum` semantics off-by-one

express.e treats `highMsgNum` as the **next** message number to assign:

- express.e:8693 — fresh init: `mailStat.highMsgNum := 1`
- express.e:10688 — `mh.msgNumb := mailStat.highMsgNum` (current high becomes msg id)
- express.e:12418 — `mailStat.highMsgNum := mailStat.highMsgNum + 1`
  (unconditional bump after every save)
- express.e:5097 — UI shows `mailStat.highMsgNum - 1` as actual last msg id
- express.e:8846, 11687, 11698 — iterators use `while msgNum < mailStat.highMsgNum`

So after **N** msgs posted starting from a fresh msgbase, `highMsgNum = N + 1`.

TS `MessageIndexManager.updateMailStatsAfterAdd`
(`services/MessageIndexManager.ts:415-417`) uses MAX semantics:
```ts
if (msgNumber > stats.highMsgNum) {
  stats.highMsgNum = msgNumber;
}
```

After **N** msgs posted, `highMsgNum = N` (off by 1 vs express.e).

TS `MessageIndexManager.initializeMessageIndex` (`:130-135`) initializes
`highMsgNum: 0` — express.e:8693 inits to `1`.

By contrast, `utils/message-file.util.ts` uses the express.e-correct semantic
(reads current high as new id, writes `high + 1`, inits high=1 — see
`message-file.util.ts:69-73, 148-157`).

The two writers disagree.

Live evidence: `Conf1/MsgBase/MailStats` shows `highMsgNum=0x5b=91`,
which is the **last assigned** id (matches MAX semantic), not 92 as express.e
would store.

**Severity: HIGH** — any door iterating
`while msgNum < highMsgNum` will silently skip the last message.

## 3. `lowestNotDel` first-message bump missing

express.e:12418-12419 inside `saveMessageHeader`:

```
mailStat.highMsgNum := mailStat.highMsgNum + 1
IF (mailStat.highMsgNum = 2) THEN mailStat.lowestNotDel := 1
```

When `highMsgNum` JUST transitions to 2 (i.e. very first save in a brand-new
msgbase), `lowestNotDel` is set to 1.

TS `MessageIndexManager.updateMailStatsAfterAdd:425-427` uses different logic:
```ts
if (stats.lowestNotDel === 0 || msgNumber < stats.lowestNotDel) {
  stats.lowestNotDel = msgNumber;
}
```

This always tracks the lowest msg number ever added, not the express.e
"first message ever" rule. Different drift but converges to the same value
in normal flow. **Severity: LOW** — semantics differ, observed values agree.

## 4. Two MailStats files for the same conference

`utils/message-file.util.ts:51-54` writes MailStats at
`<conf>/Messages/MailStats`.

`services/MessageIndexManager.ts:91` writes MailStats at
`<conf>/MsgBase/MailStats`.

Live: only `Conf1/MsgBase/MailStats` exists today, no `Conf1/Messages/MailStats`.
This means the message-entry handler's call to `writeMessageFile`
(which calls `getNextMessageId` from `message-file.util.ts`) creates a
**second** MailStats file in `Messages/` whenever a message is posted by a
fresh user, while the index manager keeps writing the canonical one in
`MsgBase/`. They diverge.

**Severity: HIGH** — two files, two semantics, racing. Dual-write also means
a reader picking the wrong one sees stale numbers.

## 5. Save flow triple-writes

`message-entry.handler.ts:461` → `writeMessageFile` (`message-file.util.ts`)
allocates an id via `getNextMessageId` → writes `Conf/Messages/<id>.msg`.

`message-entry.handler.ts:478` → `_db.createMessage` →
`message-repository.ts:39-65`:
1. Calls `messageIndexManager.getNextMessageNumber` (separate id from above)
2. Calls `messageFileManager.writeMessageFile` with **that id** → second `.msg` file
3. Calls `messageIndexManager.appendMessageHeader` with **that id** → header file entry

Two ids, two `.msg` files, but only one HeaderFile entry. The HeaderFile
entry references the second id, but the user-visible "Message Number N..."
prompt shows the first id.

**Severity: CRITICAL** — every posted message creates two physical files
with different numbers. Reader by HeaderFile looks for id #2 (DB-allocated),
but user was told id #1 (file-util-allocated). Mail scan and conftop reports
will be inconsistent.

## 6. `Conf{N}/Messages/<id>.msg` file format diverges from express.e

express.e:10700-10703 writes raw body lines only, no header in the `.msg`
file (header is in the parallel HeaderFile binary index):
```
FOR i:=0 TO lines-1
  StringF(tempStr2,'\s\n',msgBuf.item(i))
  Write(f,tempStr2,StrLen(tempStr2))
ENDFOR
```

TS `message-file.util.ts:207-216` and `MessageFileManager.ts:100-138` both
prepend metadata lines (from, to, subject, date, msgNum) before body.

**Severity: MEDIUM** — Amiga doors reading message files via direct
`Open(<conf>/MsgBase/<id>)` would parse the first body line as part of the
header and break. Internal BBS reader compensates by reading `.msg` first
6 lines, but the file contents don't match the wire format.

## What's already 1:1 (verified clean)

- **Msg. Options menu prompts** (express.e:10374-10391) — `message-entry.handler.ts:172-199`
- **D delete confirmation flow** (express.e:10402-10449) — `message-entry.handler.ts:617-672`
- **Subject prompt 30-char cap** (express.e:10779) — `command.handler.ts` cap-on-input
- **MsgStatus single-char ASCII enum** (express.e:10790-10794) — `MessageIndexManager.ts:MsgStatus`
- **EH save zeros recv** (express.e:11643) — `messaging-sysop.ts:328`
- **Save flow text** "Message Number N...done!" (express.e:10692, 10705) — `message-entry.handler.ts:475`
- **Mail scan banner verbatim** (express.e:28083)
- **WEB_ tagged deviations** in handoff.md are all still tagged

## Recommended next iteration focus

The deviations in §1, §2, §4, §5 are architectural. Fixing them blindly will
break the 56 messages currently in `Conf1/Messages/`. Recommend:

1. User decision: do we keep dual-path (TS-internal works; doors don't read
   it) or migrate to express.e-canonical `<conf>/MsgBase/<id>` flat-file
   layout?
2. If migrating: write a one-shot tool to rewrite existing on-disk data and
   delete the duplicate writer paths.
3. After migration, fix `highMsgNum` semantics in `MessageIndexManager` to
   match express.e (`stats.highMsgNum = msgNumber + 1`).
4. Add the §3 lowestNotDel transition rule for completeness.

These changes are not safe to make automatically.
