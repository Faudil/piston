<script setup lang="ts">
import {
  applicationStatusLabels,
  applicationStatuses,
  generationKindLabels,
  type AdminOverview,
  type GenerationKind,
} from '@piston/shared'

/** Totals and spending, from GET /api/admin/overview. */
const props = defineProps<{ overview: AdminOverview }>()

const dollars = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' })
const integer = new Intl.NumberFormat('fr-FR')
const dayLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

const percent = (value: number, max: number) =>
  max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 100
const meterColor = (value: number) => (value >= 90 ? 'error' : value >= 70 ? 'warning' : 'primary')

const tiles = computed(() => {
  const t = props.overview.totals
  return [
    {
      label: 'Membres',
      value: t.users,
      hint: `${t.activeUsers7d} actifs sur 7 jours`,
      icon: 'i-lucide-users',
    },
    {
      label: 'Demandes en attente',
      value: t.pendingRequests,
      hint: `${t.activeInvites} invitations actives`,
      icon: 'i-lucide-inbox',
    },
    {
      label: 'Candidatures',
      value: t.applications,
      hint: `${t.offers} offres enregistrées`,
      icon: 'i-lucide-kanban',
    },
    {
      label: 'Générations IA',
      value: t.generations,
      hint: `${t.letters} lettres, ${t.cvDocuments} CV créés`,
      icon: 'i-lucide-sparkles',
    },
  ]
})

const budgets = computed(() => {
  const { claude, web } = props.overview
  return [
    {
      label: 'Claude — ce mois',
      value: percent(claude.month.costUsd, claude.month.budgetUsd),
      detail: `${dollars.format(claude.month.costUsd)} sur ${dollars.format(claude.month.budgetUsd)} · ${integer.format(claude.month.calls)} appels`,
    },
    {
      label: 'Claude — dernières 24 h',
      value: percent(claude.today.calls, claude.today.limit),
      detail: `${claude.today.calls} appels sur ${claude.today.limit} autorisés`,
    },
    {
      label: 'Recherche web (Tavily) — ce mois',
      value: percent(web.month.credits, web.month.budget),
      detail: `${integer.format(web.month.credits)} crédits sur ${integer.format(web.month.budget)} · ${web.month.calls} appels`,
    },
    {
      label: 'Recherche web — dernières 24 h',
      value: percent(web.today.calls, web.today.limit),
      detail: `${web.today.calls} appels sur ${web.today.limit} autorisés`,
    },
  ]
})

// Daily bars, scaled on the busiest day.
const maxDaily = computed(() =>
  Math.max(0, ...props.overview.daily.map((day) => day.claudeCalls + day.webCalls)),
)
const dailyTotal = computed(() =>
  props.overview.daily.reduce((sum, day) => sum + day.claudeCostUsd, 0),
)

const operationLabel = (operation: string) =>
  generationKindLabels[operation as GenerationKind] ??
  ({ import_offer: 'Import d’offre' } as Record<string, string>)[operation] ??
  operation

const pipeline = computed(() =>
  applicationStatuses.map((status) => ({
    label: applicationStatusLabels[status],
    value: props.overview.applicationsByStatus[status] ?? 0,
  })),
)
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <UCard v-for="tile in tiles" :key="tile.label" :ui="{ body: 'p-4 sm:p-5' }">
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon :name="tile.icon" class="size-4" />
          {{ tile.label }}
        </div>
        <p class="mt-2 text-3xl font-semibold text-highlighted tabular-nums">
          {{ integer.format(tile.value) }}
        </p>
        <p class="mt-1 text-xs text-muted">{{ tile.hint }}</p>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">Budgets et quotas</h2>
        <p class="text-sm text-muted">
          Estimations du serveur. La vraie limite reste celle réglée chez Anthropic et Tavily.
        </p>
      </template>
      <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <div v-for="budget in budgets" :key="budget.label" class="space-y-2">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="font-medium text-highlighted">{{ budget.label }}</span>
            <span class="tabular-nums text-muted">{{ budget.value }} %</span>
          </div>
          <UProgress :model-value="budget.value" :color="meterColor(budget.value)" size="sm" />
          <p class="text-xs text-muted">{{ budget.detail }}</p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 class="font-semibold text-highlighted">Activité sur 30 jours</h2>
            <p class="text-sm text-muted">Appels à Claude et à la recherche web, par jour (UTC).</p>
          </div>
          <p class="text-sm text-muted">
            Coût Claude estimé :
            <span class="font-medium text-highlighted">{{ dollars.format(dailyTotal) }}</span>
          </p>
        </div>
      </template>
      <p v-if="maxDaily === 0" class="grid h-40 place-items-center text-sm text-muted">
        Aucun appel sur les 30 derniers jours.
      </p>
      <div
        v-else
        class="flex h-40 items-end gap-[3px]"
        role="img"
        aria-label="Appels par jour sur 30 jours"
      >
        <div
          v-for="day in overview.daily"
          :key="day.day"
          class="group relative flex h-full flex-1 flex-col justify-end"
        >
          <UTooltip
            :text="`${dayLabel.format(new Date(day.day))} : ${day.claudeCalls} Claude (${dollars.format(day.claudeCostUsd)}), ${day.webCalls} web`"
          >
            <div class="flex h-full w-full flex-col justify-end">
              <div
                class="w-full rounded-t-sm bg-sky-400/80"
                :style="{ height: `${(day.webCalls / maxDaily) * 100}%` }"
              />
              <div
                class="w-full bg-primary"
                :class="day.webCalls ? '' : 'rounded-t-sm'"
                :style="{ height: `${(day.claudeCalls / maxDaily) * 100}%` }"
              />
              <div class="h-px w-full bg-(--ui-border)" />
            </div>
          </UTooltip>
        </div>
      </div>
      <div class="mt-2 flex justify-between text-xs text-muted">
        <span>{{ dayLabel.format(new Date(overview.daily[0]!.day)) }}</span>
        <div class="flex gap-4">
          <span class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-sm bg-primary" />Claude
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-sm bg-sky-400/80" />Web
          </span>
        </div>
        <span>Aujourd’hui</span>
      </div>
    </UCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">Coût Claude par usage, ce mois</h2>
        </template>
        <p v-if="overview.claude.byOperation.length === 0" class="text-sm text-muted">
          Aucun appel ce mois-ci.
        </p>
        <ul v-else class="divide-y divide-default text-sm">
          <li
            v-for="row in overview.claude.byOperation"
            :key="row.operation"
            class="flex items-center justify-between gap-3 py-2"
          >
            <span class="text-highlighted">{{ operationLabel(row.operation) }}</span>
            <span class="tabular-nums text-muted">
              {{ row.calls }} appel{{ row.calls > 1 ? 's' : '' }} ·
              <span class="font-medium text-highlighted">{{ dollars.format(row.costUsd) }}</span>
            </span>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">Candidatures par étape</h2>
        </template>
        <ul class="space-y-3 text-sm">
          <li v-for="step in pipeline" :key="step.label" class="space-y-1">
            <div class="flex justify-between">
              <span class="text-highlighted">{{ step.label }}</span>
              <span class="tabular-nums text-muted">{{ step.value }}</span>
            </div>
            <UProgress :model-value="percent(step.value, overview.totals.applications)" size="xs" />
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
