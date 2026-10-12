<script setup lang="ts">
const emit = defineEmits<{ editProfile: []; changePassword: [] }>()
</script>

<template>
  <DropdownMenuItem @click="emit('editProfile')">
    <Icon name="lucide:user-round-pen" size="16" class="mr-2" />
    {{ $t('nav.editProfile') }}
  </DropdownMenuItem>
  <DropdownMenuItem @click="emit('changePassword')">
    <Icon name="lucide:key-round" size="16" class="mr-2" />
    {{ $t('nav.changePassword') }}
  </DropdownMenuItem>
</template>
