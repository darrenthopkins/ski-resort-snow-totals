# Hero Card – GPT Workflow

Repo:
git@github.com:darrenthopkins/ski-resort-snow-totals.git

Branch:
feature/hero-ux

All Hero work must:
- NOT modify planner logic
- NOT modify scoring
- Only modify src/pages/Snow.tsx
- Use the provided scripts (no large manual edits)

---

# STANDARD HERO + GPT LOOP

## 1) Copy Hero region to GPT

From repo root:

```bash
sed -n '450,900p' src/pages/Snow.tsx | pbcopy
```

Paste into GPT thread and describe the requested change.

---

## 2) GPT must return ONE of the following:

A) A FULL replacement block including:
   `{(() => {`
   `})()}`

OR

B) A valid unified diff containing hunk headers like:
   `@@ -123,7 +123,9 @@`

---

## 3) Apply GPT output

### Preferred: Region Replace (Deterministic)

Copy GPT’s full replacement block to clipboard, then run:

```bash
./scripts/replace-between.sh \
  --file src/pages/Snow.tsx \
  --start '{(() => {' \
  --end '})()}' \
  --pbpaste \
  --trim \
  --backup
```

This:
- Reads from clipboard using pbpaste
- Replaces only the Hero region
- Creates a backup of the file

---

### Alternate: Patch Apply (Only if valid unified diff)

Copy GPT diff to clipboard, then run:

```bash
./scripts/apply-gpt-diff.sh --pbpaste -m "Hero: <description>"
```

If patch fails, revert to Region Replace above.

---

## 4) Verify Before Commit

```bash
git status
git diff -- src/pages/Snow.tsx
npm run build
```

Optional probe:

```bash
rg -n 'Alternate:|heroPicks|multi resort' src/pages/Snow.tsx
```

---

## 5) Commit + Push

```bash
git add src/pages/Snow.tsx
git commit -m "Hero: <description>"
git push origin feature/hero-ux
```

---

# Clipboard Utilities (macOS)

View clipboard:

```bash
pbpaste
```

Copy Hero region again:

```bash
sed -n '450,900p' src/pages/Snow.tsx | pbcopy
```
