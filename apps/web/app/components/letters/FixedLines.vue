<script setup lang="ts">
/**
 * The salutation (`header`) or the closing formula and signature (`footer`)
 * of a letter: light lines outside the numbered body, each with a small
 * inline edit. Enter or « OK » applies, Escape cancels; an emptied line is
 * removed.
 */
const lines = defineModel<string[]>({ required: true })
const props = defineProps<{ place: 'header' | 'footer'; disabled?: boolean }>()

const editing = ref<{ index: number; text: string } | null>(null)
const id = useId()

function label(line: string) {
  if (props.place === 'header') return /^objet\s*:/i.test(line) ? 'Objet' : 'Formule d’appel'
  return isSignatureLine(line) ? 'Signature' : 'Formule de politesse'
}

function start(index: number) {
  editing.value = { index, text: lines.value[index] ?? '' }
  void nextTick(() => document.getElementById(`${id}-input`)?.focus())
}

function focusEditButton(index: number) {
  void nextTick(() => document.getElementById(`${id}-edit-${index}`)?.focus())
}

function commit() {
  const edit = editing.value
  if (!edit) return
  const next = [...lines.value]
  const text = edit.text.trim()
  if (text) next[edit.index] = text
  else next.splice(edit.index, 1)
  lines.value = next
  editing.value = null
  if (text) focusEditButton(edit.index)
}

function cancel() {
  const index = editing.value?.index
  editing.value = null
  if (index !== undefined) focusEditButton(index)
}
</script>

<template>
  <ul class="space-y-1">
    <li v-for="(line, i) in lines" :key="i" class="group flex items-start gap-2">
      <form
        v-if="editing?.index === i"
        class="flex w-full flex-col gap-2 sm:flex-row sm:items-start"
        @submit.prevent="commit"
        @keydown.esc.prevent="cancel"
      >
        <UFormField :label="label(line)" :ui="{ label: 'sr-only' }" class="flex-1">
          <UTextarea
            :id="`${id}-input`"
            v-model="editing.text"
            :rows="1"
            autoresize
            class="w-full"
            @keydown.enter.exact.prevent="commit"
          />
        </UFormField>
        <div class="flex gap-1">
          <UButton type="submit" label="OK" size="sm" />
          <UButton label="Annuler" size="sm" color="neutral" variant="ghost" @click="cancel" />
        </div>
      </form>
      <template v-else>
        <p class="min-w-0 flex-1 py-1 text-sm whitespace-pre-line text-muted">
          <span class="sr-only">{{ label(line) }} : </span>{{ line }}
        </p>
        <UButton
          :id="`${id}-edit-${i}`"
          icon="i-lucide-pencil"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="disabled"
          :aria-label="`Modifier : ${label(line)}`"
          class="shrink-0 sm:opacity-60 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          @click="start(i)"
        />
      </template>
    </li>
  </ul>
</template>
