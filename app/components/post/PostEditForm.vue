<script setup lang="ts">
import '~/assets/css/md-editor-preview.css'
import { sanitizeAttachmentHtml } from '~/utils/attachment'

defineProps<{ error: string; saving: boolean }>()
const emit = defineEmits<{ cancel: []; save: [] }>()
const title = defineModel<string>('title', { required: true })
const content = defineModel<string>('content', { required: true })
const { onUploadImg } = useUploadImg()
</script>

<template>
  <div class="space-y-4">
    <Input v-model="title" class="h-10 text-lg font-heading font-bold" :placeholder="$t('post.detail.titlePlaceholder')" :maxlength="200" />
    <div class="editor-preview-styled">
      <ThemedMdEditor v-model="content" language="en-US" :placeholder="$t('post.detail.editPlaceholder')" :preview="false" :max-length="10000" :toolbars="['bold', 'italic', 'strikeThrough', '-', 'title', 'unorderedList', 'orderedList', '-', 'link', 'image', 'code', 'codeRow', '-', 'previewOnly']" :sanitize="sanitizeAttachmentHtml" :style="{ height: '280px' }" @on-upload-img="onUploadImg" />
    </div>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <div class="flex items-center gap-3 justify-end">
      <button class="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button class="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-heading font-bold hover:bg-primary/90 transition-colors disabled:opacity-50" :disabled="saving" @click="emit('save')">{{ saving ? $t('post.detail.saving') : $t('post.detail.saveChanges') }}</button>
    </div>
  </div>
</template>
