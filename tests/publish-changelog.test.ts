import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
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
const repairArgs = ['--repair-help-links']
const otherOrg = 'support-216-other-org'
// created_at/updated_at/published_at of the repair fixtures, so a write shows.
const fixtureTime = new Date('2026-10-01T00:00:00.000Z')

// A help changelog entry as the help site writes it: root-relative help links
// next to links and code the rewrite must leave alone.
const linksNote = [
  '- Turn on [Reduce motion](/account/#reduce-motion) or read the [export guide](/guides/clips/?tab=export#share "Sharing").',
  '- ![Toolbar](/images/toolbar.png) opens the [settings][settings] page.',
  '- Escaped [slash](\\/escaped/), [entity](&#47;entity/) and [spaced](</clips/with space/>) links.',
  '- Kept: [site](https://sourceclip.app/pricing/), [cdn](//cdn.example.com/x.js), [top](#top), [sibling](./faq/).',
  '- Also kept: [mail](mailto:help@sourceclip.app), [escaped](/\\/evil.example/) and `[code](/inline/)`.',
  '',
  'Examples:',
  '',
  '    [indented](/indented-code/)',
  '',
  '```md',
  '[fenced](/fenced/)',
  '```',
  '',
  '<a href="/raw-html/">raw</a>',
  '',
  '[settings]: /settings/ "Settings"',
].join('\n')
const linksNoteStored = [
  '- Turn on [Reduce motion](https://help.sourceclip.app/account/#reduce-motion) or read the [export guide](https://help.sourceclip.app/guides/clips/?tab=export#share "Sharing").',
  '- ![Toolbar](https://help.sourceclip.app/images/toolbar.png) opens the [settings][settings] page.',
  '- Escaped [slash](https://help.sourceclip.app\\/escaped/), [entity](https://help.sourceclip.app&#47;entity/) and [spaced](<https://help.sourceclip.app/clips/with space/>) links.',
  '- Kept: [site](https://sourceclip.app/pricing/), [cdn](//cdn.example.com/x.js), [top](#top), [sibling](./faq/).',
  '- Also kept: [mail](mailto:help@sourceclip.app), [escaped](/\\/evil.example/) and `[code](/inline/)`.',
  '',
  'Examples:',
  '',
  '    [indented](/indented-code/)',
  '',
  '```md',
  '[fenced](/fenced/)',
  '```',
  '',
  '<a href="/raw-html/">raw</a>',
  '',
  '[settings]: https://help.sourceclip.app/settings/ "Settings"',
].join('\n')

const relativeNote = '- Turn on [Reduce motion](/account/#reduce-motion).'
const absoluteNote = '- Turn on [Reduce motion](https://help.sourceclip.app/account/#reduce-motion).'
const draftEdit = '\n- Draft only: [Shortcuts](/shortcuts/).'
const crlfDraft = '\uFEFF- [Clips](/clips/)\r\n- `[code](/code/)` and **[bold](/bold/)**'
type Note = { org_id: string; author_id: string; slug: string; content: string; published_content: string | null }
const release = { org_id: 'default-org', author_id: 'system' }
const repairNotes: Note[] = [
  // Published, with a draft edit that must stay unpublished.
  { ...release, slug: 'sourceclip-03281', content: relativeNote + draftEdit, published_content: relativeNote },
  // Published links already absolute; the draft has a byte order mark, CRLF and code.
  { ...release, slug: 'sourceclip-03282', content: crlfDraft, published_content: absoluteNote },
  // Never published.
  { ...release, slug: 'sourceclip-03283', content: relativeNote, published_content: null },
  // Nothing to repair.
  { ...release, slug: 'sourceclip-03284', content: absoluteNote, published_content: absoluteNote },
  // Out of scope: another organization, another author, and support posts
  // whose slugs slugFor() never produces.
  { ...release, org_id: otherOrg, slug: 'sourceclip-03281', content: relativeNote, published_content: relativeNote },
  { ...release, author_id: 'support-editor', slug: 'sourceclip-03285', content: relativeNote, published_content: null },
  { ...release, slug: 'support-welcome', content: relativeNote, published_content: relativeNote },
  { ...release, slug: 'sourceclip-roadmap-notes', content: relativeNote, published_content: relativeNote },
]
// What the repair stores for the in-scope notes it changes.
const repairedNotes: Record<string, Pick<Note, 'content' | 'published_content'>> = {
  'sourceclip-03281': {
    content: `${absoluteNote}\n- Draft only: [Shortcuts](https://help.sourceclip.app/shortcuts/).`,
    published_content: absoluteNote,
  },
  'sourceclip-03282': {
    content:
      '\uFEFF- [Clips](https://help.sourceclip.app/clips/)\r\n- `[code](/code/)` and **[bold](https://help.sourceclip.app/bold/)**',
    published_content: absoluteNote,
  },
  'sourceclip-03283': { content: absoluteNote, published_content: null },
}
const repairOutput = (verb: string) =>
  [
    `${verb} help links in sourceclip-03281 (content, published_content).`,
    `${verb} help links in sourceclip-03282 (content).`,
    `${verb} help links in sourceclip-03283 (content).`,
    `${verb} help links in 3 of 4 SourceClip release notes.`,
    '',
  ].join('\n')

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
let linksChangelog = ''
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
  linksChangelog = join(workDir, 'links.md')
  await writeFile(
    linksChangelog,
    `# Changelog\n\n## Version 1.2.3\n\n${linksNote}\n\n## Version 1.2.2\n\n- Older note.\n`,
  )
  neonFetch = join(workDir, 'neon-fetch.mjs')
  await writeFile(neonFetch, neonFetchPreload)
})

