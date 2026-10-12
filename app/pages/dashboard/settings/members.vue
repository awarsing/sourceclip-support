<script setup lang="ts">
import { toast } from 'vue-sonner'
import { authClient } from '~/lib/auth-client'
import { inviteToast, isLastOwner, type MemberRole, parseInviteEmails, roleChangeAllowed } from '~/lib/pages/members'

// /dashboard/settings/members — list members + pending invitations.
// Backed by better-auth organization plugin's listMembers / listInvitations
// + invite / removeMember / updateMemberRole / cancelInvitation.

definePageMeta({ layout: 'dashboard', middleware: ['admin'] })

const ctx = useOrgContext()
const { data: session } = useAuthSession()
const orgId = computed(() => ctx.value.orgId)
const myUserId = computed(() => session.value?.user?.id)
const canManage = computed(() => ctx.value.role === 'owner' || ctx.value.role === 'manager')
const canPromoteToOwner = computed(() => ctx.value.role === 'owner')
const { t } = useI18n()

type Role = MemberRole

interface MemberView {
  id: string
  userId: string
  role: Role
  createdAt?: string
  user: { name: string; email: string; image: string | null }
}
interface InvitationView {
  id: string
  email: string
  role: Role
  status: string
  expiresAt: string | null
  inviterId: string
}

const members = ref<MemberView[]>([])
const invitations = ref<InvitationView[]>([])
const loading = ref(true)

async function refresh() {
  loading.value = true
  try {
    const [memRes, invRes] = await Promise.all([
      authClient.organization.listMembers({ query: { organizationId: orgId.value, limit: 200 } }),
      authClient.organization.listInvitations({ query: { organizationId: orgId.value } }),
    ])
    members.value = ((memRes as unknown as { data?: { members?: MemberView[] } }).data?.members ?? []) as MemberView[]
    invitations.value = ((invRes as unknown as { data?: InvitationView[] }).data ?? []).filter(
      (i) => i.status === 'pending',
    )
  } finally {
    loading.value = false
  }
}
// Defer to onMounted: authClient.organization.* hits /api/... with a
// relative URL via better-fetch, which Node's fetch can't parse during
// SSR. Loading is fine as a post-mount fetch — the table renders in
// `loading` state briefly then populates.
onMounted(() => {
  void refresh()
})

const ownerCount = computed(() => members.value.filter((m) => m.role === 'owner').length)

const roleOptions = computed<{ key: Role; label: string; icon: string; desc: string }[]>(() => [
  {
    key: 'contributor',
    label: t('settings.members.roles.contributor.label'),
    icon: 'lucide:user',
    desc: t('settings.members.roles.contributor.desc'),
  },
  {
    key: 'manager',
    label: t('settings.members.roles.manager.label'),
    icon: 'lucide:shield',
    desc: t('settings.members.roles.manager.desc'),
  },
  {
    key: 'owner',
    label: t('settings.members.roles.owner.label'),
    icon: 'lucide:crown',
    desc: t('settings.members.roles.owner.desc'),
  },
])
const roleIcon = (role: string) => roleOptions.value.find((r) => r.key === role)?.icon ?? 'lucide:user'
const roleLabel = (role: string) => roleOptions.value.find((r) => r.key === role)?.label ?? role
// Hide 'owner' from non-owners — promoting to owner is owner-only.
const availableRoles = computed(() =>
  canPromoteToOwner.value ? roleOptions.value : roleOptions.value.filter((r) => r.key !== 'owner'),
)

// Invite modal
const showInvite = ref(false)
const inviteEmails = ref('')
const inviteRole = ref<Role>('contributor')
const inviting = ref(false)

// Whether an outbound email provider (Resend) is configured. When false, the
// invite is still created but no email is sent — admin must copy the link
// manually. Surfaced as a banner inside the modal so this isn't surprising.
const { data: authCfg } = await useFetch<{ emailProvider?: boolean }>('/api/auth-config', {
  key: 'auth-config',
  default: () => ({ emailProvider: false }),
})
const emailConfigured = computed(() => !!authCfg.value?.emailProvider)

