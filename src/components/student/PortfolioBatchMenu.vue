<template>
  <div ref="rootRef" class="portfolio-batch" :class="`is-${variant}`">
    <button
      type="button"
      class="portfolio-batch-trigger"
      :class="{ active }"
      :aria-expanded="menuOpen"
      @click="toggleMenu"
    >
      <el-icon><Grid /></el-icon>
      <span>{{ active ? '退出批量' : '批量操作' }}</span>
      <el-icon class="caret"><ArrowUp v-if="active" /><ArrowDown v-else /></el-icon>
    </button>

    <transition name="batch-menu">
      <div v-if="menuOpen" class="batch-menu" role="menu">
        <div class="batch-menu-head">选择要执行的批量操作</div>
        <button
          v-for="entry in actions"
          :key="entry.key"
          type="button"
          class="batch-menu-item"
          :class="{ 'is-disabled': entry.disabled }"
          :disabled="entry.disabled"
          @click="chooseAction(entry.key)"
        >
          <span class="batch-menu-icon"><el-icon><component :is="ICONS[entry.icon]" /></el-icon></span>
          <span class="batch-menu-text">
            <strong>{{ entry.label }}</strong>
            <small>{{ entry.desc }}</small>
          </span>
          <span v-if="entry.badge" class="batch-menu-badge">{{ entry.badge }}</span>
        </button>
      </div>
    </transition>
  </div>

  <Teleport to="body">
    <transition name="batch-bar">
      <div v-if="active" class="batch-action-bar">
        <div class="batch-bar-info">
          <strong>{{ selectedIds.length }}</strong>
          <span>/ {{ items.length }} 项已选</span>
          <em>{{ actionMeta?.label }}</em>
        </div>
        <p v-if="skippedHint" class="batch-bar-hint">{{ skippedHint }}</p>
        <div class="batch-bar-actions">
          <button type="button" class="batch-bar-ghost" @click="toggleSelectAll">
            {{ allSelected ? '取消全选' : '全选' }}
          </button>
          <button type="button" class="batch-bar-ghost" :disabled="!selectedIds.length" @click="clearSelection">清空</button>
          <button type="button" class="batch-bar-ghost" @click="exitBatch">退出</button>
          <button type="button" class="batch-bar-primary" :disabled="busy || !selectedIds.length" @click="runAction">
            {{ busy ? '处理中…' : `执行${actionVerb}` }}
          </button>
        </div>
      </div>
    </transition>
  </Teleport>

  <Teleport to="body">
    <transition name="batch-bar">
      <div v-if="undoBar.visible" class="batch-undo-bar">
        <span>已删除 <strong>{{ undoBar.count }}</strong> 项素材</span>
        <button type="button" @click="undoDelete">
          <el-icon><RefreshLeft /></el-icon>
          撤销
        </button>
        <button type="button" class="batch-undo-close" aria-label="关闭" @click="dismissUndo">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </transition>
  </Teleport>

  <el-dialog v-model="renameDialog.open" title="批量重命名" width="520px" append-to-body>
    <div class="batch-rename">
      <label class="batch-rename-switch">
        <el-switch v-model="renameDialog.keepOriginal" />
        <span>保留原名称，仅在后面追加序号</span>
      </label>
      <label v-if="!renameDialog.keepOriginal">
        <span>统一前缀</span>
        <el-input v-model="renameDialog.prefix" maxlength="24" placeholder="例如：秋日写生-" />
      </label>
      <div class="batch-rename-row">
        <label>
          <span>起始序号</span>
          <el-input-number v-model="renameDialog.start" :min="0" :max="9999" controls-position="right" />
        </label>
        <label>
          <span>序号位数</span>
          <el-input-number v-model="renameDialog.pad" :min="1" :max="4" controls-position="right" />
        </label>
      </div>
      <div class="batch-rename-preview">
        <span>效果预览</span>
        <strong>{{ renamePreview }}</strong>
        <small>共 {{ supportedSelected.length }} 项将被改名<template v-if="skippedSelected.length">，另有 {{ skippedSelected.length }} 项自动跳过</template></small>
      </div>
    </div>
    <template #footer>
      <BaseButton variant="secondary" @click="renameDialog.open = false">取消</BaseButton>
      <BaseButton @click="applyRename">确认重命名</BaseButton>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowDown, ArrowUp, Check, Close, Delete, Download, EditPen, Grid, RefreshLeft, Star,
} from '@element-plus/icons-vue'
import BaseButton from '../base/BaseButton.vue'
import { PORTFOLIO_BATCH_ACTIONS, usePortfolioBatch } from '../../composables/usePortfolioBatch'

