<template>
  <!-- 后台头像：线条人像图标，按账号类型配色（管理员蓝、讲师青、小画家橙）。不再用名字的第一个字。 -->
  <span class="ax-avatar" :class="[`is-${tone}`, { 'is-lg': size === 'lg' }]" aria-hidden="true">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.8" /><path d="M4.8 19.6c1.4-3.2 4.1-4.9 7.2-4.9s5.8 1.7 7.2 4.9c-1.9 1.7-4.4 2.7-7.2 2.7s-5.3-1-7.2-2.7z" /></svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  role: { type: String, default: '' },
  size: { type: String, default: '' },
})
const tone = computed(() => ({ admin: 'blue', teacher: 'teal', student: 'orange' }[props.role] || 'gray'))
</script>
