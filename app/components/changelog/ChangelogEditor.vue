<script setup lang="ts">
import { NormalToolbar } from 'md-editor-v3'
import '~/assets/css/md-editor-preview.css'
import { sanitizeAttachmentHtml, resolveAttachmentUrl } from '~/utils/attachment'
import { toast } from 'vue-sonner'
import { apiErrorMessage } from '../post/-post-logic'
import { changelogBody, hasTitleAndContent, toggleCategory, typeIcon, typeToggleClass } from './-changelog-logic'

const props = defineProps<{
  changelogId?: string
}>()

const emit = defineEmits<{
  saved: [changelog: ChangelogAdminDetail]
  deleted: []
}>()

const { onUploadImg } = useUploadImg()
const { confirm } = useConfirmDialog()
const { t } = useI18n()
const localePath = useLocalePath()

const categoryLabel = computed<Record<string, string>>(() => ({
  new: t('changelog.category.new'),
  improved: t('changelog.category.improved'),
  fixed: t('changelog.category.fixed'),
}))

const isCreateMode = computed(() => !props.changelogId)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const deleting = ref(false)

const localTitle = ref('')
const localContent = ref('')
const localCategories = ref<ChangelogCategory[]>([])
const localHasCover = ref(false)
const localCoverUrl = ref<string | null>(null)
const localStatus = ref<string>('draft')
const localSlug = ref<string | null>(null)
const localPublishedAt = ref<string | null>(null)

const showAiModal = ref(false)

// Snapshot for dirty detection (must be reactive so isDirty re-evaluates on snapshot change)
const snapshot = ref({ title: '', content: '', categories: '[]', cover: null as string | null })

function takeSnapshot() {
  snapshot.value = {
    title: localTitle.value,
    content: localContent.value,
    categories: JSON.stringify(localCategories.value),
    cover: localCoverUrl.value,
  }
}

const isDirty = computed(
  () =>
    localTitle.value !== snapshot.value.title ||
    localContent.value !== snapshot.value.content ||
    JSON.stringify(localCategories.value) !== snapshot.value.categories ||
    localCoverUrl.value !== snapshot.value.cover,
)

// Load existing changelog in edit mode
if (props.changelogId) {
  loading.value = true
  try {
    const data = await useApiFetch<ChangelogAdminDetail>(`/api/admin/changelogs/${props.changelogId}`)
    localTitle.value = data.title
    localContent.value = data.content
    localCategories.value = (data.categories ?? []) as ChangelogCategory[]
    localCoverUrl.value = data.cover
    localHasCover.value = !!data.cover
    localStatus.value = data.status
    localSlug.value = data.slug
    localPublishedAt.value = data.publishedAt
    takeSnapshot()
  } catch {
    toast.error(t('changelog.editor.loadFailed'))
  } finally {
    loading.value = false
  }
}

const coverUploading = ref(false)
// Blob URL for local preview while uploading
const coverPreviewBlob = ref<string | null>(null)

async function handleFileChange(file: File) {
  // Show local blob preview immediately
  coverPreviewBlob.value = URL.createObjectURL(file)
  localHasCover.value = true
  coverUploading.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)
    const result = await $fetch<{ key: string }>('/api/upload', {
      method: 'POST',
      body: formData,
    })
    // Store only the key (e.g. "uploads/img.png"), no prefix
    localCoverUrl.value = result.key
    coverPreviewBlob.value = null
  } catch {
    // Upload failed — revert
    localHasCover.value = false
    localCoverUrl.value = null
    coverPreviewBlob.value = null
  } finally {
    coverUploading.value = false
  }
}

function handleRemoveCover() {
  localHasCover.value = false
  localCoverUrl.value = null
}

// Blob preview during upload, otherwise resolve key to /api/files/ path
const coverPreviewUrl = computed(() => coverPreviewBlob.value ?? resolveAttachmentUrl(localCoverUrl.value))
const showCoverImage = computed(() => localHasCover.value && !!(localCoverUrl.value || coverPreviewBlob.value))

function toggleType(type: ChangelogCategory) {
  localCategories.value = toggleCategory(localCategories.value, type)
}

