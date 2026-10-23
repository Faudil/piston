<script setup lang="ts">
import type { CvDraftOutput, CvEditProposal, Generation } from '@piston/shared'

/** Short view of a CV builder generation in the history: a draft or a proposal of edits. */
const props = defineProps<{ generation: Generation<'cv_draft'> | Generation<'cv_edit'> }>()

const draft = computed(() =>
  props.generation.kind === 'cv_draft' ? (props.generation.output as CvDraftOutput) : null,
)
const proposal = computed(() =>
  props.generation.kind === 'cv_edit' ? (props.generation.output as CvEditProposal) : null,
)
const documentId = computed(() => props.generation.inputRefs.cvDocumentId)
</script>

<template>
  <div class="space-y-3 text-sm">
    <template v-if="draft">
      <p class="text-highlighted">
        {{ draft.header?.fullName || 'Sans nom'
        }}<template v-if="draft.header?.title"> · {{ draft.header.title }}</template>
      </p>
      <p class="text-muted">
        {{ draft.experiences?.length ?? 0 }} expérience(s),
        {{ draft.education?.length ?? 0 }} formation(s), {{ draft.skills?.length ?? 0 }} groupe(s)
        de compétences.
      </p>
    </template>
    <template v-else-if="proposal">
      <p class="text-highlighted">{{ proposal.summary }}</p>
      <ul class="list-disc space-y-1 ps-5 text-muted">
        <li v-for="(operation, index) in proposal.operations" :key="index">
          {{ operation.reason }}
        </li>
      </ul>
    </template>
    <UButton
      v-if="documentId"
      :to="`/cv/editeur/${documentId}`"
      label="Ouvrir le CV"
      icon="i-lucide-file-pen-line"
      size="sm"
      color="neutral"
      variant="outline"
    />
  </div>
</template>
