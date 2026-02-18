# Hero Card – GPT Orchestration Log

This document tracks all commands, context, and intent related to **Hero Card UI development**.

## Purpose

- Keep Hero-related GPT changes isolated
- Provide deterministic reproduction steps
- Make it easy to audit, revert, or replay changes
- Reduce cognitive load across multiple GPT threads

---

## Scope

The Hero Card is responsible for:

- Displaying the primary resort recommendation
- Handling single-day vs multi-day presentation
- Rendering summary decision output
- Supporting cleaner adjacent-day rendering

This log tracks all shell commands executed to inspect, modify, or apply GPT-generated diffs related to the Hero card.

---

# Commands

---

## 2026-02-17 — Hero: Single-Day Clarity

### Intent

Improve clarity of single-day rendering in Hero card.

### Command

```bash
./scripts/apply-gpt-diff.sh --pbpaste -m "Hero: single-day clarity"
```

### Notes

- Applies GPT-generated diff from clipboard.
- Commit message explicitly scoped to Hero.
- Used after validating diff manually in thread.

---

## 2026-02-17 — Inspect Snow.tsx (Hero Section)

### Intent

Copy relevant Hero-related UI region for GPT review.

### Command

```bash
sed -n '450,650p' src/pages/Snow.tsx | pbcopy
```

### Notes

- Copies lines 450–650 to clipboard.
- Region includes Hero card + adjacent planner rendering.
- Line numbers may drift as file evolves.

---

# Safer Inspection Patterns (Recommended)

Line numbers are brittle. Prefer semantic search when possible.

### Find Hero-related anchors

```bash
rg -n "Hero|hero|Week|Planner|Decision" src/pages/Snow.tsx
```

### Copy entire Hero component block (if function-based)

```bash
perl -0777 -ne 'print $1 if /function\s+HeroCard\b.*?\n}\n/s' src/pages/Snow.tsx | pbcopy
```

This is more stable than hard-coded line ranges.

---

# Operating Discipline for Hero Thread

When working in the Hero GPT thread:

1. Always scope commit messages with `Hero:`
2. Log every executed command here
3. Prefer semantic extraction over fixed line numbers
4. Validate diff before applying
5. Keep Hero changes isolated from planner/scoring threads

---

# Quick Checklist Before Applying GPT Diff

- [ ] Clipboard contains only intended patch  
- [ ] `git status` is clean  
- [ ] Correct branch checked out  
- [ ] Commit message scoped (`Hero:` prefix)  
- [ ] Diff visually reviewed in thread  

---

# Future Improvements (Optional)

If Hero work expands, consider:

- Creating `src/components/hero/` directory
- Extracting Hero view-model adapter
- Adding snapshot test for Hero rendering
- Creating `hero.fixture.ts` for deterministic UI test
