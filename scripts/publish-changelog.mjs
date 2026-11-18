#!/usr/bin/env node
// Publishes a SourceClip release note to the support changelog
// (support.sourceclip.app) so the public changelog tracks the help changelog.
//
// Run this after `corepack pnpm run docs:deploy` in the SourceClip repo:
//
//   node --env-file="$TTM_PLATFORM_ROOT/.env.local" \
//     "$TTM_PLATFORM_ROOT/apps/sourceclip-support/scripts/publish-changelog.mjs" \
//     --version 0.3.193
//
// The help changelog defaults to
// $TTM_PLATFORM_ROOT/apps/sourceclip/docs/help/src/content/docs/changelog.md;
// --changelog <path> reads another file. With neither, the script exits 1.
//
// It is a no-op when that version has no help changelog entry, and idempotent:
// a note whose title already exists is skipped, never inserted twice. Pass
// --date <ISO> when backfilling so the entry sorts by its real release time
// instead of now().
//
// Help changelog links are root-relative (/account/#reduce-motion), which would
// resolve against the support host, so Markdown link, image and definition
// destinations starting with a single `/` get https://help.sourceclip.app
// inserted in front; the rest of the note is stored exactly as written.
//
// Notes published before that rewrite are corrected in place, without a Worker
// deploy (the support app renders the stored Markdown):
//
//   node --env-file="$TTM_PLATFORM_ROOT/.env.local" \
//     "$TTM_PLATFORM_ROOT/apps/sourceclip-support/scripts/publish-changelog.mjs" \
//     --repair-help-links [--dry-run]
//
// The repair only touches this publisher's notes (default-org, author system,
// slug sourceclip-<version>) and rewrites their draft (content) and published
// (published_content) Markdown independently, in one transaction holding row
// locks. --dry-run lists the affected slugs and fields without writing; a
// second repair reports 0 changes.
//
// Connection: uses SUPPORT_DATABASE_URL or DATABASE_URL when set, otherwise the
// Neon management API via NEON_API_KEY for the sourceclip-support project.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse, postprocess, preprocess } from 'micromark'
import { decodeString } from 'micromark-util-decode-string'
import postgres from 'postgres'

const ORG_ID = 'default-org'
const AUTHOR_ID = 'system'
const NEON_PROJECT_NAME = 'sourceclip-support'
const NEON_DATABASE = 'neondb'
const NEON_ROLE = 'neondb_owner'
const PLATFORM_CHANGELOG = 'apps/sourceclip/docs/help/src/content/docs/changelog.md'
const HELP_ORIGIN = 'https://help.sourceclip.app'
// slugFor() output: the publisher's notes, never other support posts.
const RELEASE_SLUG = '^sourceclip-[0-9A-Za-z]+$'
const DESTINATIONS = new Set(['resourceDestinationString', 'definitionDestinationString'])

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : undefined
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

// The help changelog in the platform checkout, located through TTM_PLATFORM_ROOT.
function defaultChangelog() {
  const root = process.env.TTM_PLATFORM_ROOT
  if (!root) throw new Error('Set TTM_PLATFORM_ROOT or pass --changelog <path>')
  return resolve(root, PLATFORM_CHANGELOG)
}

async function resolveConnectionString() {
  const direct = process.env.SUPPORT_DATABASE_URL || process.env.DATABASE_URL
  if (direct) return direct
  const key = process.env.NEON_API_KEY
  if (!key) throw new Error('Set SUPPORT_DATABASE_URL/DATABASE_URL or NEON_API_KEY')
  const headers = { authorization: `Bearer ${key}` }
  let projectId = process.env.NEON_SUPPORT_PROJECT_ID
  if (!projectId) {
    const response = await fetch('https://console.neon.tech/api/v2/projects', { headers })
    if (!response.ok) throw new Error(`Neon projects request failed: ${response.status}`)
    const body = await response.json()
    projectId = body.projects?.find((project) => project.name === NEON_PROJECT_NAME)?.id
    if (!projectId) throw new Error(`Neon project "${NEON_PROJECT_NAME}" not found`)
  }
  const url = new URL(`https://console.neon.tech/api/v2/projects/${projectId}/connection_uri`)
  url.searchParams.set('database_name', NEON_DATABASE)
  url.searchParams.set('role_name', NEON_ROLE)
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`Neon connection_uri request failed: ${response.status}`)
  const body = await response.json()
  if (!body.uri) throw new Error('Neon returned no connection URI')
  return body.uri
}

