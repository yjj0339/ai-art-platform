<template>
  <div class="empty-state">
    <div class="empty-state__mark">{{ icon }}</div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: '画' },
  title: { type: String, default: '还没有内容' },
  description: { type: String, default: '开始一次新的AI创作吧。' },
})
</script>
