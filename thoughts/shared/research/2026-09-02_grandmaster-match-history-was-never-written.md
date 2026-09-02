---
date: 2026-09-02
topic: "GRANDMASTER's gm_matches is empty because nothing has ever written it"
tags: [grandmaster, doors, sqlite, data-loss, false-alarm]
status: final
---

# gm_matches was never a data loss

Carried into this session as an open question: `gm_matches` is 0 on the live
board while users, leaderboards and stats survived, and nobody could say what
recreated `data/grandmaster.db` at Sep 1 22:10.

**Nothing was lost. The table has no writer and never has.**

## The evidence

`gm_matches` appears in exactly one file in the whole repository -
`Doors/grandmaster/server/database/schema.sql` - where it is created and
indexed. There is no `match-repository.ts`, no `INSERT INTO gm_matches`
anywhere in `Doors/`, `sdk/` or `web/backend`, and no reader either: no
screen, no query, no "match history" anything. The door's game-over path
(`app.ts:3178 submitScore`) writes a leaderboard entry and a replay, and
stops there.

`server/database/` holds three repositories - user, leaderboard, replay.

## The measurement that settles it

Row counts on the live database (`sqlite3 -readonly`, through the container):

```
gm_users              2
gm_matches            0
gm_leaderboards       2
gm_replays            2
gm_achievements       0
gm_seasons            1
gm_season_rankings    0
```

Every table with a writer has rows. Every table without one is empty. The
single `gm_seasons` row is the `INSERT OR IGNORE` at `schema.sql:268` - a
seed, which is the same rule stated the other way round.

A wipe cannot spare exactly the three tables that have code behind them.

## The Sep 1 22:10 mtime, explained

The database is in WAL mode: `journal_mode=wal`, a 4,096-byte main file (one
page - the header) and a 539,752-byte `-wal` beside it. **In WAL mode the main
file is only written at a checkpoint**, so its mtime is the last checkpoint,
not the last write. Every row on that board lives in the WAL. Nothing
recreated the file at 22:10; that is simply when it was last checkpointed,
and the deploy's door-data backup is right to take `-wal` with it.

## What is actually open

Match history is unimplemented schema, not a bug: a `MatchRepository`, a write
from the game-over path, and a screen to read it. That is a feature to decide
on, not an incident to investigate. `gm_achievements` and `gm_season_rankings`
are in the same state.
