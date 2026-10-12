<script setup lang="ts">
import { buildReplyAuthorMap, hasMoreReplies, remainingReplies, replyToName } from './-comment-logic'

defineOptions({ name: 'CommentItem' })

const props = defineProps<{
  comment: CommentItem
  depth?: number
  replyingTo?: string // commentId that is being replied to
  editingId?: string // commentId that is being edited
  submitting?: boolean
  replyAuthorMap?: Map<string, string> // commentId → author name, for @username display
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
}>()

const { authorName } = useAuthorDisplay()

const isMergedPost = computed(() => props.comment.type === 'mergedPost')
const nested = computed(() => !!props.depth)
const hasMoreChildren = computed(() => hasMoreReplies(props.comment, props.depth))
const moreRepliesCount = computed(() => remainingReplies(props.comment))
const childDepth = computed(() => (props.depth || 0) + 1)
const showReplyEditor = computed(() => !props.depth && props.replyingTo === props.comment.id)

const authorId = computed(() => props.comment.author?.id)
const { canEdit, canDelete, showMenu, isOrgManager } = usePermission(authorId, 'comment')

const isEditing = computed(() => props.editingId === props.comment.id)

// Build author map for children (only at top-level)
const childReplyAuthorMap = computed(() =>
  props.depth ? undefined : buildReplyAuthorMap(props.comment.children, (author) => authorName(author)),
)

// Resolve @username for flattened replies
const replyTo = computed(() => replyToName(props.comment, props.replyAuthorMap))
</script>

<template>
  <!-- Merged post type: render MergedPostCard instead -->
  <MergedPostCard
    v-if="isMergedPost"
    :comment="comment"
    :is-admin="isOrgManager"
    @unmerge="$emit('unmerge', $event)"
  />

  <!-- Regular comment -->
  <div v-else class="relative flex flex-col gap-4">
    <CommentCard
      :comment="comment"
      :nested="nested"
      :reply-to-name="replyTo"
      :editing="isEditing"
      :submitting="submitting"
      :show-menu="showMenu"
      :can-edit="canEdit"
      :can-delete="canDelete"
      @reply="$emit('reply', comment.id)"
      @like="$emit('like', comment.id)"
      @edit="$emit('edit', comment.id)"
      @delete="$emit('delete', comment.id)"
      @edit-submit="$emit('editSubmit', comment.id, $event)"
      @edit-cancel="$emit('editCancel')"
    />

    <!-- Reply editor for this top-level comment -->
    <div v-if="showReplyEditor" class="ml-14">
      <CommentEditor
        :parent-id="comment.id"
        :reply-to-id="comment.id"
        :placeholder="$t('post.comment.replyPlaceholder')"
        :loading="submitting"
        @submit="$emit('replySubmit', $event)"
        @cancel="$emit('replyCancel')"
      />
    </div>

    <!-- Nested replies (recursive) -->
    <template v-for="reply in comment.children" :key="reply.id">
      <CommentItem
        :comment="reply"
        :depth="childDepth"
        :reply-author-map="childReplyAuthorMap"
        :replying-to="replyingTo"
        :editing-id="editingId"
        :submitting="submitting"
        @reply="$emit('reply', $event)"
        @like="$emit('like', $event)"
        @reply-submit="$emit('replySubmit', $event)"
        @reply-cancel="$emit('replyCancel')"
        @edit="$emit('edit', $event)"
        @edit-submit="(id: string, content: string) => $emit('editSubmit', id, content)"
        @edit-cancel="$emit('editCancel')"
        @delete="$emit('delete', $event)"
        @load-more-children="$emit('loadMoreChildren', $event)"
      />

      <!-- Reply editor for this child comment -->
      <div v-if="replyingTo === reply.id" class="ml-20">
        <CommentEditor
          :parent-id="comment.id"
          :reply-to-id="reply.id"
          :placeholder="$t('post.comment.replyPlaceholder')"
          :loading="submitting"
          @submit="$emit('replySubmit', $event)"
          @cancel="$emit('replyCancel')"
        />
      </div>
    </template>

    <!-- Load more children -->
    <div v-if="hasMoreChildren" class="ml-14">
      <button
        class="text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
        @click="$emit('loadMoreChildren', comment.id)"
      >
        {{ $t('post.comment.viewMoreReplies', { count: moreRepliesCount }) }}
      </button>
    </div>

  </div>
</template>
