---
date: 2026-04-28
topic: db-default-audit
tags: [database, sql, defaults, bitmask, audit]
status: final
---

# Database DEFAULT Value Audit

Audit of SQL `DEFAULT N` values (non-zero), `INSERT OR REPLACE` patterns, and partial INSERTs
that could silently reset feature-enabling fields.

Reference bug: `conf_base.scan_flags DEFAULT 12` caused AquaScan to auto-launch every login
whenever any `INSERT OR REPLACE` omitted `scan_flags` (e.g., after reading a message).
Fixed 2026-04-27: schema changed to `DEFAULT 0`, migration resets existing rows, INSERT paths
converted to `ON CONFLICT DO UPDATE`.

---

## ISSUES FOUND

---

### advanced-commands.handler.ts `getUserScanFlags()` — HIGH

**File**: `web/backend/src/handlers/commands/advanced-commands.handler.ts:529,533,536`

**Code**:
```typescript
return result.rows[0].scan_flags || 12; // Default: MAIL_SCAN_MASK | FILE_SCAN_MASK
// ...
return 12; // MAIL_SCAN_MASK | FILE_SCAN_MASK  (no-row case)
// ...
return 12;  // error case
```

**Meaning**: 12 = `FILE_SCAN_MASK (8) | MAIL_SCAN_MASK (4)`. This is the exact same magic number
that was the root cause of the original bug.

**Risk**: `getUserScanFlags()` is called by `toggleScanFlag()` which is called by the CF command
(conference flags toggle). If a conf_base row does not yet exist for a user, or if `scan_flags`
is 0 (legitimately), this function returns 12 and immediately enables both AquaScan and mail scan
before the toggle is even applied. A user toggling any CF flag in a fresh conference will have
their scan_flags silently initialized to 12 instead of 0, re-introducing the original bug via
a different path.

The `|| 12` form also means scan_flags=0 (a valid stored state meaning "no scans") is treated
identically to "no row", returning 12 and then the toggle starts from the wrong base.

**INSERT patterns affected**: `toggleScanFlag()` uses `ON CONFLICT DO UPDATE SET scan_flags = $4`
which is safe for the upsert itself — but the value being upserted is computed from a corrupted
starting value of 12.

**Fix**: Replace all three `return 12` / `|| 12` fallbacks with `return 0`. The SQL DEFAULT is
now 0 and `DEFAULT_SCAN_FLAGS = 0` is defined in `types/message-pointers.ts` for this exact
purpose. Use that constant.

---

### conference_config INSERT omits feature columns — LOW-MEDIUM

**File**: `web/backend/src/database/config-repository.ts:392-428`

**SQL DEFAULT values omitted from INSERT**:
- `no_newscan INTEGER DEFAULT 0` — omitted from INSERT column list
- `show_new_files INTEGER DEFAULT 0` — omitted from INSERT column list
- `no_new_files INTEGER DEFAULT 0` — omitted from INSERT column list
- `free_downloads INTEGER DEFAULT 0` — omitted from INSERT column list
- `menu_prompt TEXT DEFAULT ''` — omitted (safe)
- `confdb_shared INTEGER DEFAULT 0` — omitted from INSERT column list
- `use_username INTEGER DEFAULT 1` — omitted from INSERT column list
- `use_realname INTEGER DEFAULT 0` — omitted (safe)
- `use_internetname INTEGER DEFAULT 0` — omitted (safe)

**Risk**: All omitted boolean columns have `DEFAULT 0` except `use_username` which has `DEFAULT 1`.

- `use_username DEFAULT 1`: If `createConferenceConfig()` is called (which omits this column),
  the row gets `use_username=1` from SQL DEFAULT. This is actually the correct desired value
  (display username, not real name), so this is benign in practice.
- All other omitted flags are `DEFAULT 0` (features off). These are benign.
- This INSERT is not an `INSERT OR REPLACE`, so it cannot nuke an existing row.

**Verdict**: Low risk. No feature is auto-enabled by a missing value here, and there is no
`INSERT OR REPLACE` path. The `use_username=1` default matches expected behavior. Document
the omission is intentional, or fill in the missing columns explicitly for clarity.

---

### account-edit-input.handler.ts stale comment — COSMETIC

**File**: `web/backend/src/handlers/user/account-edit-input.handler.ts:753`

**Comment**:
```typescript
// Create new record with explicit scan_flags=0 (not the SQL DEFAULT of 12,
// which would incorrectly enable both FILE_SCAN and MAIL_SCAN for every conf).
```

**Meaning**: The schema's SQL DEFAULT is now 0 (changed during the 2026-04-27 fix). This comment
refers to the old schema value.

