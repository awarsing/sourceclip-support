<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '~/lib/auth-forms'

defineProps<{ loading: boolean }>()

const name = defineModel<string>('name', { required: true })
const email = defineModel<string>('email', { required: true })
const password = defineModel<string>('password', { required: true })
const showPassword = defineModel<boolean>('showPassword', { required: true })

const emit = defineEmits<{ submit: []; signIn: [] }>()
</script>

<template>
  <LoginStepHeader :title="$t('auth.signUp.title')" />
  <form class="space-y-4 pt-2" @submit.prevent="emit('submit')">
    <div class="space-y-2">
      <label class="text-sm font-medium" for="signup-name">{{ $t('common.name') }}</label>
      <Input
        id="signup-name"
        v-model="name"
        type="text"
        :placeholder="$t('auth.signUp.namePlaceholder')"
        required
      />
    </div>
    <LoginEmailField id="signup-email" v-model="email" />
    <div class="space-y-2">
      <label class="text-sm font-medium" for="signup-password">{{ $t('common.password') }}</label>
      <PasswordInput
        id="signup-password"
        v-model="password"
        v-model:visible="showPassword"
        :placeholder="$t('auth.passwordMinHint')"
        :minlength="PASSWORD_MIN_LENGTH"
      />
    </div>
    <FormSubmitButton :loading="loading">{{ $t('common.signUp') }}</FormSubmitButton>
  </form>

  <LoginSwitchPrompt :text="$t('auth.signUp.haveAccount')" :action="$t('common.signIn')" @switch="emit('signIn')" />
</template>
