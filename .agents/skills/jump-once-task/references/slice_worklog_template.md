# Slice Worklog — S<x.y> <title>

Copy this per task slice. It mirrors the nine-stage loop so nothing is skipped. Keep it terse — it's a working artifact, not a document. Discard or archive once the slice is `VERIFIED` and captured in the verification report.

---

## 1. Reboot
- Handoff read: yes/no — resume point noted: `<file:line>`
- PKG parsed: `pkg_hash = <hash>` — matches handoff? yes/no
- `npm test`: PASS / FAIL (if FAIL → this slice becomes the regression fix)

## 2. Select
- Slice: `S<x.y>` — REQs: `REQ-###, …`
- Depends satisfied: `<list>` all COMPLETED/VERIFIED? yes/no
- Phase gate ok (predecessors VERIFIED; M2 honored if content)? yes/no
- State → IN_PROGRESS: backlog ✅ / slices ✅

## 3. Plan (micro)
- Goal (1 sentence):
- Acceptance criteria to satisfy:
- Files to touch:
- Test(s) that will prove it:

## 4. Anchor (refactor only)
- Dependents (from PKG):
- Type boundary frozen: `<interface/.d.ts>`
- Target module coverage 100%? yes/no — missing tests written first? yes/no

## 5. Implement
- Files changed:
- Invariants held (tick each): data-driven ▢ · SSOT/StateManager ▢ · immutable ▢ · deterministic ▢ · isolated systems ▢ · encapsulated geometry ▢ · no placeholders ▢
- Directory placement correct? yes/no

## 6. Verify
- New tests added:
- `npm test`: PASS / FAIL
- Determinism/replay asserted (if relevant)? yes/na
- Any file integrated-against-but-unread? → read it: done ▢

## 7. Integrate
- PKG updated: node ▢ · dependencies ▢ · dependents ▢ · last_verified_commit ▢ · pkg_hash bumped ▢
- Design decisions logged in ledger (5 fields)? yes/na

## 8. Report
- Slice state → COMPLETED ▢ → VERIFIED ▢ (only after PRD-criteria review)
- REQs advanced in backlog: `<ids → state>`
- Phase closed? → `docs/verification/P<n>.md` filed ▢
- Milestone closed? → Subtractive Removal pass ▢ · PRD compliance audit ▢

## 9. Handoff
- `meta/handoff_latest.json` written ▢
- Exact resume point recorded: `<file:line + pending transformation>`
- Warnings for next session:
- Next-session pick-list:
