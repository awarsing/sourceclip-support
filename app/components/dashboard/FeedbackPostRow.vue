<script setup lang="ts">
import { statusStyle } from '~/lib/pages/posts'

const props = defineProps<{ post: PostListItem; boardName?: string }>()
const emit = defineEmits<{ open: [post: PostListItem] }>()
const formatDate = useFormatDate()
const { authorName } = useAuthorDisplay()
const { t } = useI18n()
const boardLabel = computed(() => props.boardName ?? t('dashboard.feedback.unknownBoard'))
</script>

<template>
  <tr class="hover:bg-background/50 cursor-pointer transition-colors group" @click="emit('open', post)">
    <!-- Votes -->
    <td class="px-6 py-4">
      <div class="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-background border border-border">
        <Icon name="lucide:chevron-up" size="14" class="text-muted-foreground" />
        <span class="text-xs font-bold">{{ post.voteCount }}</span>
      </div>
    </td>
    <!-- Title -->
    <td class="px-4 py-4 overflow-hidden">
      <div class="flex flex-col max-w-full">
        <span class="text-sm font-bold group-hover:text-primary transition-colors truncate">{{ post.title }}</span>
        <span class="text-[11px] text-muted-foreground truncate">{{ post.excerpt }}</span>
      </div>
    </td>
    <!-- Board -->
    <td class="px-4 py-4">
      <span
        v-if="post.boardId"
        class="inline-block max-w-full truncate text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded whitespace-nowrap"
        :title="boardLabel"
      >
        {{ boardLabel }}
      </span>
      <span v-else class="text-xs italic text-muted-foreground">&mdash;</span>
    </td>
    <!-- Author -->
    <td class="px-4 py-4">
      <div class="flex items-center gap-2">
        <UserAvatar :author="post.author" :size="6" />
        <span class="text-xs font-medium truncate">{{ authorName(post.author) }}</span>
      </div>
    </td>
    <!-- Comments -->
    <td class="px-4 py-4">
      <div class="flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Icon name="lucide:message-square" size="14" />
        {{ post.commentCount }}
      </div>
    </td>
    <!-- Created -->
    <td class="px-4 py-4">
      <span class="text-xs font-medium text-muted-foreground">{{ formatDate(post.createdAt) }}</span>
    </td>
    <!-- Status -->
    <td class="px-4 py-4">
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border" :style="statusStyle(post.status)">
        {{ $t(statusLabelKey(post.status)) }}
      </span>
    </td>
  </tr>
</template>
