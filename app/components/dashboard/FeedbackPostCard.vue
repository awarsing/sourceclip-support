<script setup lang="ts">
import { statusStyle } from '~/lib/pages/posts'

defineProps<{ post: PostListItem; boardName?: string }>()
const emit = defineEmits<{ open: [post: PostListItem] }>()
const formatDate = useFormatDate()
const { authorName } = useAuthorDisplay()
</script>

<template>
  <div class="px-4 py-3 cursor-pointer active:bg-background/50 transition-colors" @click="emit('open', post)">
    <div class="flex items-start gap-3">
      <!-- Vote -->
      <div class="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-background border border-border shrink-0">
        <Icon name="lucide:chevron-up" size="12" class="text-muted-foreground" />
        <span class="text-[11px] font-bold leading-none">{{ post.voteCount }}</span>
      </div>
      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border" :style="statusStyle(post.status)">
            {{ $t(statusLabelKey(post.status)) }}
          </span>
          <span v-if="post.boardId" class="text-[10px] font-medium text-muted-foreground">
            {{ boardName ?? $t('dashboard.feedback.unknownBoard') }}
          </span>
        </div>
        <h4 class="text-sm font-bold truncate">{{ post.title }}</h4>
        <p class="text-[11px] text-muted-foreground truncate mt-0.5">{{ post.excerpt }}</p>
        <div class="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          <div class="flex items-center gap-1">
            <UserAvatar :author="post.author" :size="4" />
            <span class="font-medium">{{ authorName(post.author) }}</span>
          </div>
          <span>{{ formatDate(post.createdAt) }}</span>
          <div class="flex items-center gap-0.5">
            <Icon name="lucide:message-square" size="12" />
            {{ post.commentCount }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
