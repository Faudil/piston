/** Chromium's install offer (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'piston:install-dismissed'
const DISMISSED_FOR_MS = 1000 * 60 * 60 * 24 * 30

// Module state: the browser fires `beforeinstallprompt` once, early, long
// before the menu that offers the install is opened.
const deferred = shallowRef<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
const dismissed = ref(false)
const ios = ref(false)
const standalone = ref(false)
let listening = false

function readDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY))
    return at > 0 && Date.now() - at < DISMISSED_FOR_MS
  } catch {
    return false
  }
}

/**
 * « Installer l'application »: the native prompt where the browser offers one
 * (Chrome, Edge, Android), and manual instructions on iOS Safari, which has
 * no prompt (Partager → Sur l'écran d'accueil). Hidden once installed or when
 * the user said « Ne plus proposer » (remembered for 30 days).
 */
export function useInstallPrompt() {
  /** Called once by the client plugin. */
  function listen() {
    if (listening) return
    listening = true
    standalone.value =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    // iPadOS reports itself as a Mac: tell it apart by its touch screen.
    ios.value =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    dismissed.value = readDismissed()
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      deferred.value = event as BeforeInstallPromptEvent
    })
    window.addEventListener('appinstalled', () => {
      installed.value = true
      deferred.value = null
    })
  }

  /** Whether to show the menu entry. */
  const available = computed(
    () =>
      !standalone.value && !installed.value && !dismissed.value && (!!deferred.value || ios.value),
  )
  /** Browsers without a prompt (iOS Safari): the entry opens instructions. */
  const needsInstructions = computed(() => !deferred.value && ios.value)

  async function install() {
    const event = deferred.value
    if (!event) return
    deferred.value = null // a prompt can be used once
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'dismissed') dismiss()
  }

  function dismiss() {
    dismissed.value = true
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      // Private mode: the hint just comes back next visit.
    }
  }

  return { listen, available, needsInstructions, install, dismiss }
}
