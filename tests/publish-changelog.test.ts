import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postgres from 'postgres'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const script = join(repoRoot, 'scripts/publish-changelog.mjs')
const helpChangelog = 'apps/sourceclip/docs/help/src/content/docs/changelog.md'
const databaseUrl = process.env.DATABASE_URL ?? ''
const sql = postgres(databaseUrl, { max: 1 })
// Fake credential for the Neon fixture; it must never appear in the CLI output.
const neonKey = 'neon-test-key'
const publishArgs = ['--version', '1.2.3', '--date', '2026-11-01T00:00:00Z']
const publishedRow = {
  author_id: 'system',
  slug: 'sourceclip-123',
  status: 'published',
  content: '- An explicitly chosen note.',
  published_content: '- An explicitly chosen note.',
  published_at: '2026-11-01T00:00:00.000Z',
}

// Replaces fetch in the CLI process: answers the Neon management API from the
// NEON_FIXTURE routes (pathname -> status and JSON body) and rejects every other
// request, so no test reaches the network.
const neonFetchPreload = `
const routes = JSON.parse(process.env.NEON_FIXTURE ?? '{}')
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input))
  if (url.origin !== 'https://console.neon.tech') throw new Error('Unexpected request to ' + url.origin)
  const authorization = new Headers(init?.headers).get('authorization')
  if (authorization !== 'Bearer ${neonKey}') return new Response(null, { status: 401 })
  const route = routes[url.pathname]
  if (!route) throw new Error('Unexpected Neon request ' + url.pathname)
  return Response.json(route.body ?? null, { status: route.status ?? 200 })
}
`

let workDir = ''
let platformRoot = ''
let explicitChangelog = ''
let neonFetch = ''

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'publish-changelog-'))
  platformRoot = join(workDir, 'platform')
  const defaultChangelog = join(platformRoot, helpChangelog)
  await mkdir(join(defaultChangelog, '..'), { recursive: true })
  await writeFile(
    defaultChangelog,
    '# Changelog\n\n## Version 1.2.3\n\n- Platform note.\n\n## Version 1.2.2\n\n- Older note.\n',
  )
  explicitChangelog = join(workDir, 'explicit.md')
  await writeFile(explicitChangelog, '# Changelog\n\n## Version 1.2.3\n\n- An explicitly chosen note.\n')
  neonFetch = join(workDir, 'neon-fetch.mjs')
  await writeFile(neonFetch, neonFetchPreload)
})

beforeEach(async () => {
  await sql`delete from changelog where org_id = 'default-org' and title = 'SourceClip 1.2.3'`
})

after(async () => {
  await sql`delete from changelog where org_id = 'default-org' and title = 'SourceClip 1.2.3'`
  await sql.end()
  await rm(workDir, { recursive: true, force: true })
})

