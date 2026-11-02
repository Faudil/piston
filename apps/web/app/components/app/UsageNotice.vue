<script setup lang="ts">
/**
 * What is left of the user's generation quota, to show next to the buttons that
 * spend it: discreet at first, a warning at 20 % left, and when it opens again
 * once it is used up.
 */
const LOW_PERCENT = 20

const { usage, refresh } = useUsage()
onMounted(() => {
  if (!usage.value) void refresh()
})

const remaining = computed(() => usage.value?.claude.remainingPercent ?? 100)

const resetLabel = computed(() => {
  const resetsAt = usage.value?.claude.resetsAt
  if (!resetsAt) return null
  const date = new Date(resetsAt)
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
  return date.toDateString() === new Date().toDateString() ? `à ${time}` : `demain à ${time}`
})

const message = computed(() => {
  if (remaining.value <= 0) {
    return resetLabel.value
      ? `Quota du jour utilisé : de nouveau disponible ${resetLabel.value}.`
      : 'Quota du jour utilisé.'
  }
  if (remaining.value <= LOW_PERCENT) {
    return `Plus que ${remaining.value} % de ton quota du jour : garde-le pour l’essentiel.`
  }
  return `${remaining.value} % de ton quota du jour restant`
})
</script>

<template>
  <p
    v-if="usage"
    class="flex items-center gap-1.5 text-xs"
    :class="
      remaining <= 0 ? 'text-error' : remaining <= LOW_PERCENT ? 'text-warning' : 'text-muted'
    "
    role="status"
  >
    <UIcon
      :name="remaining <= LOW_PERCENT ? 'i-lucide-triangle-alert' : 'i-lucide-gauge'"
      class="size-3.5 shrink-0"
    />
    {{ message }}
  </p>
</template>
