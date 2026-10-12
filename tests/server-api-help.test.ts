import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import * as schema from '../server/db/schemas/index'
import { createOrg, db, loadHandler, serve, setup } from './server-api-harness'

const helpCenter = { portalModules: { helpCenter: true } }

async function helpRoutes() {
  return serve({
    'GET /api/help/search': await loadHandler('help/search.get'),
    'GET /api/admin/help/stats': await loadHandler('admin/help/stats.get'),
    'POST /api/admin/help/articles': await loadHandler('admin/help/articles/index.post'),
    'PATCH /api/admin/help/articles/:id': await loadHandler('admin/help/articles/[id].patch'),
    'POST /api/admin/help/articles/bulk-publish': await loadHandler('admin/help/articles/bulk-publish.post'),
    'POST /api/admin/help/articles/bulk-unpublish': await loadHandler('admin/help/articles/bulk-unpublish.post'),
    'DELETE /api/admin/help/collections/:id': await loadHandler('admin/help/collections/[id].delete'),
  })
}

async function addCollection(orgId: string, values: Partial<typeof schema.helpCollection.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.helpCollection)
    .values({ orgId, name: 'Getting started', icon: 'rocket', position: 0, ...values })
    .returning()
  return row!
}

const article = {
  title: 'Old',
  description: null,
  content: 'Body',
  status: 'draft',
  publishedAt: null,
  collectionId: 'c1',
}

test('help article edit plans: text changes, publishing rules and archive transitions', async () => {
  await setup()
  const { planHelpArticleText, planHelpArticleStatus } = await import('../server/utils/help-article-admin')

  const untouched = planHelpArticleText(article, { title: 'Old', aiEnabled: false })
  assert.equal(untouched.contentChanged, false)
  assert.deepEqual(untouched.updates, {})
  const described = planHelpArticleText(article, { description: 'Short' })
  assert.equal(described.contentChanged, true)
  assert.equal(described.updates.description, 'Short')
  assert.equal(described.updates.slug, undefined)
  const renamed = planHelpArticleText(article, { title: 'New title' })
  assert.equal(renamed.updates.title, 'New title')
  assert.equal(typeof renamed.updates.slug, 'string')

  const statusOf = (existing: object, requested: string | undefined, next = article, changed = false) =>
    planHelpArticleStatus({ ...article, ...existing }, requested, next, changed)
  assert.deepEqual(statusOf({}, undefined), {})
  assert.deepEqual(statusOf({ status: 'archived' }, undefined, article, true), { status: 'draft' })
  assert.deepEqual(statusOf({}, 'draft'), { status: 'draft' })
  const fresh = statusOf({}, 'published')
  assert.equal(fresh.status, 'published')
  assert.ok(fresh.publishedAt instanceof Date)
  assert.deepEqual(statusOf({ publishedAt: new Date('2026-01-01') }, 'published'), { status: 'published' })
  assert.throws(() => statusOf({}, 'published', { ...article, title: ' ' }), { statusCode: 400 })
  assert.throws(() => statusOf({}, 'published', { ...article, content: '' }), { statusCode: 400 })
  assert.deepEqual(statusOf({ status: 'published' }, 'archived'), { status: 'archived' })
  assert.throws(() => statusOf({}, 'archived'), { statusCode: 409 })
})

