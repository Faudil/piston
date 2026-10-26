<script setup lang="ts">
import type { CvContentBox } from '@piston/cv-render'
import type { CvCheck } from '@piston/shared'

/**
 * The live PDF preview with its page count and the CV checks. Shown beside
 * the form from `lg`, and as a full-screen sheet on phones. Touching a zone
 * of the page asks the editor to open the matching field (`point`).
 */
defineProps<{
  data: Uint8Array | null
  busy: boolean
  highlight: CvContentBox[]
  error: string | null
  pageSummary: { pages: string; almost: string | null } | null
  checks: CvCheck[]
  checksToFix: number
}>()
const emit = defineEmits<{
  point: [point: { page: number; x: number; y: number }]
  go: [check: CvCheck]
}>()
</script>

<template>
  <div class="min-w-0 space-y-6">
    <div>
      <ClientOnly>
        <CvPdfPreview
          class="[&_canvas]:cursor-pointer"
          :data="data"
          :busy="busy"
          :highlight="highlight"
          label="Aperçu du CV. Touche une zone pour la modifier."
          @point="emit('point', $event)"
        />
        <template #fallback>
          <div class="aspect-[210/297] animate-pulse rounded-sm bg-elevated" />
        </template>
      </ClientOnly>
      <UAlert
        v-if="error"
        class="mt-2"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
      <p v-if="pageSummary" class="mt-3 text-sm text-muted" role="status">
        <span class="font-medium text-highlighted">{{ pageSummary.pages }}</span>
        <template v-if="pageSummary.almost"> · {{ pageSummary.almost }}</template>
      </p>
    </div>
    <UCard>
      <template #header>
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-list-checks" class="size-5 text-primary" />
          Vérifications
          <UBadge
            v-if="checksToFix"
            :label="String(checksToFix)"
            color="warning"
            variant="subtle"
            size="sm"
          />
        </h2>
      </template>
      <CvChecksList :checks="checks" @go="emit('go', $event)" />
    </UCard>
  </div>
</template>
