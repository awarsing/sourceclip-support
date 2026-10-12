<script setup lang="ts">
import type { SimilarPost } from '#layers/feedlog/server/utils/similar'
import { statusBadgeStyle, type MergeDirection } from './-post-logic'

const props = defineProps<{ post: SimilarPost; isAdmin?: boolean }>()
const emit = defineEmits<{ merge: [direction: MergeDirection] }>()
const localePath = useLocalePath()
const badgeStyle = computed(() => statusBadgeStyle(props.post.status))
</script>

<template>
  <div class="group py-4 first:pt-0 border-b border-border/40 last:border-b-0">
    <div class="flex items-start justify-between gap-2">
      <NuxtLink :to="localePath(`/p/${post.slug}`)" class="text-sm font-bold hover:text-primary transition-colors leading-relaxed flex-1 min-w-0 break-words">
        {{ post.title }}
      </NuxtLink>
      <!-- Admin merge button -->
      <DropdownMenu v-if="isAdmin">
        <DropdownMenuTrigger as-child>
          <button
            class="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
            :title="$t('post.merge.tooltip')"
          >
            <Icon name="lucide:git-merge" size="18" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-[180px]">
          <DropdownMenuItem class="text-xs font-bold gap-2" @click="emit('merge', 'bring')">
            <Icon name="lucide:arrow-down-left" size="14" />
            {{ $t('post.merge.intoCurrent') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="text-xs font-bold gap-2" @click="emit('merge', 'push')">
            <Icon name="lucide:arrow-up-right" size="14" />
            {{ $t('post.merge.currentInto') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <p v-if="post.excerpt" class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 mb-2.5">{{ post.excerpt }}</p>
    <div class="flex items-center gap-3">
      <span class="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
        <Icon name="lucide:chevron-up" size="14" /> {{ post.voteCount }}
      </span>
      <span class="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
        <Icon name="lucide:message-square" size="14" /> {{ post.commentCount }}
      </span>
      <span
        class="ml-auto inline-flex items-center px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-wider border"
        :style="badgeStyle"
      >
        {{ $t(statusLabelKey(post.status)) }}
      </span>
    </div>
  </div>
</template>
