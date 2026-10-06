#!/usr/bin/env node
// Publishes a SourceClip release note to the support changelog
// (support.sourceclip.app) so the public changelog tracks the help changelog.
//
// Run this after `corepack pnpm run docs:deploy` in the SourceClip repo:
//
//   node --env-file=/Volumes/TITAN/Dev/threethingsmedia/.env.local \
//     /Volumes/TITAN/Dev/threethingsmedia/apps/sourceclip-support/scripts/publish-changelog.mjs \
//     --version 0.3.193 \
//     --changelog docs/help/src/content/docs/changelog.md
//
// It is a no-op when that version has no help changelog entry, and idempotent,
// so a rerun will not double-publish. Pass --date <ISO> when backfilling so the
// entry sorts by its real release time instead of now().
//
// Connection: uses SUPPORT_DATABASE_URL or DATABASE_URL when set, otherwise the
// Neon management API via NEON_API_KEY for the sourceclip-support project.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import postgres from 'postgres'

const ORG_ID = 'default-org'
const AUTHOR_ID = 'system'
const NEON_PROJECT_NAME = 'sourceclip-support'
const NEON_DATABASE = 'neondb'
const NEON_ROLE = 'neondb_owner'
const DEFAULT_CHANGELOG = '/Volumes/TITAN/Dev/threethingsmedia/apps/sourceclip/docs/help/src/content/docs/changelog.md'

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`)
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

async function main() {
  const version = arg('version')
  if (!version) throw new Error('Missing --version')
  const publishedAt = arg('date')
  const changelogPath = resolve(arg('changelog', DEFAULT_CHANGELOG))
  const title = `SourceClip ${version}`
  const markdown = await readFile(changelogPath, 'utf8')
  const content = releaseSection(markdown, version)
  if (!content) {
    console.log(`No help changelog entry for ${version}; nothing to publish.`)
    return
  }
  if (hasFlag('dry-run')) {
    console.log(`Would publish "${title}" (${content.length} chars) to ${ORG_ID}.`)
    return
  }

  const sql = postgres(await resolveConnectionString(), { max: 1, prepare: false })
  try {
    const existing = await sql`
      select id from changelog where org_id = ${ORG_ID} and title = ${title} limit 1
    `
    if (existing.length && !hasFlag('force')) {
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
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
