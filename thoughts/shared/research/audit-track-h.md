---
date: 2026-04-28
topic: track-h-support-libraries-data-structures
tags: [audit, binary-format, endian, qwk, tooltypes, axobjects, axconsts, axenums]
status: final
---

# Track H Audit — Support Libraries & Data Structures

## Executive Summary

| Category | Issues Found |
|----------|-------------|
| P1 (critical, data corruption) | 5 |
| P2 (wrong behavior, protocol violation) | 6 |
| P3 (cosmetic / minor) | 3 |

**P1 issues all involve struct layout or field-order mismatches that would cause doors to read wrong values from shared memory or disk files.**

---

## 1. axobjects.e — Binary Struct Definitions

### 1a. `mailHeader` struct audit

Source: `axobjects.e:179-190`

```
OBJECT mailHeader
  status: CHAR           ; 1 byte
  msgNumb: LONG          ; 4 bytes
  toName[31]: ARRAY OF CHAR  ; 31 bytes
  fromName[31]: ARRAY OF CHAR; 31 bytes
  subject[31]: ARRAY OF CHAR ; 31 bytes
  msgDate: LONG          ; 4 bytes
  recv: LONG             ; 4 bytes
  extMsgNum: INT         ; 2 bytes
ENDOBJECT             -> comment says 110 bytes
```

Field offset table (Amiga E — **no alignment padding** on 68K for basic CHAR/LONG/INT sequences):

| Field | Type | Size | Offset | Notes |
|-------|------|------|--------|-------|
| status | CHAR | 1 | 0 | |
| msgNumb | LONG | 4 | 1 | BE |
| toName | CHAR[31] | 31 | 5 | |
| fromName | CHAR[31] | 31 | 36 | |
| subject | CHAR[31] | 31 | 67 | |
| msgDate | LONG | 4 | 98 | BE |
| recv | LONG | 4 | 102 | BE |
| extMsgNum | INT | 2 | 106 | BE |
| **TOTAL** | | **108** | | |

**The comment says 110 bytes but the struct adds up to 108 bytes.** The source comment `->110` and secondary comment `->1+1+4+31+31+31+1+4+4+1` also sums to 108. Express.e's `saveMh` call at `qwk.e:676` checks `saveMh(fh,mh)<>110` — this is the actual serialized size with 2 bytes of trailing padding (Amiga E always pads objects to even size). So the on-disk size is **110 bytes** (108 + 2 pad).

**TypeScript implementation: `MessageIndexManager.ts`**

```typescript
private readonly MSGHEADER_SIZE = 110;  // ✅ Correct
```

Field serialization in `serializeMsgHeader` (MessageIndexManager.ts:148-193):

| Field | Offset claimed | Read method | Status |
|-------|---------------|-------------|--------|
| status (CHAR) | 0 | writeUInt8 | ✅ |
| msgNumb (LONG) | 1 | writeInt32BE | ✅ |
| toName[31] | 5 | ascii copy | ✅ |
| fromName[31] | 36 | ascii copy | ✅ |
| subject[31] | 67 | ascii copy | ✅ |
| msgDate (LONG) | 98 | writeInt32BE | ✅ |
| recv (LONG) | 102 | writeInt32BE | ✅ |
| extMsgNum (INT) | 106 | writeInt16BE | ✅ |

`MessageIndexManager` is **correct** for mailHeader.

---

### 1b. `mailStat` struct audit

Source: `axobjects.e:192-197`

```
OBJECT mailStat
  lowestKey: LONG      ; 4 bytes
  highMsgNum: LONG     ; 4 bytes
  lowestNotDel: LONG   ; 4 bytes
  pad[6]: ARRAY OF CHAR; 6 bytes
ENDOBJECT              ; = 18 bytes total
```

**P1 DEVIATION — `MessageIndexManager` vs `message-file.util` field order mismatch**

There are TWO separate MailStats implementations in the TypeScript code with **different field orderings**:

**`MessageIndexManager.ts:318-341`** (correct order matches axobjects.e):
```typescript
lowestKey    @ offset 0  (writeInt32BE)  ✅
highMsgNum   @ offset 4  (writeInt32BE)  ✅
lowestNotDel @ offset 8  (writeInt32BE)  ✅
pad[6]       @ offset 12               ✅
TOTAL = 18 bytes ✅
```