**Risk**: None. The code itself is correct (explicitly inserts 0). The comment is just stale and
misleading — it implies the schema still has `DEFAULT 12`.

**Fix**: Update comment to say `DEFAULT 0` — the explicit value is a defensive belt-and-suspenders
measure against any future schema change, not an active override.

---

### chat_room_members INSERT OR REPLACE omits is_muted, is_voiced — LOW

**File**: `web/backend/src/database/chat-repository.ts:265-269`

**Code**:
```typescript
INSERT OR REPLACE INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator)
VALUES (?, ?, ?, ?, ?)
```

**SQL DEFAULTs for omitted columns**:
- `is_muted INTEGER DEFAULT 0`
- `is_voiced INTEGER DEFAULT 0`
- `joined_at INTEGER DEFAULT (strftime('%s', 'now'))`

**Risk**: `INSERT OR REPLACE` deletes the existing row then re-inserts. If a user is already
muted (`is_muted=1`) or voiced (`is_voiced=1`) in a room, rejoining the room (which calls
`joinChatRoom()`) will silently clear both of those states because `is_muted` and `is_voiced`
are not included in the column list and will reset to DEFAULT 0.

Similarly, `joined_at` will be refreshed to "now" on every rejoin, losing the original join
timestamp.

For mutes this is the more serious concern: a moderator mutes a user, then the user disconnects
and reconnects — `joinChatRoom()` is presumably called again — and the mute is silently cleared.

**Fix**: Convert to `INSERT ... ON CONFLICT(room_id, user_id) DO UPDATE SET username=...,
socket_id=..., is_moderator=...` preserving `is_muted`, `is_voiced`, and `joined_at`. Or include
all columns explicitly in the `INSERT OR REPLACE` by reading existing values first.

---

### room_bans INSERT OR REPLACE omits banned_at — MINOR

**File**: `web/backend/src/database/moderation-repository.ts:16-19`

**Code**:
```typescript
INSERT OR REPLACE INTO room_bans (room_id, user_id, banned_by, reason, expires_at)
VALUES (?, ?, ?, ?, ?)
```

**SQL DEFAULT omitted**: `banned_at INTEGER DEFAULT (strftime('%s', 'now'))`

**Risk**: `INSERT OR REPLACE` nukes and re-inserts. If a user is re-banned (e.g., ban extended or
reason updated), `banned_at` resets to "now" instead of preserving the original ban timestamp.
This is a data-accuracy issue rather than a feature-enabling bug — audit logs would show the
wrong original ban time.

**Fix**: Convert to `ON CONFLICT DO UPDATE` preserving `banned_at`, or keep `INSERT OR REPLACE`
and explicitly pass the original `banned_at` value.

---

### room_mutes INSERT OR REPLACE omits muted_at — MINOR

**File**: `web/backend/src/database/moderation-repository.ts:44-47`

**Code**:
```typescript
INSERT OR REPLACE INTO room_mutes (room_id, user_id, muted_by, duration)
VALUES (?, ?, ?, ?)
```

**SQL DEFAULT omitted**: `muted_at INTEGER DEFAULT (strftime('%s', 'now'))`

**Risk**: Same as room_bans — re-muting resets `muted_at` to "now". If `duration` is checked
against `muted_at` to compute expiry, re-muting effectively extends the mute silently.

Looking at `isMuted()`:
```typescript
const mutedUntil = result.muted_at + result.duration;
if (now < mutedUntil) return true;
```
So if a 60-second mute is applied and 50 seconds later `muteUser()` is called again (e.g., to
update the reason), `muted_at` resets and the mute is extended by another full `duration`.
This is a behavior bug, not just a data-accuracy issue.

**Fix**: Convert to `ON CONFLICT DO UPDATE` preserving `muted_at`, unless the intent is to
intentionally restart the mute timer on every call.

---

### mail_stats non-zero defaults — INFORMATIONAL

**File**: `web/backend/src/database.ts:1249-1257`

**SQL DEFAULTs**:
- `lowest_key INTEGER DEFAULT 1`
- `high_msg_num INTEGER DEFAULT 1`
- `lowest_not_del INTEGER DEFAULT 0`

**INSERT pattern** (`message-pointers.util.ts:70-80`): Always explicitly passes all three values
from `DEFAULT_MAIL_STAT` (`lowestKey=1, highMsgNum=1, lowestNotDel=0`). Not an `INSERT OR
REPLACE`. The SQL defaults are never relied upon for this table.

**Risk**: None. The INSERT is complete and the SQL defaults match what the code explicitly passes.

---

### sessions INSERT OR REPLACE non-zero defaults — INFORMATIONAL

**File**: `web/backend/src/database/session-repository.ts:15-31`

