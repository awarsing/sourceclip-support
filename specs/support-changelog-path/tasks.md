# Tasks: support changelog publisher path

1. [x] `specs/support-changelog-path/spec.md` and this checklist.
2. [x] `scripts/publish-changelog.mjs`: bring the deployed publisher from the
   `sourceclip` branch unchanged except the usage comment and the default
   changelog, which resolves from `TTM_PLATFORM_ROOT` and fails clearly when
   neither it nor `--changelog` is set. The `arg` helper loses its fallback
   parameter, which no caller uses after this change.
3. [x] `package.json`: add the `changelog:publish` script.
4. [x] `tests/publish-changelog.test.ts`: subprocess tests with an isolated
   environment and temporary changelog files: `--dry-run` path cases, a
   publish and rerun against the test database, and Neon connection selection
   and failures through a test-only `fetch` preload.
5. [x] `package.json`: `nuxt` 4.6.4, `nitropack` 2.13.6 and `@nuxtjs/seo` 4.0.2
   for the audit prerequisite.
6. [x] `pnpm-workspace.yaml`: scoped overrides for `node-forge`, `glob`,
   `minimatch`, `fast-xml-parser` and the `vue-i18n`/`@intlify` 11.4 family.
7. [x] `audit-accepted.json`: drop the four expired acceptances.
8. [ ] Main regenerates `pnpm-lock.yaml` with the strict cooldown and trust
   policy, then runs `pnpm check` and `pnpm quality` with `TTM_PLATFORM_ROOT`
   set. `picomatch` GHSA-fc5q-39xc-vjpf awaits a separate owner decision.
9. [ ] No Worker release; the publisher runs from the operator checkout only.
