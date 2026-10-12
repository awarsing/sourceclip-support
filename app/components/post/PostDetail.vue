<script setup lang="ts">
import '~/assets/css/md-editor-preview.css'
import { toast } from 'vue-sonner'
import { apiErrorMessage, errorStatus } from '~/lib/form-errors'
import {
  findComment,
  mergeBody,
  postEditError,
  replyIds,
  replyTargetFor,
  statusNotifyBody,
  type MergeDirection,
} from './-post-logic'

// Event types for post mutations
export interface PostUpdatedEvent {
  id: string
  slug: string
  title?: string
  content?: string
  excerpt?: string
  status?: string
  boardId?: string | null
  commentCount?: number
  voteCount?: number
  hasVoted?: boolean
}

const props = defineProps<{
  slug: string
}>()

const emit = defineEmits<{
  updated: [post: PostUpdatedEvent]
  deleted: [postId: string]
  sourceConversation: [conversationId: string]
}>()

const store = usePostDetailStore()
const boardStore = useBoardStore()
const { boards } = storeToRefs(boardStore)

// Derive data from store using slug
const post = computed(() => store.getPost(props.slug))
const comments = computed(() => store.getComments(props.slug))
const hasMoreComments = computed(() => !!store.getCommentCursor(props.slug))
const loading = computed(() => store.isPostLoading(props.slug))
const commentLoading = useDebouncedLoading(computed(() => store.isCommentLoading(props.slug)))
const moreCommentLoading = computed(() => store.isMoreCommentLoading(props.slug))
const showSkeleton = computed(() => loading.value && !post.value)

// Comment sort is local UI state
const commentSort = ref<'newest' | 'oldest' | 'top'>('newest')

// Auth & login modal
const { data: session } = useAuthSession()
const loginModal = useLoginModal()
const { hasAccount, mayAct, ensureIdentity } = useGuestSession()
// The comment box is offered before an identity exists: a guest is only minted
// once they actually press submit. Whoever filed the report always keeps the box,
// switch or no switch — following up on your own feedback is part of filing it,
// which is the same exception the server makes.
const isPostAuthor = computed(() => !!session.value?.user?.id && post.value?.author?.id === session.value.user.id)
const canOpenCommentBox = computed(() => isPostAuthor.value || mayAct('allowComment'))

// Permissions
const postAuthorId = computed(() => post.value?.author?.id)
const {
  canEdit: canEditPost,
  canDelete: canDeletePost,
  isOrgManager,
  showMenu: showPostMenu,
} = usePermission(postAuthorId, 'post')

// Board name
const boardName = computed(() => {
  if (!post.value?.boardId) return null
  return boardStore.boardMap.get(post.value.boardId) ?? null
})

// ---- Post editing state ----
const editing = ref(false)
const editTitle = ref('')
const editContent = ref('')
const editSaving = ref(false)
const editError = ref('')
const { confirm } = useConfirmDialog()
const { t } = useI18n()
const deleting = ref(false)

function startEditPost() {
  if (!post.value) return
  editTitle.value = post.value.title
  editContent.value = post.value.content
  editError.value = ''
  editing.value = true
  replyingTo.value = null
  editingCommentId.value = null
}

function cancelEditPost() {
  editing.value = false
  editError.value = ''
}

async function saveEditPost() {
  if (!post.value) return
  const title = editTitle.value.trim()
  const content = editContent.value.trim()
  const invalid = postEditError(title, content)
  if (invalid) {
    editError.value = t(invalid)
    return
  }
  await persistPostEdit(post.value, title, content)
}

async function persistPostEdit(target: PostDetail, title: string, content: string) {
  editSaving.value = true
  editError.value = ''
  try {
    await store.updatePost(props.slug, { title, content }, isOrgManager.value)
    editing.value = false
    emit('updated', { id: target.id, slug: target.slug, title, content })
  } catch (e) {
    editError.value = apiErrorMessage(e, t('post.detail.errors.saveFailed'))
  } finally {
    editSaving.value = false
  }
}

async function handleDeletePost() {
  if (!post.value) return
  const ok = await confirm({
    title: t('post.detail.deleteTitle'),
    description: t('post.detail.deleteDescription'),
    cancelText: t('common.cancel'),
    confirmText: t('common.delete'),
    variant: 'destructive',
  })
  if (ok) await deletePost(post.value.id)
}

async function deletePost(postId: string) {
  deleting.value = true
  try {
    await store.deletePost(props.slug)
    emit('deleted', postId)
  } catch (e) {
    // Not editError: that line only renders inside the edit form, so a delete
    // failure there was indistinguishable from the button doing nothing.
    toast.error(apiErrorMessage(e, t('post.detail.errors.deleteFailed')))
  } finally {
    deleting.value = false
  }
}