test('moderators create, edit, move, publish and archive help articles', async () => {
  const call = await helpRoutes()
  const { orgId, token } = await createOrg({ metadata: helpCenter })
  const first = await addCollection(orgId)
  const second = await addCollection(orgId, { name: 'Billing', position: 1 })
  const admin = (path: string, method: string, body?: unknown, who = token('manager')) =>
    call(`/api/admin/help${path}`, { method, org: orgId, session: who, body })

  const created = await admin('/articles', 'POST', {
    collectionId: first.id,
    title: 'Reset a password',
    content: 'Use the link',
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.status, 'draft')
  assert.equal(created.body.collection.name, 'Getting started')
  const id = created.body.id
  assert.equal((await admin('/articles', 'POST', { collectionId: uuidv7(), title: 'x', content: 'y' })).status, 404)

  const renamed = await admin(`/articles/${id}`, 'PATCH', { title: 'Reset your password', aiEnabled: false })
  assert.equal(renamed.body.title, 'Reset your password')
  assert.equal(renamed.body.aiEnabled, false)
  assert.notEqual(renamed.body.slug, created.body.slug)
  const live = await admin(`/articles/${id}`, 'PATCH', { status: 'published' })
  assert.equal(live.body.status, 'published')
  assert.ok(live.body.publishedAt)
  const moved = await admin(`/articles/${id}`, 'PATCH', { collectionId: second.id })
  assert.equal(moved.body.collection.id, second.id)
  assert.equal((await admin(`/articles/${id}`, 'PATCH', { collectionId: uuidv7() })).status, 404)
  assert.equal((await admin(`/articles/${id}`, 'PATCH', { status: 'archived' })).body.status, 'archived')
  const reopened = await admin(`/articles/${id}`, 'PATCH', { content: 'Use the emailed link' })
  assert.equal(reopened.body.status, 'draft')
  assert.equal(reopened.body.publishedAt, live.body.publishedAt)
  assert.equal((await admin(`/articles/${id}`, 'PATCH', { status: 'archived' })).status, 409)
  assert.equal((await admin(`/articles/${uuidv7()}`, 'PATCH', { title: 'x' })).status, 404)
  assert.equal((await admin(`/articles/${id}`, 'PATCH', { title: 'x' }, token('user'))).status, 403)
})

test('bulk publishing counts skipped ids; deleting a collection takes its articles', async () => {
  const call = await helpRoutes()
  const { orgId, token } = await createOrg({ metadata: helpCenter })
  const collection = await addCollection(orgId)
  const admin = (path: string, method: string, body?: unknown) =>
    call(`/api/admin/help${path}`, { method, org: orgId, session: token('owner'), body })
  const a = (await admin('/articles', 'POST', { collectionId: collection.id, title: 'A', content: 'a' })).body.id
  const b = (await admin('/articles', 'POST', { collectionId: collection.id, title: 'B', content: 'b', publish: true }))
    .body.id

  assert.deepEqual((await admin('/articles/bulk-publish', 'POST', { ids: [a, b, uuidv7()] })).body, {
    affected: 1,
    skipped: 2,
  })
  assert.deepEqual((await admin('/articles/bulk-unpublish', 'POST', { ids: [a, b] })).body, { affected: 2, skipped: 0 })
  assert.deepEqual((await admin('/articles/bulk-unpublish', 'POST', { ids: [a] })).body, { affected: 0, skipped: 1 })
  assert.equal((await admin('/articles/bulk-publish', 'POST', { ids: [] })).status, 400)

  const stats = await call('/api/admin/help/stats', { org: orgId, session: token('contributor') })
  assert.deepEqual(stats.body, { collectionCount: 1, articleCount: 2 })
  assert.equal((await admin(`/collections/${collection.id}`, 'DELETE')).status, 204)
  assert.equal((await admin(`/collections/${collection.id}`, 'DELETE')).status, 404)
  const left = await db.select().from(schema.helpArticle).where(eq(schema.helpArticle.orgId, orgId))
  assert.equal(left.length, 0)
  const empty = await call('/api/admin/help/stats', { org: orgId, session: token('owner') })
  assert.deepEqual(empty.body, { collectionCount: 0, articleCount: 0 })
})

test('help search ranks title matches first and only shows published, visible articles', async () => {
  const call = await helpRoutes()
  const { orgId, token } = await createOrg({ metadata: helpCenter })
  const visible = await addCollection(orgId)
  const hidden = await addCollection(orgId, { name: 'Internal', visible: false, position: 1 })
  const create = async (collectionId: string, title: string, content: string, publish = true) =>
    (
      await call('/api/admin/help/articles', {
        method: 'POST',
        org: orgId,
        session: token('owner'),
        body: { collectionId, title, content, publish },
      })
    ).body
  const inTitle = await create(visible.id, 'Invoices explained', 'How billing works')
  const inBody = await create(visible.id, 'Payments', 'Download every invoices file')
  await create(visible.id, 'Invoices draft', 'unpublished', false)
  await create(hidden.id, 'Invoices internal', 'staff only')

  const search = (q: string) => call(`/api/help/search?q=${encodeURIComponent(q)}`, { orgSlug: orgId })
  const found = await search('invoices')
  assert.equal(found.status, 200)
  assert.equal(found.body.total, 2)
  assert.deepEqual(
    found.body.data.map((r: { shortId: string }) => r.shortId),
    [inTitle.shortId, inBody.shortId],
  )
  assert.deepEqual(found.body.data[0].collection, { id: visible.id, name: 'Getting started' })
  assert.ok(found.body.data[0].titleRanges.length > 0)
  assert.deepEqual((await search('   ')).body, { total: 0, data: [] })
  assert.deepEqual((await search('zzzz')).body, { total: 0, data: [] })

  const { orgId: closed } = await createOrg()
  assert.equal((await call('/api/help/search?q=invoices', { orgSlug: closed })).status, 404)
})
