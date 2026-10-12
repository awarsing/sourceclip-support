<script setup lang="ts">
import { toast } from 'vue-sonner'
import { newPasswordProblem, PASSWORD_MIN_LENGTH } from '~/lib/auth-forms'

const { resetPassword } = useAuth()
const { t } = useI18n()
useHead({ title: () => t('auth.resetPage.title') })
const route = useRoute()
const localePath = useLocalePath()

const token = computed(() => route.query.token as string | undefined)
const error = computed(() => route.query.error as string | undefined)

const form = reactive({
  newPassword: '',
  confirmPassword: '',
})

const loading = ref(false)
const success = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

function reportResetError(error: { message?: string }) {
  toast.error(error.message || t('auth.errors.resetFailed'))
}

async function onSubmit() {
  if (!token.value) return
  const problem = newPasswordProblem(form.newPassword, form.confirmPassword)
  if (problem) {
    toast.error(t(problem))
    return
  }

  loading.value = true
  try {
    const { error: resetError } = await resetPassword({
      newPassword: form.newPassword,
      token: token.value,
    })
    if (resetError) reportResetError(resetError)
    else success.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[60vh] w-full items-center justify-center px-4">
    <Card class="w-full max-w-sm shadow-warm">
      <!-- Success state -->
      <template v-if="success">
        <CardHeader class="text-center space-y-2">
          <div class="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Icon name="lucide:check" size="24" class="text-green-600 dark:text-green-400" />
          </div>
          <CardTitle class="font-heading text-xl">{{ $t('auth.resetPage.successTitle') }}</CardTitle>
          <CardDescription>{{ $t('auth.resetPage.successBody') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button class="w-full" size="lg" @click="navigateTo(localePath('/'))">
            {{ $t('common.goHome') }}
          </Button>
        </CardContent>
      </template>

      <!-- Error state (invalid/expired token) -->
      <template v-else-if="error || !token">
        <CardHeader class="text-center space-y-2">
          <div class="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <Icon name="lucide:alert-circle" size="24" class="text-destructive" />
          </div>
          <CardTitle class="font-heading text-xl">{{ $t('auth.resetPage.expiredTitle') }}</CardTitle>
          <CardDescription>
            {{ $t('auth.resetPage.expiredBody') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button class="w-full" size="lg" @click="navigateTo(localePath('/'))">
            {{ $t('common.goHome') }}
          </Button>
        </CardContent>
      </template>

      <!-- Reset form -->
      <template v-else>
        <CardHeader class="text-center space-y-2">
          <div class="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:key-round" size="24" class="text-primary" />
          </div>
          <CardTitle class="font-heading text-xl">{{ $t('auth.resetPage.title') }}</CardTitle>
          <CardDescription>{{ $t('auth.resetPage.subtitle') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-4" @submit.prevent="onSubmit">
            <PasswordField
              id="reset-new-password"
              v-model="form.newPassword"
              v-model:visible="showNewPassword"
              :label="$t('auth.fields.new')"
              :placeholder="$t('auth.passwordMinHint')"
              :minlength="PASSWORD_MIN_LENGTH"
            />
            <PasswordField
              id="reset-confirm-password"
              v-model="form.confirmPassword"
              v-model:visible="showConfirmPassword"
              :label="$t('auth.fields.confirm')"
              :minlength="PASSWORD_MIN_LENGTH"
            />
            <Button type="submit" class="w-full" size="lg" :disabled="loading">
              <Spinner v-if="loading" class="mr-2 size-4" />
              {{ $t('auth.resetPage.submit') }}
            </Button>
          </form>
          <p class="text-center text-sm text-muted-foreground mt-4">
            <NuxtLink :to="localePath('/')" class="text-primary hover:underline font-medium">
              {{ $t('auth.resetPage.backHome') }}
            </NuxtLink>
          </p>
        </CardContent>
      </template>
    </Card>
  </div>
</template>
