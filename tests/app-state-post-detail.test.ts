import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { stubGlobals } from './app-state-nuxt'

type Call = { url: string; opts?: Record<string, any> }
type Handler = (call: Call) => unknown

// useApiFetch answered by the first handler whose key prefixes "METHOD url".
function api(handlers: Record<string, Handler>) {
  const calls: Call[] = []
  stubGlobals({
    useApiFetch: async (url: string, opts?: Record<string, any>) => {
      const call = { url, opts }
      calls.push(call)
      const route = `${opts?.method ?? 'GET'} ${url}`
      const key = Object.keys(handlers).find((k) => route.startsWith(k))
      if (!key) throw new Error(`unexpected ${route}`)
      return handlers[key]!(call)
    },
  })
  return calls
}

const { usePostDetailStore } = await import('../app/stores/postDetail')

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: `slug-${id}`,
  title: `Post ${id}`,
  content: 'body',
  status: 'open',
  boardId: 'b1',
  voteCount: 1,
  commentCount: 3,
  hasVoted: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const comment = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  content: id,
  likeCount: 0,
  hasLiked: false,
  createdAt: '2026-01-02T00:00:00.000Z',
  ...extra,
})

function loadedStore() {
  const store = usePostDetailStore()
  store.setPost('s', post('p1') as never)
  store.setComments(
    's',
    [
      comment('c1', { replyCount: 2, children: [comment('c1a'), comment('c1b')] }),
      comment('c2', { replyCount: 0 }),
      comment('c3'),
    ] as never,
    'cursor-1',
  )
  return store
}

test('accessors answer empty for a post that is not loaded', () => {
  const store = usePostDetailStore()
  assert.equal(store.getPost('x'), null)
  assert.deepEqual(store.getComments('x'), [])
  assert.equal(store.getCommentCursor('x'), null)
  assert.equal(store.isPostLoading('x'), false)
  assert.equal(store.isCommentLoading('x'), false)
  assert.equal(store.isMoreCommentLoading('x'), false)
  store.setComments('x', [], null)
  assert.deepEqual(store.getComments('x'), [])
})

test('prefill seeds a post from a list item once', () => {
  const store = usePostDetailStore()
  const item = { ...post('p1'), mergedCount: 0, author: null }
  store.prefill('s', item as never)
  assert.equal(store.getPost('s')!.content, '')
  assert.equal(store.getPost('s')!.updatedAt, item.createdAt)
  store.setPost('s', post('p1', { content: 'full' }) as never)
  store.prefill('s', item as never)
  assert.equal(store.getPost('s')!.content, 'full')
  assert.equal(store.getCommentCursor('s'), null)
  assert.equal(store.isCommentLoading('s'), false)
  assert.equal(store.isMoreCommentLoading('s'), false)
})

test('the cache keeps the 20 most recently used posts', () => {
  const store = usePostDetailStore()
  for (let i = 0; i < 21; i++) {
    store.setPost(`s${i}`, post(`p${i}`) as never)
    store.setComments(`s${i}`, [comment(`c${i}`)] as never, null)
    if (i === 5) store.setPost('s0', post('p0') as never)
  }
  assert.ok(store.getPost('s0'))
  assert.equal(store.getPost('s1'), null)
  assert.ok(store.getPost('s20'))
})

test('concurrent fetches share one request and comments load after the post', async () => {
  const calls = api({
    'GET /api/posts/s': () => post('p1'),
    'GET /api/posts/p1/comments': () => ({ data: [comment('c1')], pagination: { nextCursor: 'n1' } }),
  })
  const store = usePostDetailStore()
  const pending = store.fetchPost('s')
  assert.equal(store.isPostLoading('s'), true)
  await Promise.all([pending, store.fetchPost('s')])
  assert.equal(calls.length, 1)
  assert.equal(store.isPostLoading('s'), false)

  const fresh = usePostDetailStore()
  await fresh.fetchComments('s', 'top')
  assert.deepEqual(calls.at(-1)!.opts, { query: { sort: 'top', withChildren: 'true', limit: 10 } })
  assert.equal(fresh.getComments('s').length, 1)
  assert.equal(fresh.getCommentCursor('s'), 'n1')
})

