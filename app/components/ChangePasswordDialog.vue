<script setup lang="ts">
import { toast } from 'vue-sonner'
import { PASSWORD_MIN_LENGTH, passwordProblem } from '~/lib/pages/password'

const { changePassword, listAccounts } = useAuth()
const { t } = useI18n()

const open = defineModel<boolean>('open', { default: false })

const loading = ref(false)
const hasPassword = ref<boolean | null>(null) // null = loading

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
      hasPassword.value = data?.some((acc: { providerId: string }) => acc.providerId === 'credential') ?? false
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

async function onSubmit() {
  const problem = passwordProblem(form.newPassword, form.confirmPassword)
  if (problem) {
    toast.error(t(problem))
    return
  }

  loading.value = true
  try {
    if (hasPassword.value) {
      // Change password: requires current password
      const { error } = await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        revokeOtherSessions: true,
      })
      if (error) {
        toast.error(error.message || t('auth.errors.changeFailed'))
        return
      }
    } else {
      // Set password: OAuth user, no current password
      try {
        await $fetch('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword: form.newPassword },
        })
      } catch (e: any) {
        toast.error(e.data?.message || t('auth.errors.setFailed'))
        return
      }
    }
    toast.success(hasPassword.value ? t('auth.success.passwordUpdated') : t('auth.success.passwordSet'))
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
          {{ hasPassword ? $t('auth.changePassword.title') : $t('auth.changePassword.setTitle') }}
        </DialogTitle>
        <DialogDescription>
          {{ hasPassword ? $t('auth.changePassword.subtitle') : $t('auth.changePassword.setSubtitle') }}
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

        <Button type="submit" class="w-full" size="lg" :disabled="loading">
          <Spinner v-if="loading" class="mr-2 size-4" />
          {{ hasPassword ? $t('auth.changePassword.submit') : $t('auth.changePassword.setTitle') }}
        </Button>
        <p class="text-center">
          <button type="button" class="text-sm text-muted-foreground hover:text-foreground transition-colors" @click="open = false">
            {{ $t('common.cancel') }}
          </button>
        </p>
      </form>
    </DialogContent>
  </Dialog>
</template>
