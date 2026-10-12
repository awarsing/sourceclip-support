<script setup lang="ts">
const props = defineProps<{
  user?: { name?: string | null; email?: string | null; image?: string | null } | null
  personalSettings: boolean
  variant: 'mobile' | 'desktop'
}>()
const emit = defineEmits<{ editProfile: []; changePassword: []; signOut: [] }>()
const localePath = useLocalePath()

const mobile = computed(() => props.variant === 'mobile')
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="flex items-center gap-3 rounded-xl hover:bg-background transition-colors"
        :class="mobile ? 'flex-1 min-w-0 p-2' : 'p-1.5 min-[1360px]:flex-1 min-[1360px]:min-w-0 min-[1360px]:p-2'"
      >
        <AccountAvatar :user="user" class="w-8 h-8 shrink-0" />
        <div class="flex-1 min-w-0 text-left" :class="{ 'hidden min-[1360px]:block': !mobile }">
          <p class="text-xs font-bold truncate">{{ user?.name }}</p>
          <p class="text-[10px] text-muted-foreground truncate">{{ user?.email }}</p>
        </div>
        <Icon v-if="mobile" name="lucide:chevron-up" size="16" class="text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" class="w-[228px]">
      <DropdownMenuLabel class="font-normal">
        <div class="flex flex-col space-y-1">
          <p class="text-sm font-medium">{{ user?.name }}</p>
          <p class="text-xs text-muted-foreground truncate">{{ user?.email }}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <NuxtLink :to="localePath('/dashboard/settings/personal')" :aria-current="personalSettings ? 'page' : undefined" :class="{ 'text-primary': personalSettings }">
          <Icon name="lucide:sliders-horizontal" size="16" class="mr-2" />
          {{ $t('settings.personal.title') }}
        </NuxtLink>
      </DropdownMenuItem>
      <AccountProfileItems @edit-profile="emit('editProfile')" @change-password="emit('changePassword')" />
      <DropdownMenuItem as-child>
        <NuxtLink :to="localePath('/')">
          <Icon name="lucide:arrow-left" size="16" class="mr-2" />
          {{ $t('dashboard.backToSite') }}
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem @click="emit('signOut')">
        <Icon name="lucide:log-out" size="16" class="mr-2" />
        {{ $t('common.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
