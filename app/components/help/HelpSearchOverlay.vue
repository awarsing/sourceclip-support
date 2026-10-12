<script setup lang="ts">
import { searchFailure, type SearchOutcome } from './-help-logic'

interface SearchHit {
  shortId: string
  slug: string
  title: string
  titleRanges: [number, number][]
  excerpt: string
  excerptRanges: [number, number][]
  collection: { id: string; name: string }
}

const props = defineProps<{ query: string }>()

const hits = ref<SearchHit[]>([])
const total = ref(0)
const rateLimited = ref(false)
const loading = ref(false)

let timer: ReturnType<typeof setTimeout>
let seq = 0

watch(
  () => props.query,
  (value) => {
    clearTimeout(timer)
    loading.value = true
    const q = value.trim()
    timer = setTimeout(() => runSearch(q), 200)
  },
  { immediate: true },
)

async function runSearch(q: string) {
  const mine = ++seq
  const outcome = await searchHelp(q)
  if (mine !== seq) return
  hits.value = outcome.hits
  total.value = outcome.total
  rateLimited.value = outcome.rateLimited
  loading.value = false
}

async function searchHelp(q: string): Promise<SearchOutcome<SearchHit>> {
  try {
    const result = await $fetch<{ total: number; data: SearchHit[] }>('/api/help/search', { query: { q } })
    return { hits: result.data, total: result.total, rateLimited: false }
  } catch (e) {
    return searchFailure(e)
  }
}

const { t } = useI18n()
const emptyTitle = computed(() => (rateLimited.value ? t('help.portal.rateLimited') : t('help.portal.noMatch')))
const emptyHint = computed(() => (rateLimited.value ? t('help.portal.rateLimitedHint') : t('help.portal.noMatchHint')))
const hasMore = computed(() => total.value > hits.value.length)
</script>

<template>
  <div class="absolute inset-x-0 top-[60px] z-20 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_20px_rgba(196,90,70,.08)]">
    <template v-if="hits.length">
      <p class="border-b border-border px-[18px] py-2.5 text-[11px] font-bold uppercase tracking-[.05em] text-muted-foreground">
        {{ $t('help.portal.results', { n: total }, total) }}
      </p>
      <HelpSearchHit v-for="hit in hits" :key="hit.shortId" :hit="hit" />
      <p v-if="hasMore" class="px-[18px] pb-3 pt-2.5 text-center text-[11px] leading-4 text-muted-foreground">
        {{ $t('help.portal.more', { n: total - hits.length }) }}
      </p>
    </template>

    <div v-else-if="loading" class="flex justify-center px-[18px] py-7">
      <Icon name="lucide:loader-2" size="20" class="animate-spin text-muted-foreground" />
    </div>

    <div v-else class="px-[18px] py-7 text-center">
      <div class="text-sm font-semibold">{{ emptyTitle }}</div>
      <div class="mt-1 text-xs leading-[18px] text-muted-foreground">
        {{ emptyHint }}
      </div>
    </div>
  </div>
</template>