**SQL DEFAULTs for sessions table** (non-zero):
- `timeremaining INTEGER DEFAULT 60`
- `confrjoin INTEGER DEFAULT 1`
- `msgbaserjoin INTEGER DEFAULT 1`
- `menupause INTEGER DEFAULT 1`

**INSERT pattern**: `INSERT OR REPLACE` with an explicit 18-column list that includes all four
of these fields.

**Risk**: None. All four fields are explicitly included in the INSERT column list, so SQL DEFAULTs
are never used for existing-row replacements.

---

### node_sessions INSERT OR REPLACE — INFORMATIONAL

**File**: `web/backend/src/database/session-repository.ts:124-136`

**SQL DEFAULT** (non-zero): `loadlevel INTEGER DEFAULT 0` (zero, safe)

**INSERT pattern**: `INSERT OR REPLACE` includes `loadlevel` explicitly.

**Risk**: None.

---

### daily_stats INSERT OR REPLACE — INFORMATIONAL

**File**: `web/backend/src/database.ts:3169-3185`

**SQL DEFAULTs** (non-zero): all counter columns default 0. Non-zero: none.

**INSERT pattern**: `INSERT OR REPLACE` with explicit column list covering all data fields.

**Risk**: None. `created_at` and `updated_at` are not included, so `created_at` would reset on
each replace — but this is a statistics table where timestamp accuracy is low stakes.

---

## SUMMARY TABLE

| Finding | Severity | File | Nature |
|---------|----------|------|--------|
| `getUserScanFlags()` returns 12 fallback | HIGH | advanced-commands.handler.ts:529,533,536 | Re-introduces original AquaScan bug via CF command path |
| `chat_room_members` INSERT OR REPLACE drops is_muted/is_voiced | LOW | chat-repository.ts:265 | Rejoining a room silently clears mute/voice state |
| `room_mutes` INSERT OR REPLACE drops muted_at | MINOR | moderation-repository.ts:44 | Re-muting resets expiry timer (may be intentional) |
| `room_bans` INSERT OR REPLACE drops banned_at | MINOR | moderation-repository.ts:16 | Re-banning resets original ban timestamp |
| `conference_config` INSERT omits several columns | LOW | config-repository.ts:392 | All omitted columns have DEFAULT 0 or safe defaults; no `INSERT OR REPLACE` |
| Stale comment referencing `DEFAULT of 12` | COSMETIC | account-edit-input.handler.ts:753 | Schema now has DEFAULT 0 |

---

## WHAT WAS CHECKED AND FOUND OK

- `conf_base.scan_flags`: Schema now `DEFAULT 0`; migration resets existing rows; all INSERT
  paths use `ON CONFLICT DO UPDATE` or explicit value 0. (Fixed 2026-04-27.)
- `mail_stats`: INSERT always passes all columns explicitly; SQL defaults match code values.
- `sessions`: INSERT OR REPLACE lists all non-zero-default columns explicitly.
- `node_sessions`: INSERT OR REPLACE is complete; only non-zero default is `loadlevel=0`.
- `daily_stats`: INSERT OR REPLACE covers all data columns; timestamp issue is low stakes.
- `users`: INSERT lists all columns explicitly; no INSERT OR REPLACE pattern.
- `conferences`: INSERT lists all columns; all defaults are 0 or safe.
- `message_bases`: No defaults of concern.
- `messages`: No non-zero defaults.
- `file_areas`: No non-zero defaults.
- `file_entries`: INSERT lists all columns; `status DEFAULT 'active'` and `checked DEFAULT 'N'`
  are always passed explicitly.
- `webhooks`: INSERT includes `enabled=1` explicitly (not relying on DEFAULT).
- `system_config` (singleton): Migration-added columns all have `DEFAULT 0`; `createSystemConfig`
  is only called on first-time creation, never as upsert.
- `conference_config`: Only INSERT (no INSERT OR REPLACE); all feature flags are DEFAULT 0 except
  `use_username DEFAULT 1` which is the correct default value.
- `node_config`: INSERT lists all columns explicitly; `sysop_chat_color DEFAULT 33` and
  `user_chat_color DEFAULT 32` are cosmetic display values, not feature enables, and are always
  passed explicitly.
- `doors`: INSERT lists all columns explicitly.
- `protocols`: INSERT lists all columns explicitly.
- `command_history`: Uses `ON CONFLICT DO UPDATE SET` (safe).
- `operator_sysop_status`: Uses `ON CONFLICT DO UPDATE SET` (safe).
- `chat_room_members`: INSERT OR REPLACE — see issue above for is_muted/is_voiced.
- `room_bans`/`room_mutes`: INSERT OR REPLACE — see issues above.
- `vote_*` tables: No non-zero defaults; INSERT OR IGNORE only.
