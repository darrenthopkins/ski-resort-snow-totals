# Hero Card – GPT Orchestration Log

This document tracks commands, context, and intent related to **Hero Card UI development**.

---

## Repo / Fork

- git@github.com:darrenthopkins/ski-resort-snow-totals.git

## Canonical Hero Branch

- feature/hero-ux

---

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

Constraints for Hero threads:

- **Do not modify planner logic**
- **Do not modify scoring**
- Keep changes localized to: `src/pages/Snow.tsx`

---

# Primary Workflow (Preferred)

## Region Replace (Deterministic)

For Hero refactors, patch hunks are often fragile. Region replace is the stable method.

### 1) Find Hero IIFE markers (robust)

```bash
rg -n '^\s*\{\(\(\)\s*=>\s*\{$' src/pages/Snow.tsx
rg -n '^\s*\}\)\(\)\}\s*$' src/pages/Snow.tsx
