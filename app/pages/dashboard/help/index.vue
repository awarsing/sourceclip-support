<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { HelpCollectionFormValue } from '#layers/feedlog/app/components/help/HelpCollectionDialog.vue'
import type { HelpArticleStatus } from '#layers/feedlog/shared/constants/help'
import {
  type AdminCollection,
  type BulkAction,
  bulkBody,
  bulkResultMessage,
  hasNoContent,
  shownRange,
  toggleCollectionArticles,
  toggledSet,
  withoutId,
} from '~/lib/pages/help'

definePageMeta({ layout: 'dashboard', middleware: 'admin' })

interface FlatArticle {
  id: string
  shortId: string
  slug: string
  title: string
  aiEnabled: boolean
  status: HelpArticleStatus
  position: number
  updatedAt: string
  collection: { id: string; name: string; visible: boolean }
}

const PAGE_SIZE = 10

const { t } = useI18n()
const { confirm } = useConfirmDialog()
const localePath = useLocalePath()
const router = useRouter()

const view = ref<'collections' | 'articles'>('collections')
const search = ref('')
const debouncedSearch = ref('')
const page = ref(1)
const expanded = ref(new Set<string>())
const selected = ref(new Set<string>())
const dialogOpen = ref(false)
const editing = ref<HelpCollectionFormValue | null>(null)

let searchTimer: ReturnType<typeof setTimeout>
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value.trim()
    page.value = 1
    selected.value = new Set()
  }, 300)
})

watch(view, () => {
  page.value = 1
  selected.value = new Set()
})

watch(page, () => {
  selected.value = new Set()
})

const flat = computed(() => view.value === 'articles' || !!debouncedSearch.value)
const selecting = computed(() => selected.value.size > 0)

const { data: stats, refresh: refreshStats } = await useFetch<{ collectionCount: number; articleCount: number }>(
  '/api/admin/help/stats',
)

const { data: collectionsData, refresh: refreshCollections } = await useFetch<{
  data: AdminCollection[]
}>('/api/admin/help/collections', {
  immediate: true,
  deep: true,
})

const { data: articlesData, refresh: refreshArticles } = await useFetch<{
  data: FlatArticle[]
  pagination: { total: number }
}>('/api/admin/help/articles', {
  query: computed(() => ({ page: page.value, pageSize: PAGE_SIZE, q: debouncedSearch.value || undefined })),
})

const collections = computed(() => collectionsData.value?.data ?? [])
const articles = computed(() => articlesData.value?.data ?? [])

const total = computed(() => (flat.value ? (articlesData.value?.pagination.total ?? 0) : collections.value.length))
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const isEmpty = computed(() => hasNoContent(stats.value))

const draggableCollections = computed({
  get: () => collections.value,
  set: (value) => {
    if (collectionsData.value) collectionsData.value.data = value
  },
})

async function refreshAll() {
  await Promise.all([refreshStats(), refreshCollections(), refreshArticles()])
}

function toggleExpanded(id: string) {
  expanded.value = toggledSet(expanded.value, id)
}

function toggleSelected(id: string) {
  selected.value = toggledSet(selected.value, id)
}

function toggleCollectionSelection(collection: AdminCollection) {
  const result = toggleCollectionArticles(
    collection.articles.map((a) => a.id),
    selected.value,
  )
  selected.value = result.selected
  if (result.expand && !expanded.value.has(collection.id)) toggleExpanded(collection.id)
}

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(collection: AdminCollection) {
  editing.value = {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    icon: collection.icon,
    visible: collection.visible,
    articleCount: collection.articleCount,
  }
  dialogOpen.value = true
}

function createArticle() {
  const collectionId = collections.value[0]?.id
  if (!collectionId) return
  return router.push({ path: localePath('/dashboard/help/new'), query: { collection: collectionId } })
}

function onCollectionDragStart(event: { oldIndex?: number }) {
  const dragged = collections.value[event.oldIndex ?? -1]
  if (dragged) expanded.value = withoutId(expanded.value, dragged.id)
}

