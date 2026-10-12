// Pure helpers behind the widget embed page.

export type EmbedView = 'conversations' | 'chat' | 'list'

interface EmbedUser {
  email?: string | null
  isAnonymous?: boolean | null
}

interface ResumeState<Chat extends { conversationId: string | null }> {
  owner: string | null
  anonymous: boolean
  view: EmbedView
  conversationId: string | null
  chat: Chat | null
  scrollTop: number
}

/** What the SDK keeps for this frame, so a reload or login can put the reader back. */
export function resumeSnapshot<Chat extends { conversationId: string | null }>(
  user: EmbedUser | null | undefined,
  view: EmbedView,
  conversationId: string | null,
  chat: Chat | null,
  scrollTop: number,
): ResumeState<Chat> {
  return {
    owner: user?.email ?? null,
    anonymous: !user || user.isAnonymous === true,
    view,
    conversationId,
    chat: chat ? (JSON.parse(JSON.stringify(chat)) as Chat) : null,
    scrollTop,
  }
}

/**
 * A guest may claim their own draft on login; a different signed-in account
 * must never inherit the previous account's conversation or composer.
 */
export function canRestore(
  saved: { anonymous: boolean; owner: string | null },
  currentEmail: string | null | undefined,
) {
  return saved.anonymous || saved.owner === currentEmail
}

/** The conversation to reopen: the chat's own one when restoring the chat view. */
export function restoredConversationId<Chat extends { conversationId: string | null }>(saved: ResumeState<Chat>) {
  if (saved.view !== 'chat') return saved.conversationId
  return saved.chat?.conversationId ?? saved.conversationId
}

/**
 * Whether a wheel event should be stopped from scrolling the host page: it
 * should unless some element on its path (up to the widget root) can scroll.
 */
export function shouldContainWheel(
  event: { ctrlKey: boolean; deltaY: number },
  path: readonly unknown[],
  root: unknown,
  canScroll: (node: unknown) => boolean,
) {
  if (event.ctrlKey || !event.deltaY) return false
  for (const node of path) {
    if (canScroll(node)) return false
    if (node === root) break
  }
  return true
}

/** An element scrolls when its overflow allows it and its content is taller than its box. */
export function isScrollableBox(overflowY: string, scrollHeight: number, clientHeight: number) {
  return (overflowY === 'auto' || overflowY === 'scroll') && scrollHeight > clientHeight
}

/**
 * The feedback list request. A refresh refetches at least everything already
 * shown; "load more" continues from the cursor.
 */
export function feedbackListUrl(append: boolean, cursor: string | null, loaded: number, pageSize: number) {
  const after = append && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
  const size = append ? pageSize : Math.max(loaded, pageSize)
  return `/api/widget/feedback?pageSize=${size}${after}`
}

/** The header's title key, by view. */
export function embedTitleKey(view: EmbedView) {
  if (view === 'conversations') return 'widget.messages'
  if (view === 'list') return 'widget.myFeedback'
  return 'widget.agentTitle'
}

/** Without any history the root view is the composer, not an empty list. */
export function rootView(conversationCount: number, feedbackCount: number): EmbedView {
  return conversationCount || feedbackCount ? 'conversations' : 'chat'
}
