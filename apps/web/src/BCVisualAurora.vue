<script setup>
/**
 * Aurora effect adapted from the MIT-licensed Inspira UI AuroraBackground.vue:
 * https://inspira-ui.com/r/aurora-background.json
 * Upstream: https://github.com/unovue/inspira-ui ; Copyright (c) 2024-2026 rahulv.dev.
 * MIT license text is preserved at apps/web/evidence/INSPIRA_UI_AURORA_LICENSE.md.
 *
 * The original component's layered repeating aurora / dark gradient,
 * oversized animated overlay, masked blur are retained. We fit it into
 * YANCE's existing .shell theme tokens instead of creating another theme engine.
 * Decorative only. No event listeners, canvas, network, user data or unsafe HTML.
 */
</script>
<template>
  <div aria-hidden="true" class="bc-wow-aurora">
    <div class="bc-wow-aurora__wash"></div>
    <div class="bc-wow-aurora__rays"></div>
    <div class="bc-wow-aurora__orbit bc-wow-aurora__orbit--one"></div>
    <div class="bc-wow-aurora__orbit bc-wow-aurora__orbit--two"></div>
    <div class="bc-wow-aurora__grain"></div>
  </div>
</template>
