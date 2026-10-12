<script setup lang="ts">
import { toast } from 'vue-sonner'
import { resolveAttachmentUrl } from '~/utils/attachment'
import { prepareAvatar } from '~/utils/avatar'
import { AVATAR_ACCEPT, AvatarValidationError } from '#layers/feedlog/shared/utils/avatar'
import { profileFromSession, profileNameProblem } from '~/lib/auth-forms'
import { authErrorMessage } from '~/lib/form-errors'

const NAME_MAX = 50
const { updateUser } = useAuth()
const { data: session, refresh } = useAuthSession()
const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })
const loading = ref(false)
const processing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const name = ref('')
const image = ref<string | null>(null)
const previewError = ref(false)
const previewUrl = ref<string | null>(null)
let pendingAvatar: Blob | null = null
let selection = 0

const imageUrl = computed(() => previewUrl.value || resolveAttachmentUrl(image.value))
const initials = computed(() => (name.value.trim() || '?').slice(0, 2).toUpperCase())
const busy = computed(() => loading.value || processing.value)
const dialogOpen = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (!loading.value) open.value = value
  },
})

function clearSelection() {
  selection++
  processing.value = false
  pendingAvatar = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

watch(
  open,
  (value) => {
    clearSelection()
    if (value) {
      const profile = profileFromSession(session.value)
      name.value = profile.name
      image.value = profile.image
      previewError.value = false
    }
  },
  { immediate: true },
)
watch(imageUrl, () => {
  previewError.value = false
})
onBeforeUnmount(clearSelection)

function removeAvatar() {
  clearSelection()
  image.value = null
}

// Reads the picked file and clears the input so picking the same file again
// still fires a change. Nothing is taken while a save or another file is busy.
function takePickedFile(event: Event): File | undefined {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (fileInput.value) fileInput.value.value = ''
  return busy.value ? undefined : file
}

// Closing and reopening the dialog invalidates work from the previous selection.
function isCurrentSelection(currentSelection: number) {
  return currentSelection === selection && open.value
}

function showPreview(currentSelection: number, prepared: Blob) {
  if (!isCurrentSelection(currentSelection)) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  pendingAvatar = prepared
  previewUrl.value = URL.createObjectURL(prepared)
}

async function onFileChange(event: Event) {
  const file = takePickedFile(event)
  if (!file) return
  const currentSelection = ++selection
  processing.value = true
  try {
    showPreview(currentSelection, await prepareAvatar(file))
  } catch (error) {
    reportAvatarError(currentSelection, error)
  } finally {
    if (currentSelection === selection) processing.value = false
  }
}

function reportAvatarError(currentSelection: number, error: unknown) {
  if (!isCurrentSelection(currentSelection)) return
  toast.error(t(`auth.profile.${error instanceof AvatarValidationError ? error.code : 'invalidImage'}`))
}

// The trimmed name when the form can be submitted; otherwise null, with a toast
// when the name itself is the problem.
function submittableName(): string | null {
  if (busy.value) return null
  const trimmed = name.value.trim()
  const problem = profileNameProblem(trimmed, NAME_MAX)
  if (problem) toast.error(t(problem))
  return problem ? null : trimmed
}

// Uploads the picked avatar, if any. False when the upload failed.
async function uploadPendingAvatar(): Promise<boolean> {
  if (!pendingAvatar) return true
  try {
    const result = await $fetch<{ key: string }>('/api/profile/avatar', {
      method: 'POST',
      body: pendingAvatar,
    })
    image.value = resolveAttachmentUrl(result.key)
    clearSelection()
    return true
  } catch {
    toast.error(t('auth.profile.uploadFailed'))
    return false
  }
}

async function saveProfile(trimmed: string) {
  const { error } = await updateUser({ name: trimmed, image: image.value ?? '' })
  if (error) {
    toast.error(authErrorMessage(error, t, 'auth.profile.saveFailed'))
    return
  }
  await refresh()
  toast.success(t('auth.success.profileUpdated'))
  open.value = false
}

async function onSubmit() {
  const trimmed = submittableName()
  if (!trimmed) return

  loading.value = true
  try {
    if (await uploadPendingAvatar()) await saveProfile(trimmed)
  } catch {
    toast.error(t('auth.profile.saveFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="sm:max-w-sm" :show-close-button="!loading">
      <DialogHeader>
        <DialogTitle class="font-heading text-lg">
          {{ $t('auth.profile.title') }}
        </DialogTitle>
        <DialogDescription>
          {{ $t('auth.profile.subtitle') }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-5" @submit.prevent="onSubmit">
        <div class="flex flex-col items-center gap-3">
          <input
            ref="fileInput"
            type="file"
            :accept="AVATAR_ACCEPT"
            class="hidden"
            :disabled="busy"
            @change="onFileChange"
          >
          <button
            type="button"
            class="group relative w-28 h-28 rounded-full border border-border bg-card overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            :disabled="busy"
            :aria-label="$t('auth.profile.changeAvatar')"
            @click="fileInput?.click()"
          >
            <img
              v-if="imageUrl && !previewError"
              :src="imageUrl"
              :alt="name.trim() || initials"
              class="aspect-square size-full object-cover"
              referrerpolicy="no-referrer"
              @error="previewError = true"
            >
            <span v-else class="flex size-full items-center justify-center bg-accent text-accent-foreground text-lg font-bold">
              {{ initials }}
            </span>
            <span
              class="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white transition-colors group-hover:bg-black/70 group-focus-visible:bg-black/70"
              aria-hidden="true"
            >
              <Icon :name="processing ? 'lucide:loader-2' : 'lucide:camera'" size="22" :class="{ 'animate-spin': processing }" />
            </span>
          </button>
          <button
            v-if="imageUrl"
            type="button"
            class="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
            :disabled="busy"
            @click="removeAvatar"
          >
            {{ $t('auth.profile.removeAvatar') }}
          </button>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium" for="profile-name">{{ $t('auth.profile.name') }}</label>
          <Input
            id="profile-name"
            v-model="name"
            :maxlength="NAME_MAX"
            :disabled="busy"
            :placeholder="$t('auth.profile.namePlaceholder')"
            required
            autocomplete="nickname"
          />
        </div>

        <Button type="submit" class="w-full" size="lg" :disabled="busy">
          <Spinner v-if="loading" class="mr-2 size-4" />
          {{ $t('auth.profile.submit') }}
        </Button>
        <p class="text-center">
          <button type="button" class="text-sm text-muted-foreground hover:text-foreground transition-colors" :disabled="loading" @click="dialogOpen = false">
            {{ $t('common.cancel') }}
          </button>
        </p>
      </form>
    </DialogContent>
  </Dialog>
</template>
