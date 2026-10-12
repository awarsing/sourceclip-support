<script setup lang="ts">
import type { SimilarPost } from '#layers/feedlog/server/utils/similar'
import { apiErrorMessage } from '~/lib/form-errors'
import { mergeBody } from './-post-logic'

const props = defineProps<{
  postId: string
  postTitle: string
  direction: 'bring' | 'push'
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ merged: [] }>()
const { t } = useI18n()

const searchQuery = ref('')
const results = ref<SimilarPost[]>([])
const loading = ref(false)
const selectedId = ref<string | null>(null)
const merging = ref(false)
const error = ref('')

const debounceTimer = ref<ReturnType<typeof setTimeout>>()

async function fetchDefault() {
  loading.value = true
  try {
    const { data } = await useApiFetch<{ data: SimilarPost[] }>(`/api/posts/${props.postId}/similar?limit=10`)
    results.value = data
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

async function searchByText(query: string) {
  loading.value = true
  try {
    const { data } = await useApiFetch<{ data: SimilarPost[] }>('/api/posts/similar', {
      method: 'POST',
      body: { title: query },
    })
    results.value = data
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

watch(searchQuery, (val) => {
  clearTimeout(debounceTimer.value)
  selectedId.value = null
  if (!val.trim()) {
    fetchDefault()
    return
  }
  debounceTimer.value = setTimeout(() => searchByText(val.trim()), 500)
})

watch(open, (v) => {
  if (v) {
    searchQuery.value = ''
    selectedId.value = null
    error.value = ''
    fetchDefault()
  }
})

async function handleMerge() {
  if (!selectedId.value) return
  merging.value = true
  error.value = ''

  const body = mergeBody(props.direction, props.postId, selectedId.value)

  try {
    await useApiFetch('/api/admin/posts/merge', { method: 'POST', body })
    open.value = false
    emit('merged')
  } catch (e) {
    error.value = apiErrorMessage(e, t('post.merge.failed'))
  } finally {
    merging.value = false
  }
}

function toggleSelected(id: string) {
  selectedId.value = selectedId.value === id ? null : id
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      :show-close-button="false"
      class="!max-w-[800px] !max-h-[calc(100vh-4rem)] !p-0 !gap-0 flex flex-col overflow-hidden border border-border bg-card !rounded-[24px] shadow-warm"
    >
      <!-- Header -->
      <div class="px-8 pt-8 pb-6 shrink-0">
        <div class="flex items-start justify-between mb-1">
          <div class="flex flex-col gap-1">
            <DialogTitle class="text-[26px] font-bold font-heading leading-tight tracking-tight">{{ $t('post.merge.dialogTitle') }}</DialogTitle>
            <p class="text-[14px] text-muted-foreground">{{ $t('post.merge.dialogSubtitle') }}</p>
          </div>
          <DialogClose class="text-muted-foreground hover:text-foreground transition-colors p-2 -mr-2 -mt-1">
            <Icon name="lucide:x" size="24" />
          </DialogClose>
        </div>
      </div>

      <!-- Search -->
      <div class="px-8 flex flex-col gap-4 mb-6 shrink-0">
        <div class="relative group">
          <Icon name="lucide:search" size="20" class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
          <Input
            v-model="searchQuery"
            class="pl-12 pr-12 py-3 h-auto bg-background/50 border-border rounded-xl text-[15px] focus-visible:ring-2 focus-visible:ring-primary/10 focus-visible:border-primary"
            :placeholder="$t('post.merge.searchPlaceholder')"
          />
        </div>
      </div>

      <!-- Results -->
      <div class="flex-1 overflow-y-auto px-6 min-h-0">
        <div v-if="loading" class="flex flex-col items-center py-12">
          <Spinner class="w-5 h-5 mb-2" />
          <p class="text-sm text-muted-foreground">{{ $t('post.merge.searching') }}</p>
        </div>
        <div v-else-if="results.length === 0" class="flex flex-col items-center py-12 text-sm text-muted-foreground">
          {{ $t('post.merge.noResults') }}
        </div>
        <div v-else class="flex flex-col pb-4">
          <MergeResultRow v-for="r in results" :key="r.id" :post="r" :selected="selectedId === r.id" @toggle="toggleSelected(r.id)" />
        </div>
      </div>

      <!-- Footer -->
      <div class="px-8 py-6 border-t border-border bg-card/50 shrink-0">
        <div class="flex items-center justify-between">
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          <span v-else />
          <div class="flex items-center gap-3">
            <button
              class="px-8 py-2.5 text-[14px] font-bold text-muted-foreground border border-border hover:bg-background transition-all rounded-xl"
              @click="open = false"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              class="px-8 py-2.5 bg-primary text-primary-foreground text-[14px] font-bold font-heading rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!selectedId || merging"
              @click="handleMerge"
            >
              {{ merging ? $t('post.merge.merging') : $t('post.merge.action') }}
            </button>
          </div>
        </div>
      </div>

      <DialogDescription class="sr-only">{{ $t('post.merge.dialogDescription') }}</DialogDescription>
    </DialogContent>
  </Dialog>
</template>
