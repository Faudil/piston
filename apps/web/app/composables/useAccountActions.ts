import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * Account actions shared by the desktop user menu and the mobile "Plus" menu:
 * my account, invite a friend, pick the color theme, log out.
 */
export function useAccountActions() {
  const { user, clear } = useUserSession()
  const toast = useToast()
  const colorMode = useColorMode()

  /** "Faudil Puttilli" → "FP", "camille" → "CA". Words without letters, like "(démo)", are skipped. */
  const initials = computed(() => {
    const words = (user.value?.displayName ?? '')
      .split(/\s+/)
      .filter((word) => /^\p{L}/u.test(word))
    if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
    return (words[0] ?? '?').slice(0, 2).toUpperCase()
  })

  async function invite() {
    try {
      const { url } = await $fetch('/api/invites', { method: 'POST' })
      await navigator.clipboard.writeText(url)
      toast.add({
        title: "Lien d'invitation copié",
        description: 'Valable 7 jours, pour une seule personne.',
        icon: 'i-lucide-link',
      })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error), color: 'error' })
    }
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await clear()
    await navigateTo('/login')
  }

  const themes = [
    { value: 'system', label: 'Automatique', icon: 'i-lucide-monitor' },
    { value: 'light', label: 'Clair', icon: 'i-lucide-sun' },
    { value: 'dark', label: 'Sombre', icon: 'i-lucide-moon' },
  ] as const

  /** Menu groups, ready for a UDropdownMenu. */
  const accountItems = computed<DropdownMenuItem[][]>(() => [
    [
      { label: 'Mon compte', icon: 'i-lucide-user-round', to: '/compte' },
      { label: 'Inviter un ami', icon: 'i-lucide-user-plus', onSelect: invite },
    ],
    [
      {
        label: 'Thème',
        icon: colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun',
        children: themes.map((theme) => ({
          label: theme.label,
          icon: theme.icon,
          type: 'checkbox' as const,
          checked: colorMode.preference === theme.value,
          onSelect: (event: Event) => {
            event.preventDefault()
            colorMode.preference = theme.value
          },
        })),
      },
    ],
    [{ label: 'Se déconnecter', icon: 'i-lucide-log-out', onSelect: logout }],
  ])

  return { user, initials, accountItems }
}
