<script setup lang="ts">
import type { SimilarPost } from '#layers/feedlog/server/utils/similar'

const props = defineProps<{
  postId: string
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  merge: [direction: 'bring' | 'push', targetPost: SimilarPost]
}>()

const similarPosts = ref<SimilarPost[]>([])
const loading = ref(false)
const expanded = ref(false)

async function fetchSimilar(limit = 3) {
  loading.value = true
  try {
    const { data } = await useApiFetch<{ data: SimilarPost[] }>(`/api/posts/${props.postId}/similar?limit=${limit}`)
    similarPosts.value = data
  } catch {
    similarPosts.value = []
  } finally {
    loading.value = false
  }
}

async function handleExpand() {
  expanded.value = true
  await fetchSimilar(10)
}

onMounted(() => fetchSimilar())

const showSkeleton = computed(() => loading.value && similarPosts.value.length === 0)
const showEmpty = computed(() => similarPosts.value.length === 0 && !loading.value)
const canExpand = computed(() => !expanded.value && similarPosts.value.length >= 3)
</script>

<template>
  <div class="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
    <h3 class="font-heading text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{{ $t('post.similar.panelTitle') }}</h3>

    <!-- Loading -->
    <div v-if="showSkeleton" class="space-y-3">
      <div v-for="i in 3" :key="i" class="animate-pulse space-y-1.5 py-3">
        <div class="h-3.5 bg-muted rounded w-3/4" />
        <div class="h-2.5 bg-muted rounded w-full" />
        <div class="flex gap-3 mt-1.5">
          <div class="h-2.5 bg-muted rounded w-8" />
          <div class="h-2.5 bg-muted rounded w-8" />
        </div>
      </div>
    </div>

    <!-- Empty -->
    <p v-else-if="showEmpty" class="text-xs text-muted-foreground py-2">
      {{ $t('post.similar.empty') }}
    </p>

    <!-- List -->
    <div v-else class="flex flex-col">
      <SimilarPostItem
        v-for="sp in similarPosts"
        :key="sp.id"
        :post="sp"
        :is-admin="isAdmin"
        @merge="emit('merge', $event, sp)"
      />
    </div>

    <!-- Expand link -->
    <div v-if="canExpand" class="flex justify-center pt-2">
      <button
        class="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary transition-colors py-1 group/link"
        @click="handleExpand"
      >
        {{ $t('post.similar.expandAll') }}
        <Icon name="lucide:chevron-right" size="16" class="group-hover/link:translate-x-0.5 transition-transform" />
      </button>
    </div>
  </div>
</template>
