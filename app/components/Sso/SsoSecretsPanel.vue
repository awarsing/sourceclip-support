<script setup lang="ts">
import type { SsoSecret } from '~/composables/useSsoSecrets'
import { SSO_SECRET_LIMIT } from '~~/shared/constants/sso'

// The signing secrets card: loading, empty state or the list, then the rotation hint.
defineProps<{ secrets: SsoSecret[]; loading: boolean; justCreatedId: string | null }>()
defineEmits<{ create: []; toggle: [secret: SsoSecret]; rename: [secret: SsoSecret]; delete: [secret: SsoSecret] }>()
</script>

<template>
  <section class="rounded-xl border border-border bg-card overflow-hidden">
    <div class="px-5 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="font-heading font-bold text-sm">{{ $t('dashboard.sso.signingSecrets') }}</h3>
        <p class="text-[11px] text-muted-foreground mt-0.5">{{ $t('dashboard.sso.secretsDesc') }}</p>
      </div>
      <span class="text-[11px] font-semibold text-muted-foreground tabular-nums">{{
        $t('dashboard.sso.usedCount', { used: secrets.length, limit: SSO_SECRET_LIMIT })
      }}</span>
    </div>

    <div v-if="loading" class="px-6 py-14 text-center text-sm text-muted-foreground">{{ $t('dashboard.sso.loading') }}</div>

    <div v-else-if="!secrets.length" class="px-6 py-14 flex flex-col items-center text-center">
      <div class="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3">
        <Icon name="lucide:key-round" size="22" class="text-primary" />
      </div>
      <p class="font-heading font-bold text-sm">{{ $t('dashboard.sso.empty') }}</p>
      <p class="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
        {{ $t('dashboard.sso.emptyHint') }}
      </p>
      <button
        class="mt-4 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 transition-all flex items-center gap-2"
        @click="$emit('create')"
      >
        <Icon name="lucide:plus" size="14" />
        {{ $t('dashboard.sso.createSecret') }}
      </button>
    </div>

    <div v-else class="divide-y divide-border">
      <SsoSecretRow
        v-for="s in secrets"
        :key="s.id"
        :secret="s"
        :just-created="s.id === justCreatedId"
        @toggle="$emit('toggle', s)"
        @rename="$emit('rename', s)"
        @delete="$emit('delete', s)"
      />
    </div>
  </section>

  <p class="text-[11px] text-muted-foreground leading-relaxed mt-4">
    <Icon name="lucide:refresh-cw" size="11" class="inline mr-1" />
    <span class="font-semibold">{{ $t('dashboard.sso.rotationLabel') }}</span>{{ $t('dashboard.sso.rotationMid') }}<span class="font-semibold">{{ $t('dashboard.sso.rotationDisable') }}</span>{{ $t('dashboard.sso.rotationEnd') }}
  </p>
</template>
