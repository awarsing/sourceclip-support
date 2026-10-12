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
    <DropdownMenu v-if="showMenu">
      <DropdownMenuTrigger as-child>
        <button class="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <Icon name="lucide:more-horizontal" :size="sizing.menuIcon" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-[120px]">
        <DropdownMenuItem v-if="canEdit" class="text-xs font-bold gap-2" @click="emit('edit')">
          <Icon name="lucide:pencil" size="14" />
          {{ $t('common.edit') }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canDelete" class="text-xs font-bold gap-2 text-destructive" @click="emit('delete')">
          <Icon name="lucide:trash-2" size="14" />
          {{ $t('common.delete') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
