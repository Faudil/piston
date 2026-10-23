<script setup lang="ts">
import { CV_ASSET_MAX_BYTES, type CvPhoto } from '@piston/shared'
import {
  CV_PHOTO_MAX_ZOOM,
  clampPhotoCrop,
  cropPhotoToJpeg,
  initialPhotoCrop,
  photoCropRect,
  photoSourceSize,
  type PhotoCrop,
  type PhotoSource,
} from '~/utils/cv-photo'

/**
 * Crops a picked image to a square: drag to move, pinch / wheel / slider to
 * zoom, arrow keys and + / - from the keyboard. The part outside the chosen
 * shape (round, rounded, square) is dimmed. Confirming renders a JPEG of at
 * most 800 px, ready to upload.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ source: PhotoSource | null; shape: CvPhoto['shape'] }>()
const emit = defineEmits<{ confirm: [photo: Blob]; error: [message: string] }>()

/** Side of the crop canvas in CSS pixels. */
const VIEW = 320

const canvas = ref<HTMLCanvasElement | null>(null)
const crop = ref<PhotoCrop>({ zoom: 1, cx: 0, cy: 0 })
const working = ref(false)

const size = computed(() => (props.source ? photoSourceSize(props.source) : null))

watch(
  () => props.source,
  () => {
    if (size.value) crop.value = initialPhotoCrop(size.value.width, size.value.height)
  },
  { immediate: true },
)

function draw() {
  const element = canvas.value
  const source = props.source
  if (!element || !source || !size.value) return
  const ratio = window.devicePixelRatio || 1
  element.width = VIEW * ratio
  element.height = VIEW * ratio
  const context = element.getContext('2d')!
  const rect = photoCropRect(size.value.width, size.value.height, crop.value)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, element.width, element.height)
  context.drawImage(
    source,
    rect.x,
    rect.y,
    rect.side,
    rect.side,
    0,
    0,
    element.width,
    element.height,
  )
  if (props.shape === 'square') return
  // Dim what the shape will hide (even-odd: the whole square minus the shape).
  const w = element.width
  context.beginPath()
  context.rect(0, 0, w, w)
  if (props.shape === 'round') context.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2)
  else context.roundRect(0, 0, w, w, w * 0.16)
  context.fillStyle = 'rgba(0, 0, 0, 0.5)'
  context.fill('evenodd')
}

watch([canvas, crop, () => props.shape, () => props.source], draw, { deep: true })

function setCrop(next: Partial<PhotoCrop>) {
  if (!size.value) return
  crop.value = clampPhotoCrop(size.value.width, size.value.height, { ...crop.value, ...next })
}

/** Image pixels per CSS pixel of the canvas. */
function imageScale() {
  return size.value ? photoCropRect(size.value.width, size.value.height, crop.value).side / VIEW : 1
}

// Pointer gestures: one pointer drags, two pinch.
const pointers = new Map<number, { x: number; y: number }>()
let pinchDistance = 0

function distance() {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a!.x - b!.x, a!.y - b!.y)
}

function onPointerDown(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) pinchDistance = distance()
}

function onPointerMove(event: PointerEvent) {
  const last = pointers.get(event.pointerId)
  if (!last) return
  const next = { x: event.clientX, y: event.clientY }
  pointers.set(event.pointerId, next)
  if (pointers.size === 2) {
    const now = distance()
    if (pinchDistance) setCrop({ zoom: crop.value.zoom * (now / pinchDistance) })
    pinchDistance = now
    return
  }
  const scale = imageScale()
  setCrop({
    cx: crop.value.cx - (next.x - last.x) * scale,
    cy: crop.value.cy - (next.y - last.y) * scale,
  })
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  pinchDistance = 0
}

function onWheel(event: WheelEvent) {
  setCrop({ zoom: crop.value.zoom * Math.exp(-event.deltaY * 0.0015) })
}

function onKeydown(event: KeyboardEvent) {
  const step = imageScale() * 16
  const moves: Record<string, () => void> = {
    ArrowLeft: () => setCrop({ cx: crop.value.cx - step }),
    ArrowRight: () => setCrop({ cx: crop.value.cx + step }),
    ArrowUp: () => setCrop({ cy: crop.value.cy - step }),
    ArrowDown: () => setCrop({ cy: crop.value.cy + step }),
    '+': () => setCrop({ zoom: crop.value.zoom * 1.1 }),
    '=': () => setCrop({ zoom: crop.value.zoom * 1.1 }),
    '-': () => setCrop({ zoom: crop.value.zoom / 1.1 }),
  }
  const move = moves[event.key]
  if (!move) return
  event.preventDefault()
  move()
}

async function confirm() {
  if (!props.source || !size.value) return
  working.value = true
  try {
    const rect = photoCropRect(size.value.width, size.value.height, crop.value)
    const blob = await cropPhotoToJpeg(props.source, rect, CV_ASSET_MAX_BYTES - 1024)
    open.value = false
    emit('confirm', blob)
  } catch (err) {
    emit('error', (err as Error).message)
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Recadrer la photo"
    description="Déplace l’image et zoome pour cadrer ton visage. Le résultat est un carré."
  >
    <template #body>
      <div class="flex flex-col items-center gap-4">
        <canvas
          ref="canvas"
          :style="{ width: `${VIEW}px`, height: `${VIEW}px`, maxWidth: '100%' }"
          class="aspect-square cursor-grab touch-none rounded-lg ring-1 ring-default focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
          tabindex="0"
          role="application"
          aria-label="Zone de recadrage. Flèches pour déplacer l’image, plus et moins pour zoomer."
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKeydown"
        />
        <label class="flex w-full max-w-xs items-center gap-3 text-sm text-muted">
          <UIcon name="i-lucide-zoom-out" class="size-4 shrink-0" aria-hidden="true" />
          <input
            type="range"
            class="w-full accent-[var(--ui-primary)]"
            min="1"
            :max="CV_PHOTO_MAX_ZOOM"
            step="0.01"
            :value="crop.zoom"
            aria-label="Zoom"
            @input="setCrop({ zoom: Number(($event.target as HTMLInputElement).value) })"
          />
          <UIcon name="i-lucide-zoom-in" class="size-4 shrink-0" aria-hidden="true" />
        </label>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Annuler" color="neutral" variant="ghost" @click="open = false" />
        <UButton
          label="Utiliser cette photo"
          icon="i-lucide-check"
          :loading="working"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
