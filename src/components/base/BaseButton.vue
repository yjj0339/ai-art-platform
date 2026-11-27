<template>
  <button
    class="base-button"
    :class="[`base-button--${variant}`, { 'is-block': block, 'is-disabled': disabled || loading, 'is-loading': loading }]"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <span v-if="loading" class="base-button__spinner" />
    <slot />
  </button>
</template>

<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  block: Boolean,
  loading: Boolean,
  disabled: Boolean,
})
</script>
