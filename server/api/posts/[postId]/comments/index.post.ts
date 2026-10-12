import { z } from 'zod/v4'
import { comment } from '#layers/feedlog/server/db/schemas'
import { isActorAdmin } from '#layers/feedlog/shared/utils/notifications'

const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(5000, 'Comment must be 5000 characters or less'),
  parentId: z.uuid().optional(),
  replyToId: z.uuid().optional(),
  // Admin opt-out for pinging upvoters; author + manual subscribers always get it.
  notifyVoters: z.boolean().optional(),
})

// POST /api/posts/:postId/comments — Create a comment (any authenticated user).
export default defineEventHandler(async (event) => {
  const { session, orgId, postId, db } = await requirePostRoute(event)
  const body = await readValidatedBody(event, createCommentSchema.parse)

  // Verify post exists, belongs to org, and is not merged.
  const p = await requireOrgPost(db, orgId, postId, ['authorId', 'mergedTo', 'slug', 'title'])
  if (p.mergedTo) {
    throw createError({ statusCode: 403, message: 'Cannot comment on a merged post' })
  }

  // Guests may always keep talking under their own report — adding a detail or
  // answering an admin's follow-up is part of filing it. The switch governs
  // speaking up on other people's posts.
  if (p.authorId !== session.user.id) {
    await assertGuestMay(event, session, 'allowComment')
  }

  const { parentId, replyToId } = await resolveReplyTarget(db, body.parentId, body.replyToId)
  const [created] = await db
    .insert(comment)
    .values({ postId, parentId, replyToId, authorId: session.user.id, content: body.content })
    .returning()
  await countNewComment(db, postId, parentId)

  const actorIsAdmin = isActorAdmin(session, orgId)
  queueCommentNotifications(event, {
    orgId,
    postId,
    postSlug: p.slug,
    postTitle: p.title,
    content: body.content,
    actorId: session.user.id,
    actorIsAdmin,
    isTopLevel: !parentId,
    notifyVoters: body.notifyVoters !== false,
  })

  setResponseStatus(event, 201)
  return await toCreatedComment(db, created!, session.user.id, actorIsAdmin)
})
