# Handoff - 2025-12-31

## Current State
- Fixed `UserDatabaseManager.ts` struct sizes to match 68K alignment: USER_SIZE=232, USERKEYS_SIZE=56, USERMISC_SIZE=248.
- Changed byte order from little-endian to big-endian for 68K compatibility.
- Added alignment padding after phoneNumber, expert, userName, and newUser.
- Updated CONF_ACCESS_OFFSET from 135 to 136.
- Updated all stat field offsets (+1 for phoneNumber padding).

## Next Steps
- Delete old user.data/user.keys/user.misc files.
- Restart servers and login to regenerate user files with correct format.
- Test AquaScan N door - should complete without stalling after EXPRESS_VERSION.
- Verify confScan works for conferences 4+.

## Recent Prompts
- "fix aquascan n"