**`message-file.util.ts:101-105`** (WRONG field order — does NOT match axobjects.e):
```typescript
lowestKey    @ offset 0  (readInt32BE(0)) ✅
lowestNotDel @ offset 4  (readInt32BE(4)) ❌ WRONG — should be highMsgNum
highMsgNum   @ offset 8  (readInt32BE(8)) ❌ WRONG — should be lowestNotDel
TOTAL = 12 bytes (missing 6-byte pad) ❌
```

`message-file.util.ts:122-128` write confirms the swap:
```typescript
buffer.writeInt32BE(stats.lowestKey, 0);     // ✅ correct
buffer.writeInt32BE(stats.lowestNotDel, 4);  // ❌ WRONG: axobjects.e has highMsgNum here
buffer.writeInt32BE(stats.highMsgNum, 8);    // ❌ WRONG: axobjects.e has lowestNotDel here
```

This means `message-file.util.ts` writes `lowestNotDel` into the `highMsgNum` byte position and vice versa — a direct binary incompatibility with AmiExpress HeaderFile reads. The file written by `message-file.util.ts` is only 12 bytes (no pad), while the real format is 18 bytes with 6 bytes of pad.

**Fix**: Swap fields 4 and 8 in message-file.util.ts to match axobjects.e:
- offset 4 = highMsgNum
- offset 8 = lowestNotDel
- Add 6-byte pad to reach 18 bytes total.

**Priority: P1** — Any 68K door reading MailStats (e.g., AquaScan, MultiTop, any message reader) will read stale/wrong highMsgNum and treat it as lowestNotDel.

---

### 1c. `confBase` struct audit

Source: `axobjects.e:136-155`

```
OBJECT confBase
  handle[16]: ARRAY OF CHAR  ; 16 bytes
  downloadBytesBCD[8]:       ; 8 bytes
  uploadBytesBCD[8]:         ; 8 bytes
  newSinceDate: LONG         ; 4 bytes  @ offset 32
  confRead: LONG             ; 4 bytes  @ offset 36
  confYM: LONG               ; 4 bytes  @ offset 40
  bytesDownload: LONG        ; 4 bytes  @ offset 44
  bytesUpload: LONG          ; 4 bytes  @ offset 48
  uploadTracking: INT        ; 2 bytes  @ offset 52
  unused: INT                ; 2 bytes  @ offset 54
  unused2: LONG              ; 4 bytes  @ offset 56
  upload: INT                ; 2 bytes  @ offset 60
  downloads: INT             ; 2 bytes  @ offset 62
  ratioType: INT             ; 2 bytes  @ offset 64
  ratio: INT                 ; 2 bytes  @ offset 66
  messagesPosted: INT        ; 2 bytes  @ offset 68
  access: INT                ; 2 bytes  @ offset 70
  active: INT                ; 2 bytes  @ offset 72
ENDOBJECT                    ; = 74 bytes
```

Actual size: 16+8+8+4+4+4+4+4+2+2+4+2+2+2+2+2+2+2 = **74 bytes**

**`ConferenceFileManager.ts` claims `CONFBASE_SIZE = 64`** — 10 bytes short. The claim at line 7: "Each conference is a fixed-size record" and `private readonly CONFBASE_SIZE = 64`.

Checking the serializer in `ConferenceFileManager.ts:123-189`:
- handle[16] + downloadBytesBCD[8] + uploadBytesBCD[8] = 32 bytes
- newSinceDate(4) + confRead(4) + confYM(4) + bytesDownload(4) + bytesUpload(4) = 20 bytes
- uploadTracking(2) + unused(2) + unused2(4) = 8 bytes
- upload(2) + downloads(2) + ratioType(2) + ratio(2) + messagesPosted(2) + access(2) + active(2) = 14 bytes
- **Total serialized: 32 + 20 + 8 + 14 = 74 bytes**

But the buffer is only allocated as 64 bytes! The serialize function would overflow by 10 bytes and the check `if (offset !== this.CONFBASE_SIZE)` would throw. **This is a critical size mismatch.**

**Fix**: Change `CONFBASE_SIZE = 64` to `CONFBASE_SIZE = 74`. Every Conf.DB read/write and slot offset calculation uses this constant.