async function sendInvite() {
  const emails = parseInviteEmails(inviteEmails.value)
  if (emails.length === 0) return
  inviting.value = true
  try {
    for (const email of emails) {
      await authClient.organization.inviteMember({
        organizationId: orgId.value,
        email,
        role: inviteRole.value,
      })
    }
    showInvite.value = false
    inviteEmails.value = ''
    inviteRole.value = 'contributor'
    await refresh()
    const message = inviteToast(emails.length, emailConfigured.value)
    toast.success(t(message.title, { count: emails.length }), { description: t(message.description) })
  } finally {
    inviting.value = false
  }
}

async function cancelInvitation(id: string) {
  await authClient.organization.cancelInvitation({ invitationId: id })
  await refresh()
}

async function onRoleChange(member: MemberView, role: Role) {
  if (!roleChangeAllowed(member, role, ownerCount.value)) return
  await authClient.organization.updateMemberRole({
    organizationId: orgId.value,
    memberId: member.id,
    role,
  })
  await refresh()
}

async function removeMember(member: MemberView) {
  if (isLastOwner(member, ownerCount.value)) return
  await authClient.organization.removeMember({
    organizationId: orgId.value,
    memberIdOrEmail: member.id,
  })
  await refresh()
}

function copyInviteLink(invitationId: string) {
  const url = `${window.location.origin}/invite?id=${invitationId}`
  navigator.clipboard?.writeText(url)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <header class="h-16 px-6 border-b border-border flex items-center justify-between shrink-0 bg-card">
      <div>
        <h2 class="font-heading text-lg font-bold">{{ $t('settings.members.title') }}</h2>
        <p class="text-xs text-muted-foreground">{{ $t('settings.members.subtitle') }}</p>
      </div>
      <button
        v-if="canManage"
        class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 transition-all flex items-center gap-2"
        @click="showInvite = true"
      >
        <Icon name="lucide:user-plus-2" size="14" />
        {{ $t('settings.members.invite') }}
      </button>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <template v-if="loading">
          <p class="text-sm text-muted-foreground">{{ $t('settings.loading') }}</p>
        </template>

        <template v-else>
          <!-- Pending invitations -->
          <section v-if="invitations.length" class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="px-5 py-3 border-b border-border">
              <h3 class="font-heading font-bold text-sm">{{ $t('settings.members.pending') }}</h3>
            </div>
            <ul class="divide-y divide-border">
              <MemberInvitationRow
                v-for="inv in invitations"
                :key="inv.id"
                :invitation="inv"
                :role-label="roleLabel(inv.role)"
                :can-manage="canManage"
                @copy-link="copyInviteLink"
                @revoke="cancelInvitation"
              />
            </ul>
          </section>

          <!-- Members table -->
          <section class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 class="font-heading font-bold text-sm">{{ $t('settings.members.membersSection') }}</h3>
              <span class="text-[11px] text-muted-foreground">{{ $t('settings.members.total', { count: members.length }) }}</span>
            </div>
            <ul class="divide-y divide-border">
              <MemberRow
                v-for="m in members"
                :key="m.id"
                :member="m"
                :is-self="m.userId === myUserId"
                :can-manage="canManage"
                :owner-count="ownerCount"
                :roles="availableRoles"
                :role-label="roleLabel(m.role)"
                :role-icon="roleIcon(m.role)"
                @role-change="onRoleChange(m, $event)"
                @remove="removeMember(m)"
              />
            </ul>
          </section>

          <!-- Footnote about last owner safeguard -->
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            <Icon name="lucide:shield-check" size="11" class="inline mr-1" />
            {{ $t('settings.members.lastOwnerNote') }}
          </p>
        </template>
      </div>
    </div>

    <MemberInviteDialog
      v-model:open="showInvite"
      v-model:emails="inviteEmails"
      v-model:role="inviteRole"
      :roles="availableRoles"
      :email-configured="emailConfigured"
      :inviting="inviting"
      @send="sendInvite"
    />
  </div>
</template>
