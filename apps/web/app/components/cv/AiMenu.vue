<script setup lang="ts">
import { cvAiActionLabels, cvAiActions, type CvAiAction, type CvEditScope } from '@piston/shared'

/**
 * The « IA » menu of a section, an item or a bullet: the inline actions
 * (« Plus percutant », « Chiffrer »...) limited to that part of the CV, and
 * the writing help that fits it: the summary's « Générer l'accroche », an
 * experience's « Suggérer des points » (from the user's own notes) and
 * « Compléter cette section » (Claude asks questions). The request goes to
 * the editor page, which shows the proposal in the AI panel.
 */
const props = defineProps<{
  scope: CvEditScope
  /** What the scope is, for the accessible name and the revision label (« la puce »). */
  label: string
}>()

const requestEdit = inject(CV_AI_REQUEST)

const BULLET_SECTIONS = ['experiences', 'volunteering', 'projects'] as const
type BulletSection = (typeof BULLET_SECTIONS)[number]
const bulletSection = computed(() =>
  BULLET_SECTIONS.find((section) => section === props.scope.section),
)

const notesOpen = ref(false)
const notes = ref('')

function suggestBullets() {
  const section: BulletSection | undefined = bulletSection.value
  const text = notes.value.trim()
  if (!section || !props.scope.itemId || text.length < 10) return
  requestEdit?.(
    { mode: 'bullets', section, itemId: props.scope.itemId, notes: text },
    `IA : points suggérés (${props.label})`,
  )
  notesOpen.value = false
  notes.value = ''
}

const items = computed(() => {
  const { scope } = props
  const actions = [
    cvAiActions
      // Translating one bullet into English rarely makes sense on its own.
      .filter((action: CvAiAction) => action !== 'translate_en' || !scope.bulletId)
      .map((action) => ({
        label: cvAiActionLabels[action].label,
        icon: cvAiActionLabels[action].icon,
        onSelect: () =>
          requestEdit?.(
            { mode: 'action', action, scope },
            `IA : ${cvAiActionLabels[action].label.toLowerCase()} (${props.label})`,
          ),
      })),
  ]

  const writing = []
  if (scope.section === 'summary') {
    writing.push({
      label: 'Générer l’accroche',
      icon: 'i-lucide-text-cursor-input',
      onSelect: () => requestEdit?.({ mode: 'summary' }, 'IA : accroche générée'),
    })
  } else if (scope.section && !scope.bulletId) {
    const section = scope.section
    if (scope.itemId && bulletSection.value) {
      writing.push({
        label: 'Suggérer des points',
        icon: 'i-lucide-list-plus',
        onSelect: () => (notesOpen.value = true),
      })
    }
    writing.push({
      label: scope.itemId ? 'Compléter cet élément' : 'Compléter cette section',
      icon: 'i-lucide-message-circle-question',
      onSelect: () =>
        requestEdit?.(
          { mode: 'complete', section, itemId: scope.itemId },
          `IA : ${scope.itemId ? 'élément complété' : 'section complétée'} (${props.label})`,
        ),
    })
  }
  return writing.length ? [writing, ...actions] : actions
})
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-sparkles"
      color="primary"
      variant="ghost"
      size="sm"
      :aria-label="`Actions de Claude sur ${label}`"
    />
  </UDropdownMenu>

  <UModal
    v-model:open="notesOpen"
    title="Suggérer des points"
    description="Dis en quelques mots ce que tu as fait : Claude en tire des puces, sans rien inventer."
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="suggestBullets">
        <UFormField
          label="Tes notes"
          required
          :hint="`${notes.length}/1500`"
          help="Écris comme tu parles. Pas de chiffre ? Claude laissera un [crochet] à remplir."
        >
          <UTextarea
            v-model="notes"
            class="w-full"
            :rows="5"
            autoresize
            :maxlength="1500"
            autofocus
            placeholder="Ex. : je gérais Instagram et LinkedIn de plusieurs clients, je préparais les posts et un reporting mensuel"
          />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="notesOpen = false" />
          <UButton
            type="submit"
            label="Proposer des points"
            icon="i-lucide-sparkles"
            :disabled="notes.trim().length < 10"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
