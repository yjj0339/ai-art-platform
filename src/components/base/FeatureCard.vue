<template>
  <article class="feature-card" :class="{ 'is-active': active }" tabindex="0">
    <div v-if="icon" class="feature-card__icon">{{ icon }}</div>
    <div class="feature-card__body">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
    </div>
    <slot />
  </article>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  active: Boolean,
})
</script>