**Priority: P1** — Every conference slot in Conf.DB is written with wrong stride. Slot 1 data overlaps into slot 0's tail, causing corrupted conference list reads.

---

### 1d. `user` struct size in UserFileManager vs UserStructures

Source: `axobjects.e:11-68`

Calculated size from source (Amiga E packs arrays without padding between; INTs on word boundary):

| Segment | Bytes |
|---------|-------|
| name[31] | 31 |
| pass[9] | 9 |
| location[30] | 30 |
| phoneNumber[13] | 13 |
| +1 pad (align INT) | 1 |
| slotNumber-badFiles (6 INTs) | 12 |
| newSinceDate-confRead3 (4 LONGs) | 16 |
| zoomType-badFiles (8 INTs) | 16 |
| accountDate (LONG) | 4 |
| screenType-editorType (2 INTs) | 4 |
| conferenceAccess[10] | 10 |
| uploads-timesCalled (4 INTs) | 8 |
| timeLastOn-dailyBytesDld (8 LONGs) | 32 |
| expert (CHAR) | 1 |
| +1 pad (align LONG) | 1 |
| chatRemain-creditTotalDate (7 LONGs) | 28 |
| creditTracking (CHAR) | 1 |
| translatorID (CHAR) | 1 |
| msgBaseRJoin (INT) | 2 |
| confYM9 (LONG) | 4 |
| todaysBytesLimit (LONG) | 4 |
| protocol-newUser (4 CHARs) | 4 |
| **TOTAL** | **232** |

**`UserFileManager.ts` uses `USER_STRUCT_SIZE = 232`** ✅ — matches the calculation.

**`UserStructures.ts` (for shared memory) uses `static readonly SIZE = 230`** at line 79 — **2 bytes short**.

The comment in `UserStructures.ts:77` says `TOTAL SIZE: 230 bytes (0xE6)`. Checking the layout table in the comment, offset 0xE5 = `newUser` (last CHAR). Size would be 0xE6 = 230. But this layout shows `phoneNumber` at `+0x46` (70 decimal), which means no alignment pad after `phoneNumber[13]`. The `UserFileManager` adds 1 pad byte after `phoneNumber[13]`. If `UserStructures.ts` doesn't include this pad, it shifts every subsequent field by 1 byte.

Comparing `UserFileManager.ts` serialize (`serializeUserStruct`):
- After phoneNumber[13] (ends at offset 83): `buffer.writeUInt8(0, offset++)` adds 1 pad byte, making slotNumber at offset 84 (0x54).

`UserStructures.ts` comment shows `slotNumber` at `+0x53` (83 decimal) — **no pad byte inserted**.

This means `UserStructures.ts` puts the entire remainder of the struct 1 byte earlier than `UserFileManager.ts`. The two implementations disagree on layout for every INT and LONG after the phone number field.

**Priority: P1** — Any 68K door reading user memory via `UserStructures` will read wrong values for secStatus, secBoard, all LONGs, etc. Only affects the in-memory struct written to the emulator, not disk reads (which use UserFileManager correctly).

---

### 1e. `userKeys` struct padding

Source: `axobjects.e:70-81`

```
OBJECT userKeys
  userName[31]: ARRAY OF CHAR  ; 31 bytes, ends at offset 30
  number: LONG                 ; 4 bytes — must align to 2-byte boundary
  newUser: CHAR                ; 1 byte
  oldUpCPS: INT                ; 2 bytes — must align to 2-byte boundary
  ...
```

On 68K, LONG requires 2-byte alignment. After `userName[31]` (odd end), there is **1 byte of padding** before `number`. Then after `newUser` (CHAR at even address), 1 byte pad before `oldUpCPS` (INT).

`UserFileManager.ts` adds both pads correctly (lines 381-386) ✅.
`UserStructures.ts` comment (lines 320-333) shows:
- `+0x1F: number` — offset 31 (odd!) — **no padding byte stated**

If `UserStructures.ts` places `number` at 0x1F (odd offset), this is a misaligned LONG on 68K. The actual write at line 345:
```typescript
emulator.writeMemory32(addr + 0x1F, user.id || 0);
```
MOIRA may handle misaligned writes, but the layout is wrong vs. disk format where `UserFileManager` puts `number` at offset 32 (with pad).

