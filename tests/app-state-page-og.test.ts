import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ref } from 'vue'
import { buildPageMeta } from '../app/lib/page-og'
import { fakeT, stubGlobals } from './app-state-nuxt'

const named = { name: 'Acme', isDefault: false, t: fakeT }
const unnamed = { name: 'FeedLog', isDefault: true, t: fakeT }

test('listing pages use the org title key and pick generic or named copy', () => {
  assert.deepEqual(buildPageMeta({ kind: 'home' }, named), {
    title: 'seo.portalTitle {"name":"Acme"}',
    description: 'Give feedback to Acme, vote on feature requests, and help shape the roadmap.',
    ogType: 'website',
  })
  assert.equal(
    buildPageMeta({ kind: 'home' }, unnamed).description,
    "Give us feedback, vote on feature requests, and help shape what we're building next.",
  )
  assert.equal(buildPageMeta({ kind: 'roadmap' }, named).title, 'seo.roadmapTitle {"name":"Acme"}')
  assert.equal(
    buildPageMeta({ kind: 'roadmap' }, named).description,
    "See what Acme is building, what's planned, and what's shipped.",
  )
  assert.equal(
    buildPageMeta({ kind: 'roadmap' }, unnamed).description,
    "See what we're working on, what's planned, and what's shipped.",
  )
  assert.equal(
    buildPageMeta({ kind: 'changelogList' }, named).description,
    'The latest product updates, improvements, and fixes from Acme.',
  )
  assert.equal(
    buildPageMeta({ kind: 'changelogList' }, unnamed).description,
    'The latest product updates, improvements, and fixes.',
  )
  assert.equal(buildPageMeta({ kind: 'helpHome' }, named).title, 'seo.helpTitle {"name":"Acme"}')
  assert.equal(
    buildPageMeta({ kind: 'helpHome' }, named).description,
    'Guides and answers to the questions Acme users ask most.',
  )
  assert.equal(
    buildPageMeta({ kind: 'helpHome' }, unnamed).description,
    'Guides and answers to the questions people ask most.',
  )
})

test('help collections fall back to a generic title and a Help Center description', () => {
  assert.deepEqual(buildPageMeta({ kind: 'helpCollection', title: 'Billing', description: 'Invoices' }, named), {
    title: 'seo.helpTitleWithOrg {"title":"Billing","name":"Acme"}',
    description: 'Invoices',
    ogType: 'website',
  })
  assert.deepEqual(buildPageMeta({ kind: 'helpCollection', title: undefined, description: null }, named), {
    title: 'seo.helpTitleWithOrg {"title":"seo.helpFallback","name":"Acme"}',
    description: 'seo.helpFallback — Acme Help Center.',
    ogType: 'website',
  })
})

test('help articles read refs and excerpt the body when there is no description', () => {
  const body = ref(`# Heading\n\n${'word '.repeat(60)}`)
  const meta = buildPageMeta(
    { kind: 'helpArticle', title: ref('Reset'), description: () => '', content: body, publishedAt: '2026-01-02' },
    named,
  )
  assert.equal(meta.title, 'seo.helpTitleWithOrg {"title":"Reset","name":"Acme"}')
  assert.equal(meta.description.length, 155)
  assert.ok(meta.description.startsWith('Heading'))
  assert.equal(meta.ogType, 'article')
  assert.equal(meta.publishedTime, '2026-01-02')
  const empty = buildPageMeta({ kind: 'helpArticle', title: '', description: 'Set', content: undefined }, named)
  assert.equal(empty.description, 'Set')
  assert.equal(buildPageMeta({ kind: 'helpArticle', title: '', description: null, content: '' }, named).description, '')
})

test('posts keep the bare title for the default org and excerpt their content', () => {
  assert.deepEqual(buildPageMeta({ kind: 'post', title: 'Dark mode', content: 'Please **add** it' }, unnamed), {
    title: 'Dark mode',
    description: 'Please add it',
    ogType: 'article',
    publishedTime: undefined,
  })
  assert.deepEqual(buildPageMeta({ kind: 'post', title: undefined, content: undefined }, named), {
    title: 'seo.titleWithOrg {"title":"seo.postFallback","name":"Acme"}',
    description: 'Vote and join the discussion on Acme.',
    ogType: 'article',
    publishedTime: undefined,
  })
  assert.equal(
    buildPageMeta({ kind: 'post', title: 'x', content: '' }, unnamed).description,
    'Vote and join the discussion.',
  )
})

test('changelog entries carry their publish date', () => {
  assert.deepEqual(
    buildPageMeta({ kind: 'changelogEntry', title: '', content: '', publishedAt: () => '2026-03-04' }, named),
    {
      title: 'seo.titleWithOrg {"title":"seo.changelogFallback","name":"Acme"}',
      description: "What's new at Acme.",
      ogType: 'article',
      publishedTime: '2026-03-04',
    },
  )
  assert.equal(buildPageMeta({ kind: 'changelogEntry', title: 'v2', content: '' }, unnamed).description, "What's new.")
})

test('usePageOg feeds the same meta into the head and SEO tags', async () => {
  const calls: { head?: unknown; seo?: Record<string, () => unknown> } = {}
  stubGlobals({
    usePortalOrg: () => ref({ name: 'Acme', isDefault: false }),
    useHead: (head: unknown) => {
      calls.head = head
    },
    useSeoMeta: (seo: Record<string, () => unknown>) => {
      calls.seo = seo
    },
  })
  const { usePageOg } = await import('../app/composables/usePageOg')
  usePageOg({ kind: 'changelogEntry', title: 'v2', content: 'Faster', publishedAt: '2026-05-06' })
  assert.deepEqual(calls.head, { titleTemplate: '%s' })
  const seo = Object.fromEntries(Object.entries(calls.seo ?? {}).map(([key, read]) => [key, read()]))
  assert.deepEqual(seo, {
    title: 'seo.titleWithOrg {"title":"v2","name":"Acme"}',
    ogTitle: 'seo.titleWithOrg {"title":"v2","name":"Acme"}',
    twitterTitle: 'seo.titleWithOrg {"title":"v2","name":"Acme"}',
    description: 'Faster',
    ogDescription: 'Faster',
    twitterDescription: 'Faster',
    ogType: 'article',
    articlePublishedTime: '2026-05-06',
  })
})
