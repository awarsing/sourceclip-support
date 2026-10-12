<script setup lang="ts">
import { toast } from 'vue-sonner'
import { activeHeading, createAnchorIds } from '~/lib/pages/help-article'
import '~/assets/css/help-article.css'

interface ArticlePage {
  shortId: string
  canonicalSlug: string
  title: string
  description: string | null
  content: string
  publishedAt: string | null
  updatedAt: string
  collection: { id: string; name: string }
  siblings: { shortId: string; slug: string; title: string; description: string | null }[]
}

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()

const segment = String(route.params.slug ?? '')
const shortId = segment.split('-')[0] ?? ''

if (!usePortalOrg().value.modules.helpCenter) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
}

const { data, error } = await useFetch<ArticlePage>(`/api/help/articles/${shortId}`)

if (import.meta.server && error.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

const article = computed(() => data.value)

if (article.value && segment !== `${article.value.shortId}-${article.value.canonicalSlug}`) {
  await navigateTo(localePath(`/help/${article.value.shortId}-${article.value.canonicalSlug}`), {
    redirectCode: 301,
    replace: true,
  })
}

const editorId = 'help-article-preview'

const anchorId = createAnchorIds()

const formatDate = useFormatDate()

const bodyRoot = ref<HTMLElement | null>(null)
const toc = ref<{ id: string; text: string; level: number }[]>([])
const activeId = ref('')
let headingEls: HTMLElement[] = []
let syncQueued = false
let navLock = false
let navLockTimer: ReturnType<typeof setTimeout>

const TOC_GAP = 24

function scrollOffset() {
  return (document.querySelector('header')?.getBoundingClientRect().height ?? 0) + TOC_GAP
}

function readHeadings() {
  headingEls = [...(bodyRoot.value?.querySelectorAll<HTMLElement>('h2[id], h3[id]') ?? [])]
  toc.value = headingEls.map((node) => ({
    id: node.id,
    text: node.textContent?.replace(/#$/, '').trim() ?? '',
    level: Number(node.tagName[1]),
  }))
  syncActive()
}

function releaseNavLock() {
  navLock = false
  clearTimeout(navLockTimer)
}

function syncActive() {
  if (navLock) return

  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
  const headings = headingEls.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top }))
  activeId.value = activeHeading(headings, scrollOffset(), atBottom)
}

function queueSync() {
  if (syncQueued) return
  syncQueued = true
  requestAnimationFrame(() => {
    syncQueued = false
    syncActive()
  })
}

function goToHeading(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - scrollOffset()
  navLock = true
  clearTimeout(navLockTimer)
  navLockTimer = setTimeout(releaseNavLock, 2500)
  window.scrollTo({ top, behavior: 'smooth' })
  activeId.value = id
}

function mountAnchors() {
  for (const heading of bodyRoot.value?.querySelectorAll<HTMLElement>('h2[id], h3[id]') ?? []) {
    if (heading.querySelector('[data-anchor]')) continue
    const mark = document.createElement('span')
    mark.dataset.anchor = ''
    mark.textContent = '#'
    mark.className = 'ml-2 cursor-pointer font-normal text-muted-foreground opacity-0 group-hover/h:opacity-100'
    heading.classList.add('group/h')
    mark.addEventListener('click', async () => {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${heading.id}`)
      toast.success(t('help.admin.editor.copied'))
    })
    heading.append(mark)
  }
  readHeadings()
}

onMounted(() => {
  nextTick(mountAnchors)
  window.addEventListener('scroll', queueSync, { passive: true })
  window.addEventListener('scrollend', releaseNavLock)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', queueSync)
  window.removeEventListener('scrollend', releaseNavLock)
  clearTimeout(navLockTimer)
})
watch(
  () => article.value?.content,
  () => nextTick(mountAnchors),
)

usePageOg({
  kind: 'helpArticle',
  title: () => article.value?.title,
  description: () => article.value?.description,
  content: () => article.value?.content,
  publishedAt: () => article.value?.publishedAt ?? undefined,
})
useRobotsRule(computed(() => (article.value ? 'index, follow' : 'noindex')))
</script>

<template>
  <div class="flex-1">
    <div v-if="article" class="mx-auto max-w-[1080px] px-6 pb-16 pt-12">
      <div class="grid items-start gap-10 lg:[grid-template-columns:minmax(0,720px)_280px]">
        <div>
          <div class="mb-[18px] flex flex-wrap items-center gap-2 text-[13px] leading-[18px]">
            <NuxtLink :to="localePath('/help')" class="font-semibold text-muted-foreground hover:text-foreground">{{ $t('help.portal.back') }}</NuxtLink>
            <Icon name="lucide:chevron-right" size="13" class="text-muted-foreground" />
            <NuxtLink :to="localePath(`/help/c/${article.collection.id}`)" class="max-w-[280px] truncate font-semibold text-muted-foreground hover:text-foreground">{{ article.collection.name }}</NuxtLink>
            <Icon name="lucide:chevron-right" size="13" class="text-muted-foreground" />
            <span class="max-w-[280px] truncate font-semibold">{{ article.title }}</span>
          </div>

          <h1 class="mb-2.5 text-[30px] font-bold leading-[38px]! tracking-[-.02em]">{{ article.title }}</h1>
          <p v-if="article.description" class="mb-5 text-base leading-[26px] text-muted-foreground">{{ article.description }}</p>
          <div class="mb-[22px] text-sm leading-[21px] text-muted-foreground">
            {{ $t('help.portal.lastUpdated') }} <b>{{ formatDate(article.updatedAt) }}</b>
          </div>
          <hr class="mb-6 border-border">

          <div ref="bodyRoot" class="help-article-styled">
            <ThemedMdPreview :editor-id="editorId" :model-value="article.content" :md-heading-id="anchorId" />
          </div>

          <HelpArticleSiblings :collection-name="article.collection.name" :siblings="article.siblings" />
        </div>

        <HelpArticleToc :items="toc" :active-id="activeId" @go="goToHeading" />
      </div>
    </div>

    <div v-else class="mx-auto max-w-[768px] px-6 pb-16 pt-12">
      <NuxtLink :to="localePath('/help')" class="mb-4 inline-flex items-center gap-2 text-xs font-bold">
        <Icon name="lucide:arrow-left" size="16" />
        {{ $t('help.portal.back') }}
      </NuxtLink>
      <div class="px-6 py-16 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground">
          <Icon name="lucide:file-text" size="26" />
        </div>
        <p class="text-xl font-bold leading-7">{{ $t('help.portal.notFoundTitle') }}</p>
        <p class="mt-2 text-sm leading-[22px] text-muted-foreground">{{ $t('help.portal.notFoundHint') }}</p>
        <NuxtLink :to="localePath('/help')" class="mt-[22px] inline-flex h-9 items-center rounded-2xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90">
          {{ $t('help.portal.backToHelp') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
