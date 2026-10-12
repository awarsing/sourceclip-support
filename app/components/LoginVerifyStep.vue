<script setup lang="ts">
const props = defineProps<{
  email: string
  loading: boolean
  resendCooldown: number
}>()

const emit = defineEmits<{ verified: []; resend: [] }>()

const coolingDown = computed(() => props.resendCooldown > 0)
const resendLabel = computed(() => (coolingDown.value ? ` (${props.resendCooldown}s)` : ''))
</script>

<template>
  <LoginStepHeader icon="lucide:mail" :title="$t('auth.checkEmail')">
    {{ $t('auth.verifyEmail.sentTo') }}
    <span class="font-medium text-foreground">{{ email }}</span>
  </LoginStepHeader>
  <div class="space-y-4 pt-2">
    <p class="text-sm text-center text-muted-foreground">
      {{ $t('auth.verifyEmail.instruction') }}
    </p>
    <FormSubmitButton type="button" :loading="loading" @click="emit('verified')">
      {{ $t('auth.verifyEmail.verified') }}
    </FormSubmitButton>
    <p class="text-center text-sm text-muted-foreground">
      {{ $t('auth.verifyEmail.didntReceive') }}
      <button
        class="text-primary hover:underline font-medium"
        :class="{ 'opacity-50 cursor-not-allowed': coolingDown }"
        :disabled="coolingDown"
        @click="emit('resend')"
      >
        {{ $t('auth.verifyEmail.resend') }}{{ resendLabel }}
      </button>
    </p>
  </div>
</template>
