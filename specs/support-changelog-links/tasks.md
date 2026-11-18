# Tasks: support changelog help links

1. [x] `specs/support-changelog-links/spec.md` and this checklist.
2. [x] `package.json`: exact `micromark` 4.0.3 and
   `micromark-util-decode-string` 2.0.1 dev dependencies for the operator
   script.
3. [x] `scripts/publish-changelog.mjs`: `absoluteHelpLinks` inserts the help
   origin at parser-reported destination offsets; publishing stores the
   rewritten note; `--force` is removed; `--repair-help-links [--dry-run]`
   corrects scoped notes in a locking transaction; usage comment documents
   both modes.
4. [x] `tests/publish-changelog.test.ts`: CLI cases against the test database
   for a new note's stored links and for repair dry run, repair and second
   repair, with out-of-scope rows and unchanged metadata.
5. [ ] Main regenerates `pnpm-lock.yaml` with the cooldown and trust policy,
   then runs `pnpm check` and `pnpm quality` with `TTM_PLATFORM_ROOT` set.
6. [ ] Main runs the production dry run, the approved repair and a second
   repair, and verifies `sourceclip-03281` links to
   `https://help.sourceclip.app/account/#reduce-motion`.
7. [ ] No Worker release; the publisher runs from the operator checkout only.