// ---- Admin sidebar actions ----
// Status changes apply immediately and silently; this prompt (when set to the
// new status) then asks whether to mail the subscribers.
const notifyStatus = ref<string | null>(null)

async function handleStatusChange(status: string) {
  if (!post.value || !isOrgManager.value || post.value.status === status) return
  await store.updatePost(props.slug, { status }, true)
  emit('updated', { id: post.value.id, slug: post.value.slug, status })
  notifyStatus.value = status
}

async function sendStatusNotification(note: string) {
  const status = notifyStatus.value
  if (!post.value || !status) return
  notifyStatus.value = null
  try {
    await useApiFetch(`/api/admin/posts/${post.value.id}/notify-status`, {
      method: 'POST',
      body: statusNotifyBody(status, note),
    })
  } catch (err: unknown) {
    reportNotifyFailure(err)
  }
}

function reportNotifyFailure(err: unknown) {
  // 409 = status changed under the admin between the write and the send.
  if (errorStatus(err) === 409) {
    console.error('[notifications] status changed by someone else')
  }
}

async function handleBoardChange(boardId: string | null) {
  if (!post.value || !isOrgManager.value) return
  await store.updatePost(props.slug, { boardId }, true)
  emit('updated', { id: post.value.id, slug: post.value.slug, boardId })
}

// ---- Merge state ----
const isMerged = computed(() => !!post.value?.mergedTo)
const mergeDialogOpen = ref(false)
const mergeDirection = ref<MergeDirection>('bring')

function openMergeDialog(direction: MergeDirection) {
  mergeDirection.value = direction
  mergeDialogOpen.value = true
}

async function handleMerged() {
  // Refresh post data after merge
  await store.fetchPost(props.slug)
  await store.fetchComments(props.slug, commentSort.value)
}

async function handleUnmerge(postId: string) {
  try {
    await useApiFetch('/api/admin/posts/unmerge', { method: 'POST', body: { postId } })
    await store.fetchPost(props.slug)
    await store.fetchComments(props.slug, commentSort.value)
  } catch (e: any) {
    console.error('Unmerge failed:', e)
  }
}

async function handleSimilarMerge(direction: MergeDirection, targetPost: { id: string }) {
  if (!post.value) return
  const body = mergeBody(direction, post.value.id, targetPost.id)

  try {
    await useApiFetch('/api/admin/posts/merge', { method: 'POST', body })
    await handleMerged()
  } catch (e: any) {
    console.error('Merge failed:', e)
  }
}

// ---- Vote handler ----
async function handleVote() {
  // Block voting on merged posts
  if (!post.value || isMerged.value) return
  if (await ensureIdentity('allowVote')) toggleVote(post.value!)
}

function toggleVote(p: PostDetail) {
  const settled = p.hasVoted ? store.unvote(props.slug) : store.vote(props.slug)
  const syncList = () => emit('updated', { id: p.id, slug: p.slug, voteCount: p.voteCount, hasVoted: p.hasVoted })
  syncList()
  settled.then(syncList)
}

// ---- Comment interaction state ----
const replyingTo = ref<{ commentId: string; parentId: string } | null>(null)
const editingCommentId = ref<string | null>(null)
const commentSubmitting = ref(false)
const commentEditorRef = ref<{ clear: () => void } | null>(null)

function emitCommentCount() {
  if (post.value) {
    emit('updated', { id: post.value.id, slug: post.value.slug, commentCount: post.value.commentCount })
  }
}

/** The post's author may always comment; anyone else needs an identity first. */
async function mayComment() {
  return isPostAuthor.value || (await ensureIdentity('allowComment'))
}

// Comment handlers
async function handleCommentSubmit(content: string, notify: boolean) {
  if (!(await mayComment())) return
  commentSubmitting.value = true
  try {
    await store.addComment(props.slug, content, { notify })
    commentEditorRef.value?.clear()
    emitCommentCount()
  } finally {
    commentSubmitting.value = false
  }
}

async function handleReplySubmit(content: string) {
  if (!replyingTo.value || !(await mayComment())) return
  commentSubmitting.value = true
  try {
    await store.addComment(props.slug, content, replyIds(replyingTo.value))
    replyingTo.value = null
    emitCommentCount()
  } finally {
    commentSubmitting.value = false
  }
}

function handleReply(commentId: string) {
  if (!canOpenCommentBox.value) return loginModal.open()

  editingCommentId.value = null
  editing.value = false

  const target = replyTargetFor(comments.value, commentId)
  if (target) replyingTo.value = target
}

