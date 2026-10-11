import { z } from 'zod/v4'

const postTitle = z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less')
const postContent = z
  .string()
  .trim()
  .min(1, 'Content is required')
  .max(10000, 'Content must be 10000 characters or less')

export const createPostSchema = z.object({
  title: postTitle,
  content: postContent,
  boardId: z.uuid().nullable().optional(),
})

// Author can edit title/content, admin can edit any field
export const updatePostSchema = z.object({
  title: postTitle.optional(),
  content: postContent.optional(),
  status: z.enum(['open', 'planned', 'in_progress', 'done']).optional(),
  boardId: z.uuid().nullable().optional(),
})

export const authorUpdatePostSchema = updatePostSchema.pick({ title: true, content: true })