const ICONS = { Delete, EditPen, Download, Star }

const props = defineProps({
  /** 当前可见（已按分类筛选）的素材列表 */
  items: { type: Array, default: () => [] },
  /** 已勾选的素材 id，由父组件持有以便渲染卡片勾选框 */
  selectedIds: { type: Array, default: () => [] },
  /** 是否处于批量模式 */
  active: { type: Boolean, default: false },
  /** 无限画布文档列表（工作台入口没有该数据，可不传） */
  canvasDocuments: { type: Array, default: null },
  /** 仅用于样式微调：page | workbench */
  variant: { type: String, default: 'page' },
})

const emit = defineEmits(['update:selectedIds', 'update:active', 'update:canvasDocuments', 'applied'])

const rootRef = ref(null)
const actions = PORTFOLIO_BATCH_ACTIONS

const batch = usePortfolioBatch({
  items: () => props.items,
  selectedIds: () => props.selectedIds,
  setSelectedIds: (ids) => emit('update:selectedIds', ids),
  active: () => props.active,
  setActive: (value) => emit('update:active', value),
  getCanvas: () => props.canvasDocuments,
  setCanvas: (list) => emit('update:canvasDocuments', list),
  onApplied: () => emit('applied'),
})

const {
  menuOpen, actionMeta, actionVerb, busy, renameDialog, undoBar,
  selectedIds, allSelected, supportedSelected, skippedSelected, skippedHint, renamePreview,
  toggleMenu, closeMenu, chooseAction, exitBatch, clearSelection, toggleSelectAll,
  runAction, applyRename, undoDelete, dismissUndo,
} = batch

const actionsVisible = computed(() => actions.length)

function handleDocumentClick(event) {
  if (!menuOpen.value) return
  if (rootRef.value?.contains(event.target)) return
  closeMenu()
}

onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))

defineExpose({ chooseAction, exitBatch, closeMenu, actionsVisible })
</script>

<style scoped lang="scss">
.portfolio-batch {
  position: relative;
  flex: 0 0 auto;
}

/* 高度必须与同排其它控件对齐，否则它就是撑高整条横栏的那一个：
   素材库页的分类胶囊/齿轮是 34px，而这里原 42px → 工具栏被顶到 58px（用户报"占位太大"的真因）。
   不要用全局 min-height，必须在各 variant 下显式写。 */
.portfolio-batch-trigger {
  min-height: 36px;
  border: 1px solid rgba(111, 126, 214, .2);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  color: #5664b7;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
}

/* 独立页（page）：同排 tabs 34px / 齿轮 34px，触发器跟齐 */
.portfolio-batch.is-page .portfolio-batch-trigger {
  min-height: 34px;
  padding: 0 13px;
}

/* 工作台（workbench）：同排刷新/齿轮 36px */
.portfolio-batch.is-workbench .portfolio-batch-trigger {
  min-height: 36px;
}

.portfolio-batch-trigger .caret {
  font-size: 12px;
  opacity: .7;
}

.portfolio-batch-trigger.active {
  border-color: transparent;
  background: linear-gradient(100deg, #596ae4, #8e7cec);
  color: #fff;
  box-shadow: 0 10px 22px rgba(89, 106, 228, .24);
}

.batch-menu {
  position: absolute;
  z-index: 60;
  top: calc(100% + 10px);
  right: 0;
  width: 288px;
  border: 1px solid rgba(117, 130, 205, .2);
  border-radius: 18px;
  padding: 8px;
  background: #fff;
  box-shadow: 0 22px 48px rgba(50, 62, 140, .2);
  transform-origin: top right;
}

.batch-menu-head {
  padding: 6px 10px 8px;
  color: #8b92c6;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
}

.batch-menu-item {
  width: 100%;
  min-height: 0;
  border: 0;
  border-radius: 13px;
  padding: 9px 10px;
  display: flex;
  align-items: center;
  gap: 11px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease;
}

.batch-menu-item:hover:not(.is-disabled) {
  background: #f3f5ff;
}

.batch-menu-item.is-disabled {
  cursor: not-allowed;
  opacity: .58;
}

.batch-menu-icon {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: #eef0ff;
  color: #5d6ac9;
  font-size: 16px;
}

.batch-menu-item.is-disabled .batch-menu-icon {
  background: #f2f3f8;
  color: #9aa1c2;
}

.batch-menu-text {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.batch-menu-text strong {
  color: #2b3a72;
  font-size: 14px;
  font-weight: 900;
  white-space: nowrap;
}

.batch-menu-text small {
  color: #8b92c6;
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-menu-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 3px 8px;
  background: #f1f2f9;
  color: #98a0c6;
  font-size: 10.5px;
  font-weight: 900;
}

.batch-menu-enter-active,
.batch-menu-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.batch-menu-enter-from,
.batch-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(.97);
}
</style>

<style lang="scss">
/* 批量操作条 / 撤销条 / 重命名弹窗：均 Teleport 到 body，故不能用 scoped。 */
.batch-action-bar {
  position: fixed;
  z-index: 3000;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  max-width: min(94vw, 880px);
  border: 1px solid rgba(117, 130, 205, .22);
  border-radius: 20px;
  padding: 12px 14px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 24px 52px rgba(44, 56, 130, .22);
  backdrop-filter: blur(12px);
}

.batch-bar-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: #7a83ae;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.batch-bar-info strong {
  color: #4d5ecb;
  font-size: 20px;
}