async function handleLike(commentId: string) {
  if (!(await ensureIdentity('allowVote'))) return

  const c = findComment(comments.value, commentId)
  if (!c) return
  if (c.hasLiked) {
    store.unlikeComment(props.slug, commentId)
  } else {
    store.likeComment(props.slug, commentId)
  }
}

function handleEditComment(commentId: string) {
  replyingTo.value = null
  editing.value = false
  editingCommentId.value = commentId
}

async function handleEditCommentSubmit(commentId: string, content: string) {
  commentSubmitting.value = true
  try {
    await store.updateComment(props.slug, commentId, content)
    editingCommentId.value = null
  } finally {
    commentSubmitting.value = false
  }
}

function handleEditCommentCancel() {
  editingCommentId.value = null
}

async function handleDeleteComment(commentId: string) {
  try {
    await store.deleteComment(props.slug, commentId)
  } catch (e) {
    // Uncaught, this rejected into nowhere and the comment silently stayed put.
    toast.error(apiErrorMessage(e, t('post.detail.errors.deleteFailed')))
    return
  }
  emitCommentCount()
}

// Watch comment sort changes → refetch
watch(commentSort, () => {
  store.fetchComments(props.slug, commentSort.value)
})
</script>

<template>
  <!-- Single stable root for SSR hydration -->
  <PostDetailSkeleton v-if="showSkeleton" />

  <!-- Content: use v-if (not v-else-if) so SSR always renders this when post exists -->
  <template v-if="post">
    <!-- Left column: post card + discussion -->
    <div class="flex-1 min-w-0 space-y-6">
      <!-- Post card -->
      <div class="bg-card border border-border rounded-lg p-6 lg:p-8 shadow-sm">
        <div class="flex flex-col md:flex-row gap-6">
          <PostVoteButton v-if="!isMerged" :voted="post.hasVoted" :count="post.voteCount" @vote="handleVote" />
          <div class="flex-1 min-w-0">
            <PostEditForm v-if="editing" v-model:title="editTitle" v-model:content="editContent" :error="editError" :saving="editSaving" @cancel="cancelEditPost" @save="saveEditPost" />
            <template v-else>
              <PostDetailHeader
                :title="post.title"
                :created-at="post.createdAt"
                :can-merge="isOrgManager && !isMerged"
                :show-menu="showPostMenu"
                :can-edit="canEditPost"
                :can-delete="canDeletePost"
                @merge="openMergeDialog"
                @edit="startEditPost"
                @delete="handleDeletePost"
              />
              <PostContent v-if="post.content" :content="post.content" />
              <div v-else class="h-20 bg-muted rounded animate-pulse" />
            </template>
          </div>
        </div>
      </div>

      <!-- Discussion -->
      <div class="space-y-4">
        <PostDiscussionHeader
          ref="commentEditorRef"
          v-model:sort="commentSort"
          :comment-count="post.commentCount"
          :merged="isMerged"
          :canonical-post="post.canonicalPost"
          :can-open-comment-box="canOpenCommentBox"
          :submitting="commentSubmitting"
          :can-notify="isOrgManager"
          @submit="handleCommentSubmit"
        />
        <PostCommentList
          :comments="comments"
          :loading="commentLoading"
          :has-more="hasMoreComments"
          :loading-more="moreCommentLoading"
          :replying-to="replyingTo"
          :editing-id="editingCommentId"
          :submitting="commentSubmitting"
          @reply="handleReply"
          @like="handleLike"
          @reply-submit="handleReplySubmit"
          @reply-cancel="replyingTo = null"
          @edit="handleEditComment"
          @edit-submit="handleEditCommentSubmit"
          @edit-cancel="handleEditCommentCancel"
          @delete="handleDeleteComment"
          @load-more-children="store.loadMoreChildren(slug, $event)"
          @unmerge="handleUnmerge"
          @load-more="store.loadMoreComments(slug, commentSort)"
        />
      </div>
    </div>

    <!-- Right sidebar -->
    <PostDetailSidebar
      :post="post"
      :slug="slug"
      :boards="boards"
      :board-name="boardName"
      :is-org-manager="isOrgManager"
      :merged="isMerged"
      :has-account="hasAccount"
      :notify-status="notifyStatus"
      :actor-name="session?.user?.name"
      :actor-image="session?.user?.image"
      @board-change="handleBoardChange"
      @status-change="handleStatusChange"
      @send-notification="sendStatusNotification"
      @dismiss-notification="notifyStatus = null"
      @source-conversation="emit('sourceConversation', $event)"
      @subscribed="post.subscribed = $event"
      @similar-merge="handleSimilarMerge"
    />

    <!-- Merge dialog -->
    <MergeDialog v-if="post.id" v-model:open="mergeDialogOpen" :post-id="post.id" :post-title="post.title" :direction="mergeDirection" @merged="handleMerged" />

  </template>
</template>
