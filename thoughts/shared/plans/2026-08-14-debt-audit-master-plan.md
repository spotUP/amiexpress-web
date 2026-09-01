---
date: 2026-08-14
topic: Full-project WIP/TODO/stub audit + master fix plan
tags: [audit, debt, roadmap, emulator, security, corpus, fame, parity]
status: draft
---

# Debt audit — master fix plan

Sources: three parallel audits on 2026-08-14 — (A) code markers (86 actionable
items across 11 subsystems), (B) documentation mining (32 open items, 21 stale
clusters explicitly retired), (C) emulator stub surface (per-library
implemented/stub tables + dishonest-success inventory). Full details live in
the audit outputs; this plan consolidates, dedupes, and sequences. Each phase
is sized to become its own detailed TDD plan at execution time.

Retired as stale (do NOT re-pick): 149-corpus-reds backlog, DOORMAN backlog,
CONFTOP resetdate, DREWALL prompt leak, GWALL hang, audit-master 138/138,
info-editor del