`UserFileManager.ts` (line 382): inserts pad byte, puts number at offset 32.
`UserStructures.ts`: puts number at offset 31 (no pad).

**Priority: P2** — Misalignment in userKeys in-memory structure. Disk reads (UserFileManager) are correct; shared memory layout (UserStructures) is wrong.

---

## 2. axconsts.e — ACS Permission Constants

`axconsts.e` does **not** contain `ACS_*` constants — those are in `express.e` (lines 31528-31537 as cited in `acs-permissions.ts`). The axconsts.e file contains: socket constants, editor flags (`ED_ANSI_ALLOWED`, etc.), page constants (`PG_SM`, `PG_CO`, etc.), and scan masks.

Checking `axconsts.e` scan masks vs TypeScript:

| axconsts.e Constant | Value | TypeScript | Status |
|--------------------|-------|------------|--------|
| MAIL_SCAN_MASK | 4 | `ScanFlags.MAIL_SCAN = 1 << 2 = 4` | ✅ |
| FILE_SCAN_MASK | 8 | `ScanFlags.FILE_SCAN = 1 << 3 = 8` | ✅ |
| ZOOM_SCAN_MASK | 2 | `ScanFlags.ZOOM_SCAN = 1 << 1 = 2` | ✅ |
| MAILSCAN_ALL | 128 | `ScanFlags.MAILSCAN_ALL = 1 << 7 = 128` | ✅ |

Scan flags are correct.

Editor flags from `axconsts.e`:

| axconsts.e Constant | Value |
|--------------------|-------|
| ED_ANSI_ALLOWED | 1 |
| ED_ABORT_ALLOWED | 2 |
| ED_LOAD_ALLOWED | 4 |
| ED_BATCH_UPLOAD | 8 |
| ED_ATTACH_FILE | 16 |
| ED_BATCH_REQUESTED | 32768 |
| ED_ATTACH_REQUESTED | 16384 |

No TS enum for these was found in constants/. These may be hardcoded inline where used — **not a deviation, just absence of named constants**.

PG_* constants from `axconsts.e`:

| Constant | Value |
|---------|-------|
| PG_SM | 1 |
| PG_CO | 2 |
| PG_SO | 3 |
| PG_CC | 4 |
| PG_CH | 5 |
| PG_PM | 6 |
| PG_SC | 7 |
| PG_HK | 8 |
| PG_SF | 10 |
| PG_FF | 11 |
| PG_EF | 12 |
| PG_UD | 13 |
| PG_US | 14 |
| PG_PS | 15 |
| PG_CS | 16 |
| PG_RD | 17 |
| PG_CL | 18 |
| PG_SG | 19 |
| PG_SHUTDOWN | 20 |
| PG_TM | 21 |

Note: `PG_SF` = 10 (skips 9). No TypeScript constants file for these found. Not a deviation since PG_* are used only internally by the TIM/ACP protocol — but the skip at 9 should be documented for whoever implements full TIM support.

---

## 3. axenums.e — Enumeration Comparison

Amiga E enums auto-increment from 0. Values listed as-declared.

### STATE_* (main BBS states)

```
axenums.e:5
STATE_AWAIT=0, STATE_CONNECTING=1, STATE_SYSOPLOGON=2, STATE_LOGON=3,
STATE_LOGGEDON=4, STATE_HANGUP=5, STATE_LOGGING_OFF=6, STATE_SHUTDOWN=7,
STATE_CHECK=8, STATE_SUSPEND=9
```

**`bbs-states.ts` BBSState enum** uses string literals, not integers. The names present:
- AWAIT, LOGON, REGISTERING (WEB_ extension), LOGGEDON

Missing from TypeScript: `CONNECTING`, `SYSOPLOGON`, `HANGUP`, `LOGGING_OFF`, `SHUTDOWN`, `CHECK`, `SUSPEND`.

**Priority: P2** — These states are used by the state machine that express.e drives. Missing states means the TS BBS can't represent or transition into those states if a 68K door or internal component depends on them. `REGISTERING` is a WEB_ extension (acceptable). The others (`HANGUP`, `SHUTDOWN`, `LOGGING_OFF`) are operationally important.

### REQ_STATE_* (request states)

