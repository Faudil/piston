/**
 * For admins: the « Administration » navigation entry and the number of
 * access requests waiting, shared by the sidebar and the mobile menu.
 * Refreshed on every navigation, so an approval elsewhere clears the badge.
 */
export function useAdminBadge() {
  const { user } = useUserSession()
  const isAdmin = computed(() => !!user.value?.isAdmin)
  const pending = useState('admin-pending', () => 0)

  async function refresh() {
    if (!isAdmin.value) return
    try {
      pending.value = (await $fetch('/api/admin/pending-count')).pending
    } catch {
      // The badge is a hint: never break the page for it.
    }
  }

  return { isAdmin, pending, refresh }
}
