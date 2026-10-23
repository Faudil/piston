<script setup lang="ts">
import type { CvContent, CvDesign, CvTemplateId } from '@piston/shared'

/**
 * The first page of a template, rendered in the browser by the CV worker.
 * Shows the built-in sample straight away, then the user's own content when
 * `content` is given and rendered (cached: reopening the gallery is instant).
 * `lazy` waits until the thumbnail scrolls into view.
 */
const props = withDefaults(
  defineProps<{
    templateId: CvTemplateId
    design: CvDesign
    content?: CvContent | null
    label: string
    lazy?: boolean
  }>(),
  { content: null, lazy: true },
)

const { thumbnail, cached } = useCvThumbnails()
const root = ref<HTMLElement | null>(null)
const visible = ref(!props.lazy)
const url = ref<string | null>(null)
const failed = ref(false)

/** Own content only when there is something to show: a name or any experience or education. */
const ownContent = computed(() => {
  const content = props.content
  if (!content) return undefined
  return content.header.fullName.trim() || content.experiences.length || content.education.length
    ? content
    : undefined
})

async function load() {
  const source = { templateId: props.templateId, design: props.design }
  const own = ownContent.value ? { ...source, content: ownContent.value } : null
  // Whatever is already known first, so a change never blanks the card.
  url.value = (own && cached(own)) ?? cached(source) ?? url.value
  if (own && cached(own)) return
  if (!cached(source)) {
    const sample = await thumbnail(source)
    if (sample) url.value = sample
    else failed.value = !url.value
  }
  if (own) {
    const mine = await thumbnail(own)
    if (mine) url.value = mine
  }
}

let observer: IntersectionObserver | undefined
onMounted(() => {
  if (visible.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      visible.value = true
      observer?.disconnect()
    },
    { rootMargin: '200px' },
  )
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

watch(
  [visible, () => props.templateId, () => props.design, ownContent],
  () => {
    if (visible.value) void load()
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div
    ref="root"
    class="relative aspect-[210/297] w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-default"
  >
    <img
      v-if="url"
      :src="url"
      :alt="label"
      class="size-full object-cover object-top"
      loading="lazy"
      draggable="false"
    />
    <div
      v-else-if="failed"
      class="grid size-full place-items-center p-2 text-center text-xs text-muted"
    >
      Aperçu indisponible
    </div>
    <div v-else class="size-full animate-pulse bg-elevated" role="status" :aria-label="label" />
  </div>
</template>
