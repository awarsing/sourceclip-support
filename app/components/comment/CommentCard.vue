<script setup lang="ts">
import { commentSizing } from './-comment-logic'

const props = defineProps<{
  comment: CommentItem
  nested: boolean
  replyToName: string | null
  editing: boolean
  submitting?: boolean
  showMenu: boolean
  canEdit: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{
  reply: []
  like: []
  edit: []
  delete: []
  editSubmit: [content: string]
  editCancel: []
}>()
const { confirm } = useConfirmDialog()
const { t } = useI18n()

const sizing = computed(() => commentSizing(props.nested))
const likeClass = computed(() => [sizing.value.actionText, props.comment.hasLiked ? 'text-primary' : ''])

async function handleDelete() {
  const ok = await confirm({
    title: t('post.comment.deleteTitle'),
    description: t('post.comment.deleteDescription'),
    cancelText: t('common.cancel'),
    confirmText: t('common.delete'),
    variant: 'destructive',
  })
  if (ok) emit('delete')
}
</script>

<template>
  <div class="flex gap-4" :class="sizing.row">
    <!-- Avatar -->
    <UserAvatar :author="comment.author" :size="sizing.avatar" shadow />

    <!-- Content -->
    <div class="flex-1 rounded-lg shadow-sm" :class="sizing.bubble">
      <CommentHeader
        :comment="comment"
        :sizing="sizing"
        :reply-to-name="replyToName"
        :show-menu="showMenu"
        :can-edit="canEdit"
        :can-delete="canDelete"
        @edit="emit('edit')"
        @delete="handleDelete"
      />

      <!-- Edit mode -->
      <CommentEditor
        v-if="editing"
        :initial-content="comment.content"
        :placeholder="$t('post.comment.editPlaceholder')"
        :loading="submitting"
        @submit="emit('editSubmit', $event)"
        @cancel="emit('editCancel')"
      />

      <!-- Read mode -->
      <template v-else>
        <CommentContent :content="comment.content" />
        <div class="flex items-center gap-4" :class="sizing.actions">
          <Button
            variant="subtle"
            size="xs"
            class="font-bold text-primary"
            :class="sizing.actionText"
            @click="emit('reply')"
          >
            <Icon name="lucide:reply" :size="sizing.actionIcon" /> {{ $t('post.comment.reply') }}
          </Button>
          <Button
            variant="subtle"
            size="xs"
            class="font-bold"
            :class="likeClass"
            @click="emit('like')"
          >
            <Icon name="lucide:thumbs-up" class="translate-y-[-1px]" :size="sizing.actionIcon" /> {{ comment.likeCount }}
          </Button>
        </div>
      </template>
    </div>
  </div>
</template>
