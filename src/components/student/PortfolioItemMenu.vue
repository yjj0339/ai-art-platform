<template>
  <!--
    素材卡片右上角的「三个点」菜单：下载 / 重命名 / 删除。
    点击整块都 stop，避免冒泡到卡片上触发「打开详情」。
  -->
  <div v-if="!hidden" class="portfolio-item-menu" @click.stop @pointerdown.stop @keydown.stop>
    <el-dropdown trigger="click" placement="bottom-end" :hide-on-click="true" popper-class="portfolio-item-menu-popper" @command="handleCommand">
      <button type="button" class="pim-trigger" :aria-label="`「${item.title}」的更多操作`" title="更多操作">
        <el-icon><MoreFilled /></el-icon>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="download" :icon="Download">下载</el-dropdown-item>
          <el-dropdown-item command="rename" :icon="EditPen" :disabled="!actions.canRename(item)">重命名</el-dropdown-item>
          <el-dropdown-item command="delete" :icon="Delete" divided :disabled="!actions.canDelete(item)">删除</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import { Delete, Download, EditPen, MoreFilled } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { usePortfolioItemActions } from '../../composables/usePortfolioItemActions'

const props = defineProps({
  item: { type: Object, required: true },
  /** 批量选择模式下整块隐藏：那时点卡片是「勾选」，露出三个点会让人误点 */
  hidden: { type: Boolean, default: false },
})

const emit = defineEmits(['changed'])

const actions = usePortfolioItemActions({ onApplied: () => emit('changed') })

function handleCommand(command) {
  if (command === 'download') {
    actions.download(props.item)
    return
  }
  if (command === 'rename') promptRename()
  if (command === 'delete') confirmDelete()
}

async function promptRename() {
  if (!actions.canRename(props.item)) return
  let value = ''
  try {
    const result = await ElMessageBox.prompt('改完后素材库、项目封面都会显示新名称。', '重命名素材', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: props.item.title,
      inputPlaceholder: '输入新名称',
      inputValidator: (input) => {
        const text = String(input || '').trim()
        if (!text) return '名称不能为空'
        if (text.length > 30) return '名称最多 30 个字'
        return true
      },
      customClass: 'portfolio-item-rename-box',
    })
    value = result.value
  } catch {
    return
  }
  await actions.rename(props.item, value)
}

async function confirmDelete() {
  if (!actions.canDelete(props.item)) {
    actions.remove(props.item) // 只为拿到统一提示，不会真的删除
    return
  }
  try {
    await ElMessageBox.confirm(`删除后不可恢复，确定删除「${props.item.title}」吗？`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'portfolio-item-delete-box',
    })
  } catch {
    return
  }
  await actions.remove(props.item)
}
</script>

<style scoped lang="scss">
.portfolio-item-menu {
  position: absolute;
  z-index: 4;
  top: 12px;
  right: 12px;
  line-height: 0;
}
.pim-trigger {
  width: 28px;
  height: 28px;
  /* 全局 button 有 min-height: var(--touch-size)（触控尺寸 48px），不压掉会变成 28×48 的胶囊 */
  min-height: 28px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .42);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(24, 30, 60, .46);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 160ms ease, transform 160ms ease, border-color 160ms ease;
}
.pim-trigger:hover,
.pim-trigger:focus-visible {
  background: rgba(24, 30, 60, .78);
  border-color: #fff;
  outline: none;
  transform: scale(1.06);
}
.pim-trigger:active { transform: scale(.96); }
</style>

<style lang="scss">
/* 下拉面板挂在 body 上，只能用非 scoped 样式 */
.portfolio-item-menu-popper .el-dropdown-menu__item.is-disabled { opacity: .45; }
.portfolio-item-rename-box .el-message-box__message p,
.portfolio-item-delete-box .el-message-box__message p { line-height: 1.6; }
</style>
