import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveS3Config } from '../modules/blob-s3/runtime/server/utils/s3-config'
import { collectHints } from '../modules/widget-preload/hints'
import { widgetEmbedLocale } from '../modules/widget-preload/runtime/server/utils/embed-locale'
import { resolveConnectionString } from '../modules/cf-setup/runtime/server/utils/connection-string'
import { probeDatabaseState } from '../modules/cf-setup/runtime/server/utils/migration-state'
import { isCloudflare } from '../modules/cf-setup/runtime/server/utils/preset'

const credentials = { S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret', S3_BUCKET: 'media' }

test('S3 stays unset without complete credentials and refuses a hostless configuration', () => {
  assert.equal(resolveS3Config({}), 'unset')
  assert.equal(resolveS3Config({ ...credentials, S3_BUCKET: '' }), 'unset')
  assert.equal(resolveS3Config({ ...credentials, S3_SECRET_ACCESS_KEY: undefined }), 'unset')
  assert.equal(resolveS3Config(credentials), 'no-region')
  assert.equal(resolveS3Config({ ...credentials, S3_ENDPOINT: '', S3_REGION: '' }), 'no-region')
})

test('S3 driver options keep the bucket unless the endpoint already names it', () => {
  assert.deepEqual(resolveS3Config({ ...credentials, S3_REGION: 'eu-central-1' }), {
    driver: {
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'media',
      region: 'eu-central-1',
      endpoint: undefined,
    },
    summary: 'bucket=media',
  })
  const pathStyle = resolveS3Config({ ...credentials, S3_ENDPOINT: 'https://s3.example.com' })
  assert.ok(typeof pathStyle === 'object')
  assert.equal(pathStyle.driver.bucket, 'media')
  assert.equal(pathStyle.summary, 'bucket=media, endpoint=https://s3.example.com')
  for (const endpoint of ['https://media', 'https://media.r2.example.com']) {
    const bucketStyle = resolveS3Config({ ...credentials, S3_ENDPOINT: endpoint })
    assert.ok(typeof bucketStyle === 'object')
    assert.equal(bucketStyle.driver.bucket, '')
    assert.equal(bucketStyle.summary, `bucket=media, endpoint=${endpoint}, bucketEndpoint=true`)
  }
  const unparsable = resolveS3Config({ ...credentials, S3_ENDPOINT: 'not a url' })
  assert.ok(typeof unparsable === 'object')
  assert.equal(unparsable.driver.bucket, 'media')
})

test('preload hints cover the embed route chain and i18n configs, minus what the entry ships', () => {
  assert.deepEqual(collectHints({ 'app.vue': { file: 'app.js', isEntry: true } }), [])
  const hints = collectHints({
    'entry.ts': { file: 'entry.js', isEntry: true, imports: ['shared.ts'], css: ['entry.css'] },
    'shared.ts': { file: 'shared.js' },
    'app/pages/widget/embed.vue': {
      file: 'embed.js',
      imports: ['shared.ts', 'chat.ts', 'missing.ts'],
      css: ['embed.css'],
    },
    'chat.ts': { file: 'chat.js', imports: ['embed-loop.ts'], css: ['entry.css'] },
    'embed-loop.ts': { file: 'loop.js', imports: ['chat.ts'] },
    'layers/feedlog/i18n/i18n.config.ts': { file: 'i18n.js' },
    'unrelated.ts': { file: 'unrelated.js' },
  })
  assert.deepEqual(hints, [
    { file: 'embed.js', rel: 'modulepreload', as: 'script' },
    { file: 'embed.css', rel: 'preload', as: 'style' },
    { file: 'chat.js', rel: 'modulepreload', as: 'script' },
    { file: 'loop.js', rel: 'modulepreload', as: 'script' },
    { file: 'i18n.js', rel: 'modulepreload', as: 'script' },
  ])
})

test('widget embed locale accepts only configured locales on the embed route', () => {
  const i18n = { locales: ['en', { code: 'de' }], defaultLocale: 'en' }
  assert.equal(widgetEmbedLocale('/widget/embed', i18n), 'en')
  assert.equal(widgetEmbedLocale('/widget/embed?org=x', i18n), 'en')
  assert.equal(widgetEmbedLocale('/de/widget/embed', i18n), 'de')
  assert.equal(widgetEmbedLocale('/fr/widget/embed', i18n), undefined)
  assert.equal(widgetEmbedLocale('/widget/other', i18n), undefined)
  assert.equal(widgetEmbedLocale('/widget/embed', undefined), undefined)
  assert.equal(widgetEmbedLocale('/widget/embed', { locales: [''] }), '')
})

test('setup flow is Cloudflare-only', () => {
  assert.equal(isCloudflare('cloudflare-module'), true)
  assert.equal(isCloudflare('cloudflare-pages'), true)
  assert.equal(isCloudflare('node-server'), false)
  assert.equal(isCloudflare(undefined), false)
})

test('connection string prefers the Hyperdrive binding over DATABASE_URL', () => {
  const scope = globalThis as { __env__?: unknown; POSTGRES?: unknown }
  const databaseUrl = process.env.DATABASE_URL
  try {
    scope.__env__ = { POSTGRES: { connectionString: 'postgres://env-binding' } }
    scope.POSTGRES = { connectionString: 'postgres://global-binding' }
    assert.equal(resolveConnectionString(), 'postgres://env-binding')
    scope.__env__ = {}
    assert.equal(resolveConnectionString(), 'postgres://global-binding')
    delete scope.POSTGRES
    process.env.DATABASE_URL = 'postgres://dev'
    assert.equal(resolveConnectionString(), 'postgres://dev')
    process.env.DATABASE_URL = ''
    assert.equal(resolveConnectionString(), undefined)
  } finally {
    delete scope.__env__
    delete scope.POSTGRES
    process.env.DATABASE_URL = databaseUrl
  }
})

test('migration probe reports a missing binding, an unreachable server and a migrated database', async () => {
  assert.deepEqual(await probeDatabaseState(undefined), {
    state: 'unreachable',
    expected: 0,
    applied: 0,
    error: 'Database connection not configured — Hyperdrive binding missing',
  })
  const unreachable = await probeDatabaseState('postgres://nobody@127.0.0.1:1/none?connect_timeout=1')
  assert.equal(unreachable.state, 'unreachable')
  assert.match(unreachable.error ?? '', /^\w+: /)

  const migrated = await probeDatabaseState(process.env.DATABASE_URL)
  assert.equal(migrated.state, 'migrated')
  assert.ok(migrated.applied > 0)
})
