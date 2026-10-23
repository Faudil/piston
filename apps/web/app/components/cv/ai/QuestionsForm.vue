<script setup lang="ts">
import type { CvQuestion } from '@piston/shared'

/**
 * « Compléter cette section »: the questions Claude asks, answered here. The
 * answers go back to Claude, which turns them into a proposal. Answers may
 * stay empty: Claude does not guess what is not said.
 */
const props = defineProps<{ questions: CvQuestion[]; summary: string; pending: boolean }>()
const emit = defineEmits<{
  submit: [answers: Array<{ question: string; answer: string }>]
  cancel: []
}>()

const answers = ref<string[]>(props.questions.map(() => ''))
const filled = computed(() => answers.value.some((answer) => answer.trim()))

function submit() {
  if (!filled.value || props.pending) return
  emit(
    'submit',
    props.questions.map((entry, index) => ({
      question: entry.question,
      answer: answers.value[index]?.trim() ?? '',
    })),
  )
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <p v-if="summary" class="text-pretty text-highlighted">{{ summary }}</p>
    <UFormField
      v-for="(entry, index) in questions"
      :key="entry.question"
      :label="entry.question"
      :help="entry.hint"
    >
      <UTextarea
        v-model="answers[index]"
        class="w-full"
        :rows="2"
        autoresize
        :maxlength="1000"
        :disabled="pending"
      />
    </UFormField>
    <p class="text-sm text-muted">
      Réponds avec tes mots et seulement ce que tu sais : Claude n’ajoute rien d’autre et tu relis
      sa proposition avant qu’elle touche ton CV.
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        type="submit"
        label="Proposer des modifications"
        icon="i-lucide-sparkles"
        :loading="pending"
        :disabled="!filled || pending"
      />
      <UButton label="Annuler" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