async function reorder(url: string, body: Record<string, unknown>) {
  try {
    await $fetch(url, { method: 'PATCH', body })
  } catch {
    toast.error(t('help.admin.reorderFailed'))
    await refreshAll()
  }
}

function onCollectionsDragEnd() {
  return reorder('/api/admin/help/collections/reorder', { ids: collections.value.map((c) => c.id) })
}

function onArticlesDragEnd(collection: AdminCollection) {
  return reorder('/api/admin/help/articles/reorder', {
    collectionId: collection.id,
    ids: collection.articles.map((a) => a.id),
  })
}

// Publishing many articles at once asks first; the other bulk actions run straight away.
async function bulkConfirmed(action: BulkAction, count: number) {
  if (action !== 'publish') return true
  return confirm({
    title: t('help.admin.bulkPublishTitle', { n: count }, count),
    confirmText: t('help.admin.publish'),
    cancelText: t('common.cancel'),
  })
}

function bulkToast(action: BulkAction, affected: number) {
  const message = bulkResultMessage(action, affected)
  return message.n === undefined ? t(message.key) : t(message.key, { n: message.n }, message.n)
}

async function runBulk(action: BulkAction, aiEnabled?: boolean) {
  const ids = [...selected.value]
  if (!ids.length || !(await bulkConfirmed(action, ids.length))) return
  try {
    const result = await $fetch<{ affected: number }>(`/api/admin/help/articles/bulk-${action}`, {
      method: 'POST',
      body: bulkBody(ids, aiEnabled),
    })
    selected.value = new Set()
    await refreshAll()
    toast.success(bulkToast(action, result.affected))
  } catch {
    toast.error(t('help.admin.bulkFailed'))
  }
}

const range = computed(() => shownRange(page.value, PAGE_SIZE, total.value))
const pageNumbers = computed(() => Array.from({ length: pageCount.value }, (_, i) => i + 1))
const rangeSummary = computed(() =>
  t('help.admin.showing', { from: range.value.from, to: range.value.to, total: total.value }),
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <HelpAdminHeader :stats="stats" :empty="isEmpty" @new-collection="openCreate" @new-article="createArticle" />

    <HelpAdminToolbar
      v-if="!isEmpty"
      v-model:view="view"
      v-model:search="search"
      :selected-count="selected.size"
      @clear="selected = new Set()"
      @bulk="runBulk"
    />

    <HelpAdminEmptyState v-if="isEmpty" @create="openCreate" />

    <template v-else>
      <div class="min-h-0 flex-1 overflow-auto bg-card">
        <template v-if="flat">
          <p v-if="!articles.length" class="px-6 py-14 text-center text-[13px] text-muted-foreground">
            {{ $t('help.admin.noMatch') }}
          </p>
          <HelpAdminArticleRow
            v-for="article in articles"
            :key="article.id"
            :article="article"
            :selected="selected.has(article.id)"
            :selecting="selecting"
            @toggle="toggleSelected(article.id)"
          />
        </template>

        <ClientOnly v-else>
          <HelpAdminCollectionTree
            v-model:collections="draggableCollections"
            :expanded="expanded"
            :selected="selected"
            @drag-start="onCollectionDragStart"
            @reorder-collections="onCollectionsDragEnd"
            @reorder-articles="onArticlesDragEnd"
            @toggle-expanded="toggleExpanded"
            @toggle-collection="toggleCollectionSelection"
            @toggle-article="toggleSelected"
            @edit="openEdit"
          />
        </ClientOnly>
      </div>

      <DashboardPagination
        v-if="flat"
        v-model:page="page"
        :pages="pageNumbers"
        :page-count="pageCount"
        :summary="rangeSummary"
        :short-summary="rangeSummary"
      />
    </template>

    <HelpCollectionDialog v-model:open="dialogOpen" :collection="editing" @saved="refreshAll" @deleted="refreshAll" />
  </div>
</template>
