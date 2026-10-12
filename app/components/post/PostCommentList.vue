<script setup lang="ts">
const props = defineProps<{
  comments: CommentItem[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  replyingTo: { commentId: string; parentId: string } | null
  editingId: string | null
  submitting: boolean
}>()
const emit = defineEmits<{
  reply: [commentId: string]
  like: [commentId: string]
  replySubmit: [content: string]
  replyCancel: []
  edit: [commentId: string]
  editSubmit: [commentId: string, content: string]
  editCancel: []
  delete: [commentId: string]
  loadMoreChildren: [parentId: string]
  unmerge: [postId: string]
  loadMore: []
}>()

const showSkeleton = computed(() => props.loading && props.comments.length === 0)
const listClass = computed(() => (props.loading ? 'opacity-60 pointer-events-none' : ''))

/** The comment being answered inside this thread, if the open reply belongs to it. */
function replyingWithin(commentId: string) {
  return props.replyingTo?.parentId === commentId ? props.replyingTo.commentId : undefined
}
</script>

<template>
  <div v-if="showSkeleton" class="space-y-4 pt-2">
    <div v-for="i in 3" :key="i" class="flex gap-4 animate-pulse">
      <div class="w-10 h-10 rounded-full bg-border shrink-0" />
      <div class="flex-1 bg-card border border-border rounded-lg p-4 space-y-2">
        <div class="h-3 bg-muted rounded w-1/4" /><div class="h-4 bg-muted rounded w-full" /><div class="h-4 bg-muted rounded w-3/4" />
      </div>
    </div>
  </div>
  <div v-else-if="comments.length > 0" class="space-y-4 pt-2 transition-opacity duration-200" :class="listClass">
    <CommentItem
      v-for="comment in comments"
      :key="comment.id"
      :comment="comment"
      :replying-to="replyingWithin(comment.id)"
      :editing-id="editingId ?? undefined"
      :submitting="submitting"
      @reply="emit('reply', $event)"
      @like="emit('like', $event)"
      @reply-submit="emit('replySubmit', $event)"
      @reply-cancel="emit('replyCancel')"
      @edit="emit('edit', $event)"
      @edit-submit="(id: string, content: string) => emit('editSubmit', id, content)"
      @edit-cancel="emit('editCancel')"
      @delete="emit('delete', $event)"
      @load-more-children="emit('loadMoreChildren', $event)"
      @unmerge="emit('unmerge', $event)"
    />
  </div>
  <div v-else class="flex flex-col items-center justify-center py-12 text-center">
    <Icon name="lucide:message-circle" size="48" class="text-muted-foreground/40 mb-4" />
    <p class="text-sm font-medium text-muted-foreground">{{ $t('post.detail.noComments') }}</p>
    <p class="text-xs text-muted-foreground/60 mt-1">{{ $t('post.detail.noCommentsHint') }}</p>
  </div>
  <div v-if="hasMore" class="flex justify-center mt-8">
    <button class="px-6 py-2.5 rounded-full border border-border text-sm font-heading font-semibold hover:border-primary hover:text-primary transition-colors bg-card shadow-warm" :disabled="loadingMore" @click="emit('loadMore')">{{ loadingMore ? $t('post.detail.loadingMore') : $t('post.detail.viewMoreComments') }}</button>
  </div>
</template>
