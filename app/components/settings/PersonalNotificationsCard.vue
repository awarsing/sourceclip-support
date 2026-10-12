<script setup lang="ts">
import type { MemberPreferenceResponse } from '#layers/feedlog/shared/schemas/member-preference'
import type { PreferenceState } from '~/lib/pages/personal'

const props = defineProps<{
  preferences: MemberPreferenceResponse | null
  state: PreferenceState
  busy: boolean
  dirty: boolean
}>()
const emit = defineEmits<{ retry: []; reset: []; save: [] }>()
const enabled = defineModel<boolean>('enabled', { required: true })

const loadErrorKey = computed(() => `settings.personal.${props.state === 'unknown' ? 'unknown' : 'loadError'}`)
</script>

<template>
  <section class="rounded-xl border border-border bg-card overflow-hidden" :aria-busy="busy">
    <div class="px-6 py-5 border-b border-border">
      <h3 class="font-heading font-bold text-sm">{{ $t('settings.personal.notifications') }}</h3>
      <p class="text-xs text-muted-foreground mt-0.5">{{ $t('settings.personal.notificationsDesc') }}</p>
    </div>
    <div class="px-6 py-6 space-y-6">
      <p v-if="state === 'loading'" role="status" class="text-sm text-muted-foreground flex items-center gap-2">
        <Icon name="lucide:loader-circle" size="16" class="animate-spin" />
        {{ $t('settings.loading') }}
      </p>
      <div v-else-if="!preferences" class="space-y-3">
        <p role="alert" class="text-sm text-destructive">{{ $t(loadErrorKey) }}</p>
        <Button variant="outline" size="sm" @click="emit('retry')">{{ $t('settings.personal.retry') }}</Button>
      </div>
      <template v-else>
        <div class="flex items-start justify-between gap-5">
          <div class="min-w-0">
            <label for="staff-feedback-email" class="block text-sm font-semibold cursor-pointer">{{ $t('settings.personal.feedbackEmail') }}</label>
            <p id="staff-feedback-email-description" class="mt-1 text-xs text-muted-foreground leading-relaxed">{{ $t('settings.personal.feedbackEmailDesc') }}</p>
            <p class="mt-3 text-xs"><span class="text-muted-foreground">{{ $t('settings.personal.email') }}</span> <span class="inline-block max-w-full break-all align-top">{{ preferences.email }}</span></p>
          </div>
          <Switch
            id="staff-feedback-email"
            v-model="enabled"
            class="mt-0.5"
            :disabled="busy"
            aria-describedby="staff-feedback-email-description"
          />
        </div>
        <div class="text-xs text-muted-foreground leading-relaxed">
          <p>{{ $t('settings.personal.onlyMe') }}</p>
          <p>{{ $t('settings.personal.essentialEmails') }}</p>
          <p v-if="preferences.role === 'contributor'" class="mt-2">{{ $t('settings.personal.contributor') }}</p>
        </div>
      </template>
    </div>
    <PersonalSaveFooter v-if="preferences" :state="state" :busy="busy" :dirty="dirty" @reset="emit('reset')" @save="emit('save')" />
  </section>
</template>