```
axenums.e:7
REQ_STATE_NONE=0, REQ_STATE_LOGOFF=1, REQ_STATE_SHUTDOWN=2,
REQ_STATE_SHUTDOWN_OFFHOOK=3, REQ_STATE_SYSOPLOGON=4, REQ_STATE_LOGON=5,
REQ_STATE_RESUME=6
```

No corresponding TypeScript enum found. Not critical unless inter-node signaling uses these.

### SUBSTATE_* (sub-states during loggedon)

```
axenums.e:9
SUBSTATE_DISPLAY_AWAIT=0, SUBSTATE_INPUT=1, SUBSTATE_DISPLAY_BULL=2,
SUBSTATE_DISPLAY_CONF_BULL=3, SUBSTATE_DISPLAY_MENU=4,
SUBSTATE_READ_COMMAND=5, SUBSTATE_READ_SHORTCUTS=6,
SUBSTATE_PROCESS_COMMAND=7, SUBSTATE_READSHORTCUTS=8
```

`bbs-states.ts` `LoggedOnSubState` uses string literals rather than integers. String literals are fine for the web TS layer, but if any 68K door reads the substate integer directly from shared memory, it must match these values.

**Priority: P3** — document only; internal mapping needed if shared memory substate is used.

### SCREEN_* (screen identifiers)

```
axenums.e:19 (partial list):
SCREEN_AWAIT=0, SCREEN_BBSTITLE=1, SCREEN_LOGON=2, SCREEN_JOIN=3,
SCREEN_JOINCONF=4, SCREEN_CONF_JOINMSGBASE=5, SCREEN_JOINMSGBASE=6,
SCREEN_JOINED=7, SCREEN_BULL=8, SCREEN_NODE_BULL=9, SCREEN_CONF_BULL=10,
SCREEN_MENU=11, SCREEN_LOGOFF=12, SCREEN_DOWNLOAD=13, SCREEN_UPLOAD=14,
SCREEN_NEWUSERPW=15, SCREEN_NONEWUSERS=16, SCREEN_NONEWATBAUD=17,
SCREEN_GUESTLOGON=18, SCREEN_NOCALLERSATBAUD=19, SCREEN_LOCKOUT0=20,
SCREEN_LOCKOUT1=21, SCREEN_PRIVATE=22, SCREEN_ONENODE=23, SCREEN_LOGON24=24,
SCREEN_NOT_TIME=25, SCREEN_FILEHELP=26, SCREEN_LANGUAGES=27,
SCREEN_REALNAMES=28, SCREEN_INTERNETNAMES=29, SCREEN_MAILSCAN=30,
SCREEN_NOUPLOADS=31
```

These map to `displayScreen()` calls. Searched for TypeScript counterparts — `env-codes.ts` and `screen.handler.ts` reference screens by filename string, not integer. This is a valid implementation difference (using filenames instead of integer enum) as long as the resolution is correct.

### USER_* flags (userKeys.userFlags bits)

```
axenums.e:46:
USER_NEWMSG=1, USER_TOCONF1=2, USER_ONETIME_MSG=4, USER_SCRNCLR=8,
USER_DONATED=16, USER_ED_FULLSCREEN=32, USER_ED_PROMPT=64,
USER_BGFILECHECK=128
```

No TypeScript constants file for user flags found. These bit flags are likely hardcoded inline.

---

## 4. tooltypes.e — .info File Tooltype Parsing

### Original express.e tooltype behavior

`tooltypes.e:152-174` (`readToolType`):
1. Calls `getNodeFile()` to resolve the `.info` file path.
2. Calls `GetDiskObject()` (Amiga OS icon library) to read the binary `.info` file.
3. Falls back to `.txt` or `.cfg` files as plain text with `KEY=VALUE` lines.
4. Calls `FindToolType(tooltypes, key)` — this is the **Amiga OS icon library function**.

The `FindToolType` AmigaOS function does **case-insensitive** key comparison. This is documented behavior.

`getOrCreateCacheItem()` (line 223): For plain text fallback, lines are parsed, comments after `;` are stripped, trailing whitespace is trimmed. Keys are stored raw (not uppercased) in this path.

### TypeScript implementation — `info-file.util.ts`

