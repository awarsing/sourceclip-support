<script setup lang="ts">
defineProps<{ email: string }>()

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <LoginStepHeader icon="lucide:mail-check" success :title="$t('auth.checkEmail')">
    {{ $t('auth.resetSent.sentTo') }}
    <span class="font-medium text-foreground">{{ email }}</span>
  </LoginStepHeader>
  <div class="space-y-4 pt-2">
    <p class="text-sm text-center text-muted-foreground">
      {{ $t('auth.resetSent.instruction') }}
    </p>
    <p class="text-center text-sm text-muted-foreground">
      <button class="text-primary hover:underline font-medium" @click="emit('back')">
        ← Back to sign in
      </button>
    </p>
  </div>
</template>