// Runs the CLI with only PATH (and V8 coverage output) from the test environment,
// so no database URL, Neon key or platform root leaks in from the caller.
function publish(args: string[], extraEnv: Record<string, string> = {}, nodeArgs: string[] = []) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', ...extraEnv }
  if (process.env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE
  const result = spawnSync(process.execPath, [...nodeArgs, script, ...args], { cwd: repoRoot, env, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// Publishes the explicit changelog entry with the Neon fixture in place of the network.
function publishThroughNeon(routes: Record<string, { status?: number; body?: unknown }>, env: Record<string, string>) {
  const result = publish(
    [...publishArgs, '--changelog', explicitChangelog],
    { NEON_FIXTURE: JSON.stringify(routes), ...env },
    ['--import', pathToFileURL(neonFetch).href],
  )
  assert.ok(!`${result.stdout}${result.stderr}`.includes(neonKey))
  assert.ok(!`${result.stdout}${result.stderr}`.includes(databaseUrl))
  return result
}

async function supportRows() {
  const rows = await sql<(Omit<typeof publishedRow, 'published_at'> & { published_at: Date })[]>`
    select author_id, slug, status, content, published_content, published_at
    from changelog where org_id = 'default-org' and title = 'SourceClip 1.2.3'
  `
  return rows.map((row) => ({ ...row, published_at: row.published_at.toISOString() }))
}

test('reads the help changelog under TTM_PLATFORM_ROOT by default', () => {
  assert.deepEqual(publish(['--version', '1.2.3', '--dry-run'], { TTM_PLATFORM_ROOT: platformRoot }), {
    status: 0,
    stdout: 'Would publish "SourceClip 1.2.3" (16 chars) to default-org.\n',
    stderr: '',
  })
})

test('an explicit --changelog needs no TTM_PLATFORM_ROOT and takes precedence over it', () => {
  const expected = {
    status: 0,
    stdout: 'Would publish "SourceClip 1.2.3" (28 chars) to default-org.\n',
    stderr: '',
  }
  assert.deepEqual(publish(['--version', '1.2.3', '--changelog', explicitChangelog, '--dry-run']), expected)
  assert.deepEqual(
    publish(['--version', '1.2.3', '--changelog', explicitChangelog, '--dry-run'], { TTM_PLATFORM_ROOT: platformRoot }),
    expected,
  )
})

test('fails clearly without TTM_PLATFORM_ROOT or --changelog', () => {
  const expected = { status: 1, stdout: '', stderr: 'Set TTM_PLATFORM_ROOT or pass --changelog <path>\n' }
  assert.deepEqual(publish(['--version', '1.2.3', '--dry-run']), expected)
  assert.deepEqual(publish(['--version', '1.2.3', '--dry-run'], { TTM_PLATFORM_ROOT: '' }), expected)
})

test('reports a missing help changelog at the resolved platform path', () => {
  const emptyRoot = join(workDir, 'empty-platform')
  const result = publish(['--version', '1.2.3', '--dry-run'], { TTM_PLATFORM_ROOT: emptyRoot })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /^ENOENT: no such file or directory/)
  assert.ok(result.stderr.includes(join(emptyRoot, helpChangelog)))
})

test('publishes nothing for a version without a help entry and requires --version', () => {
  assert.deepEqual(publish(['--version', '9.9.9'], { TTM_PLATFORM_ROOT: platformRoot }), {
    status: 0,
    stdout: 'No help changelog entry for 9.9.9; nothing to publish.\n',
    stderr: '',
  })
  assert.deepEqual(publish(['--changelog', explicitChangelog, '--dry-run']), {
    status: 1,
    stdout: '',
    stderr: 'Missing --version\n',
  })
})

test('publishes the entry once to the support database and skips a rerun', async () => {
  const args = [...publishArgs, '--changelog', explicitChangelog]
  assert.deepEqual(publish(args, { SUPPORT_DATABASE_URL: databaseUrl }), {
    status: 0,
    stdout: 'Published "SourceClip 1.2.3" to the support changelog.\n',
    stderr: '',
  })
  assert.deepEqual(publish(args, { DATABASE_URL: databaseUrl }), {
    status: 0,
    stdout: 'Changelog "SourceClip 1.2.3" already exists; skipping.\n',
    stderr: '',
  })
  assert.deepEqual(await supportRows(), [publishedRow])
})

test('without a database URL, publishes through the Neon project named exactly sourceclip-support', async () => {
  const result = publishThroughNeon(
    {
      '/api/v2/projects': {
        body: {
          projects: [
            { id: 'proj-staging', name: 'sourceclip-support-staging' },
            { id: 'proj-support', name: 'sourceclip-support' },
          ],
        },
      },
      '/api/v2/projects/proj-support/connection_uri': { body: { uri: databaseUrl } },
    },
    { NEON_API_KEY: neonKey },
  )
  assert.deepEqual(result, {
    status: 0,
    stdout: 'Published "SourceClip 1.2.3" to the support changelog.\n',
    stderr: '',
  })
  assert.deepEqual(await supportRows(), [publishedRow])
})

test('NEON_SUPPORT_PROJECT_ID skips the Neon project lookup', async () => {
  const result = publishThroughNeon(
    { '/api/v2/projects/proj-pinned/connection_uri': { body: { uri: databaseUrl } } },
    { NEON_API_KEY: neonKey, NEON_SUPPORT_PROJECT_ID: 'proj-pinned' },
  )
  assert.deepEqual(result, {
    status: 0,
    stdout: 'Published "SourceClip 1.2.3" to the support changelog.\n',
    stderr: '',
  })
  assert.deepEqual(await supportRows(), [publishedRow])
})

test('fails clearly without publishing when no connection can be resolved', async () => {
  const support = { '/api/v2/projects': { body: { projects: [{ id: 'proj-support', name: 'sourceclip-support' }] } } }
  const cases: [Record<string, { status?: number; body?: unknown }>, Record<string, string>, string][] = [
    [{}, {}, 'Set SUPPORT_DATABASE_URL/DATABASE_URL or NEON_API_KEY\n'],
    [{ '/api/v2/projects': { status: 500 } }, { NEON_API_KEY: neonKey }, 'Neon projects request failed: 500\n'],
    [
      { '/api/v2/projects': { body: { projects: [{ id: 'proj-staging', name: 'sourceclip-support-staging' }] } } },
      { NEON_API_KEY: neonKey },
      'Neon project "sourceclip-support" not found\n',
    ],
    [
      { ...support, '/api/v2/projects/proj-support/connection_uri': { status: 503 } },
      { NEON_API_KEY: neonKey },
      'Neon connection_uri request failed: 503\n',
    ],
    [
      { ...support, '/api/v2/projects/proj-support/connection_uri': { body: {} } },
      { NEON_API_KEY: neonKey },
      'Neon returned no connection URI\n',
    ],
  ]
  for (const [routes, env, stderr] of cases) {
    assert.deepEqual(publishThroughNeon(routes, env), { status: 1, stdout: '', stderr })
  }
  assert.deepEqual(await supportRows(), [])
})
