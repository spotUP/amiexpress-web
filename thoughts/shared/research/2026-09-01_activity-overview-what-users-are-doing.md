---
date: 2026-09-01
topic: The admin's Activity overview knows almost nothing about what users are doing
tags: [admin, activity, events, telemetry, todo]
status: draft
---

# Activity overview: what it knows, and what the board already knows

Requested by the sysop, 2026-09-01: *"the activity overview in the admin
interface is really lacking, it only knows if a door is running or not, expand
it greatly - I want to see what the users are doing."*

Not started. This is the scoping, so whoever picks it up does not start by
re-reading the same six files.

## What exists today

- `web/config-app/src/pages/ActivityPage.tsx` (272 lines) - the live feed.
- `web/backend/src/services/bbs-event-emitter.ts` - the contract.

The whole vocabulary is **six event types**:

```
user_login | user_logout | upload | download | door_activity | custom_door_event
```

and the backend emits them from **seven places**:

| file | what it reports |
|---|---|
| `handlers/door.handler.ts` (x2) | a door was entered / exited |
| `services/login-post.service.ts` | logged on |
| `server/socket-handlers.ts` | logged off |
| `handlers/user/new-user.handler.ts` | a new user |
| `server/file-socket-handlers.ts` | upload |
| `handlers/file/download.handler.ts` | download |

The page also backfills history from the callers log, uploads and downloads
(marked `seeded`) - that part is real data, not placeholder rows.

So the feed answers "who is on, who moved a file, and which door is open". It
says nothing about the ninety per cent of a session that happens between
logon and logoff.

## What the board already knows and never reports

None of this needs new plumbing to OBSERVE - it is all in the session or
passes through one handler. It needs emitting.

- **Which conference and message base** the user is in. `JoinConf` changes it;
  the session carries it.
- **The command being run.** `handlers/command.handler.ts` sees every keypress
  that becomes a command - the single richest source, and it emits nothing.
- **Reading and posting messages** - which base, which message, replying or
  entering new.
- **Browsing and searching files** - which area, which search.
- **Paging the sysop / entering chat**, and whether it was answered.
- **Idle time and time remaining**, which the node manager already tracks.
- **Connection type and node** - telnet, SSH, web, and the baud a door sees.
- **New-user signup progress**, which today reports only the finished account.
- **Door INTERNALS.** `custom_door_event` exists for exactly this and is
  barely used; a door could report "playing level 3", "in the message editor".

## The obvious shape

1. Widen `BBSEventType`. It is a union in one file, and the page's three
   lookup tables (`TYPE_ICON`, `TYPE_TONE`, `TYPE_LABEL`) are keyed by it, so
   TypeScript names every site that needs a new case - the compiler does the
   bookkeeping.
2. Emit from `command.handler.ts` first. One site, and it covers most of what
   the sysop is asking to see.
3. Give the page a per-user view, not just a flat feed: "what is Phantasm
   doing" is the actual question, and the feed makes it a scrolling search.
4. Consider retention. The feed is in-memory and capped at `MAX_ENTRIES`;
   "what were they doing an hour ago" needs somewhere to put it. The callers
   log is the existing precedent for durable history.

## Care

- **Do not log what a user typed verbatim.** A command line can carry a
  password (the login prompt, `AUTOVAL_PASSWORD`), and the Configuration Files
  page will happily display anything written to disk.
- The emitter broadcasts to every admin socket; a per-keystroke event would be
  a flood. Emit at command GRANULARITY, not keystroke.
- `who-is-online.ts` (added 2026-09-01) is the existing "who is on" read and
  the natural companion to a per-user view - do not grow a second one.
