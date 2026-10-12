<script setup lang="ts">
import { initialsOf } from '~/lib/pages/layout'
import { resolveAttachmentUrl } from '~/utils/attachment'

// The signed-in half of the invite page: who is signed in, then either the
// join button (matching email) or the wrong-account notice.
const props = defineProps<{
  user: { name: string; email: string; image?: string | null }
  invitation: { email: string; organizationName: string }
  matches: boolean
  accepting: boolean
}>()
defineEmits<{ accept: []; switchAccount: [] }>()

const initials = computed(() => initialsOf(props.user.name))
const image = computed(() => resolveAttachmentUrl(props.user.image))
</script>

<template>
  <div class="mt-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card text-left">
    <div class="w-10 h-10 rounded-full overflow-hidden bg-accent shrink-0 flex items-center justify-center">
      <img v-if="image" :src="image" :alt="user.name" class="w-full h-full object-cover" referrerpolicy="no-referrer">
      <span v-else class="text-accent-foreground text-sm font-bold">{{ initials }}</span>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-bold truncate leading-tight">{{ user.name }}</p>
      <p class="text-xs text-muted-foreground truncate leading-tight mt-0.5">{{ user.email }}</p>
    </div>
  </div>

  <template v-if="matches">
    <button
      :disabled="accepting"
      class="mt-4 w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-heading font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      @click="$emit('accept')"
    >
      {{ accepting ? $t('auth.invite.joining') : $t('auth.invite.joinOrg', { org: invitation.organizationName }) }}
      <Icon name="lucide:arrow-right" size="14" />
    </button>

    <p class="mt-3 text-[11px] text-muted-foreground">
      {{ $t('auth.invite.notYou') }}
      <a class="text-foreground font-semibold hover:underline ml-1 cursor-pointer" @click="$emit('switchAccount')">{{ $t('auth.invite.signOut') }}</a>
    </p>
  </template>

  <p v-else class="mt-4 text-xs text-red-600 leading-relaxed flex items-center justify-center gap-1.5">
    <Icon name="lucide:alert-circle" size="13" class="shrink-0" />
    <span>
      <i18n-t keypath="auth.invite.sentToEmail" tag="span" scope="global">
        <template #email><span class="font-semibold">{{ invitation.email }}</span></template>
      </i18n-t>
      <a class="text-foreground font-semibold hover:underline ml-1 cursor-pointer" @click="$emit('switchAccount')">{{ $t('auth.invite.switchAccount') }}</a>
    </span>
  </p>
</template>
