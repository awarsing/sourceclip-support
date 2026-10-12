<script setup lang="ts">
import type { LoginModalState } from '~/lib/auth-forms'

defineProps<{
  title: string
  description: string
  hasOAuth: boolean
  loading: boolean
}>()

const email = defineModel<string>('email', { required: true })
const password = defineModel<string>('password', { required: true })
const showPassword = defineModel<boolean>('showPassword', { required: true })

const emit = defineEmits<{
  submit: []
  switch: [target: LoginModalState]
}>()
</script>

<template>
  <LoginStepHeader :title="title" :description="description" />
  <form class="space-y-4 pt-2" @submit.prevent="emit('submit')">
    <LoginEmailField id="signin-email" v-model="email" />
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium" for="signin-password">{{ $t('common.password') }}</label>
        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-primary transition-colors"
          @click="emit('switch', 'forgot-password')"
        >
          {{ $t('auth.forgot.title') }}
        </button>
      </div>
      <PasswordInput
        id="signin-password"
        v-model="password"
        v-model:visible="showPassword"
        :placeholder="$t('auth.signInEmail.passwordPlaceholder')"
      />
    </div>
    <FormSubmitButton :loading="loading">{{ $t('common.signIn') }}</FormSubmitButton>
  </form>

  <button
    v-if="hasOAuth"
    class="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
    @click="emit('switch', 'sign-in')"
  >
    <Icon name="lucide:arrow-left" size="14" />
    {{ $t('auth.signIn.otherOptions') }}
  </button>

  <LoginSwitchPrompt :text="$t('auth.signIn.noAccount')" :action="$t('common.signUp')" @switch="emit('switch', 'sign-up-email')" />
</template>