// Exactly the rows this file writes, by organization and slug: the published
// note and the repair fixtures. Other files' changelog rows are never deleted.
const ownedRows = [{ org_id: 'default-org', slug: publishedRow.slug }, ...repairNotes]
async function deleteTestRows() {
  for (const { org_id, slug } of ownedRows) {
    await sql`delete from changelog where org_id = ${org_id} and slug = ${slug}`
  }
}

beforeEach(deleteTestRows)

after(async () => {
  await deleteTestRows()
  await sql.end()
  await rm(workDir, { recursive: true, force: true })
})

// Runs the CLI with only PATH (and V8 coverage output) from the test environment,
// so no database URL, Neon key or platform root leaks in from the caller.
function cliEnv(extraEnv: Record<string, string>) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', ...extraEnv }
  if (process.env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE
  return env
}

type CliResult = { status: number | null; stdout: string; stderr: string }

function publish(args: string[], extraEnv: Record<string, string> = {}, nodeArgs: string[] = []): CliResult {
  const env = cliEnv(extraEnv)
  const result = spawnSync(process.execPath, [...nodeArgs, script, ...args], { cwd: repoRoot, env, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// The CLI as a child process, so the test can hold database locks while it runs.
function publishInBackground(args: string[], extraEnv: Record<string, string>) {
  const { promise, resolve, reject } = Promise.withResolvers<CliResult>()
  const child = spawn(process.execPath, [script, ...args], { cwd: repoRoot, env: cliEnv(extraEnv) })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk
  })
  child.once('error', reject)
  child.once('close', (status) => resolve({ status, stdout, stderr }))
  return promise
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

async function seedRepairNotes() {
  for (const note of repairNotes) {
    const published = note.published_content !== null
    await sql`
      insert into changelog (
        id, org_id, author_id, slug, status, title, content, categories, cover,
        published_title, published_content, published_categories, published_cover,
        published_at, created_at, updated_at
      ) values (
        gen_random_uuid(), ${note.org_id}, ${note.author_id}, ${note.slug}, ${published ? 'published' : 'draft'},
        ${`Note ${note.slug}`}, ${note.content}, ${sql.json(['new'])}, 'https://cdn.example.com/cover.png',
        ${published ? `Note ${note.slug}` : null}, ${note.published_content},
        ${published ? sql.json(['new']) : null}, ${published ? 'https://cdn.example.com/cover.png' : null},
        ${published ? fixtureTime : null}, ${fixtureTime}, ${fixtureTime}
      )
    `
  }
}

type NoteRow = Note & { updated_at: Date; [column: string]: unknown }

// Every column of the repair fixtures, in a stable order.
async function repairRows(): Promise<NoteRow[]> {
  const rows = await sql<NoteRow[]>`
    select * from changelog
    where org_id in ('default-org', ${otherOrg}) and (slug like 'sourceclip-%' or slug = 'support-welcome')
    order by org_id, author_id, slug
  `
  return [...rows]
}

// The fixtures as the repair should leave them: in-scope notes get the
// repaired Markdown and a new updated_at; every other column and row is kept.
function expectRepaired(before: NoteRow[], after: NoteRow[], notes = repairedNotes) {
  const repaired = before.map((row, index) => {
    const inScope = row.org_id === 'default-org' && row.author_id === 'system'
    const markdown = inScope ? notes[row.slug] : undefined
    return markdown ? { ...row, ...markdown, updated_at: after[index]?.updated_at } : row
  })
  assert.deepEqual(after, repaired)
  assert.deepEqual(
    after.filter((row) => row.updated_at > fixtureTime).map((row) => row.slug),
    Object.keys(notes),
  )
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

test('stores help links as absolute help-site links; a rerun, --force or a repair changes nothing', async () => {
  const args = [...publishArgs, '--changelog', linksChangelog]
  const env = { SUPPORT_DATABASE_URL: databaseUrl }
  assert.deepEqual(publish([...args, '--dry-run']), {
    status: 0,
    stdout: `Would publish "SourceClip 1.2.3" (${linksNoteStored.length} chars) to default-org.\n`,
    stderr: '',
  })
  assert.deepEqual(publish(args, env), {
    status: 0,
    stdout: 'Published "SourceClip 1.2.3" to the support changelog.\n',
    stderr: '',
  })
  const stored = [{ ...publishedRow, content: linksNoteStored, published_content: linksNoteStored }]
  assert.deepEqual(await supportRows(), stored)
  assert.deepEqual(publish([...args, '--force'], env), {
    status: 0,
    stdout: 'Changelog "SourceClip 1.2.3" already exists; skipping.\n',
    stderr: '',
  })
  assert.deepEqual(publish(repairArgs, env), {
    status: 0,
    stdout: 'Repaired help links in 0 of 1 SourceClip release notes.\n',
    stderr: '',
  })
  assert.deepEqual(await supportRows(), stored)
})

test('repairs help links in publisher notes only, once, without publishing drafts or touching metadata', async () => {
  await seedRepairNotes()
  const before = await repairRows()
  const env = { SUPPORT_DATABASE_URL: databaseUrl }
  assert.deepEqual(publish([...repairArgs, '--dry-run'], env), {
    status: 0,
    stdout: repairOutput('Would repair'),
    stderr: '',
  })
  assert.deepEqual(await repairRows(), before)

  assert.deepEqual(publish(repairArgs, env), { status: 0, stdout: repairOutput('Repaired'), stderr: '' })
  const after = await repairRows()
  expectRepaired(before, after)

  assert.deepEqual(publish(repairArgs, { DATABASE_URL: databaseUrl }), {
    status: 0,
    stdout: 'Repaired help links in 0 of 4 SourceClip release notes.\n',
    stderr: '',
  })
  assert.deepEqual(await repairRows(), after)
})

test('a repair waits for a concurrent edit and repairs it instead of overwriting it', async () => {
  await seedRepairNotes()
  const before = await repairRows()
  const edit = `${relativeNote}\n- Saved during the repair: [Exports](/exports/).`
  const editor = postgres(databaseUrl, { max: 1 })
  const observer = postgres(databaseUrl, { max: 1 })
  let repair: Promise<CliResult> | undefined
  try {
    // The editor's uncommitted save holds the row lock while the repair starts.
    await editor.begin(async (tx) => {
      await tx`
        update changelog set content = ${edit}
        where org_id = 'default-org' and author_id = 'system' and slug = 'sourceclip-03283'
      `
      repair = publishInBackground(repairArgs, { SUPPORT_DATABASE_URL: databaseUrl })
      // Commit only once the repair is blocked on the lock, so it must see the save.
      const deadline = Date.now() + 10_000
      for (;;) {
        const [row] = await observer<{ waiting: number }[]>`
          select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
        `
        if (row?.waiting) break
        if (Date.now() > deadline) throw new Error('The repair never waited for the locked note')
        await delay(20)
      }
    })
  } finally {
    await Promise.all([editor.end(), observer.end()])
    await repair
  }
  assert.deepEqual(await repair, { status: 0, stdout: repairOutput('Repaired'), stderr: '' })
  expectRepaired(before, await repairRows(), {
    ...repairedNotes,
    'sourceclip-03283': {
      content: `${absoluteNote}\n- Saved during the repair: [Exports](https://help.sourceclip.app/exports/).`,
      published_content: null,
    },
  })
})
