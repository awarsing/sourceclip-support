<script setup lang="ts">
import type { SimilarPost } from '#layers/feedlog/server/utils/similar'
import { statusBadgeStyle, statusCssVar } from './-post-logic'

const props = defineProps<{ post: SimilarPost; selected: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const rowClass = computed(() => (props.selected ? 'bg-primary/5 !border-primary/10' : 'hover:bg-background'))
const radioClass = computed(() =>
  props.selected
    ? 'border-[6px] border-primary bg-card shadow-sm'
    : 'border-2 border-border bg-card group-hover:border-primary/30',
)
const titleClass = computed(() => (props.selected ? 'text-primary' : 'group-hover:text-primary'))
const badgeStyle = computed(() => statusBadgeStyle(props.post.status))
const dotStyle = computed(() => ({ backgroundColor: `var(${statusCssVar(props.post.status)})` }))
</script>

<template>
  <div
    class="group relative flex items-start gap-4 p-4 rounded-xl transition-all cursor-pointer mb-1 border border-transparent"
    :class="rowClass"
    @click="emit('toggle')"
  >
    <!-- Radio circle -->
    <div class="mt-1 flex-shrink-0">
      <div class="w-5 h-5 rounded-full transition-all" :class="radioClass" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 overflow-hidden">
          <h4 class="text-[15px] font-bold font-heading truncate transition-colors" :class="titleClass">
            {{ post.title }}
          </h4>
          <div class="flex items-center gap-3 text-muted-foreground/50 text-[12px] font-bold shrink-0">
            <span class="flex items-center gap-0.5">
              <Icon name="lucide:chevron-up" size="16" /> {{ post.voteCount }}
            </span>
            <span class="flex items-center gap-0.5">
              <Icon name="lucide:message-square" size="14" /> {{ post.commentCount }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4 mt-1">
        <p class="text-[13px] text-muted-foreground line-clamp-1 flex-1">{{ post.excerpt }}</p>
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 border"
          :style="badgeStyle"
        >
          <span class="w-1.5 h-1.5 rounded-full" :style="dotStyle" />
          {{ $t(statusLabelKey(post.status)) }}
        </span>
      </div>
    </div>
  </div>
</template>
