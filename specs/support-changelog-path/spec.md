# Support changelog publisher path

Tracks SourceClip issue 208 (stale `/Volumes/TITAN` paths after the workspace
move). Issue 216 (relative help links in published notes) is separate and out
of scope.

## User Story & Acceptance Criteria

### User Story

As the SourceClip release operator, I publish a release note to the support
changelog from the platform checkout wherever it lives, without a hard-coded
machine path.

### Acceptance Criteria

- [ ] `scripts/publish-changelog.mjs` exists on `main` with the publisher
  behavior already used for SourceClip releases from the `sourceclip` branch:
  same section extraction, slug, title, idempotent insert, `--date`, `--force`
  and `--dry-run` options, and connection resolution.
- [ ] Without `--changelog`, the script reads
  `$TTM_PLATFORM_ROOT/apps/sourceclip/docs/help/src/content/docs/changelog.md`.
- [ ] With `--changelog <path>`, the script reads that file and needs no
  `TTM_PLATFORM_ROOT`.
- [ ] With neither, the script exits 1 with
  `Set TTM_PLATFORM_ROOT or pass --changelog <path>` before reading any file
  or opening a database connection.
- [ ] No `/Volumes/TITAN` path remains in the script.
- [ ] `tests/publish-changelog.test.ts` runs the CLI in a subprocess with an
  isolated environment and temporary changelog files. `--dry-run` cases cover
  the default path, the explicit path, the missing-path failure, a version
  without an entry, and a missing `--version`. Publishing cases run against the
  test database (`DATABASE_URL` from `scripts/with-test-postgres.mjs`): a
  direct URL publishes once and a rerun skips; with only `NEON_API_KEY`, a
  test-only `--import` preload answers the Neon management API from a fixture
  (rejecting every other request) and the CLI publishes through the project
  named exactly `sourceclip-support`, or through `NEON_SUPPORT_PROJECT_ID`
  without the lookup. A missing key, failed requests, a missing project and a
  missing URI exit 1 without publishing, and no output echoes the credential
  or connection URI.
- [ ] The script is declared as the `changelog:publish` package script, so
  Knip and Fallow treat it as an entry point.
- [ ] The full gate's dependency audit passes, which this change has to fix
  first (owner-approved gate prerequisite): advisories reported against the
  existing dependencies on `main` and four acceptances past their 2026-11-08
  review date. See [Gate prerequisite](#gate-prerequisite-dependency-audit).

## Data Models

No schema change. The script inserts into the existing `changelog` table with
the same columns and values as the deployed publisher.

## API Contracts

No HTTP route changes.

### CLI

```text
node scripts/publish-changelog.mjs --version <version>
  [--changelog <path>] [--date <ISO timestamp>] [--dry-run] [--force]
```

| Exit | Meaning |
|------|---------|
| 0 | Published, already published, nothing to publish, or dry run |
| 1 | Missing `--version`, no changelog path, unreadable file, or database error |

## Component Trees (Nuxt 3 / Vue)

No UI changes.

## Service Dependencies

| Service | Binding | Purpose |
|---------|---------|---------|
| Neon PostgreSQL | `SUPPORT_DATABASE_URL`, `DATABASE_URL` or `NEON_API_KEY` | Operator-only connection for the insert; not part of the Worker deployment |

## Gate prerequisite: dependency audit

The full gate on the issue branch reports dependency advisories inherited from
`main`. Remediation uses supported upgrades or scoped overrides, with no
cooldown or trust exceptions. The only new advisory acceptance is the owner's
explicit, time-limited picomatch decision below:

| Advisories | Remediation |
|------------|-------------|
| `nuxt`, `@nuxt/nitro-server`, `@nuxt/vite-builder`, `@nuxt/vite-server`, `@nuxt/schema` | `nuxt` 4.6.2 to 4.6.4 (patch); `nitropack` 2.13.4 to 2.13.6, the range `@nuxt/nitro-server` 4.6.4 requires, so the app and Nuxt share one Nitro |
| `nuxt-og-image` (three accepted, expired), `satori` | `@nuxtjs/seo` 3.4.0 to 4.0.2, whose only dependency change is `nuxt-og-image` 5 to 6 (patched from 6.2.5). Robots, sitemap, schema.org, SEO utils, site config and link checker keep their majors. `ogImage.enabled: false` still skips the module's setup, and satori becomes an optional peer that nothing installs |
| `node-forge` (one accepted, expired, and others), `glob`, `minimatch` | Scoped overrides to 1.4.3, 14.0.4 and 11.0.5, the versions the SourceClip gate runs |
| `fast-xml-parser` | Scoped override to 5.12.1, inside `@nuxtjs/sitemap`'s `^5.3.3` range |
| `vue-i18n`, `@intlify/*` | Scoped overrides moving the lockstep 11.4 family to 11.4.21 |
| `picomatch` (GHSA-fc5q-39xc-vjpf) | No patched release. Owner approved a support-only exception on 2026-11-18 through 2026-11-24; runtime unreachability is not proven. SourceClip's existing deadline is unchanged |

`audit-accepted.json` drops all four expired entries; the upgraded versions are
outside every one of their affected ranges.

`nuxt-og-image` 5 was what put `@unhead/vue` 2.1.17 in the `@nuxtjs/seo` scope,
where `nuxt-schema-org` 5 and `@unhead/schema-org` 2 (peer `^2`) bound to it.
A `packageExtensions` entry gives `@nuxtjs/seo` 4.0.2 that dependency directly,
so those peers keep the version they had on `main`.

## Release scope

No Worker release. The change is executed only as the operator publisher
(`scripts/` is not part of the Worker bundle). The deployed support app and the
deferred SourceClip production branch work (draft PR #3) are unchanged.

## Task Checklist

See [tasks.md](./tasks.md).
