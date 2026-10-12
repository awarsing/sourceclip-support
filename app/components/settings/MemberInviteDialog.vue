<script setup lang="ts">
import type { MemberRole } from '~/lib/pages/members'
import { inviteButtonKey } from '~/lib/pages/members'

const props = defineProps<{
  roles: { key: MemberRole; label: string; icon: string; desc: string }[]
  emailConfigured: boolean
  inviting: boolean
}>()
const emit = defineEmits<{ send: [] }>()
const open = defineModel<boolean>('open', { required: true })
const emails = defineModel<string>('emails', { required: true })
const role = defineModel<MemberRole>('role', { required: true })

const currentRole = computed(() => props.roles.find((r) => r.key === role.value) ?? props.roles[0]!)
const sendLabel = computed(() => inviteButtonKey(props.inviting, props.emailConfigured))
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="font-heading">{{ $t('settings.members.inviteTitle') }}</DialogTitle>
        <DialogDescription class="text-sm">
          {{ $t('settings.members.inviteDesc') }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Email-not-configured banner -->
        <div v-if="!emailConfigured" class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <Icon name="lucide:mail-x" size="14" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-bold">{{ $t('settings.members.emailNotConfigured') }}</p>
            <p class="mt-0.5 leading-relaxed">{{ $t('settings.members.emailNotConfiguredHint') }}</p>
          </div>
        </div>

        <!-- Emails input -->
        <div>
          <label class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('settings.members.emailLabel') }}</label>
          <textarea
            v-model="emails"
            rows="2"
            :disabled="inviting"
            :placeholder="$t('settings.members.emailPlaceholder')"
            class="mt-2 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary transition-colors resize-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <p class="text-[11px] text-muted-foreground mt-1">{{ $t('settings.members.emailHint') }}</p>
        </div>

        <!-- Role -->
        <div>
          <label class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('settings.members.roleLabel') }}</label>
          <Select v-model="role" :disabled="inviting">
            <SelectTrigger class="mt-2 w-full h-10 text-sm">
              <SelectValue>
                <span class="flex items-center gap-2">
                  <Icon :name="currentRole.icon" size="14" class="text-muted-foreground" />
                  <span class="font-semibold">{{ currentRole.label }}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <MemberRoleItems :roles="roles" />
            </SelectContent>
          </Select>
          <p class="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{{ currentRole.desc }}</p>

          <!-- In-context warning when Owner is selected -->
          <div v-if="role === 'owner'" class="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
            <Icon name="lucide:alert-triangle" size="13" class="mt-0.5 shrink-0 text-amber-600" />
            <span>{{ $t('settings.members.ownerWarning') }}</span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <button class="h-9 px-4 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-secondary transition-colors" @click="open = false">
          {{ $t('common.cancel') }}
        </button>
        <button
          :disabled="!emails.trim() || inviting"
          class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          @click="emit('send')"
        >
          {{ $t(sendLabel) }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