const draft = () => ({
  title: localTitle.value,
  content: localContent.value,
  categories: localCategories.value,
  cover: localCoverUrl.value,
})

/** Shows the given error unless both title and content are filled in. */
function requireTitleAndContent(errorKey: string) {
  if (hasTitleAndContent(draft())) return true
  toast.error(t(errorKey))
  return false
}

async function createChangelog() {
  const data = await useApiFetch<ChangelogAdminDetail>('/api/admin/changelogs', {
    method: 'POST',
    body: changelogBody(draft()),
  })
  takeSnapshot() // Clear dirty before navigation
  navigateTo(localePath(`/dashboard/changelog/${data.id}`))
}

async function updateChangelog() {
  const data = await useApiFetch<ChangelogAdminDetail>(`/api/admin/changelogs/${props.changelogId}`, {
    method: 'PATCH',
    body: changelogBody(draft()),
  })
  localStatus.value = data.status
  takeSnapshot()
  emit('saved', data)
}

async function handleSave() {
  if (!requireTitleAndContent('changelog.editor.titleContentRequired')) return
  saving.value = true

  try {
    await (isCreateMode.value ? createChangelog() : updateChangelog())
  } catch (e) {
    toast.error(apiErrorMessage(e, t('changelog.editor.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function publishChangelog() {
  // Save first
  if (!isCreateMode.value) {
    await useApiFetch(`/api/admin/changelogs/${props.changelogId}`, {
      method: 'PATCH',
      body: changelogBody(draft()),
    })
  }

  const data = await useApiFetch<ChangelogAdminDetail>(`/api/admin/changelogs/${props.changelogId}/publish`, {
    method: 'POST',
  })
  localStatus.value = data.status
  localSlug.value = data.slug
  localPublishedAt.value = data.publishedAt
  takeSnapshot()
  emit('saved', data)
  toast.success(t('changelog.editor.publishSuccess'))
}

async function handlePublish() {
  if (!requireTitleAndContent('changelog.editor.titleContentRequiredPublish')) return
  publishing.value = true

  try {
    await publishChangelog()
  } catch (e) {
    toast.error(apiErrorMessage(e, t('changelog.editor.publishFailed')))
  } finally {
    publishing.value = false
  }
}

async function handleDelete() {
  const ok = await confirm({
    title: t('changelog.editor.deleteTitle'),
    description: t('changelog.editor.deleteDescription'),
    confirmText: t('common.delete'),
    variant: 'destructive',
  })
  if (ok) await deleteChangelog()
}

async function deleteChangelog() {
  deleting.value = true

  try {
    await useApiFetch(`/api/admin/changelogs/${props.changelogId}`, { method: 'DELETE' })
    takeSnapshot() // Clear dirty state before navigation
    emit('deleted')
    navigateTo(localePath('/dashboard/changelog'))
  } catch (e) {
    toast.error(apiErrorMessage(e, t('changelog.editor.deleteFailed')))
  } finally {
    deleting.value = false
  }
}

// --- Unsaved changes guard ---

// Browser tab close / refresh
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
  }
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// In-app route navigation
const router = useRouter()
let removeGuard: (() => void) | null = null

onMounted(() => {
  removeGuard = router.beforeEach(async () => {
    if (!isDirty.value) return true
    const ok = await confirm({
      title: t('changelog.editor.unsavedTitle'),
      description: t('changelog.editor.unsavedDescription'),
      confirmText: t('changelog.editor.leave'),
      cancelText: t('changelog.editor.stay'),
      variant: 'destructive',
    })
    return ok
  })
})

onBeforeUnmount(() => removeGuard?.())

function handleAiApply(result: ChangelogAiResult) {
  localTitle.value = result.title
  localContent.value = result.content
  localCategories.value = result.categories as ChangelogCategory[]
  showAiModal.value = false
}
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-16">
    <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
  </div>

  <div v-else class="flex h-full min-h-0 flex-col bg-background">
    <!-- Header -->
    <ChangelogEditorHeader
      :create-mode="isCreateMode"
      :status="localStatus"
      :slug="localSlug"
      :saving="saving"
      :publishing="publishing"
      :deleting="deleting"
      :uploading="coverUploading"
      @save="handleSave"
      @publish="handlePublish"
      @delete="handleDelete"
    />

    <!-- Editor Container: left details col + right body col -->
    <div class="flex flex-1 flex-col min-h-0 overflow-y-auto bg-muted/10 lg:flex-row lg:overflow-hidden">

      <!-- Left: Details (scrollable) -->
      <div class="flex w-full shrink-0 flex-col gap-6 border-b border-border p-6 lg:w-[400px] lg:overflow-y-auto lg:border-b-0 lg:border-r xl:w-[460px]">
        <h2 class="shrink-0 text-xl font-bold text-foreground">{{ $t('changelog.editor.details') }}</h2>

        <!-- Featured Image -->
        <ChangelogCoverUpload
          :has-cover="localHasCover"
          :show-image="showCoverImage"
          :preview-url="coverPreviewUrl"
          :uploading="coverUploading"
          @pick="handleFileChange"
          @remove="handleRemoveCover"
        />

        <!-- Title & Types -->
        <section class="shrink-0 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div class="grid gap-6">
            <div>
              <label class="mb-2 block text-sm font-semibold text-foreground">{{ $t('changelog.editor.titleLabel') }}</label>
              <input
                v-model="localTitle"
                maxlength="70"
                :placeholder="$t('changelog.editor.titlePlaceholder')"
                class="h-10 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary/30"
              >
            </div>
            <div>
              <label class="mb-2 block text-sm font-semibold text-foreground">{{ $t('changelog.editor.types') }}</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="type in (['new', 'improved', 'fixed'] as ChangelogCategory[])"
                  :key="type"
                  class="inline-flex h-8 items-center gap-1.5 rounded-full border px-4 text-xs font-bold capitalize transition-colors"
                  :class="typeToggleClass(type, localCategories.includes(type))"
                  @click="toggleType(type)"
                >
                  <Icon :name="typeIcon(type)" size="12" />
                  {{ categoryLabel[type] ?? type }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Right: Body (fills height, editor stretches) -->
      <div class="flex min-h-[480px] min-w-0 flex-1 flex-col p-6 lg:min-h-0 lg:pb-6">
        <div class="mb-4 flex shrink-0 items-center justify-between">
          <h2 class="text-xl font-bold text-foreground">{{ $t('changelog.editor.content') }}</h2>
        </div>

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ClientOnly>
            <div class="editor-preview-styled min-h-0 flex-1 overflow-hidden [&_.md-editor]:rounded-lg [&_.md-editor]:border-transparent [&_.md-editor]:shadow-[0_0_0_1px_rgba(0,0,0,0.08)] dark:[&_.md-editor]:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
              <ThemedMdEditor
                v-model="localContent"
                language="en-US"
                :placeholder="$t('changelog.editor.contentPlaceholder')"
                :preview="false"
                :max-length="20000"
                :footers="['markdownTotal']"
                :toolbars="['bold', 'italic', 'strikeThrough', '-', 'title', 'unorderedList', 'orderedList', '-', 'link', 'image', 'code', 'codeRow', '-', 'previewOnly', '=', 0]"
                :sanitize="sanitizeAttachmentHtml"
                style="height: 100%"
                @on-upload-img="onUploadImg"
              >
                <template #defToolbars>
                  <NormalToolbar :title="$t('changelog.editor.aiWrite')" @on-click="showAiModal = true">
                    <template #trigger>
                      <div class="inline-flex h-7 items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 text-xs font-bold text-purple-600 transition-colors hover:bg-purple-100 dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-400">
                        <Icon name="lucide:wand-2" size="14" />
                        {{ $t('changelog.editor.aiWrite') }}
                      </div>
                    </template>
                  </NormalToolbar>
                </template>
              </ThemedMdEditor>
            </div>
          </ClientOnly>
        </div>
      </div>

    </div>
  </div>

  <!-- AI Modal -->
  <ChangelogAiModal
    :open="showAiModal"
    @apply="handleAiApply"
    @close="showAiModal = false"
  />
</template>
