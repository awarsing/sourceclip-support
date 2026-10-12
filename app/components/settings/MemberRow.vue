<script setup lang="ts">
import { isLastOwner, type MemberRole } from '~/lib/pages/members'

const props = defineProps<{
  member: { id: string; userId: string; role: MemberRole; user: { name: string; email: string; image: string | null } }
  isSelf: boolean
  canManage: boolean
  ownerCount: number
  roles: { key: string; label: string; icon: string; desc: string }[]
  roleLabel: string
  roleIcon: string
}>()
const emit = defineEmits<{ roleChange: [role: MemberRole]; remove: [] }>()

const editable = computed(() => props.canManage && !props.isSelf)
const lastOwner = computed(() => isLastOwner(props.member, props.ownerCount))
</script>

<template>
  <li class="px-5 py-3 flex items-center gap-3">
    <UserAvatar :author="{ id: member.userId, name: member.user.name, image: member.user.image }" :size="9" />
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <p class="text-sm font-bold truncate">{{ member.user.name }}</p>
        <span v-if="isSelf" class="text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{{ $t('settings.members.you') }}</span>
      </div>
      <p class="text-[11px] text-muted-foreground truncate">{{ member.user.email }}</p>
    </div>

    <!-- Role: inline Select (read-only label for self / when can't manage) -->
    <Select
      v-if="editable"
      :model-value="member.role"
      :disabled="member.role === 'owner' && ownerCount === 1"
      @update:model-value="(v) => emit('roleChange', v as MemberRole)"
    >
      <SelectTrigger class="h-8 w-auto gap-1.5 px-2.5 text-xs font-semibold capitalize">
        <span class="flex items-center gap-1.5">
          <Icon :name="roleIcon" size="12" class="text-muted-foreground" />
          <span>{{ roleLabel }}</span>
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        <MemberRoleItems :roles="roles" />
      </SelectContent>
    </Select>
    <span v-else class="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-semibold capitalize text-muted-foreground">
      <Icon :name="roleIcon" size="12" />
      {{ roleLabel }}
    </span>

    <!-- More -->
    <DropdownMenu v-if="editable">
      <DropdownMenuTrigger as-child>
        <button class="w-8 h-8 rounded-md hover:bg-secondary transition-colors flex items-center justify-center text-muted-foreground">
          <Icon name="lucide:more-horizontal" size="14" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-[180px]">
        <DropdownMenuItem class="text-red-600" :disabled="lastOwner" @click="emit('remove')">
          <Icon name="lucide:user-x" size="13" class="mr-2" />
          {{ $t('settings.members.remove') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </li>
</template>
