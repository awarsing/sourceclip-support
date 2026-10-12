<script setup lang="ts">
defineProps<{ loading: boolean }>()

const email = defineModel<string>('email', { required: true })

const emit = defineEmits<{ submit: []; back: [] }>()
</script>

<template>
  <LoginStepHeader icon="lucide:key-round" :title="$t('auth.forgot.title')" :description="$t('auth.forgot.subtitle')" />
  <form class="space-y-4 pt-2" @submit.prevent="emit('submit')">
    <LoginEmailField id="forgot-email" v-model="email" />
    <FormSubmitButton :loading="loading">{{ $t('auth.forgot.submit') }}</FormSubmitButton>
  </form>
  <p class="text-center text-sm text-muted-foreground">
    <button class="text-primary hover:underline font-medium" @click="emit('back')">
      {{ $t('auth.backToSignIn') }}
    </button>
  </p>
</template>
