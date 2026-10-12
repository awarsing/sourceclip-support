<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { HelpArticleStatus, HelpCollectionIcon } from '#layers/feedlog/shared/constants/help'
import '~/assets/css/help-article.css'
import { apiErrorMessage } from '../post/-post-logic'
import {
  articleContentBody,
  articleForm,
  articleSaveError,
  articleUrlPath,
  firstCollectionId,
  isArticleDirty,
  isHiddenFromReaders,
  needsLeaveConfirm,
  nextPublishStatus,
} from './-help-logic'

interface ArticleDetail {
  id: string
  shortId: string
  slug: string
  title: string
  description: string | null
  content: string
  aiEnabled: boolean
  status: HelpArticleStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  collection: { id: string; name: string; visible: boolean }
}

interface CollectionOption {
  id: string
  name: string
  icon: HelpCollectionIcon
  visible: boolean
}

const props = defineProps<{ articleId?: string; collectionId?: string }>()

const { t } = useI18n()
const { confirm } = useConfirmDialog()
const router = useRouter()
const localePath = useLocalePath()

const id = computed(() => props.articleId ?? '')
const isNew = computed(() => !props.articleId)

const { data: article, refresh } = await useFetch<ArticleDetail>(() => `/api/admin/help/articles/${id.value}`, {
  immediate: !isNew.value,
})

watch(isNew, (value) => {
  if (!value) refresh()
})
const { data: collectionsData } = await useFetch<{ data: CollectionOption[] }>('/api/admin/help/collections', {
  query: { flat: 1 },
})
const collections = computed(() => collectionsData.value?.data ?? [])

const form = reactive(articleForm(null))
const draftCollectionId = ref(props.collectionId ?? '')
const saving = ref(false)
const previewOpen = ref(false)
const leavingAfterWrite = ref(false)

function syncForm() {
  Object.assign(form, articleForm(article.value))
}
syncForm()
watch(() => article.value?.id, syncForm)

const dirty = computed(() => isArticleDirty(form, article.value))

const collection = computed(() =>
  isNew.value ? collections.value.find((c) => c.id === draftCollectionId.value) : article.value?.collection,
)
const hiddenWarning = computed(() => isHiddenFromReaders(article.value?.status, collection.value))
const articleUrl = computed(() => articleUrlPath(article.value))

watch(
  collections,
  (list) => {
    if (isNew.value && !draftCollectionId.value) draftCollectionId.value = firstCollectionId(list)
  },
  { immediate: true },
)

async function patch(body: Record<string, unknown>) {
  saving.value = true
  try {
    await $fetch(`/api/admin/help/articles/${id.value}`, { method: 'PATCH', body })
    await refresh()
    return true
  } catch (e) {
    toast.error(apiErrorMessage(e, t('help.admin.editor.saveFailed')))
    return false
  } finally {
    saving.value = false
  }
}

const contentBody = () => articleContentBody(form)

async function create(publish: boolean) {
  if (!draftCollectionId.value) {
    toast.error(t('help.admin.newArticleDisabledHint'))
    return
  }

  saving.value = true
  try {
    const created = await $fetch<{ id: string }>('/api/admin/help/articles', {
      method: 'POST',
      body: { collectionId: draftCollectionId.value, ...contentBody(), publish },
    })
    toast.success(t('help.admin.editor.saved'))
    leavingAfterWrite.value = true
    await router.replace(localePath(`/dashboard/help/${created.id}`))
  } catch (e) {
    toast.error(apiErrorMessage(e, t('help.admin.editor.saveFailed')))
  } finally {
    saving.value = false
  }
}

/** Shows the first blocking problem; true when the form can be saved. */
function validate(requireContent: boolean) {
  const problem = articleSaveError(form, requireContent)
  if (problem) toast.error(t(problem))
  return !problem
}

async function saveAndConfirm(body: Record<string, unknown>) {
  if (await patch(body)) toast.success(t('help.admin.editor.saved'))
}

async function saveDraft() {
  if (!validate(true)) return
  if (isNew.value) return create(false)
  await saveAndConfirm(contentBody())
}

async function confirmPublishing(publishing: boolean) {
  if (!publishing) return true
  return confirm({
    title: t('help.admin.publishTitle'),
    confirmText: t('help.admin.publish'),
    cancelText: t('common.cancel'),
  })
}

/** Validates and, when publishing, asks for confirmation; true to go ahead. */
async function readyToToggle(status: HelpArticleStatus | undefined) {
  const publishing = status !== 'published'
  return validate(publishing) && (await confirmPublishing(publishing))
}

async function togglePublish() {
  const status = article.value?.status
  if (!(await readyToToggle(status))) return
  if (isNew.value) return create(true)
  await saveAndConfirm({ ...contentBody(), status: nextPublishStatus(status) })
}

async function pickCollection(collectionId: string) {
  if (isNew.value) {
    draftCollectionId.value = collectionId
    return
  }
  if (collectionId === collection.value?.id) return

  await patch({ collectionId })
}

