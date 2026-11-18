# Support changelog help links

Tracks SourceClip issue 216: release notes published to the support changelog
(support.sourceclip.app) keep the help changelog's root-relative links, such as
`/account/#reduce-motion`, which resolve against the support host instead of
help.sourceclip.app.

## User Story & Acceptance Criteria

### User Story

As the SourceClip release operator, I publish release notes whose help links
open the help site, and I correct the notes already published with relative
links once, without duplicating or republishing them.

### Acceptance Criteria

- [ ] `scripts/publish-changelog.mjs` rewrites Markdown link, image and
  reference-definition destinations whose decoded value starts with `/` but not
  `//` by inserting `https://help.sourceclip.app` at the destination's source
  offset. Positions come from the public micromark `parse`/`postprocess`/
  `preprocess` API and decoding from `micromark-util-decode-string`; no regex
  Markdown parsing or re-serialization.
- [ ] Everything else in the Markdown stays byte for byte: inline and fenced
  code, indented code, raw HTML, formatting, titles, angle brackets,
  backslash escapes, character references, queries and fragments, and
  absolute, protocol-relative (`//host`), `mailto:`, local fragment (`#id`) and
  bare or `./` relative destinations. A rewritten note is a fixed point.
- [ ] A new release note is stored with absolute help links in both `content`
  and `published_content`. Publishing stays idempotent: an existing note with
  the same title is skipped. The old `--force` option, which inserted a second
  row (and fails on the `(org_id, slug)` unique index), is removed with no
  replacement flag; passing it no longer changes anything.
- [ ] `--repair-help-links` corrects existing publisher-owned notes only:
  `org_id = 'default-org'`, `author_id = 'system'` and a slug matching the
  publisher's `sourceclip-<alphanumeric version>` convention. Other
  organizations, authors and support posts are never read for repair.
- [ ] The repair transforms `content` and `published_content` independently,
  so a pending draft edit is never published and a null `published_content`
  stays null. It writes only those two columns and `updated_at`, and only on
  rows where one of them changes; title, slug, status, categories, cover,
  published title/categories/cover, `published_at` and `created_at` are kept.
- [ ] The repair runs in one transaction that selects the notes `FOR UPDATE`:
  it waits for an uncommitted concurrent save and rewrites the saved Markdown,
  and a save started during the repair waits for its commit, so neither write
  is lost. A second repair reports zero changes.
- [ ] `--repair-help-links --dry-run` reads in a read-only transaction and
  prints the slugs and changed field names plus a count, never Markdown bodies
  or connection details.
- [ ] `micromark` 4.0.3 and `micromark-util-decode-string` 2.0.1 are exact
  direct dependencies (both already locked transitively; published 2026-09-26
  and 2024-11-12, past the 24-hour cooldown). No other dependency changes.
- [ ] `tests/publish-changelog.test.ts` keeps its nine CLI cases and adds CLI
  cases against the isolated test PostgreSQL: the stored links of a new note
  (dry-run size, rerun and `--force` skip, repair finds nothing); repair dry
  run, repair and second repair with in-scope and out-of-scope rows and full
  row comparisons; and a repair blocked by an uncommitted save that then
  repairs the saved Markdown.

## Data Models

No schema change. Repair updates existing `changelog` rows:

```sql
UPDATE changelog
SET content = $1, published_content = $2, updated_at = now()
WHERE id = $3; -- row selected FOR UPDATE in the same transaction
```

## API Contracts

No HTTP route changes.

### CLI

```text
node scripts/publish-changelog.mjs --version <version>
  [--changelog <path>] [--date <ISO timestamp>] [--dry-run]
node scripts/publish-changelog.mjs --repair-help-links [--dry-run]
```

| Exit | Meaning |
|------|---------|
| 0 | Published, already published, nothing to publish, repaired (including zero notes), or dry run |
| 1 | Missing `--version`, no changelog path, unreadable file, or connection or database error |

Repair output, one line per changed note then a total:

```text
Would repair help links in sourceclip-03281 (content, published_content).
Would repair help links in 1 of 12 SourceClip release notes.
```

Without `--dry-run` the verb is `Repaired`, printed after the transaction
commits.

### Operator runbook

Run from the support checkout with the operator environment (the connection
resolves as for publishing: `SUPPORT_DATABASE_URL`, `DATABASE_URL`, or
`NEON_API_KEY` for the `sourceclip-support` Neon project):

```bash
node --env-file="$TTM_PLATFORM_ROOT/.env.local" \
  "$TTM_PLATFORM_ROOT/apps/sourceclip-support/scripts/publish-changelog.mjs" \
  --repair-help-links --dry-run
node --env-file="$TTM_PLATFORM_ROOT/.env.local" \
  "$TTM_PLATFORM_ROOT/apps/sourceclip-support/scripts/publish-changelog.mjs" \
  --repair-help-links
```

Review the dry-run slugs before the real repair, then run the real repair a
second time and expect `Repaired help links in 0 of N SourceClip release
notes.` The support app renders stored Markdown, so corrected links appear
without a Worker deploy.

Row locks cover saves in flight, not an admin editor opened before the repair
and saved after it, which would store the Markdown it loaded. Run the repair
when no release note is open in the dashboard; a later dry run that lists a
slug again shows such a save.

## Component Trees (Nuxt 3 / Vue)

No UI changes.

## Service Dependencies

| Service | Binding | Purpose |
|---------|---------|---------|
| Neon PostgreSQL | `SUPPORT_DATABASE_URL`, `DATABASE_URL` or `NEON_API_KEY` | Operator-only connection for publish and repair; not part of the Worker deployment |

## Release scope

No Worker release. `scripts/` is not part of the Worker bundle. The deferred
SourceClip production branch work (draft PR #3) is unchanged.

## Task Checklist

See [tasks.md](./tasks.md).
