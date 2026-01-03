# Handoff - 2026-01-04

## Recent Fixes (COMPLETE)

### Mail Composer Door Launch (FIXED)
**File:** `Doors/mail-composer/index.ts`
- **Issue:** The `mail-composer` door (command `E`) was failing to launch with an "Invalid TypeScript door" error. This was caused by the door using a mix of legacy and modern SDK patterns.
- **Fix:** Refactored the entire `mail-composer/index.ts` file to use the correct, modern SDK v2.0 `CoreDoor` pattern. The logic was moved into the `door.onStart()` event handler, and the door instance is now the default export. This aligns the door with the current SDK standard.

### Door Preloader (FIXED)
**Files:** `sdk/utils/door-preloader.ts`, `web/backend/src/handlers/door.handler.ts`
- **Issue:** The `SHOWPRELOADER=YES` tooltype was not working.
- **Fix:** Re-implemented the missing `door-preloader.ts` utility and restored the logic in `door.handler.ts` to conditionally display it.

### Door Execution Error (`ansi-editor`) (FIXED)
**File:** `Doors/ansi-editor/index.ts`
- **Issue:** The `ansi-editor` door was crashing on launch due to an SDK API mismatch.
- **Fix:** Refactored the door's entry point to align with the current door execution context.

### Command Priority (FIXED)
**File:** `web/backend/src/handlers/command-handler/internal-commands.ts`, `web/backend/src/utils/amiga-command-parser.util.ts`
- **Issue:** Internal commands were overriding external door commands (e.g., `livechat`).
- **Fix:** Implemented multiple fixes to ensure external doors are always prioritized over internal commands.

### Bulletin Display Loop (FIXED)
**File:** `web/backend/src/handlers/command.handler.ts`
- **Issue:** A pause loop occurred at the `NODE_BULL` screen.
- **Fix:** Corrected the display flow state machine to properly transition from `DISPLAY_NODE_BULL` to `CONF_SCAN`.

### QuickNew Path Resolution (FIXED)
**File:** `web/backend/src/services/batch-scheduler.ts`
- **Issue:** `generateQuickNewFromConfig` failed because it was receiving an unresolved Amiga-style path.
- **Fix:** Added path resolution to convert the Amiga path to a valid filesystem path.

## Recent Features (COMPLETE)
- **EXECUTE_ON_* Tooltype Support:** Run commands on various BBS events.
- **MAIL_ON_* Email Notifications:** Send email notifications via SMTP on key events.
- **Password Reset Flow:** Full password reset via email.
- **SAmiLog TypeScript Port:** Replaced 68K binary with a TypeScript implementation.