.batch-bar-info em {
  margin-left: 6px;
  border-radius: 999px;
  padding: 3px 10px;
  background: #eef0ff;
  color: #5664b7;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.batch-bar-hint {
  flex: 1 1 220px;
  margin: 0;
  color: #d18a2c;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.5;
}

.batch-bar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.batch-bar-ghost,
.batch-bar-primary {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 16px;
  font-weight: 900;
  cursor: pointer;
}

.batch-bar-ghost {
  border: 1px solid rgba(111, 126, 214, .22);
  background: #fff;
  color: #5b68bd;
}

.batch-bar-ghost:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.batch-bar-primary {
  border: 0;
  background: linear-gradient(100deg, #596ae4, #8e7cec);
  color: #fff;
  box-shadow: 0 10px 22px rgba(89, 106, 228, .24);
}

.batch-bar-primary:disabled {
  opacity: .6;
  cursor: not-allowed;
  box-shadow: none;
}

.batch-undo-bar {
  position: fixed;
  z-index: 3100;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  border-radius: 999px;
  padding: 10px 12px 10px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(37, 46, 92, .94);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 20px 44px rgba(30, 38, 80, .3);
}

.batch-undo-bar strong {
  color: #ffd08a;
}

.batch-undo-bar button {
  min-height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, .16);
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.batch-undo-bar button:hover {
  background: rgba(255, 255, 255, .28);
}

.batch-undo-bar .batch-undo-close {
  padding: 0 10px;
  background: transparent;
}

.batch-bar-enter-active,
.batch-bar-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.batch-bar-enter-from,
.batch-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 14px);
}

/* 删除二次确认：用 HTML 列表明示「到底删了什么」，替代浏览器原生 confirm */
.batch-confirm-box .el-message-box__message {
  width: 100%;
}

.batch-confirm-tip {
  margin: 0 0 10px;
  color: #4b5578;
  line-height: 1.6;
}

.batch-confirm-tip strong {
  color: #e0662f;
}

.batch-confirm-list {
  max-height: 220px;
  margin: 0;
  padding: 8px;
  border-radius: 12px;
  overflow-y: auto;
  list-style: none;
  background: #f7f8fd;
}

.batch-confirm-list li {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #3a4470;
  font-size: 13px;
  line-height: 1.5;
}

.batch-confirm-list li + li {
  border-top: 1px solid rgba(117, 130, 205, .12);
}

.batch-confirm-list li span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-confirm-list li em {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 2px 8px;
  background: #eceffb;
  color: #6c76ab;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.batch-confirm-list li.batch-confirm-more {
  justify-content: center;
  color: #8b92c6;
  font-size: 12px;
}

.batch-rename {
  display: grid;
  gap: 16px;
}

.batch-rename label {
  display: grid;
  gap: 7px;
}

.batch-rename label > span {
  color: #25346e;
  font-weight: 900;
  font-size: 13px;
}

.batch-rename-switch {
  display: flex !important;
  align-items: center;
  gap: 10px;
}

.batch-rename-switch span {
  font-weight: 800;
  color: #5b6695;
  font-size: 13px;
}

.batch-rename-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.batch-rename-preview {
  border-radius: 14px;
  padding: 12px 14px;
  display: grid;
  gap: 4px;
  background: #f5f6ff;
}

.batch-rename-preview span {
  color: #8b92c6;
  font-size: 11.5px;
  font-weight: 900;
}

.batch-rename-preview strong {
  color: #4d5ecb;
  font-size: 17px;
  word-break: break-all;
}

.batch-rename-preview small {
  color: #8b92c6;
  font-size: 11.5px;
}
</style>
