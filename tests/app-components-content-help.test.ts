import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  articleContentBody,
  articleForm,
  articleSaveError,
  articleUrlPath,
  collectionBody,
  collectionFormValues,
  firstCollectionId,
  formatStamp,
  highlightSegments,
  isArticleDirty,
  isHiddenFromReaders,
  isRateLimited,
  needsLeaveConfirm,
  nextPublishStatus,
  searchFailure,
} from '../app/components/help/-help-logic'

const saved = { title: 'Title', description: null, content: 'Body', aiEnabled: false }

test('fills the article form from a saved article or defaults', () => {
  assert.deepEqual(articleForm(null), { title: '', description: '', content: '', aiEnabled: true })
  assert.deepEqual(articleForm(saved), { title: 'Title', description: '', content: 'Body', aiEnabled: false })
})

test('detects unsaved article edits field by field', () => {
  const form = articleForm(saved)
  assert.equal(isArticleDirty(form, saved), false)
  assert.equal(isArticleDirty({ ...form, title: 'Other' }, saved), true)
  assert.equal(isArticleDirty({ ...form, description: 'Other' }, saved), true)
  assert.equal(isArticleDirty({ ...form, content: 'Other' }, saved), true)
  assert.equal(isArticleDirty({ ...form, aiEnabled: true }, saved), true)
  assert.equal(isArticleDirty(articleForm(null), undefined), false)
})

test('asks before leaving unsaved edits or a started draft', () => {
  const base = { leavingAfterWrite: false, dirty: false, isNew: false, form: { title: '', content: '' } }
  assert.equal(needsLeaveConfirm(base), false)
  assert.equal(needsLeaveConfirm({ ...base, dirty: true }), true)
  assert.equal(needsLeaveConfirm({ ...base, dirty: true, leavingAfterWrite: true }), false)
  assert.equal(needsLeaveConfirm({ ...base, isNew: true }), false)
  assert.equal(needsLeaveConfirm({ ...base, isNew: true, form: { title: 'T', content: '' } }), true)
  assert.equal(needsLeaveConfirm({ ...base, isNew: true, form: { title: '', content: 'B' } }), true)
})

test('builds the article body with a null empty description', () => {
  assert.deepEqual(articleContentBody({ title: ' T ', description: '  ', content: ' B ', aiEnabled: true }), {
    title: 'T',
    description: null,
    content: ' B ',
    aiEnabled: true,
  })
  assert.equal(articleContentBody({ title: 'T', description: ' D ', content: '', aiEnabled: false }).description, 'D')
})

test('requires a title, and content when asked', () => {
  assert.equal(articleSaveError({ title: ' ', content: 'B' }, true), 'help.admin.editor.titleRequired')
  assert.equal(articleSaveError({ title: 'T', content: ' ' }, true), 'help.admin.editor.contentRequired')
  assert.equal(articleSaveError({ title: 'T', content: ' ' }, false), null)
  assert.equal(articleSaveError({ title: 'T', content: 'B' }, true), null)
})

test('toggles between published and archived', () => {
  assert.equal(nextPublishStatus('published'), 'archived')
  assert.equal(nextPublishStatus('draft'), 'published')
  assert.equal(nextPublishStatus(undefined), 'published')
})

test('builds article URLs and timestamps', () => {
  assert.equal(articleUrlPath({ shortId: 'abc123', slug: 'start' }), '/help/abc123-start')
  assert.equal(articleUrlPath(null), '')
  assert.equal(formatStamp(null), '—')
  assert.equal(formatStamp(undefined), '—')
  assert.match(formatStamp('2026-03-04T05:06:00.000Z'), /Mar \d, 2026/)
})

test('warns only for a published article in a hidden collection', () => {
  assert.equal(isHiddenFromReaders('published', { visible: false }), true)
  assert.equal(isHiddenFromReaders('published', { visible: true }), false)
  assert.equal(isHiddenFromReaders('draft', { visible: false }), false)
  assert.equal(isHiddenFromReaders('published', undefined), false)
})

test('fills and submits the collection form', () => {
  assert.deepEqual(collectionFormValues(null, 'book'), { icon: 'book', name: '', description: '', visible: true })
  const values = collectionFormValues({ icon: 'star', name: 'N', description: null, visible: false }, 'book')
  assert.deepEqual(values, { icon: 'star', name: 'N', description: '', visible: false })
  assert.deepEqual(collectionBody({ icon: 'star', name: ' N ', description: ' ', visible: true }), {
    name: 'N',
    description: null,
    icon: 'star',
    visible: true,
  })
  assert.equal(collectionBody({ icon: 'star', name: 'N', description: ' D ', visible: true }).description, 'D')
  assert.equal(firstCollectionId([{ id: 'c1' }, { id: 'c2' }]), 'c1')
  assert.equal(firstCollectionId([]), '')
})

test('splits search text into highlighted runs', () => {
  assert.deepEqual(highlightSegments('hello world', [[0, 5]]), [
    { text: 'hello', hit: true },
    { text: ' world', hit: false },
  ])
  assert.deepEqual(highlightSegments('say hello', [[4, 9]]), [
    { text: 'say ', hit: false },
    { text: 'hello', hit: true },
  ])
  assert.deepEqual(highlightSegments('plain', []), [{ text: 'plain', hit: false }])
})

test('recognises rate limiting in failed searches', () => {
  assert.equal(isRateLimited({ statusCode: 429 }), true)
  assert.equal(isRateLimited({ response: { status: 429 } }), true)
  assert.equal(isRateLimited({ statusCode: 500 }), false)
  assert.deepEqual(searchFailure({ statusCode: 429 }), { hits: [], total: 0, rateLimited: true })
  assert.deepEqual(searchFailure(new Error('down')), { hits: [], total: 0, rateLimited: false })
})
