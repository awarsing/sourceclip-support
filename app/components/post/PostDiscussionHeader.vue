<script setup lang="ts">
type CommentSort = 'newest' | 'oldest' | 'top'

defineProps<{
  commentCount: number
  merged: boolean
  canonicalPost?: { slug: string; title: string }
  canOpenCommentBox: boolean
  submitting: boolean
  canNotify: boolean
}>()
const emit = defineEmits<{ submit: [content: string, notify: boolean] }>()
const sort = defineModel<CommentSort>('sort', { required: true })
const sorts = ['newest', 'oldest', 'top'] as const
const editorRef = ref<{ clear: () => void } | null>(null)

function sortClass(value: CommentSort) {
  return sort.value === value
    ? 'bg-card shadow-sm text-foreground font-bold'
    : 'text-muted-foreground hover:text-foreground'
}

defineExpose({ clear: () => editorRef.value?.clear() })
</script>

<template>
  <div class="flex items-center justify-between">
    <h3 class="font-heading text-lg font-bold flex items-center gap-2">
      <Icon name="lucide:message-square" size="20" /> {{ $t('post.detail.discussion', { count: commentCount }) }}
    </h3>
    <div class="flex items-center gap-2 bg-border/20 p-1 rounded-md">
      <button v-for="s in sorts" :key="s" class="px-3 py-1 text-[11px] font-medium rounded-md capitalize transition-colors" :class="sortClass(s)" @click="sort = s">{{ $t(`post.detail.sort.${s}`) }}</button>
    </div>
  </div>
  <!-- Merge banner (inside discussion, per PRD) -->
  <MergeBanner v-if="merged && canonicalPost" :canonical-post="canonicalPost" />
  <ClientOnly v-if="!merged">
    <CommentEditor v-if="canOpenCommentBox" ref="editorRef" :loading="submitting" :can-notify="canNotify" @submit="(content: string, notify: boolean) => emit('submit', content, notify)" />
    <CommentLoginPrompt v-else />
  </ClientOnly>
</template>
