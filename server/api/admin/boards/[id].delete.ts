import { and, eq } from 'drizzle-orm'
import { board, post } from '#layers/feedlog/server/db/schemas'

// DELETE /api/boards/:id — Delete board (feedlog:moderate); clears post.board_id.
export default defineEventHandler(async (event) => {
  const { orgId, id, db } = await requireModeratedRoute(event)

  // Clear board_id on this org's posts that were attached to the board.
  await db
    .update(post)
    .set({ boardId: null })
    .where(and(eq(post.boardId, id), eq(post.orgId, orgId)))

  const [deleted] = await db
    .delete(board)
    .where(and(eq(board.id, id), eq(board.orgId, orgId)))
    .returning({ id: board.id })

  return respondDeleted(event, deleted, 'Board not found')
})