Key comparison in `updateTooltype` and `removeTooltype` (lines 370-416):
```typescript
const upperKey = key.toUpperCase();
const existingIndex = info.tooltypes.findIndex(tt => tt.key === upperKey);
```

And in `parseTooltypeString` (line 77):
```typescript
const key = rawKey.toUpperCase();
```

**All keys are uppercased on parse and comparison** ✅ — matches `FindToolType` case-insensitive behavior.

Tooltype format parsing differences:

| Feature | tooltypes.e / Amiga OS | TypeScript info-file.util.ts |
|---------|------------------------|------------------------------|
| Comment prefix `(NAME)` | strip parens, mark commented | ✅ strip, set `commented=true` |
| Comment prefix `!NAME` | not in AmigaOS FindToolType (used by express.e custom parser?) | ✅ supported |
| Semicolon comments on text lines | stripped | ✅ stripped (line 280) |
| Trailing whitespace | trimmed | ✅ trimmed |
| Case sensitivity | case-insensitive | ✅ uppercase |
| Empty key validation | no validation in OS | TS validates via VALID_KEY_RE |

**Minor deviation**: The plain-text fallback in tooltypes.e strips comments after `;` on the same line. The TypeScript fallback (`extractTooltypesFallback`) doesn't parse line-by-line; it scans for printable ASCII blobs. This could cause issues with text-format `.info` files that mix tooltype lines with comments.

**Priority: P3** — text-format .info files are rare; binary .info parsing matches well.

---

## 5. qwk.e — QWK Packet Format

### qwk.e message block format

From `qwk.e:561-580` (`main()` read loop):

```amigae
n := Read(mf, buf, 128)         -- reads 128-byte blocks
qh.status := buf[0]              -- byte 0: status
StrCopy(tempStr, buf+1, 7)       -- bytes 1-7: msgnum (7 chars, decimal)
AstrCopy(qh.msgdate, buf+8, 14)  -- bytes 8-21: date (14 chars)
AstrCopy(qh.to, buf+21, 26)      -- bytes 21-46: to (26 chars)  *** overlap bug ***
AstrCopy(qh.from, buf+46, 26)    -- bytes 46-71: from (26 chars)
AstrCopy(qh.subject, buf+71, 26) -- bytes 71-96: subject (26 chars)
AstrCopy(qh.password, buf+96, 13)-- bytes 96-108: password (13 chars)
StrCopy(tempStr, buf+108, 8)     -- bytes 108-115: inReplyTo (8 chars decimal)
StrCopy(tempStr, buf+116, 8)     -- bytes 116-123: blockCount (8 chars decimal)
qh.active := buf[122]            -- byte 122: active flag
qh.confNum := buf[123] + (256*buf[124])  -- bytes 123-124: conf num (little-endian)
qh.relativeMsgNum := buf[125] + (256*buf[126])  -- bytes 125-126: relative msg num (LE)
qh.netTag := buf[127]            -- byte 127: net tag
```

Note: `msgdate` + `to` overlap — `buf+8` (14 chars) ends at byte 22, but `to` starts at `buf+21`. This is a 1-byte overlap in the Amiga source which is a pre-existing bug in qwk.e. The standard QWK format (PC/DOS) defines:
- bytes 8-14: date (MM-DD-YY, 8 chars — **not 14**)
- bytes 15-19: time (HH:MM, 5 chars)
- bytes 20-45: to name (25 chars + null = **26 chars, but offset 20 not 21**)

The Amiga qwk.e code has a 1-byte offset error in the `to` field (reads from 21, should be 20 per PC QWK spec). This is a known discrepancy in the original code.

### TypeScript QWK implementation — `qwk.service.ts`

**P1 DEVIATION — QWK message block field offsets are wrong**

`qwk.service.ts:189-196` (`parseQWKMessage`):
```typescript
const status = buffer[offset];
const msgNum = buffer.readUInt32LE(offset + 1);
const dateStr = buffer.slice(offset + 5, offset + 13).toString('ascii').trim();
const timeStr = buffer.slice(offset + 13, offset + 18).toString('ascii').trim();
const to = buffer.slice(offset + 18, offset + 43).toString('ascii')...
const from = buffer.slice(offset + 43, offset + 68).toString('ascii')...
const subject = buffer.slice(offset + 68, offset + 93).toString('ascii')...
```

