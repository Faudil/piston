<!-- Placeholder shown while a generation has started but nothing is parsed yet. -->
<template>
  <div class="space-y-4" aria-hidden="true">
    <div class="flex items-center gap-4">
      <USkeleton class="size-20 rounded-full" />
      <div class="flex-1 space-y-2">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-4 w-2/3" />
      </div>
    </div>
    <USkeleton class="h-24 w-full rounded-2xl" />
    <USkeleton class="h-24 w-full rounded-2xl" />
  </div>
</template>
