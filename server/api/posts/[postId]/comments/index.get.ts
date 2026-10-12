// GET /api/posts/:postId/comments — Unified comment query (top-level, children, pagination)
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const orgId = event.context.orgId!
  const postId = getRouterParam(event, 'postId')!
  const query = parseCommentListQuery(getQuery(event))

  const db = useDB()

  // Confirm the parent post belongs to the active org before exposing comments.
  await requireOrgPost(db, orgId, postId)

  const ctx = { db, postId, userId: session?.user.id, adminIds: await findAdminAuthorIds(db, orgId), query }
  return query.parentId ? await listReplies(ctx, query.parentId) : await listTopLevelComments(ctx)
})
