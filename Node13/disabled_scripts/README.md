# Disabled Questionnaire Scripts

These `script{baud}` files are the AmiExpress new-user questionnaire scripts
for this node. They were moved out of the node root to disable the
questionnaire step in the new-user registration flow.

## Why they're here

The new-user flow in `web/backend/src/handlers/user/new-user.handler.ts` runs
`findQuestionnaireScript()` after a user confirms the registration summary. If
that function finds no `script*` file in the node directory, the questionnaire
is skipped and the account is created immediately. Moving these files into
`disabled_scripts/` hides them from the lookup.

## To re-enable the questionnaire for this node

From the node directory (e.g. `Node0/`):

```
mv disabled_scripts/script* .
rmdir disabled_scripts
```

The flow will pick them up on the next new-user registration; no server
restart is required.

## To re-enable for ALL nodes in one shot

From the repo root (or whatever `BBS_DATA_DIR` points to):

```
for d in Node*/disabled_scripts; do
  [ -d "$d" ] || continue
  node=$(dirname "$d")
  mv "$d"/script* "$node"/
  rmdir "$d"
done
```

## Script file format

Each line is either:

- A `~`-terminated prompt the user answers, e.g. `What is your real name: ~`
- Plain text printed verbatim (e.g. a section banner or closing note)
- Blank line — printed as an empty line

Filenames are `script{baud}` where `{baud}` matches the session's connect
speed. The lookup tries session baud first, then 57600, 38400, 33600, 28800,
19200, 14400, then falls back to any file whose name starts with `script`.

User answers are appended to `Answers` (and written to `TempAns`) in the same
node directory at the end of the questionnaire, for sysop review.

## Live deployment note

The Hetzner container keeps its own node directories under the
`amiexpress-bbs-data` Docker volume. Repo-side changes do NOT propagate. To
disable or re-enable on production:

```
docker exec -it amiexpress-bbs sh -c 'cd /app/data && for d in Node*; do ... done'
```

Adjust paths for the production data directory.
