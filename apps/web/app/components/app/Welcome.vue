<script setup lang="ts">
/**
 * Shown once, on the first visit after sign-up: what Piston does, in three
 * steps, and where to start. Closing it in any way counts as seen.
 */
const { user } = useUserSession()
const onboarding = useOnboarding()
const route = useRoute()

const firstName = computed(() => user.value?.displayName.trim().split(/\s+/)[0] ?? '')

// Not over the CV editor or a printable page: those are reached from links, not on arrival.
const open = computed({
  get: () =>
    onboarding.isOpen('welcome') &&
    !route.path.startsWith('/cv/editeur/') &&
    !route.path.startsWith('/impression'),
  set: (value) => {
    if (!value) onboarding.dismiss('welcome')
  },
})

const steps = [
  {
    icon: 'i-lucide-file-user',
    title: 'Ton CV',
    text: 'Importe-le : Claude le critique franchement et t’aide à le mettre en forme.',
  },
  {
    icon: 'i-lucide-target',
    title: 'Les offres',
    text: 'Colle une annonce : tu vois si elle te correspond, puis Piston prépare ta lettre.',
  },
  {
    icon: 'i-lucide-kanban',
    title: 'Tes candidatures',
    text: 'Suis-les de l’envoi à l’entretien, sans oublier de relancer.',
  },
]

async function start() {
  open.value = false
  await navigateTo('/cv')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="firstName ? `Bienvenue, ${firstName} !` : 'Bienvenue !'"
    description="Piston t’accompagne dans ta recherche d’emploi, en trois temps."
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <ol class="space-y-4">
        <li v-for="(step, index) in steps" :key="step.title" class="flex gap-3">
          <span
            class="relative grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <UIcon :name="step.icon" class="size-5" />
            <span
              class="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-primary text-[0.6875rem] font-semibold text-inverted"
            >
              {{ index + 1 }}
            </span>
          </span>
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ step.title }}</p>
            <p class="text-sm text-pretty text-muted">{{ step.text }}</p>
          </div>
        </li>
      </ol>
      <p class="mt-5 flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-lock" class="size-3.5 shrink-0" />
        Tes CV, offres et candidatures ne sont visibles que par toi.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Plus tard" color="neutral" variant="ghost" @click="open = false" />
        <UButton label="Commencer par mon CV" trailing-icon="i-lucide-arrow-right" @click="start" />
      </div>
    </template>
  </UModal>
</template>
