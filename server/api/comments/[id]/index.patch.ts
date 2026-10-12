import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { comment } from '#layers/feedlog/server/db/schemas'

const updateCommentSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(5000, 'Comment must be 5000 characters or less'),
})

// PATCH /api/comments/:id — Edit own comment. Author-only: moderators can
// delete other people's comments but not rewrite them (product rule).
export default defineEventHandler(async (event) => {
  // Comment is org-scoped via post.org_id.
  const { session, id, db, existing } = await requireCommentRoute(event)
  if (existing.authorId !== session.user.id) {
    throw createError({ statusCode: 403, message: 'You can only edit your own comments' })
  }

  const body = await readValidatedBody(event, updateCommentSchema.parse)

  const [updated] = await db
    .update(comment)
    .set({ content: body.content, editedAt: new Date() })
    .where(eq(comment.id, id))
    .returning()

  return updated
})
