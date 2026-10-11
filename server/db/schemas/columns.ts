import { type AnyPgColumn, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

// Column builders shared by the table definitions. Each call returns a fresh
// builder, because drizzle binds a builder to the table that receives it.

export const uuidPrimaryKey = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7())

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// A row per (post, user) pair, such as a vote or a subscription.
export const postUserColumns = () => ({
  postId: uuid('post_id').notNull(),
  userId: text('user_id').notNull(),
  createdAt: createdAt(),
})

export const postUserPrimaryKey = (t: { postId: AnyPgColumn; userId: AnyPgColumn }) => [
  primaryKey({ columns: [t.postId, t.userId] }),
]
