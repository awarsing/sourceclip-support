<script setup lang="ts">
import draggable from 'vuedraggable'
import { type AdminCollection, selectionState } from '~/lib/pages/help'

// Collections in their saved order, each expandable to its articles. Both
// levels reorder by drag handle; the page persists the new order.
const props = defineProps<{ expanded: ReadonlySet<string>; selected: ReadonlySet<string> }>()
defineEmits<{
  dragStart: [event: { oldIndex?: number }]
  reorderCollections: []
  reorderArticles: [collection: AdminCollection]
  toggleExpanded: [id: string]
  toggleCollection: [collection: AdminCollection]
  toggleArticle: [id: string]
  edit: [collection: AdminCollection]
}>()
const collections = defineModel<AdminCollection[]>('collections', { required: true })

const selecting = computed(() => props.selected.size > 0)
const collectionState = (collection: AdminCollection) =>
  selectionState(
    collection.articles.map((article) => article.id),
    props.selected,
  )
</script>

<template>
  <draggable
    v-model="collections"
    item-key="id"
    handle=".drag-handle"
    ghost-class="opacity-50"
    @start="$emit('dragStart', $event)"
    @end="$emit('reorderCollections')"
  >
    <template #item="{ element: collection }">
      <div>
        <HelpAdminCollectionRow
          :collection="collection"
          :state="collectionState(collection)"
          :selecting="selecting"
          :expanded="expanded.has(collection.id)"
          @toggle-expanded="$emit('toggleExpanded', collection.id)"
          @toggle-selection="$emit('toggleCollection', collection)"
          @edit="$emit('edit', collection)"
        />

        <draggable
          v-if="expanded.has(collection.id)"
          v-model="collection.articles"
          item-key="id"
          handle=".drag-handle"
          ghost-class="opacity-50"
          @end="$emit('reorderArticles', collection)"
        >
          <template #item="{ element: article }">
            <HelpAdminArticleRow
              :article="article"
              :selected="selected.has(article.id)"
              :selecting="selecting"
              @toggle="$emit('toggleArticle', article.id)"
            />
          </template>
        </draggable>
      </div>
    </template>
  </draggable>
</template>