These offsets are the **PC standard QWK format** offsets. However:

1. **msgNum is read as `readUInt32LE`** — the PC QWK format stores message number as 7 ASCII decimal digits at bytes 1-7, not as a binary LE integer. The Amiga code does `Val(tempStr)` after `StrCopy(tempStr, buf+1, 7)`.
   - `readUInt32LE(offset+1)` reads raw bytes 1-4 as a binary integer, which is totally wrong.
   - **Fix**: Read bytes 1-7 as ASCII, parse as integer.

2. **blockCount read as `readUInt16LE(offset + 116)`** — same issue. PC QWK spec has block count as 2 bytes at offset 116, but the Amiga qwk.e reads it as 8-char decimal string at offset 116. The TS code uses `readUInt16LE` which may coincidentally work for small values but is not the QWK format.

3. **confNum at offset 110** — TypeScript uses `buffer[110]`, but qwk.e reads `buf[123]+(256*buf[124])` (LE word at offset 123).
   - `qwk.service.ts:417`: `buffer[110] = message.conference` — **wrong offset**.
   - Correct: offset 123 (LSB) + offset 124 (MSB).

4. **inReplyTo**: TypeScript line 105 reads `buffer.readUInt32LE(offset + 108)` via the missing explicit field. The qwk.e reads 8-char decimal at offset 108.

**`createQWKMessage` (`qwk.service.ts:365-429`) also writes wrong offsets**:
- Line 381: `buffer.writeUInt32LE(msgNum, 1)` — should be 7-char ASCII.
- Line 417: `buffer[110] = message.conference` — wrong offset (should be 123/124).

**Priority: P1** — Any QWK round-trip with a real Amiga QWK tool will fail because msgNum and confNum are read/written at wrong offsets/formats.

---

### CONTROL.DAT format

`qwk.e:248-289` (`createControlDat`):

```
Line 0: BBS name
Line 1: BBS location
Line 2: BBS phone number
Line 3: "SysopName, Sysop"
Line 4: "000000,BBSID"
Line 5: date/time ("MM/DD/YY,HH:MM")
Line 6: user name
Line 7: (blank)
Line 8: "0"
Line 9: "0"
Line 10: conf count
Line 11+: conf_id\r\n + conf_name\r\n (pairs)
...
"HELLO\r\n"
"NEWS\r\n"
"GOODBYE\r\n"
```

TypeScript `createQWKHeader()` in `qwk.service.ts:340-361` creates a 128-byte binary blob with "QWK" at offset 0 — this is **the MESSAGES.DAT header**, not CONTROL.DAT. There is no TypeScript implementation of `createControlDat` found. CONTROL.DAT is a critical file in QWK packets; its absence means the TS QWK generator produces invalid packets.

**Priority: P2** — CONTROL.DAT must be present in any valid QWK packet for offline mail readers to parse.

---

## 6. Tooltypes Key Lookup — `FindToolType` Compatibility

`tooltypes.e` uses AmigaOS `FindToolType()` which:
- Is case-insensitive
- Returns the value after `=`, or the whole string if no `=`
- Returns NULL if not found

`checkToolType` uses `MatchToolValue()` which is also case-insensitive for the value comparison.

TypeScript `parseInfoFile` / `updateTooltype`:
- Keys uppercased on parse ✅
- Values are NOT uppercased ✅ (correct, values are case-sensitive in practice)
- `findIndex(tt => tt.key === upperKey)` — exact match on uppercased key ✅

One gap: `checkToolType` in tooltypes.e checks the **value** with `MatchToolValue()` (case-insensitive). The TypeScript tooltype system has no equivalent `checkToolType` function that does case-insensitive value comparison. Callers must do their own case-insensitive value comparison.

**Priority: P3** — functional gap but low impact; most tooltype values are numbers or YES/NO.

---

## Summary Table

### axobjects.e struct deviations

