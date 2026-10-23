<script setup lang="ts">
import {
  describeCvOperation,
  diffWords,
  type CvContent,
  type CvEditProposal,
  type CvOperation,
  type CvChangeKind,
} from '@piston/shared'

/**
 * Review of Claude's proposed edits: one card per operation with what
 * changes (word diff), why (Claude's reason), and accept / reject buttons.
 * Nothing touches the document until « Appliquer » is pressed; the parent
 * then applies the accepted operations with `applyCvOperations`.
 *
 * While the proposal streams, operations appear as they arrive and their
 * buttons stay disabled until the proposal is complete.
 */
const props = defineProps<{
  proposal: Partial<CvEditProposal>
  /** The document the operations are described against. */
  content: CvContent
  pending: boolean
}>()
const emit = defineEmits<{ apply: [operations: CvOperation[]]; discard: [] }>()

type Decision = 'accepted' | 'rejected'
const decisions = ref<Record<number, Decision>>({})

// A complete operation has a reason (its last field); partial ones are still streaming.
const operations = computed(() =>
  (props.proposal.operations ?? []).filter((op): op is CvOperation =>
    Boolean(op && typeof op === 'object' && 'op' in op && op.reason),
  ),
)
const described = computed(() =>
  operations.value.map((op, index) => ({ op, index, ...describeCvOperation(props.content, op) })),
)
const applicable = computed(() => described.value.filter((entry) => !entry.problem))
const accepted = computed(() =>
  applicable.value.filter((entry) => decisions.value[entry.index] === 'accepted'),
)

watch(
  () => props.proposal,
  () => (decisions.value = {}),
)

/** Toggles a decision: pressing « Accepter » twice brings the operation back to undecided. */
function decide(index: number, decision: Decision) {
  const { [index]: previous, ...others } = decisions.value
  decisions.value = previous === decision ? others : { ...others, [index]: decision }
}

function applySelection() {
  emit(
    'apply',
    accepted.value.map((entry) => entry.op),
  )
}

function acceptAll() {
  emit(
    'apply',
    applicable.value.map((entry) => entry.op),
  )
}

const KINDS: Record<
  CvChangeKind,
  { label: string; color: 'primary' | 'success' | 'error' | 'neutral' | 'info' }
> = {
  edit: { label: 'Modification', color: 'primary' },
  add: { label: 'Ajout', color: 'success' },
  remove: { label: 'Suppression', color: 'error' },
  move: { label: 'Déplacement', color: 'neutral' },
  section: { label: 'Section', color: 'info' },
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <p v-if="proposal.summary" class="text-pretty text-highlighted">{{ proposal.summary }}</p>
      <p v-if="!pending" class="text-sm text-muted">
        {{ operations.length }} proposition(s)<template v-if="proposal.dropped">
          · {{ proposal.dropped }} écartée(s) car mal formée(s)</template
        >. Accepte ou refuse chacune, rien n’est modifié avant « Appliquer ».
      </p>
    </div>

    <ol class="space-y-3" aria-live="polite">
      <li
        v-for="entry in described"
        :key="entry.index"
        class="rounded-xl border bg-default p-4"
        :class="{
          'border-success/50 ring-1 ring-success/20': decisions[entry.index] === 'accepted',
          'border-default opacity-60': decisions[entry.index] === 'rejected' || entry.problem,
          'border-default': !decisions[entry.index] && !entry.problem,
        }"
      >
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <UBadge
            :label="KINDS[entry.kind].label"
            :color="KINDS[entry.kind].color"
            variant="subtle"
            size="sm"
          />
          <span class="min-w-0 text-sm font-medium text-highlighted">{{ entry.target }}</span>
        </div>

        <div class="space-y-1 text-sm">
          <p
            v-if="entry.kind === 'edit' && entry.before !== null && entry.after !== null"
            class="whitespace-pre-line"
          >
            <template v-for="(part, i) in diffWords(entry.before, entry.after)" :key="i">
              <del
                v-if="part.type === 'removed'"
                class="rounded bg-error/10 text-error decoration-error/60"
                >{{ part.text }}</del
              >
              <ins
                v-else-if="part.type === 'added'"
                class="rounded bg-success/10 text-success no-underline"
                >{{ part.text }}</ins
              >
              <span v-else>{{ part.text }}</span>
            </template>
          </p>
          <template v-else>
            <p v-if="entry.before" class="whitespace-pre-line">
              <span class="sr-only">Avant : </span>
              <del class="text-muted decoration-error/60">{{ entry.before }}</del>
            </p>
            <p v-if="entry.after" class="whitespace-pre-line text-success">
              <span class="sr-only">Après : </span>{{ entry.after }}
            </p>
          </template>
        </div>

        <p class="mt-2 flex gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-sparkles" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{{ entry.op.reason }}</span>
        </p>
        <p v-if="entry.problem" class="mt-2 flex gap-1.5 text-sm text-warning">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>Impossible à appliquer : {{ entry.problem }}</span>
        </p>

        <div v-else class="mt-3 flex gap-2">
          <UButton
            label="Accepter"
            icon="i-lucide-check"
            size="sm"
            :color="decisions[entry.index] === 'accepted' ? 'success' : 'neutral'"
            :variant="decisions[entry.index] === 'accepted' ? 'solid' : 'outline'"
            :aria-pressed="decisions[entry.index] === 'accepted'"
            :disabled="pending"
            @click="decide(entry.index, 'accepted')"
          />
          <UButton
            label="Refuser"
            icon="i-lucide-x"
            size="sm"
            :color="decisions[entry.index] === 'rejected' ? 'error' : 'neutral'"
            :variant="decisions[entry.index] === 'rejected' ? 'soft' : 'outline'"
            :aria-pressed="decisions[entry.index] === 'rejected'"
            :disabled="pending"
            @click="decide(entry.index, 'rejected')"
          />
        </div>
      </li>
    </ol>

    <div
      v-if="!pending"
      class="sticky bottom-[calc(var(--app-bottom-nav)+0.5rem)] flex flex-wrap gap-2 rounded-xl border border-default bg-default/95 p-3 shadow-sm backdrop-blur lg:bottom-4"
    >
      <UButton
        :label="`Appliquer (${accepted.length})`"
        icon="i-lucide-check-check"
        :disabled="!accepted.length"
        @click="applySelection"
      />
      <UButton
        v-if="applicable.length > 1"
        label="Tout appliquer"
        color="neutral"
        variant="outline"
        @click="acceptAll"
      />
      <UButton
        label="Ignorer"
        color="neutral"
        variant="ghost"
        class="ms-auto"
        @click="emit('discard')"
      />
    </div>
  </div>
</template>
