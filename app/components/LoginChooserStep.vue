<script setup lang="ts">
import type { LoginModalState } from '~/lib/auth-forms'

// First step of the sign-in modal: OAuth providers first, then email.
defineProps<{
  title: string
  subtitle: string
  google: boolean
  github: boolean
  emailEnabled: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  social: [provider: 'google' | 'github']
  switch: [target: LoginModalState]
}>()
</script>

<template>
  <LoginStepHeader :title="title" :description="subtitle" />

  <div v-if="google || github" class="space-y-2 pt-2">
    <Button
      v-if="google"
      class="w-full"
      variant="outline"
      size="lg"
      :disabled="loading"
      @click="emit('social', 'google')"
    >
      <Icon name="logos:google-icon" class="mr-2 size-5" />
      {{ $t('auth.signIn.google') }}
    </Button>
    <Button
      v-if="github"
      class="w-full"
      variant="outline"
      size="lg"
      :disabled="loading"
      @click="emit('social', 'github')"
    >
      <Icon name="mdi:github" class="mr-2 size-5" />
      {{ $t('auth.signIn.github') }}
    </Button>
  </div>

  <template v-if="emailEnabled">
    <div v-if="google || github" class="relative my-2">
      <Separator />
      <span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">{{ $t('auth.signIn.or') }}</span>
    </div>

    <Button
      class="w-full"
      variant="outline"
      size="lg"
      :disabled="loading"
      @click="emit('switch', 'sign-in-email')"
    >
      <Icon name="lucide:mail" class="mr-2 size-5" />
      {{ $t('auth.signIn.withEmail') }}
    </Button>

    <LoginSwitchPrompt :text="$t('auth.signIn.noAccount')" :action="$t('common.signUp')" @switch="emit('switch', 'sign-up-email')" />
  </template>
</template>