| Struct | Field | axobjects.e | Our code | File | Status |
|--------|-------|------------|----------|------|--------|
| mailStat | field order at offset 4 | highMsgNum | lowestNotDel | message-file.util.ts:101-105 | ❌ P1 |
| mailStat | field order at offset 8 | lowestNotDel | highMsgNum | message-file.util.ts | ❌ P1 |
| mailStat | total size | 18 bytes (with 6-byte pad) | 12 bytes (no pad) | message-file.util.ts | ❌ P1 |
| confBase | struct size | 74 bytes | CONFBASE_SIZE=64 | ConferenceFileManager.ts:50 | ❌ P1 |
| user | pad after phoneNumber[13] | +1 byte (offset 84) | missing (offset 83) | UserStructures.ts | ❌ P1 |
| userKeys | pad after userName[31] | +1 byte (offset 32) | no pad (offset 31) | UserStructures.ts | ❌ P2 |
| mailHeader | struct size | 110 bytes | 110 bytes | MessageIndexManager.ts | ✅ |
| mailHeader | all fields | correct BE | correct BE | MessageIndexManager.ts | ✅ |
| user | struct size | 232 bytes | USER_STRUCT_SIZE=232 | UserFileManager.ts | ✅ |
| userMisc | struct size | 248 bytes | USERMISC_STRUCT_SIZE=248 | UserFileManager.ts | ✅ |

### axconsts.e constant deviations

| Constant | axconsts.e | TypeScript | File | Status |
|---------|-----------|------------|------|--------|
| MAIL_SCAN_MASK=4 | 4 | ScanFlags.MAIL_SCAN=4 | message-pointers.ts | ✅ |
| FILE_SCAN_MASK=8 | 8 | ScanFlags.FILE_SCAN=8 | message-pointers.ts | ✅ |
| ZOOM_SCAN_MASK=2 | 2 | ScanFlags.ZOOM_SCAN=2 | message-pointers.ts | ✅ |
| MAILSCAN_ALL=128 | 128 | ScanFlags.MAILSCAN_ALL=128 | message-pointers.ts | ✅ |

### axenums.e enum deviations

| Enum | axenums.e | TypeScript | Status |
|------|----------|------------|--------|
| STATE_AWAIT=0 | 0 | BBSState.AWAIT='await' | ✅ (strings ok) |
| STATE_HANGUP=5 | 5 | missing | ❌ P2 |
| STATE_LOGGING_OFF=6 | 6 | missing | ❌ P2 |
| STATE_SHUTDOWN=7 | 7 | missing | ❌ P2 |
| LOGON_TYPE_* | 0-4 | not found | P2 (if used by doors) |

### QWK format deviations

| Component | qwk.e (Amiga) | qwk.service.ts | Status |
|-----------|--------------|----------------|--------|
| msgNum format | 7-char ASCII at offset 1 | readUInt32LE(offset+1) | ❌ P1 |
| confNum offset | byte 123+124 LE word | buffer[110] | ❌ P1 |
| blockCount format | 8-char ASCII at offset 116 | readUInt16LE(offset+116) | ❌ P2 |
| CONTROL.DAT | created per spec | missing | ❌ P2 |

---

## Recommended Fix Priority

### P1 — Fix immediately (data corruption on disk/memory)

1. **`message-file.util.ts`**: Swap `highMsgNum` and `lowestNotDel` offsets (4 and 8), add 6-byte pad to reach 18 bytes.
2. **`ConferenceFileManager.ts`**: Change `CONFBASE_SIZE = 64` to `74`.
3. **`UserStructures.ts`**: Add 1-byte padding after `phoneNumber[13]` before `slotNumber`, update all subsequent offsets, update `SIZE = 230` to `232`.
4. **`qwk.service.ts`**: Fix msgNum to read/write 7-char ASCII at offset 1; fix confNum to offset 123/124.

### P2 — Fix before QWK or multi-node features

5. **`qwk.service.ts`**: Add `createControlDat()` per qwk.e format.
6. **`bbs-states.ts`**: Add missing states: `HANGUP`, `LOGGING_OFF`, `SHUTDOWN` (and optionally `CONNECTING`, `SYSOPLOGON`, `CHECK`, `SUSPEND`).
7. **`UserStructures.ts`**: Fix `userKeys` pad after `userName[31]`.
8. **`qwk.service.ts`**: Fix blockCount to read/write 8-char ASCII at offset 116.

### P3 — Nice to have

9. Add named TypeScript constants for `ED_*` editor flags, `USER_*` userFlags bits, `PG_*` page commands.
10. Add `checkToolTypeValue()` helper with case-insensitive value comparison to match AmigaOS `MatchToolValue()`.
