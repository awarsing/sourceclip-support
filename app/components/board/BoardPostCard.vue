<script setup lang="ts">
import { showsStatusBadge, statusStyle } from '~/lib/pages/posts'

const props = defineProps<{ post: PostListItem; boardName?: string }>()
const emit = defineEmits<{ open: [post: PostListItem]; vote: [post: PostListItem] }>()
const timeAgo = useTimeAgo()

const badged = computed(() => showsStatusBadge(props.post.status))
const pastOpen = computed(() => !!props.post.status && props.post.status !== 'open')
</script>

<template>
  <article
    class="feedback-card flex items-stretch gap-4 bg-card border border-border rounded-lg p-4 cursor-pointer"
    data-fdl-action="feedback_open"
    data-fdl-source="board-list"
    @click="emit('open', post)"
  >
    <!-- Upvote button -->
    <button
      class="upvote-btn w-[56px] h-[64px] shrink-0 rounded-md flex flex-col items-center justify-center gap-1 border focus:outline-none"
      :class="post.hasVoted
        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
        : 'bg-background text-foreground border-border hover:border-primary hover:text-primary transition-colors'"
      data-fdl-action="feedback_vote"
      data-fdl-source="board-list"
      @click.stop="emit('vote', post)"
    >
      <Icon name="lucide:chevron-up" size="24" />
      <span class="font-heading font-bold text-[15px] leading-none">{{ post.voteCount }}</span>
    </button>

    <!-- Card content -->
    <div class="flex-1 flex flex-col justify-center min-w-0 py-1">
      <!-- Status badge + Board -->
      <div class="flex items-center gap-2 mb-1">
        <span
          v-if="badged"
          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
          :style="statusStyle(post.status)"
        >
          {{ $t(statusLabelKey(post.status)) }}
        </span>
        <span v-if="boardName" class="text-xs font-medium text-muted-foreground">
          {{ pastOpen ? '•' : '' }} {{ boardName }}
        </span>
      </div>

      <!-- Title -->
      <div class="flex items-center gap-2 mb-1.5">
        <h3 class="font-heading text-lg font-bold leading-tight truncate">
          {{ post.title }}
        </h3>
      </div>

      <!-- Excerpt -->
      <p class="text-sm text-muted-foreground line-clamp-2 break-words">
        {{ post.excerpt }}
      </p>

      <!-- Bottom meta -->
      <div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground font-medium">
        <div class="flex items-center gap-1.5">
          <Icon name="lucide:message-square" size="14" />
          <span>{{ $t('board.comments', { n: post.commentCount }) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <UserAvatar :author="post.author" :size="5" />
          <div class="flex items-center gap-1.5">
            <Icon name="lucide:clock" size="14" />
            <span>{{ timeAgo(post.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.upvote-btn {
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.feedback-card {
  transition: box-shadow 0.2s ease;
}

.feedback-card:hover {
  box-shadow: var(--shadow-warm);
}
</style>
