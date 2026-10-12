<script setup lang="ts">
import { toast } from 'vue-sonner'
import { hasCredentialAccount, newPasswordProblem, PASSWORD_MIN_LENGTH, passwordDialogCopy } from '~/lib/auth-forms'
import { apiErrorMessage, authErrorMessage } from '~/lib/form-errors'

const { changePassword, listAccounts } = useAuth()
const { t } = useI18n()

const open = defineModel<boolean>('open', { default: false })

const loading = ref(false)
const hasPassword = ref<boolean | null>(null) // null = loading
const copy = computed(() => passwordDialogCopy(hasPassword.value))

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// Detect if user has a credential account when dialog opens
watch(open, async (val) => {
  if (val) {
    resetForm()
    hasPassword.value = null
    try {
      const { data } = await listAccounts()
      hasPassword.value = hasCredentialAccount(data)
    } catch {
      hasPassword.value = false
    }
  }
})

function resetForm() {
  form.currentPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  showCurrentPassword.value = false
  showNewPassword.value = false
  showConfirmPassword.value = false
}

// Change password: requires the current password.
async function changeExistingPassword(): Promise<boolean> {
  const { error } = await changePassword({
    currentPassword: form.currentPassword,
    newPassword: form.newPassword,
    revokeOtherSessions: true,
  })
  if (error) toast.error(authErrorMessage(error, t, 'auth.errors.changeFailed'))
  return !error
}

// Set password: OAuth user, no current password.
async function setFirstPassword(): Promise<boolean> {
  try {
    await $fetch('/api/auth/set-password', {
      method: 'POST',
      body: { newPassword: form.newPassword },
    })
    return true
  } catch (e) {
    toast.error(apiErrorMessage(e, t('auth.errors.setFailed')))
    return false
  }
}

async function onSubmit() {
  const problem = newPasswordProblem(form.newPassword, form.confirmPassword)
  if (problem) {
    toast.error(t(problem))
    return
  }

  loading.value = true
  try {
    const saved = hasPassword.value ? await changeExistingPassword() : await setFirstPassword()
    if (!saved) return
    toast.success(t(copy.value.success))
    open.value = false
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle class="font-heading text-lg">
          {{ $t(copy.title) }}
        </DialogTitle>
        <DialogDescription>
          {{ $t(copy.subtitle) }}
        </DialogDescription>
      </DialogHeader>

      <!-- Loading state while detecting account type -->
      <div v-if="hasPassword === null" class="flex items-center justify-center py-8">
        <Spinner class="size-6" />
      </div>

      <form v-else class="space-y-4" @submit.prevent="onSubmit">
        <!-- Current password (only for users who already have one) -->
        <PasswordField
          v-if="hasPassword"
          id="current-password"
          v-model="form.currentPassword"
          v-model:visible="showCurrentPassword"
          :label="$t('auth.fields.current')"
        />
        <PasswordField
          id="new-password"
          v-model="form.newPassword"
          v-model:visible="showNewPassword"
          :label="$t('auth.fields.new')"
          :placeholder="$t('auth.passwordMinHint')"
          :minlength="PASSWORD_MIN_LENGTH"
        />
        <PasswordField
          id="confirm-password"
          v-model="form.confirmPassword"
          v-model:visible="showConfirmPassword"
          :label="$t('auth.fields.confirm')"
          :minlength="PASSWORD_MIN_LENGTH"
        />

        <FormSubmitButton :loading="loading">{{ $t(copy.submit) }}</FormSubmitButton>
        <p class="text-center">
          <button type="button" class="text-sm text-muted-foreground hover:text-foreground transition-colors" @click="open = false">
            {{ $t('common.cancel') }}
          </button>
        </p>
      </form>
    </DialogContent>
  </Dialog>
</template>