test('comments for a post that fails to load are not requested', async () => {
  const calls = api({ 'GET /api/posts/gone': () => Promise.reject(new Error('404')) })
  const store = usePostDetailStore()
  await assert.rejects(store.fetchComments('gone'))
  assert.equal(calls.length, 1)
  assert.equal(store.isPostLoading('gone'), false)
  api({ 'GET /api/posts/gone': () => null })
  await store.fetchComments('gone')
  assert.deepEqual(store.getComments('gone'), [])
})

test('more comments append until the cursor runs out', async () => {
  const calls = api({
    'GET /api/posts/p1/comments': () => ({ data: [comment('c4')], pagination: { nextCursor: null } }),
  })
  const store = loadedStore()
  await store.loadMoreComments('s')
  assert.equal(calls[0]!.opts!.query.cursor, 'cursor-1')
  assert.deepEqual(
    store.getComments('s').map((c: { id: string }) => c.id),
    ['c1', 'c2', 'c3', 'c4'],
  )
  await store.loadMoreComments('s')
  await store.loadMoreComments('missing')
  assert.equal(calls.length, 1)
  assert.equal(store.isMoreCommentLoading('s'), false)
})

test('more replies page from the last loaded child', async () => {
  const calls = api({
    'GET /api/posts/p1/comments': () => ({ data: [comment('c1c')], pagination: { nextCursor: null } }),
  })
  const store = loadedStore()
  await store.loadMoreChildren('s', 'c1')
  const { query } = calls[0]!.opts!
  assert.equal(query.parentId, 'c1')
  const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString())
  assert.deepEqual(cursor, { s: '2026-01-02T00:00:00.000Z', id: 'c1b' })
  assert.equal(store.getComments('s')[0]!.children!.length, 3)
  await store.loadMoreChildren('s', 'c2')
  await store.loadMoreChildren('missing', 'c1')
  const bare = usePostDetailStore()
  bare.setPost('s', post('p1') as never)
  await bare.loadMoreChildren('s', 'c1')
  assert.equal(calls.length, 1)
})

test('votes apply optimistically and roll back on failure', async () => {
  let fail = false
  api({
    'POST /api/posts/p1/vote': () => (fail ? Promise.reject(new Error('x')) : { voted: true, voteCount: 9 }),
    'DELETE /api/posts/p1/vote': () => (fail ? Promise.reject(new Error('x')) : { voted: false, voteCount: 8 }),
  })
  const store = loadedStore()
  await store.vote('s')
  assert.deepEqual([store.getPost('s')!.hasVoted, store.getPost('s')!.voteCount], [true, 9])
  assert.equal(store.getPost('s')!.subscribed, true)
  await store.vote('s')
  await store.unvote('s')
  assert.deepEqual([store.getPost('s')!.hasVoted, store.getPost('s')!.voteCount], [false, 8])
  await store.unvote('s')
  fail = true
  await store.vote('s')
  assert.deepEqual([store.getPost('s')!.hasVoted, store.getPost('s')!.voteCount], [false, 8])
  store.getPost('s')!.hasVoted = true
  await store.unvote('s')
  assert.deepEqual([store.getPost('s')!.hasVoted, store.getPost('s')!.voteCount], [true, 8])
  await store.vote('missing')
  await store.unvote('missing')
})

test('new comments land at the top or under their parent', async () => {
  let n = 0
  const calls = api({ 'POST /api/posts/p1/comments': () => comment(`new${++n}`) })
  const store = loadedStore()
  await store.addComment('s', 'top', { notify: true })
  assert.deepEqual(calls[0]!.opts!.body, {
    content: 'top',
    parentId: undefined,
    replyToId: undefined,
    notifyVoters: true,
  })
  assert.equal(store.getComments('s')[0]!.id, 'new1')
  await store.addComment('s', 'reply', { parentId: 'c1', replyToId: 'c1a' })
  const c1 = store.getComments('s').find((c: { id: string }) => c.id === 'c1')!
  assert.equal(c1.children!.at(-1)!.id, 'new2')
  assert.equal(c1.replyCount, 3)
  await store.addComment('s', 'first reply', { parentId: 'c3' })
  const c3 = store.getComments('s').find((c: { id: string }) => c.id === 'c3')!
  assert.deepEqual([c3.children!.length, c3.replyCount], [1, 1])
  await store.addComment('s', 'orphan', { parentId: 'nope' })
  assert.equal(store.getPost('s')!.commentCount, 7)
  const bare = usePostDetailStore()
  bare.setPost('s', post('p1') as never)
  assert.equal((await bare.addComment('s', 'x'))!.id, 'new5')
  assert.equal(await bare.addComment('missing', 'x'), undefined)
})

