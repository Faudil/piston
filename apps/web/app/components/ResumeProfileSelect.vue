<script setup lang="ts">
import type { ResumeProfile } from '@piston/shared'

/**
 * Picks a resume profile (« CV utilisé »). With `allowDefault`, the first
 * choice is « Profil par défaut (<name>) », i.e. `null`: the offer then follows
 * whichever profile is the default one.
 */
const props = withDefaults(
  defineProps<{
    profiles: ResumeProfile[]
    label?: string
    description?: string
    allowDefault?: boolean
    disabled?: boolean
  }>(),
  { label: 'CV utilisé', description: undefined, allowDefault: false },
)

const model = defineModel<string | null>({ required: true })

// Select values cannot be null: the default choice is a sentinel string.
const DEFAULT = 'default'

const items = computed(() => {
  const defaultProfile = props.profiles.find((profile) => profile.isDefault)
  return [
    ...(props.allowDefault
      ? [
          {
            label: defaultProfile
              ? `Profil par défaut (${defaultProfile.name})`
              : 'Profil par défaut',
            value: DEFAULT,
          },
        ]
      : []),
    ...props.profiles.map((profile) => ({
      label:
        profile.isDefault && !props.allowDefault ? `${profile.name} (par défaut)` : profile.name,
      value: profile.id,
    })),
  ]
})

const selected = computed({
  get: () => model.value ?? (props.allowDefault ? DEFAULT : undefined),
  set: (value: string | undefined) => {
    model.value = !value || value === DEFAULT ? null : value
  },
})
</script>

<template>
  <UFormField :label="label" :description="description">
    <USelect
      v-model="selected"
      :items="items"
      :disabled="disabled"
      icon="i-lucide-file-user"
      class="w-full"
    />
  </UFormField>
</template>