// Extracts the body under `## Version <version>` up to the next `## ` heading.
function releaseSection(markdown, version) {
  const heading = `## Version ${version}`
  const start = markdown.indexOf(heading)
  if (start < 0) return null
  const after = markdown.slice(start + heading.length)
  const next = after.search(/\n##\s/)
  const body = (next < 0 ? after : after.slice(0, next)).trim()
  return body || null
}

function slugFor(version) {
  return `sourceclip-${version.replace(/[^0-9a-z]+/gi, '')}`
}

// Inserts HELP_ORIGIN before every Markdown link, image and reference-definition
// destination whose decoded value is root-relative (`/…`, not `//…`). The
// CommonMark parser supplies the destinations' source offsets, so code, raw
// HTML, escapes, queries and fragments are left as written, and an already
// absolute destination is never rewritten again.
function absoluteHelpLinks(markdown) {
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(markdown, undefined, true)),
  )
  // preprocess drops a leading byte order mark before counting offsets.
  const bom = markdown.charCodeAt(0) === 0xfeff ? 1 : 0
  let result = ''
  let copied = 0
  for (const [kind, token] of events) {
    if (kind !== 'enter' || !DESTINATIONS.has(token.type)) continue
    const start = token.start.offset + bom
    const destination = decodeString(markdown.slice(start, token.end.offset + bom))
    if (!destination.startsWith('/') || destination.startsWith('//')) continue
    result += markdown.slice(copied, start) + HELP_ORIGIN
    copied = start
  }
  return result + markdown.slice(copied)
}

async function withDatabase(run) {
  const sql = postgres(await resolveConnectionString(), { max: 1, prepare: false })
  try {
    return await run(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function publish() {
  const version = arg('version')
  if (!version) throw new Error('Missing --version')
  const publishedAt = arg('date')
  const changelogPath = resolve(arg('changelog') ?? defaultChangelog())
  const title = `SourceClip ${version}`
  const markdown = await readFile(changelogPath, 'utf8')
  const section = releaseSection(markdown, version)
  if (!section) {
    console.log(`No help changelog entry for ${version}; nothing to publish.`)
    return
  }
  const content = absoluteHelpLinks(section)
  if (hasFlag('dry-run')) {
    console.log(`Would publish "${title}" (${content.length} chars) to ${ORG_ID}.`)
    return
  }

  await withDatabase(async (sql) => {
    const existing = await sql`
      select id from changelog where org_id = ${ORG_ID} and title = ${title} limit 1
    `
    if (existing.length) {
      console.log(`Changelog "${title}" already exists; skipping.`)
      return
    }
    await sql`
      insert into changelog (
        id, org_id, author_id, slug, status, title, content, categories,
        published_title, published_content, published_categories, published_at
      ) values (
        gen_random_uuid(), ${ORG_ID}, ${AUTHOR_ID}, ${slugFor(version)}, 'published',
        ${title}, ${content}, '[]'::jsonb, ${title}, ${content}, '[]'::jsonb,
        coalesce(${publishedAt ?? null}::timestamptz, now())
      )
    `
    console.log(`Published "${title}" to the support changelog.`)
  })
}

// Rewrites help links in the publisher's existing notes. The draft and published
// Markdown are rewritten separately, so an unpublished draft edit stays a draft.
// The rows are locked until commit, so a concurrent admin save waits rather than
// being overwritten; a dry run reads in a read-only transaction.
async function repairHelpLinks(dryRun) {
  const { total, repairs } = await withDatabase((sql) =>
    sql.begin(dryRun ? 'read only' : 'read write', async (tx) => {
      const notes = await tx`
        select id, slug, content, published_content from changelog
        where org_id = ${ORG_ID} and author_id = ${AUTHOR_ID} and slug ~ ${RELEASE_SLUG}
        order by slug
        ${dryRun ? tx`` : tx`for update`}
      `
      const repairs = []
      for (const note of notes) {
        const content = absoluteHelpLinks(note.content)
        const publishedContent = note.published_content === null ? null : absoluteHelpLinks(note.published_content)
        const fields = []
        if (content !== note.content) fields.push('content')
        if (publishedContent !== note.published_content) fields.push('published_content')
        if (!fields.length) continue
        repairs.push({ slug: note.slug, fields })
        if (dryRun) continue
        await tx`
          update changelog
          set content = ${content}, published_content = ${publishedContent}, updated_at = now()
          where id = ${note.id}
        `
      }
      return { total: notes.length, repairs }
    }),
  )
  const verb = dryRun ? 'Would repair' : 'Repaired'
  for (const { slug, fields } of repairs) console.log(`${verb} help links in ${slug} (${fields.join(', ')}).`)
  console.log(`${verb} help links in ${repairs.length} of ${total} SourceClip release notes.`)
}

async function main() {
  if (hasFlag('repair-help-links')) await repairHelpLinks(hasFlag('dry-run'))
  else await publish()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