async function removeArticle() {
  if (!article.value) return

  const ok = await confirm({
    title: t('help.admin.editor.deleteTitle', { title: article.value.title }),
    description: t('help.admin.editor.deleteDescription'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  })
  if (ok) await deleteArticle()
}

async function deleteArticle() {
  saving.value = true
  try {
    await $fetch(`/api/admin/help/articles/${id.value}`, { method: 'DELETE' })
    toast.success(t('help.admin.editor.deleted'))
    leavingAfterWrite.value = true
    await router.push(localePath('/dashboard/help'))
  } catch (e) {
    toast.error(apiErrorMessage(e, t('help.admin.editor.deleteFailed')))
  } finally {
    saving.value = false
  }
}

onBeforeRouteLeave(async () => {
  const unsaved = needsLeaveConfirm({
    leavingAfterWrite: leavingAfterWrite.value,
    dirty: dirty.value,
    isNew: isNew.value,
    form,
  })
  if (!unsaved) return true
  return await confirm({
    title: t('help.admin.editor.leaveTitle'),
    description: t('help.admin.editor.leaveBody'),
    confirmText: t('help.admin.editor.leaveDiscard'),
    cancelText: t('help.admin.editor.leaveKeep'),
    variant: 'destructive',
  })
})

function goBack() {
  router.push(localePath('/dashboard/help'))
}
</script>

<template>
  <div v-if="article || isNew" class="flex h-full min-h-0 flex-col">
    <HelpArticleEditorHeader
      :article="article"
      :dirty="dirty"
      :saving="saving"
      @back="goBack"
      @delete="removeArticle"
      @preview="previewOpen = true"
      @save-draft="saveDraft"
      @toggle-publish="togglePublish"
    />

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <div class="min-w-0 flex-1 overflow-auto px-10 py-8">
        <div class="mx-auto max-w-[720px]">
          <div v-if="hiddenWarning" class="mb-[18px] flex gap-2 rounded-lg border border-[rgba(230,121,99,.25)] bg-[rgba(230,121,99,.08)] px-3 py-2.5">
            <span class="flex shrink-0 text-accent"><Icon name="lucide:circle-question-mark" size="15" /></span>
            <span class="text-xs leading-[17px]">{{ $t('help.admin.editor.hiddenWarning', { name: collection?.name }) }}</span>
          </div>

          <p class="mb-1.5 text-[11px] font-bold uppercase leading-[17px] tracking-[.05em] text-muted-foreground">{{ $t('help.admin.editor.title') }}</p>
          <input
            v-model="form.title"
            type="text"
            maxlength="200"
            class="w-full border-0 border-b border-border bg-transparent pb-3 text-[26px] font-bold leading-[34px]! tracking-[-.01em] outline-none"
            :placeholder="$t('help.admin.editor.titlePlaceholder')"
          >

          <p class="mb-1.5 mt-[22px] text-[11px] font-bold uppercase leading-[17px] tracking-[.05em] text-muted-foreground">{{ $t('help.admin.editor.description') }}</p>
          <textarea
            v-model="form.description"
            class="min-h-[44px] w-full resize-none border-0 border-b border-border bg-transparent pb-3 text-sm leading-[22px] outline-none"
            :placeholder="$t('help.admin.editor.descriptionPlaceholder')"
          />

          <p class="mb-2.5 mt-[22px] text-[11px] font-bold uppercase leading-[17px] tracking-[.05em] text-muted-foreground">{{ $t('help.admin.editor.body') }}</p>
          <ClientOnly>
            <ThemedMdEditor
              v-model="form.content"
              language="en-US"
              :placeholder="$t('help.admin.editor.bodyPlaceholder')"
              :preview="false"
              :max-length="50000"
              :footers="['markdownTotal']"
              :toolbars="['bold', 'italic', 'strikeThrough', '-', 'title', 'unorderedList', 'orderedList', '-', 'link', 'image', 'code', 'codeRow', '=', 0]"
              style="height: 520px"
            />
          </ClientOnly>
        </div>
      </div>

      <aside class="flex w-[300px] shrink-0 grow-0 basis-[300px] flex-col gap-[22px] overflow-auto border-l border-border bg-card px-5 py-6">
        <div>
          <p class="mb-1.5 text-[11px] font-bold uppercase leading-[17px] tracking-[.05em] text-muted-foreground">{{ $t('help.admin.editor.collection') }}</p>
          <HelpCollectionPicker :collections="collections" :current="collection" @pick="pickCollection" />
        </div>

        <div class="flex items-start gap-3 rounded-md border border-border bg-background px-3.5 py-3">
          <div class="min-w-0 flex-1">
            <label for="allow-ai" class="text-[13px] font-bold leading-[18px]">{{ $t('help.admin.aiUsage') }}</label>
            <p class="mt-0.5 text-xs leading-[17px] text-muted-foreground">{{ $t('help.admin.aiUsageHint') }}</p>
          </div>
          <Switch id="allow-ai" v-model="form.aiEnabled" />
        </div>

        <HelpArticleDetails :article="article" :is-new="isNew" :url="articleUrl" />
      </aside>
    </div>

    <HelpArticlePreview
      v-if="previewOpen"
      :title="form.title"
      :description="form.description"
      :content="form.content"
      @close="previewOpen = false"
    />
  </div>
</template>
