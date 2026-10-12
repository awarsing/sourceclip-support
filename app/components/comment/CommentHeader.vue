<script setup lang="ts">
import type { CommentSizing } from './-comment-logic'

defineProps<{
  comment: CommentItem
  sizing: CommentSizing
  replyToName: string | null
  showMenu: boolean
  canEdit: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{ edit: []; delete: [] }>()
const { authorName } = useAuthorDisplay()
const timeAgo = useTimeAgo()
</script>

<template>
  <div class="flex items-center gap-2 mb-2">
    <span class="font-heading font-bold" :class="sizing.name">
      {{ authorName(comment.author) }}
    </span>
    <span
      v-if="comment.author?.isAdmin"
      class="inline-flex items-center shrink-0 rounded-full bg-primary text-primary-foreground font-medium px-2 py-0.5"
      :class="sizing.meta"
    >
      {{ $t('post.comment.adminBadge') }}
    </span>
    <span v-if="replyToName" class="inline-flex items-center gap-0.5 text-muted-foreground" :class="sizing.meta">
      <Icon name="lucide:corner-down-right" :size="sizing.replyIcon" />
      <span class="font-medium">@{{ replyToName }}</span>
    </span>
    <span :class="sizing.meta" class="text-muted-foreground">
      {{ timeAgo(comment.createdAt) }}
    </span>
    <span v-if="comment.editedAt" class="text-[10px] text-muted-foreground italic">
      {{ $t('post.comment.edited') }}
    </span>

    <!-- Three-dot menu -->
    <ContentActionsMenu
      v-if="showMenu"
      :can-edit="canEdit"
      :can-delete="canDelete"
      trigger-class="ml-auto p-1"
      :icon-size="sizing.menuIcon"
      @edit="emit('edit')"
      @delete="emit('delete')"
    />
  </div>
</template>