test('edited comments are replaced wherever they sit', async () => {
  api({ 'PATCH /api/comments/': ({ opts }) => ({ content: opts!.body.content }) })
  const store = loadedStore()
  await store.updateComment('s', 'c2', 'top edit')
  await store.updateComment('s', 'c1b', 'child edit')
  await store.updateComment('s', 'nope', 'ignored')
  const [c1, c2] = store.getComments('s')
  assert.equal(c2!.content, 'top edit')
  assert.equal(c1!.children![1]!.content, 'child edit')
  assert.deepEqual(await usePostDetailStore().updateComment('missing', 'c1', 'x'), { content: 'x' })
})

test('deleting a comment removes its replies from the count', async () => {
  api({ 'DELETE /api/comments/': () => null })
  const store = loadedStore()
  await store.deleteComment('s', 'c1a')
  assert.deepEqual([store.getComments('s')[0]!.replyCount, store.getPost('s')!.commentCount], [1, 2])
  await store.deleteComment('s', 'c1')
  assert.equal(store.getPost('s')!.commentCount, 0)
  assert.deepEqual(
    store.getComments('s').map((c: { id: string }) => c.id),
    ['c2', 'c3'],
  )
  await store.deleteComment('s', 'nope')
  assert.equal(store.getPost('s')!.commentCount, 0)
  await store.deleteComment('missing', 'c1')
  const bare = usePostDetailStore()
  bare.setPost('s', post('p1') as never)
  await bare.deleteComment('s', 'c1')
  assert.equal(bare.getPost('s')!.commentCount, 3)
})

test('likes apply optimistically to top-level comments and replies', async () => {
  let fail = false
  api({
    'POST /api/comments/': () => (fail ? Promise.reject(new Error('x')) : { liked: true, likeCount: 5 }),
    'DELETE /api/comments/': () => (fail ? Promise.reject(new Error('x')) : { liked: false, likeCount: 4 }),
  })
  const store = loadedStore()
  await store.likeComment('s', 'c1b')
  const reply = () => store.getComments('s')[0]!.children![1]!
  assert.deepEqual([reply().hasLiked, reply().likeCount], [true, 5])
  await store.likeComment('s', 'c1b')
  await store.unlikeComment('s', 'c1b')
  assert.deepEqual([reply().hasLiked, reply().likeCount], [false, 4])
  await store.unlikeComment('s', 'c1b')
  fail = true
  await store.likeComment('s', 'c2')
  assert.deepEqual([store.getComments('s')[1]!.hasLiked, store.getComments('s')[1]!.likeCount], [false, 0])
  store.getComments('s')[1]!.hasLiked = true
  await store.unlikeComment('s', 'c2')
  assert.deepEqual([store.getComments('s')[1]!.hasLiked, store.getComments('s')[1]!.likeCount], [true, 0])
  await store.likeComment('s', 'nope')
  await store.likeComment('missing', 'c1')
})

test('post edits apply only the fields the server returned', async () => {
  let response: Record<string, unknown> = {}
  const calls = api({ 'PATCH /api/': () => response, 'DELETE /api/admin/posts/p1': () => null })
  const store = loadedStore()
  response = { title: 'New', content: '', status: 'done', boardId: null, updatedAt: '2026-02-02' }
  await store.updatePost('s', { title: 'New' }, true)
  assert.equal(calls[0]!.url, '/api/admin/posts/p1')
  assert.deepEqual(
    (({ title, content, status, boardId, updatedAt }) => ({ title, content, status, boardId, updatedAt }))(
      store.getPost('s')!,
    ),
    response,
  )
  response = {}
  await store.updatePost('s', { title: 'x' })
  assert.equal(calls[1]!.url, '/api/posts/p1')
  assert.equal(store.getPost('s')!.title, 'New')
  await store.updatePost('missing', {})
  await store.deletePost('s')
  assert.equal(store.getPost('s'), null)
  assert.deepEqual(store.getComments('s'), [])
  await store.deletePost('s')
  assert.equal(calls.length, 3)
})
