<template>
  <!-- 后台统一图标：彩色圆角方块 + 白色线条（plain 时只画线条，颜色跟随文字） -->
  <span class="adm-icon" :class="[`is-${size}`, { 'is-plain': plain }]" :style="plain ? null : { '--tint': icon.tint }" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path :d="icon.d" /></svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { adminIcon } from './adminIcons.js'

const props = defineProps({
  name: { type: String, required: true },
  // 不传就用图标自己的颜色
  tint: { type: String, default: '' },
  // sm 24px / md 30px / lg 40px / xl 56px
  size: { type: String, default: 'md' },
  plain: { type: Boolean, default: false },
})

const icon = computed(() => {
  const base = adminIcon(props.name)
  return props.tint ? { ...base, tint: props.tint } : base
})
</script>

<style scoped>
.adm-icon {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--tint) 82%, #fff) 0%, var(--tint) 100%);
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(16, 24, 40, 0.12);
}
.adm-icon svg {
  width: 60%;
  height: 60%;
  fill: none;
  stroke: #fff;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.adm-icon.is-sm { width: 24px; height: 24px; border-radius: 7px; }
.adm-icon.is-lg { width: 40px; height: 40px; border-radius: 12px; }
.adm-icon.is-xl { width: 56px; height: 56px; border-radius: 16px; }
.adm-icon.is-xl svg { stroke-width: 1.8; }
.adm-icon.is-plain {
  width: 18px;
  height: 18px;
  border-radius: 0;
  background: none;
  box-shadow: none;
}
.adm-icon.is-plain svg { width: 100%; height: 100%; stroke: currentColor; }
</style>
