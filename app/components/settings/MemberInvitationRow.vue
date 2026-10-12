<script setup lang="ts">
import { formatExpiresIn } from '~/lib/pages/members'

const props = defineProps<{
  invitation: { id: string; email: string; expiresAt: string | null }
  roleLabel: string
  canManage: boolean
}>()
const emit = defineEmits<{ copyLink: [id: string]; revoke: [id: string] }>()
const { t } = useI18n()
const expiresIn = computed(() => formatExpiresIn(props.invitation.expiresAt, t('settings.members.expired')))
</script>

<template>
  <li class="px-5 py-3 flex items-center gap-3">
    <div class="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
      <Icon name="lucide:mail" size="14" class="text-muted-foreground" />
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold truncate">{{ invitation.email }}</p>
      <p class="text-[11px] text-muted-foreground truncate">
        {{ $t('settings.members.invitedAs') }} <span class="font-semibold capitalize">{{ roleLabel }}</span>
        <template v-if="invitation.expiresAt"> · {{ $t('settings.members.expiresIn', { time: expiresIn }) }}</template>
      </p>
    </div>
    <DropdownMenu v-if="canManage">
      <DropdownMenuTrigger as-child>
        <button class="w-8 h-8 rounded-md hover:bg-secondary transition-colors flex items-center justify-center text-muted-foreground">
          <Icon name="lucide:more-horizontal" size="14" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-[180px]">
        <DropdownMenuItem @click="emit('copyLink', invitation.id)">
          <Icon name="lucide:link" size="13" class="mr-2" />
          {{ $t('settings.members.copyLink') }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="text-red-600" @click="emit('revoke', invitation.id)">
          <Icon name="lucide:x" size="13" class="mr-2" />
          {{ $t('settings.members.revoke') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </li>
</template>
