<template>
  <section class="pk-page">
    <section class="ax-card is-flush">
      <div class="pk-toolbar">
        <!-- 分类：下拉里既能筛选，也能就地增删改 -->
        <el-popover v-model:visible="categoryPopover" placement="bottom-start" :width="320" :show-arrow="false" :offset="8" trigger="click" popper-class="pk-cat-popper">
          <template #reference>
            <button type="button" class="ax-btn is-sm" :class="{ 'is-soft': categoryFilter !== 'all' }"><AdminIcon name="folder" plain />分类：{{ categoryFilterLabel }}<AdminIcon name="chevron" plain class="pk-caret" /></button>
          </template>
          <div class="pk-cat-panel">
            <button type="button" class="pk-cat-create" @click="startCreateCategory"><AdminIcon name="plus" plain />创建分类</button>

            <div v-if="creatingCategory" class="pk-cat-row is-editing">
              <input
                ref="newCategoryInput"
                v-model.trim="newCategoryName"
                class="ax-input"
                maxlength="20"
                placeholder="输入分类名称，回车保存"
                aria-label="新分类名称"
                @keyup.enter="submitCreateCategory"
                @keyup.esc="creatingCategory = false"
              />
              <button type="button" class="pk-icon-btn is-ok" title="保存" aria-label="保存" @click="submitCreateCategory"><AdminIcon name="check" plain /></button>
              <button type="button" class="pk-icon-btn" title="取消" aria-label="取消" @click="creatingCategory = false"><AdminIcon name="close" plain /></button>
            </div>

            <div class="pk-cat-list">
              <div class="pk-cat-row">
                <button type="button" class="pk-cat-name" :class="{ 'is-active': categoryFilter === 'all' }" @click="selectCategory('all')">全部<em>{{ totalPackageCount }}</em></button>
              </div>
              <div v-for="cat in categories" :key="cat.id" class="pk-cat-row" :class="{ 'is-editing': editingCategoryId === cat.id }">
                <template v-if="editingCategoryId === cat.id">
                  <input
                    v-model.trim="editingCategoryName"
                    class="ax-input"
                    maxlength="20"
                    placeholder="分类名称"
                    aria-label="分类名称"
                    @keyup.enter="submitRenameCategory(cat)"
                    @keyup.esc="editingCategoryId = ''"
                  />
                  <button type="button" class="pk-icon-btn is-ok" title="保存" aria-label="保存" @click="submitRenameCategory(cat)"><AdminIcon name="check" plain /></button>
                  <button type="button" class="pk-icon-btn" title="取消" aria-label="取消" @click="editingCategoryId = ''"><AdminIcon name="close" plain /></button>
                </template>
                <template v-else>
                  <button type="button" class="pk-cat-name" :class="{ 'is-active': categoryFilter === cat.id }" @click="selectCategory(cat.id)">{{ cat.name }}<em>{{ cat.packageCount }}</em></button>
                  <button type="button" class="pk-icon-btn" :disabled="cat.isDefault" :title="cat.isDefault ? '未分类不能改名' : '改名'" aria-label="改名" @click="startRenameCategory(cat)"><AdminIcon name="pencil" plain /></button>
                  <button type="button" class="pk-icon-btn is-danger" :disabled="cat.isDefault" :title="cat.isDefault ? '未分类不能删除' : '删除分类'" aria-label="删除分类" @click="removeCategory(cat)"><AdminIcon name="trash" plain /></button>
                </template>
              </div>
              <p v-if="!categories.length" class="pk-cat-empty">还没有分类，点上面「创建分类」建一个。</p>
            </div>
          </div>
        </el-popover>

        <!-- 批量管理 -->
        <el-dropdown trigger="click" @command="handleBulkCommand">
          <button type="button" class="ax-btn is-sm" :class="{ 'is-soft': batchMode }"><AdminIcon name="check" plain />批量管理<AdminIcon name="chevron" plain class="pk-caret" /></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rename">批量改名</el-dropdown-item>
              <el-dropdown-item command="visibility">批量上下线</el-dropdown-item>
              <el-dropdown-item command="delete" divided>批量删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <div class="ax-search pk-search"><input v-model.trim="keyword" type="search" placeholder="搜索技能包名称或简介" aria-label="搜索技能包" /></div>
        <span class="ax-count" aria-live="polite">{{ loading && packages.length ? '读取中…' : `共 ${filteredPackages.length} 个` }}</span>
        <span class="pk-spacer"></span>

        <div class="pk-upload">
          <input ref="fileInput" type="file" accept=".md,.markdown,.zip,.txt" multiple hidden @change="handleFiles" />
          <input ref="folderInput" type="file" webkitdirectory directory multiple hidden @change="handleFiles" />
          <button type="button" class="ax-btn is-sm is-primary pk-upload-main" :disabled="importing" @click="fileInput?.click()"><AdminIcon name="upload" plain />{{ importing ? '导入中…' : '上传技能包' }}</button>
          <el-dropdown trigger="click" @command="pickUpload">
            <button type="button" class="ax-btn is-sm is-primary pk-upload-caret" :disabled="importing" aria-label="其他上传方式"><AdminIcon name="chevron" plain class="pk-caret" /></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="file">上传文件（.md / .zip）</el-dropdown-item>
                <el-dropdown-item command="folder">上传文件夹</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div
        class="pk-drop"
        :class="{ 'is-dragging': dragging }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="handleDrop"
      >
        <AdminIcon name="upload" plain />
        <span>{{ dragging ? '松手就导入' : '也可以把 SKILL.md、.zip 或整个技能包文件夹拖进来' }}</span>
      </div>

      <div v-if="batchMode" class="pk-bulk">
        <label class="pk-bulk-check"><input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />全选</label>
        <span class="pk-bulk-count">已选 <b>{{ selectedIds.length }}</b> 个</span>
        <span class="pk-bulk-actions">
          <button type="button" class="ax-btn is-sm" @click="openRename">批量改名</button>
          <button type="button" class="ax-btn is-sm" @click="openVisibility">批量上下线</button>
          <button type="button" class="ax-btn is-sm is-danger" @click="bulkRemove"><AdminIcon name="trash" plain />批量删除</button>
          <button type="button" class="ax-btn is-sm is-ghost" @click="exitBatchMode">退出批量</button>
        </span>
      </div>

      <div v-if="loading && !packages.length" class="ax-empty is-compact" aria-live="polite"><strong>正在读取技能包…</strong></div>
      <div v-else-if="loadError" class="ax-note is-bad pk-state" role="alert"><span>{{ loadError }}</span><button type="button" class="ax-btn is-sm" @click="reload">重新加载</button></div>
      <div v-else-if="!filteredPackages.length" class="ax-empty">
        <strong>{{ packages.length ? '这个分类下还没有技能包' : '还没有技能包' }}</strong>
        <span>{{ packages.length ? '换个分类看看，或者把新技能包传到这个分类里。' : '把下载来的 SKILL.md 拖到上面，或者点右上角上传。' }}</span>
      </div>

      <div v-else class="ax-table-wrap">
        <table class="ax-table pk-table">
          <thead>
            <tr>
              <th v-if="batchMode" class="is-check"></th>
              <th>技能包</th>
              <th class="pk-col-cat">分类</th>
              <th class="pk-col-status">状态</th>
              <th class="is-center pk-col-vis">用户可见</th>
              <th class="is-right pk-col-more"><span class="pk-sr">更多</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredPackages" :key="item.id" :class="{ 'is-picked': batchMode && selectedIds.includes(item.id) }">
              <td v-if="batchMode" class="is-check"><input type="checkbox" :checked="selectedIds.includes(item.id)" :aria-label="`选择 ${item.title}`" @change="toggleSelect(item.id)" /></td>
              <td>
                <span class="pk-cell">
                  <span class="pk-cover">
                    <img v-if="item.coverUrl && !brokenCovers.has(item.id)" :src="item.coverUrl" :alt="item.title" loading="lazy" @error="brokenCovers.add(item.id)" />
                    <AdminIcon v-else name="layers" plain />
                  </span>
                  <span class="pk-cell-main">
                    <strong :title="item.title">{{ item.title }}</strong>
                    <small :class="{ 'is-empty': !item.summary }" :title="item.summary">{{ item.summary || '这个技能包没有写简介' }}</small>
                  </span>
                </span>
              </td>
              <td class="pk-col-cat"><span class="ax-tag pk-cat-tag" :class="{ 'pk-tag-muted': !item.categoryName }" :title="item.categoryName || '未分类'">{{ item.categoryName || '未分类' }}</span></td>
              <td><span class="ax-pill" :class="{ 'is-ok': item.status === 'converted', 'is-muted': item.status === 'ignored', 'is-warn': item.status === 'pending' }">{{ statusLabel(item.status) }}</span></td>
              <td class="is-center">
                <label class="ax-switch" :title="item.studentVisible ? '用户可见，点击下线' : '用户看不到，点击上线'">
                  <input type="checkbox" :checked="Boolean(item.studentVisible)" :disabled="visibilityBusy === item.id" :aria-label="`${item.title} 用户可见`" @click.prevent="toggleVisibility(item, !item.studentVisible)" />
                  <i></i>
                </label>
              </td>
              <td class="is-right">
                <el-dropdown trigger="click" placement="bottom-end" @command="(command) => handleRowCommand(item, command)">
                  <button type="button" class="pk-icon-btn" :aria-label="`${item.title} 更多操作`" title="更多操作"><AdminIcon name="more" plain /></button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="edit">编辑信息</el-dropdown-item>
                      <el-dropdown-item command="detail">查看正文</el-dropdown-item>
                      <el-dropdown-item v-if="!item.convertedSkillId" command="convert">转成玩法</el-dropdown-item>
                      <el-dropdown-item v-else command="open-skill">打开已生成的玩法</el-dropdown-item>
                      <el-dropdown-item v-if="item.status !== 'ignored'" command="ignore">标记为忽略</el-dropdown-item>
                      <el-dropdown-item v-else command="restore">恢复待整理</el-dropdown-item>
                      <el-dropdown-item command="delete" divided class="pk-danger-item">删除记录</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 编辑信息 -->
    <el-dialog v-model="editVisible" class="ax-dialog" title="编辑技能包信息" width="min(94vw, 620px)" align-center destroy-on-close>
      <div class="pk-form">
        <label class="ax-field"><span>标题</span><input v-model.trim="editForm.title" maxlength="80" placeholder="显示在列表里的名称" /></label>
        <label class="ax-field"><span>简介</span><textarea v-model.trim="editForm.summary" maxlength="300" rows="3" placeholder="一句话说明这个技能包能做什么" /></label>
        <label class="ax-field">
          <span>分类</span>
          <select v-model="editForm.categoryId">
            <option value="">未分类</option>
            <option v-for="cat in categories.filter((c) => !c.isDefault)" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </label>
        <div class="ax-field">
          <span>封面图</span>
          <div class="pk-cover-picker">
            <span class="pk-cover-preview" :class="{ 'is-empty': !editForm.coverUrl }">
              <img v-if="editForm.coverUrl" :src="editForm.coverUrl" alt="封面预览" />
              <AdminIcon v-else name="image" plain />
            </span>
            <div class="pk-cover-actions">
              <input ref="editCoverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleEditCover" />
              <div class="pk-cover-buttons">
                <button type="button" class="ax-btn is-sm is-soft" :disabled="coverUploading" @click="editCoverInput?.click()"><AdminIcon name="upload" plain />{{ coverUploading ? '上传中…' : editForm.coverUrl ? '更换图片' : '上传图片' }}</button>
                <button v-if="editForm.coverUrl" type="button" class="ax-btn is-sm is-ghost" @click="editForm.coverUrl = ''">移除</button>
              </div>
              <small class="ax-hint">建议 900×300 横图。改了标题和简介，已转出的玩法也会同步。</small>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="editVisible = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="editSaving" @click="submitEdit">{{ editSaving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>

    <!-- 批量改名 -->
    <el-dialog v-model="renameVisible" class="ax-dialog" title="批量改名" width="min(94vw, 660px)" align-center destroy-on-close>
      <div class="pk-form">
        <p class="ax-note is-plain"><span>只改标题，不动正文和提示词。加了前后缀后超过 80 字的那条会跳过，并告诉你原因。</span></p>
        <div class="ax-form">
          <label class="ax-field"><span>加前缀</span><input v-model="renameForm.prefix" maxlength="40" placeholder="例如：绘本-" /></label>
          <label class="ax-field"><span>加后缀</span><input v-model="renameForm.suffix" maxlength="40" placeholder="例如：-基础版" /></label>
          <label class="ax-field"><span>查找</span><input v-model="renameForm.find" maxlength="60" placeholder="要被替换掉的文字" /></label>
          <label class="ax-field"><span>替换为</span><input v-model="renameForm.replace" maxlength="60" placeholder="留空则删掉这部分" /></label>
        </div>
        <div class="pk-preview">
          <div class="pk-preview-head"><strong>预览</strong><span>共 {{ renamePreview.length }} 条，前 8 条：</span></div>
          <ul v-if="renamePreview.length">
            <li v-for="row in renamePreview.slice(0, 8)" :key="row.id">
              <span class="pk-from">{{ row.from }}</span>
              <AdminIcon name="chevron" plain class="pk-preview-arrow" />
              <span class="pk-to" :class="{ 'is-empty': !row.to }">{{ row.to || '（空，会跳过）' }}</span>
            </li>
          </ul>
          <p v-else class="pk-preview-empty">还没选技能包，先在列表里勾选。</p>
        </div>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="renameVisible = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="renaming || !renamePreview.length" @click="submitRename">{{ renaming ? '改名中…' : `确认改名（${renamePreview.length} 个）` }}</button>
      </template>
    </el-dialog>

    <!-- 批量上下线 -->
    <el-dialog v-model="visibilityVisible" class="ax-dialog" title="批量上下线" width="min(94vw, 520px)" align-center destroy-on-close>
      <div class="pk-form">
        <p class="ax-note is-plain"><span>上下线控的是<b>用户端能不能看到这张卡</b>。还没转成玩法的技能包没有用户卡片，会被跳过；转成玩法但没通过测试的也不能上线。</span></p>
        <div class="ax-seg pk-seg" role="group" aria-label="上线或下线">
          <button type="button" :class="{ 'is-active': visibilityForm.visible }" :aria-pressed="visibilityForm.visible" @click="visibilityForm.visible = true">上线（用户可见）</button>
          <button type="button" :class="{ 'is-active': !visibilityForm.visible }" :aria-pressed="!visibilityForm.visible" @click="visibilityForm.visible = false">下线（用户看不到）</button>
        </div>
        <p class="ax-hint">已选 {{ selectedIds.length }} 个技能包。</p>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="visibilityVisible = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="visibilitySaving" @click="submitVisibility">{{ visibilitySaving ? '处理中…' : '确认' }}</button>
      </template>
    </el-dialog>

    <!-- 转成玩法 -->
    <el-dialog v-model="convertVisible" class="ax-dialog" title="把技能包转成玩法" width="min(94vw, 720px)" align-center destroy-on-close>
      <div v-if="converting" class="pk-form">
        <p class="ax-note"><span>这一步只生成一张<b>草稿</b>玩法卡。转完之后要进「配置工作流 → 用户页面 → 真实测试 → 发布」，用户端才看得到。</span></p>

        <section class="pk-group">
          <h4>玩法类型<small>选错了以后不能改，只能删了重转</small></h4>
          <div class="pk-type">
            <button type="button" :class="{ 'is-active': convertForm.skillType === 'image' }" :aria-pressed="convertForm.skillType === 'image'" @click="convertForm.skillType = 'image'"><AdminIcon name="image" />图像玩法</button>
            <button type="button" :class="{ 'is-active': convertForm.skillType === 'video' }" :aria-pressed="convertForm.skillType === 'video'" @click="convertForm.skillType = 'video'"><AdminIcon name="video" />视频玩法</button>
          </div>
        </section>

        <section class="pk-group">
          <h4>卡片信息<small>显示在用户端「技能玩法」里</small></h4>
          <label class="ax-field"><span>玩法名称</span><input v-model.trim="convertForm.title" maxlength="80" placeholder="例如：活动海报设计" /></label>
          <label class="ax-field"><span>玩法说明</span><textarea v-model.trim="convertForm.summary" maxlength="300" rows="2" placeholder="一句话告诉用户这个玩法能生成什么" /></label>
        </section>

        <section class="pk-group">
          <h4>生成提示词<small>用户填的内容会插到 <code v-pre>{{subject}}</code> 的位置</small></h4>
          <div class="ax-field">
            <textarea v-model="convertForm.promptTemplate" rows="5" aria-label="生成提示词" placeholder="例如：一张活动宣传海报，主题是{{subject}}，大标题居中，紫色主视觉，极简留白，高清印刷质感" />
          </div>
          <div class="pk-prompt-meta">
            <span>{{ convertForm.promptTemplate.length }} 字</span>
            <span v-if="!convertForm.promptTemplate.includes('{{subject}}')" class="pk-warn">提示词里没有 <code v-pre>{{subject}}</code>，用户填的画面描述将不会生效</span>
          </div>

          <details v-if="converting.promptCandidates?.length" class="pk-cands">
            <summary><span>从技能包里抽到 {{ converting.promptCandidates.length }} 条候选，点一条填进去<small>机器抽的，可能混进操作说明，请自己看一眼再改</small></span><AdminIcon name="chevron" plain class="pk-cands-icon" /></summary>
            <div class="pk-cand-list">
              <button v-for="(cand, index) in converting.promptCandidates" :key="index" type="button" @click="useCandidate(cand)">
                <i>{{ index + 1 }}</i>
                <span>{{ cand }}</span>
              </button>
            </div>
          </details>
        </section>

        <section class="pk-group">
          <h4>卡片封面图<small>用户端按 3:1 横图整块铺满，主体放中间</small></h4>
          <div class="pk-cover-picker">
            <span class="pk-cover-preview" :class="{ 'is-empty': !convertForm.coverUrl }">
              <img v-if="convertForm.coverUrl" :src="convertForm.coverUrl" alt="封面预览" />
              <AdminIcon v-else name="image" plain />
            </span>
            <div class="pk-cover-actions">
              <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleConvertCover" />
              <div class="pk-cover-buttons">
                <button type="button" class="ax-btn is-sm is-soft" :disabled="coverUploading" @click="coverInput?.click()"><AdminIcon name="upload" plain />{{ coverUploading ? '上传中…' : convertForm.coverUrl ? '更换图片' : '上传图片' }}</button>
                <button v-if="convertForm.coverUrl" type="button" class="ax-btn is-sm is-ghost" @click="convertForm.coverUrl = ''">移除</button>
              </div>
              <small class="ax-hint">建议 900×300。不上传就用系统默认插画，之后还能在玩法卡里换。</small>
            </div>
          </div>
        </section>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="convertVisible = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="convertingNow" @click="submitConvert">{{ convertingNow ? '生成中…' : '生成草稿玩法' }}</button>
      </template>
    </el-dialog>

    <!-- 查看正文 -->
    <el-dialog v-model="detailVisible" class="ax-dialog" :title="detail?.title || '技能包正文'" width="min(94vw, 820px)" align-center destroy-on-close>
      <div v-if="detail" class="pk-detail">
        <div class="pk-detail-meta">
          <span v-for="(value, key) in detailMetaRows" :key="key"><b>{{ key }}</b>{{ value }}</span>
        </div>
        <pre class="pk-detail-body">{{ detail.body || '（正文为空）' }}</pre>
      </div>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminIcon from './admin/AdminIcon.vue'
import JSZip from 'jszip'
import {
  bulkSkillPackages, convertSkillPackage, createSkillPackageCategory, deleteSkillPackageCategory,
  getSkillPackageDetail, importSkillPackages, listSkillPackageCategories, listSkillPackages,
  removeSkillPackages, renameSkillPackages, setSkillPackagesCategory, setSkillPackagesVisibility,
  updateSkillPackage, updateSkillPackageCategory,
} from '../services/aiSkillPackageGateway'
import { uploadEditableAiSkillCover } from '../services/adminAiSkillEditorStore'

const router = useRouter()
const loading = ref(false)
const importing = ref(false)
const loadError = ref('')
const packages = ref([])
const categories = ref([])
const keyword = ref('')
const categoryFilter = ref('all')
const selectedIds = ref([])
const batchMode = ref(false)
const dragging = ref(false)
const fileInput = ref(null)
const folderInput = ref(null)
const coverInput = ref(null)
const editCoverInput = ref(null)
const newCategoryInput = ref(null)
const coverUploading = ref(false)
const visibilityBusy = ref('')
// 封面加载失败（多为外链签名过期）就别再渲染破图，退回默认图标。
const brokenCovers = reactive(new Set())

// 分类下拉内的增删改状态
const categoryPopover = ref(false)
const creatingCategory = ref(false)
const newCategoryName = ref('')
const editingCategoryId = ref('')
const editingCategoryName = ref('')

const editVisible = ref(false)
const editSaving = ref(false)
const editingPackage = ref(null)
const editForm = reactive({ title: '', summary: '', coverUrl: '', categoryId: '' })

const renameVisible = ref(false)
const renaming = ref(false)
const renameForm = reactive({ prefix: '', suffix: '', find: '', replace: '' })

const visibilityVisible = ref(false)
const visibilitySaving = ref(false)
const visibilityForm = reactive({ visible: true })

const convertVisible = ref(false)
const converting = ref(null)
const convertingNow = ref(false)
const convertForm = reactive({ skillType: 'image', title: '', summary: '', promptTemplate: '', coverUrl: '' })

const detailVisible = ref(false)
const detail = ref(null)

// 服务端已按分类/关键词过滤，这里只做兜底，避免本地模式与服务端两套逻辑不一致时出现错行。
const filteredPackages = computed(() => packages.value)

const categoryFilterLabel = computed(() => {
  if (categoryFilter.value === 'all') return '全部'
  return categories.value.find((cat) => cat.id === categoryFilter.value)?.name || '全部'
})

// 「全部」后面的数字要看全库：原来用的是当前列表长度，选了某个分类后它就变成那个分类的数量。
// 各分类的 packageCount 与列表同口径（未分类含没有分类的），加起来就是总数；分类没拉到时退回列表长度。
const totalPackageCount = computed(() => (
  categories.value.length
    ? categories.value.reduce((sum, cat) => sum + (Number(cat.packageCount) || 0), 0)
    : packages.value.length
))

const allSelected = computed(() => filteredPackages.value.length > 0 && selectedIds.value.length === filteredPackages.value.length)

// 预览后端的改名规则：先查找替换，再套前后缀，最后 trim。
const renamePreview = computed(() => {
  const set = new Set(selectedIds.value)
  return packages.value
    .filter((item) => set.has(item.id))
    .map((item) => {
      const from = String(item.title || '')
      let next = renameForm.find ? from.split(renameForm.find).join(renameForm.replace) : from
      next = `${renameForm.prefix}${next}${renameForm.suffix}`.trim()
      return { id: item.id, from, to: next }
    })
})

const detailMetaRows = computed(() => {
  if (!detail.value) return {}
  const meta = detail.value.metadata || {}
  const rows = {}
  if (detail.value.packageKey) rows['技能标识'] = detail.value.packageKey
  if (meta.version) rows['版本'] = meta.version
  if (meta.author) rows['作者'] = meta.author
  if (meta.category) rows['原分类'] = meta.category
  if (meta.tags?.length) rows['标签'] = meta.tags.join('、')
  rows['正文长度'] = `${meta.bodyLength || detail.value.body?.length || 0} 字`
  if (meta.hasScripts) rows['含脚本'] = '是（正文里有需要命令行执行的步骤，图像模型用不上，可忽略）'
  return rows
})

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}
function statusLabel(status) {
  return ({ pending: '待整理', converted: '已转玩法', ignored: '已忽略' })[status] || status
}

/* ---------------- 数据加载 ---------------- */
async function loadCategories() {
  try {
    categories.value = await listSkillPackageCategories()
  } catch (error) {
    // 分类拉不到不该挡住主列表，给一句提示即可。
    categories.value = []
    ElMessage.warning(errorMessage(error, '分类加载失败'))
  }
}

// 搜索框边打字边查，前一次请求可能比后一次回来得晚；只认最后一次的结果，免得列表被旧结果盖掉。
let loadSeq = 0
async function loadPackages() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const list = await listSkillPackages({
      categoryId: categoryFilter.value === 'all' ? '' : categoryFilter.value,
      keyword: keyword.value,
    })
    if (seq !== loadSeq) return
    packages.value = list
    // 列表变了，已选中的 id 里可能有已经不存在的，清掉避免误操作。
    const alive = new Set(packages.value.map((item) => item.id))
    selectedIds.value = selectedIds.value.filter((id) => alive.has(id))
  } catch (error) {
    if (seq !== loadSeq) return
    loadError.value = errorMessage(error, '技能包列表加载失败')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function reload() {
  await Promise.all([loadPackages(), loadCategories()])
}

/* ---------------- 分类 ---------------- */
function selectCategory(categoryId) {
  categoryFilter.value = categoryId
  categoryPopover.value = false
  loadPackages()
}

async function startCreateCategory() {
  creatingCategory.value = true
  newCategoryName.value = ''
  await nextTick()
  newCategoryInput.value?.focus()
}

async function submitCreateCategory() {
  const name = newCategoryName.value.trim()
  if (!name) { ElMessage.warning('请填写分类名称'); return }
  try {
    await createSkillPackageCategory(name)
    creatingCategory.value = false
    newCategoryName.value = ''
    await loadCategories()
    ElMessage.success(`已创建分类「${name}」`)
  } catch (error) {
    ElMessage.error(errorMessage(error, '创建分类失败'))
  }
}

function startRenameCategory(cat) {
  if (cat.isDefault) return
  editingCategoryId.value = cat.id
  editingCategoryName.value = cat.name
}

async function submitRenameCategory(cat) {
  const name = editingCategoryName.value.trim()
  if (!name) { ElMessage.warning('请填写分类名称'); return }
  if (name === cat.name) { editingCategoryId.value = ''; return }
  try {
    await updateSkillPackageCategory(cat.id, name)
    editingCategoryId.value = ''
    await loadCategories()
    ElMessage.success('分类已改名')
  } catch (error) {
    ElMessage.error(errorMessage(error, '改名失败'))
  }
}

async function removeCategory(cat) {
  if (cat.isDefault) return
  try {
    await ElMessageBox.confirm(
      cat.packageCount
        ? `删除分类「${cat.name}」？里面的 ${cat.packageCount} 个技能包会回到「未分类」，不会被删掉。`
        : `删除分类「${cat.name}」？`,
      '删除分类',
      { type: 'warning', confirmButtonText: '删除' },
    )
    await deleteSkillPackageCategory(cat.id)
    if (categoryFilter.value === cat.id) categoryFilter.value = 'all'
    await reload()
    ElMessage.success('分类已删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(errorMessage(error, '删除分类失败'))
  }
}

/* ---------------- 选择 / 批量 ---------------- */
function toggleSelect(id) {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) selectedIds.value.splice(index, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll(event) {
  selectedIds.value = event.target.checked ? filteredPackages.value.map((item) => item.id) : []
}

function enterBatchMode() {
  batchMode.value = true
}

function exitBatchMode() {
  batchMode.value = false
  selectedIds.value = []
}

function handleBulkCommand(command) {
  enterBatchMode()
  if (!selectedIds.value.length) {
    ElMessage.info('已进入批量管理，先在列表里勾选要操作的技能包')
    return
  }
  if (command === 'rename') openRename()
  else if (command === 'visibility') openVisibility()
  else if (command === 'delete') bulkRemove()
}

/* ---------------- 单行操作 ---------------- */
function handleRowCommand(item, command) {
  if (command === 'edit') openEdit(item)
  else if (command === 'detail') openDetail(item)
  else if (command === 'convert') openConvert(item)
  else if (command === 'open-skill') goSkill(item.convertedSkillId)
  else if (command === 'ignore') markOne(item, 'ignored')
  else if (command === 'restore') markOne(item, 'pending')
  else if (command === 'delete') removeOne(item)
}

async function toggleVisibility(item, value) {
  visibilityBusy.value = item.id
  try {
    const result = await setSkillPackagesVisibility([item.id], Boolean(value))
    const skipped = result.skipped || []
    if (skipped.length) {
      ElMessage.warning(skipped[0].reason)
    } else {
      ElMessage.success(value ? '已上线，用户端马上能看到' : '已下线，用户端不再显示')
    }
    await loadPackages()
  } catch (error) {
    ElMessage.error(errorMessage(error, '上下线失败'))
    await loadPackages()
  } finally {
    visibilityBusy.value = ''
  }
}

/* ---------------- 编辑 ---------------- */
function openEdit(item) {
  editingPackage.value = item
  editForm.title = item.title || ''
  editForm.summary = item.summary || ''
  editForm.coverUrl = item.coverUrl || ''
  // 未分类在服务端是一条真实记录，但表单里用空值表示，提交时会被归类到未分类。
  editForm.categoryId = item.categoryName && item.categoryName !== '未分类' ? item.categoryId : ''
  editVisible.value = true
}

async function uploadCover(file) {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('请选择 PNG、JPG 或 WEBP 图片')
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8MB，请先压缩')
  const url = await uploadEditableAiSkillCover(await readAsDataUrl(file))
  if (!url) throw new Error('上传未返回地址')
  return url
}

async function handleEditCover(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  coverUploading.value = true
  try {
    editForm.coverUrl = await uploadCover(file)
  } catch (error) {
    ElMessage.error(errorMessage(error, '封面图上传失败'))
  } finally {
    coverUploading.value = false
  }
}

async function submitEdit() {
  if (!editingPackage.value) return
  if (!editForm.title.trim()) { ElMessage.warning('标题不能为空'); return }
  editSaving.value = true
  try {
    await updateSkillPackage(editingPackage.value.id, {
      title: editForm.title.trim(),
      summary: editForm.summary.trim(),
      coverUrl: editForm.coverUrl,
    })
    // 分类单独走批量接口：这样「把包塞进某个分类」只有一处实现，不会出现两套口径。
    const currentCategoryId = editingPackage.value.categoryName === '未分类' ? '' : (editingPackage.value.categoryId || '')
    if ((editForm.categoryId || '') !== currentCategoryId) {
      await setSkillPackagesCategory([editingPackage.value.id], editForm.categoryId || '')
    }
    editVisible.value = false
    await reload()
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    editSaving.value = false
  }
}

/* ---------------- 批量改名 / 上下线 / 删除 ---------------- */
function openRename() {
  if (!selectedIds.value.length) { ElMessage.warning('请先勾选要改名的技能包'); return }
  renameForm.prefix = ''
  renameForm.suffix = ''
  renameForm.find = ''
  renameForm.replace = ''
  renameVisible.value = true
}

async function submitRename() {
  if (!renamePreview.value.length) return
  renaming.value = true
  try {
    const result = await renameSkillPackages({
      ids: selectedIds.value,
      prefix: renameForm.prefix,
      suffix: renameForm.suffix,
      find: renameForm.find,
      replace: renameForm.replace,
    })
    const updated = result.updated?.length || 0
    const skipped = result.skipped || []
    renameVisible.value = false
    await reload()
    if (updated) ElMessage.success(`已改名 ${updated} 个`)
    if (skipped.length) ElMessage.warning({ message: `${skipped.length} 个没改：${skipped[0].reason}`, duration: 5000 })
    if (!updated && !skipped.length) ElMessage.info('名称没有变化')
  } catch (error) {
    ElMessage.error(errorMessage(error, '批量改名失败'))
  } finally {
    renaming.value = false
  }
}

function openVisibility() {
  if (!selectedIds.value.length) { ElMessage.warning('请先勾选要上下线的技能包'); return }
  visibilityForm.visible = true
  visibilityVisible.value = true
}

async function submitVisibility() {
  visibilitySaving.value = true
  try {
    const result = await setSkillPackagesVisibility(selectedIds.value, visibilityForm.visible)
    const updated = result.updated?.length || 0
    const skipped = result.skipped || []
    visibilityVisible.value = false
    await reload()
    if (updated) ElMessage.success(`已${visibilityForm.visible ? '上线' : '下线'} ${updated} 个`)
    if (skipped.length) ElMessage.warning({ message: `${skipped.length} 个跳过：${skipped[0].reason}`, duration: 6000 })
  } catch (error) {
    ElMessage.error(errorMessage(error, '上下线失败'))
  } finally {
    visibilitySaving.value = false
  }
}

async function markOne(item, status) {
  try {
    await bulkSkillPackages([item.id], status)
    await loadPackages()
    ElMessage.success(status === 'ignored' ? '已标记忽略' : '已恢复待整理')
  } catch (error) {
    ElMessage.error(errorMessage(error, '状态更新失败'))
  }
}

async function removeOne(item) {
  try {
    await ElMessageBox.confirm(
      item.status === 'converted'
        ? `删除「${item.title}」的导入记录？已经转出来的玩法不受影响，仍会留在玩法列表里。`
        : `删除「${item.title}」的导入记录？此操作不可恢复。`,
      '删除技能包记录',
      { type: 'warning', confirmButtonText: '删除' },
    )
    await removeSkillPackages([item.id])
    await reload()
    ElMessage.success('已删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(errorMessage(error, '删除失败'))
  }
}

async function bulkRemove() {
  const count = selectedIds.value.length
  if (!count) { ElMessage.warning('请先勾选要删除的技能包'); return }
  // 安全闸：弹窗里逐条念出标题，再让老师亲手敲「删除」才放行，避免误删一整批导入的包。
  const titles = packages.value.filter((item) => selectedIds.value.includes(item.id)).map((item) => `· ${item.title}`)
  try {
    const { value } = await ElMessageBox.prompt(
      `即将删除以下 ${count} 个技能包记录（已转出的玩法不受影响）：\n\n${titles.slice(0, 20).join('\n')}${count > 20 ? `\n… 还有 ${count - 20} 个` : ''}\n\n请在下面输入「删除」两个字确认。`,
      '批量删除，请确认',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        inputPattern: /^删除$/,
        inputErrorMessage: '请输入「删除」两个字',
        customClass: 'package-bulk-delete',
      },
    )
    if (value !== '删除') return
    await removeSkillPackages(selectedIds.value)
    selectedIds.value = []
    await reload()
    ElMessage.success(`已删除 ${count} 个技能包记录`)
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(errorMessage(error, '批量删除失败'))
  }
}

/* ---------------- 读取文件 ---------------- */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`${file.name} 读取失败`))
    reader.readAsText(file)
  })
}
function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

const byDepth = (a, b) => a.split('/').length - b.split('/').length

/* 一个 zip / 一个文件夹里可能有多个技能包（每个技能包一个 SKILL.md）。
 * 早先只取第一个，剩下的静默丢掉 —— 这里改成全都取回来，一个 SKILL.md 一条记录。
 * 没有标准 SKILL.md 名时，只取层级最浅的那批 .md（避免把 README、CHANGELOG 也导进来）。
 */
function pickSkillMarkdowns(paths) {
  const markdowns = paths.filter((path) => /\.(md|markdown)$/i.test(path))
  if (!markdowns.length) return []
  const exact = markdowns.filter((path) => /(^|\/)SKILL\.md$/i.test(path)).sort(byDepth)
  if (exact.length) return exact
  const sorted = [...markdowns].sort(byDepth)
  const minDepth = sorted[0].split('/').length
  return sorted.filter((path) => path.split('/').length === minDepth)
}

function pickCoverImage(paths) {
  const images = paths.filter((path) => /\.(png|jpe?g|webp)$/i.test(path) && !path.includes('__MACOSX'))
  if (!images.length) return ''
  const named = images.find((path) => /(^|\/)(cover|封面|preview|thumbnail)\.(png|jpe?g|webp)$/i.test(path))
  return named || [...images].sort(byDepth)[0]
}

async function blobToCover(blob) {
  if (!blob || blob.size > 8 * 1024 * 1024) return ''
  try {
    return await uploadEditableAiSkillCover(await readAsDataUrl(blob))
  } catch {
    return ''
  }
}

async function parseZipFile(file) {
  const zip = await JSZip.loadAsync(file)
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path].dir && !path.includes('__MACOSX'))
  const markdowns = pickSkillMarkdowns(paths)
  if (!markdowns.length) throw new Error('这个 zip 里没有 .md 文件，可能不是技能包')
  // 封面只给第一个包（通常就是主包），后面的包共用一张图比全空着好。
  const coverPath = pickCoverImage(paths)
  const coverUrl = coverPath ? await blobToCover(await zip.files[coverPath].async('blob')) : ''
  const items = []
  for (const path of markdowns) {
    items.push({
      fileName: path.split('/').pop() || file.name,
      content: await zip.files[path].async('string'),
      coverUrl: path === markdowns[0] ? coverUrl : '',
    })
  }
  return items
}

// 文件夹上传：按目录分组，每个含 SKILL.md 的目录算一个技能包，封面取同目录里的图。
async function parseFolderFiles(files) {
  const groups = new Map()
  for (const file of files) {
    const path = file.webkitRelativePath || file.name
    const slash = path.lastIndexOf('/')
    const dir = slash >= 0 ? path.slice(0, slash) : ''
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir).push(file)
  }
  const items = []
  for (const [dir, group] of groups) {
    const markdowns = group.filter((file) => /\.(md|markdown)$/i.test(file.name))
    if (!markdowns.length) continue
    const exact = markdowns.filter((file) => /^SKILL\.md$/i.test(file.name))
    const chosen = exact.length ? exact : markdowns.slice(0, 1)
    const coverFile = group.find((file) => /^image\/(png|jpeg|webp)$/i.test(file.type) && /(^|[-_])(cover|封面|preview|thumbnail)/i.test(file.name))
      || group.find((file) => /^image\/(png|jpeg|webp)$/i.test(file.type))
    const coverUrl = coverFile ? await blobToCover(coverFile) : ''
    for (const file of chosen) {
      items.push({ fileName: `${dir ? `${dir}/` : ''}${file.name}`, content: await readAsText(file), coverUrl })
    }
  }
  return items
}

async function handleDrop(event) {
  dragging.value = false
  await ingestFiles([...(event.dataTransfer?.files || [])])
}
async function handleFiles(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  await ingestFiles(files)
}

// 30 是「一次导入多少个技能包」的上限，不是文件数：一个 zip 里可能装十个包。
async function ingestFiles(files) {
  if (!files.length) return
  importing.value = true
  const items = []
  const failed = []
  try {
    const zips = files.filter((file) => /\.zip$/i.test(file.name))
    const markdowns = files.filter((file) => /\.(md|markdown|txt)$/i.test(file.name) && !file.webkitRelativePath)
    const folderFiles = files.filter((file) => Boolean(file.webkitRelativePath))

    for (const file of zips) {
      try {
        items.push(...await parseZipFile(file))
      } catch (error) {
        failed.push(`${file.name}：${error.message}`)
      }
    }
    for (const file of markdowns) {
      try {
        items.push({ fileName: file.name, content: await readAsText(file), coverUrl: '' })
      } catch (error) {
        failed.push(`${file.name}：${error.message}`)
      }
    }
    if (folderFiles.length) {
      try {
        const folderItems = await parseFolderFiles(folderFiles)
        if (!folderItems.length) failed.push('文件夹里没有找到 .md 技能文件')
        items.push(...folderItems)
      } catch (error) {
        failed.push(`文件夹读取失败：${error.message}`)
      }
    }

    if (items.length > 30) {
      ElMessage.warning(`这次识别到 ${items.length} 个技能包，一次最多导入 30 个，先导入前 30 个`)
      items.length = 30
    }

    if (items.length) {
      const result = await importSkillPackages(items)
      const importedCount = result.imported?.length || 0
      const skipped = result.skipped || []
      if (importedCount) ElMessage.success(`本次导入 ${importedCount} 个技能包`)
      if (skipped.length) ElMessage.warning({ message: `${skipped.length} 个没导入：${skipped[0].reason}`, duration: 5000 })
      await reload()
    }
    if (failed.length) ElMessage.error({ message: failed.slice(0, 2).join('；'), duration: 6000 })
  } catch (error) {
    ElMessage.error(errorMessage(error, '导入失败'))
  } finally {
    importing.value = false
  }
}

function pickUpload(command) {
  if (command === 'folder') folderInput.value?.click()
  else fileInput.value?.click()
}

/* ---------------- 转成玩法 ---------------- */
function openConvert(item) {
  converting.value = item
  convertForm.skillType = 'image'
  convertForm.title = item.title || ''
  convertForm.summary = item.summary || ''
  convertForm.coverUrl = item.coverUrl || ''
  // 默认带第一条候选：完全空着老师反而不知道从哪下手，反正能改。
  convertForm.promptTemplate = item.promptCandidates?.[0] || '{{subject}}'
  convertVisible.value = true
}
function useCandidate(cand) {
  // 候选多半是一句「帮我做一张…」的需求描述，不是画面描述。
  // 直接把用户填的内容接在后面，老师再改成描述语即可，比整段替换掉 {{subject}} 更安全。
  convertForm.promptTemplate = convertForm.promptTemplate.includes('{{subject}}')
    ? convertForm.promptTemplate
    : `${cand}，画面主体是{{subject}}`
  ElMessage.info('已填入，请把「帮我做一张」这类话改成画面描述')
}
async function handleConvertCover(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  coverUploading.value = true
  try {
    convertForm.coverUrl = await uploadCover(file)
  } catch (error) {
    ElMessage.error(errorMessage(error, '封面图上传失败'))
  } finally {
    coverUploading.value = false
  }
}

async function submitConvert() {
  if (!converting.value) return
  if (!convertForm.title.trim()) { ElMessage.warning('请填写玩法名称'); return }
  if (!convertForm.promptTemplate.trim()) { ElMessage.warning('请填写生成提示词'); return }
  convertingNow.value = true
  try {
    const result = await convertSkillPackage(converting.value.id, {
      skillType: convertForm.skillType,
      title: convertForm.title.trim(),
      summary: convertForm.summary.trim(),
      promptTemplate: convertForm.promptTemplate.trim(),
      coverUrl: convertForm.coverUrl,
    })
    convertVisible.value = false
    await reload()
    const skillId = result?.skill?.id
    if (skillId) {
      try {
        await ElMessageBox.confirm(
          '草稿玩法已生成。现在去配置工作流和用户页面，测试通过后发布，用户端就能看到了。',
          '接下来这一步不能省',
          { confirmButtonText: '去配置工作流', cancelButtonText: '稍后再说', type: 'success' },
        )
        goSkill(skillId)
      } catch {}
    } else {
      ElMessage.success('草稿玩法已生成')
    }
  } catch (error) {
    ElMessage.error(errorMessage(error, '转成玩法失败'))
  } finally {
    convertingNow.value = false
  }
}

function goSkill(skillId) {
  router.push(`/admin/ai-skills/${encodeURIComponent(skillId)}/workflow`)
}

/* ---------------- 详情 ---------------- */
async function openDetail(item) {
  detail.value = null
  detailVisible.value = true
  try {
    detail.value = await getSkillPackageDetail(item.id)
  } catch (error) {
    ElMessage.error(errorMessage(error, '正文加载失败'))
    detailVisible.value = false
  }
}

// 搜索框原来只改了 keyword，没有任何地方按关键词重新读列表，输了等于没输；停手 300ms 后重新读取。
let keywordTimer = 0
watch(keyword, () => {
  clearTimeout(keywordTimer)
  keywordTimer = setTimeout(loadPackages, 300)
})
onBeforeUnmount(() => clearTimeout(keywordTimer))

onMounted(reload)
</script>

<style scoped>
/* 技能包（2026-11-26 第二版）：说明条 + 一张玻璃卡（工具条 / 拖拽条 / 批量条 / 表格），弹窗走 ax-dialog；组件类名一律 pk- 前缀 */
.pk-page { display: grid; gap: 14px; min-width: 0; }

/* ---------- 工具条 ---------- */
.pk-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--ax-line); }
.pk-search { flex: 0 1 300px; min-width: 200px; }
.pk-spacer { flex: 1 1 auto; }
.pk-caret { transform: rotate(90deg); }
.adm-icon.is-plain.pk-caret { width: 13px; height: 13px; opacity: 0.75; }
.pk-upload { display: inline-flex; align-items: stretch; }
.pk-upload > .pk-upload-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.pk-upload .pk-upload-caret { padding: 0 9px; border-top-left-radius: 0; border-bottom-left-radius: 0; box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.38); }

/* ---------- 拖拽导入条 ---------- */
.pk-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 14px 18px 6px;
  padding: 14px 16px;
  border: 1.5px dashed var(--ax-line-strong);
  border-radius: var(--ax-radius);
  background: rgba(255, 255, 255, 0.45);
  color: var(--ax-muted);
  font-size: 13px;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.pk-drop.is-dragging { border-color: var(--ax-brand); background: var(--ax-brand-soft); color: var(--ax-brand); }

/* ---------- 批量条 ---------- */
.pk-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 8px 18px 4px; padding: 8px 10px 8px 14px; border-radius: 12px; background: var(--ax-brand-soft); color: var(--ax-text); font-size: 13px; }
.pk-bulk-check { display: inline-flex; align-items: center; gap: 7px; color: var(--ax-ink); font-weight: 600; cursor: pointer; }
.pk-bulk-check > input { width: 16px; height: 16px; margin: 0; accent-color: var(--ax-brand); cursor: pointer; }
.pk-bulk-count b { color: var(--ax-brand); font-variant-numeric: tabular-nums; }
.pk-bulk-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.pk-bulk-actions > .ax-btn:not(.is-danger):not(.is-ghost) { background: rgba(255, 255, 255, 0.86); }
.pk-bulk-actions > .ax-btn:not(.is-danger):not(.is-ghost):hover { background: #fff; }

.pk-state { margin: 16px 18px; }
.pk-state > span { flex: 1; }

/* ---------- 表格 ---------- */
.pk-table { table-layout: fixed; }
.pk-table .is-check { width: 48px; }
.pk-col-cat { width: 132px; }
.pk-col-status { width: 104px; }
.pk-col-vis { width: 92px; }
.pk-col-more { width: 64px; }
.pk-table td { padding-top: 11px; padding-bottom: 11px; }
.pk-table tr.is-picked td { background: rgba(var(--ax-brand-rgb), 0.05); }
.pk-cell { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pk-cover { display: grid; flex: none; place-items: center; width: 84px; height: 34px; overflow: hidden; border-radius: 9px; background: var(--ax-fill); color: var(--ax-muted); }
.pk-cover > img { width: 100%; height: 100%; object-fit: cover; }
.pk-cell-main { display: grid; gap: 2px; min-width: 0; }
.pk-cell-main > strong { overflow: hidden; color: var(--ax-ink); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.pk-cell-main > small { overflow: hidden; color: var(--ax-muted); font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
.pk-cell-main > small.is-empty { color: var(--ax-faint); }
.pk-cat-tag { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.pk-tag-muted { background: var(--ax-fill); color: var(--ax-muted); }

.pk-icon-btn { display: inline-grid; flex: none; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--ax-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
.pk-icon-btn:hover:not(:disabled) { background: var(--ax-fill); color: var(--ax-ink); }
.pk-icon-btn.is-ok:hover:not(:disabled) { background: var(--ax-ok-soft); color: var(--ax-ok); }
.pk-icon-btn.is-danger:hover:not(:disabled) { background: var(--ax-bad-soft); color: var(--ax-bad); }
.pk-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pk-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pk-icon-btn > .adm-icon.is-plain { width: 17px; height: 17px; }
.pk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- 分类浮层（内容随组件编译，带 scoped 属性，挂到 body 也选得到） ---------- */
.pk-cat-panel { display: grid; gap: 8px; }
.pk-cat-create { display: flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border: 1.5px dashed var(--ax-line-strong); border-radius: 10px; background: transparent; color: var(--ax-brand); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
.pk-cat-create:hover { border-color: transparent; background: var(--ax-brand-soft); }
.pk-cat-create > .adm-icon.is-plain { width: 15px; height: 15px; }
.pk-cat-list { display: grid; gap: 2px; max-height: 300px; overflow-y: auto; }
.pk-cat-row { display: flex; align-items: center; gap: 2px; }
.pk-cat-row.is-editing { gap: 4px; }
.pk-cat-row.is-editing > .ax-input { flex: 1; min-width: 0; height: 34px; }
.pk-cat-name { display: flex; flex: 1; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; height: 36px; padding: 0 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ax-text); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; transition: background 0.15s ease; }
.pk-cat-name:hover { background: var(--ax-fill); }
.pk-cat-name.is-active { background: var(--ax-brand-soft); color: var(--ax-brand); font-weight: 600; }
.pk-cat-name > em { color: var(--ax-muted); font-size: 12px; font-style: normal; font-weight: 500; font-variant-numeric: tabular-nums; }
.pk-cat-name.is-active > em { color: var(--ax-brand); }
.pk-cat-empty { margin: 4px 0 2px; color: var(--ax-muted); font-size: 12.5px; text-align: center; }

/* ---------- 弹窗里的表单 ---------- */
.pk-form { display: grid; gap: 14px; }
.pk-form > .ax-note { margin: 0; }
.pk-cover-picker { display: flex; align-items: center; gap: 16px; }
.pk-cover-preview { display: grid; flex: none; place-items: center; width: 192px; aspect-ratio: 3 / 1; overflow: hidden; border-radius: 12px; background: var(--ax-fill); color: var(--ax-muted); }
.pk-cover-preview.is-empty { border: 1.5px dashed var(--ax-line-strong); background: var(--ax-surface-2); }
.pk-cover-preview > img { width: 100%; height: 100%; object-fit: cover; }
.pk-cover-actions { display: grid; gap: 8px; min-width: 0; }
.pk-cover-buttons { display: flex; flex-wrap: wrap; gap: 8px; }

/* 批量改名预览 */
.pk-preview { padding: 12px 14px; border-radius: 12px; background: var(--ax-surface-2); }
.pk-preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.pk-preview-head > strong { color: var(--ax-ink); font-size: 13.5px; }
.pk-preview-head > span { color: var(--ax-muted); font-size: 12.5px; }
.pk-preview ul { display: grid; margin: 0; padding: 0; list-style: none; }
.pk-preview li { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--ax-line); font-size: 13px; }
.pk-preview li:first-child { border-top: 0; }
.pk-from,
.pk-to { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-from { color: var(--ax-muted); }
.pk-to { color: var(--ax-ink); font-weight: 600; }
.pk-to.is-empty { color: var(--ax-bad); font-weight: 400; }
.adm-icon.is-plain.pk-preview-arrow { width: 14px; height: 14px; color: var(--ax-faint); }
.pk-preview-empty { margin: 4px 0 0; color: var(--ax-muted); font-size: 12.5px; }

/* 批量上下线：整宽分段 */
.pk-seg { display: flex; width: 100%; padding: 3px; border-radius: 11px; }
.pk-seg > button { flex: 1; height: 34px; border-radius: 8px; font-size: 13.5px; }

/* 转成玩法 */
.pk-group { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid var(--ax-line); }
.pk-form > .ax-note + .pk-group { padding-top: 0; border-top: 0; }
.pk-group > h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; color: var(--ax-ink); font-size: 14px; font-weight: 600; }
.pk-group > h4 > small { color: var(--ax-muted); font-size: 12px; font-weight: 400; }
.pk-group code,
.pk-prompt-meta code { padding: 1px 5px; border-radius: 5px; background: var(--ax-fill); color: var(--ax-ink); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.pk-type { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pk-type > button { display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 14px; border: 1px solid var(--ax-line-strong); border-radius: var(--ax-radius); background: rgba(255, 255, 255, 0.7); color: var(--ax-text); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease; }
.pk-type > button:hover { border-color: rgba(var(--ax-brand-rgb), 0.4); }
.pk-type > button.is-active { border-color: var(--ax-brand); background: #fff; color: var(--ax-ink); box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pk-type > button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pk-prompt-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; margin-top: -4px; color: var(--ax-muted); font-size: 12px; }
.pk-warn { color: var(--ax-warn); }

.pk-cands { border: 1px solid var(--ax-line); border-radius: 12px; background: rgba(255, 255, 255, 0.55); }
.pk-cands > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; color: var(--ax-ink); font-size: 13px; font-weight: 600; cursor: pointer; list-style: none; }
.pk-cands > summary::-webkit-details-marker { display: none; }
.pk-cands > summary:focus-visible { outline: none; border-radius: 12px; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pk-cands > summary > span { display: grid; gap: 2px; }
.pk-cands > summary small { color: var(--ax-muted); font-size: 12px; font-weight: 400; }
.pk-cands-icon { color: var(--ax-muted); transition: transform 0.2s ease; }
.pk-cands[open] .pk-cands-icon { transform: rotate(90deg); }
.pk-cand-list { display: grid; gap: 4px; max-height: 240px; padding: 0 8px 8px; overflow-y: auto; }
.pk-cand-list > button { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 10px; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ax-text); font: inherit; font-size: 13px; line-height: 1.55; text-align: left; cursor: pointer; }
.pk-cand-list > button:hover { background: var(--ax-brand-soft); }
.pk-cand-list > button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pk-cand-list i { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: var(--ax-fill); color: var(--ax-muted); font-size: 11.5px; font-style: normal; font-weight: 600; }

/* 查看正文 */
.pk-detail { display: grid; gap: 12px; }
.pk-detail-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.pk-detail-meta > span { display: inline-flex; gap: 6px; padding: 4px 10px; border-radius: 10px; background: var(--ax-surface-2); color: var(--ax-text); font-size: 12.5px; }
.pk-detail-meta b { color: var(--ax-muted); font-weight: 500; white-space: nowrap; }
.pk-detail-body { max-height: 58vh; margin: 0; padding: 14px 16px; overflow: auto; border-radius: 12px; background: var(--ax-surface-2); color: var(--ax-ink); font: 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }

/* 全站 button 有触屏最小高度，这里的紧凑按钮自己定高；触屏设备上再放大一点 */
.pk-cat-create,
.pk-cat-name,
.pk-icon-btn,
.pk-type > button,
.pk-cand-list > button { min-height: 0; }
@media (pointer: coarse) {
  .pk-cat-create,
  .pk-cat-name { height: 42px; }
  .pk-icon-btn { width: 36px; height: 36px; }
}

@media (max-width: 900px) {
  .pk-toolbar { padding: 12px 14px; }
  /* 窄屏：按钮和上传留在第一行，搜索框单独占满第二行 */
  .pk-search { flex: 1 1 100%; order: 10; max-width: none; }
  .pk-drop { margin-right: 14px; margin-left: 14px; }
  .pk-bulk { margin-right: 14px; margin-left: 14px; }
}
@media (max-width: 640px) {
  .pk-search { flex: 1 1 100%; }
  .pk-col-cat { display: none; }
  .pk-type { grid-template-columns: 1fr; }
  .pk-cover-picker { flex-direction: column; align-items: flex-start; }
}
</style>

<style>
/* 下拉菜单、分类浮层、批量删除确认框都挂在 body 上，scoped 管不到外壳 */
.el-dropdown-menu__item.pk-danger-item { color: #ff3b30; }
.el-dropdown-menu__item.pk-danger-item:not(.is-disabled):hover,
.el-dropdown-menu__item.pk-danger-item:not(.is-disabled):focus { background: rgba(255, 59, 48, 0.08); color: #ff3b30; }
.el-popover.el-popper.pk-cat-popper {
  padding: 10px;
  border: 1px solid var(--ax-glass-edge);
  border-radius: 16px;
  background: rgba(248, 249, 252, 0.94);
  box-shadow: var(--ax-shadow-pop);
  -webkit-backdrop-filter: var(--ax-blur);
  backdrop-filter: var(--ax-blur);
}
/* 批量删除确认会逐条列出标题；原来换行被合并成一整段，看不清删的是哪几个 */
/* 确认框带输入框时，正文在 <label> 里，不带时在 <p> 里，两种都要保留换行 */
.el-message-box.package-bulk-delete .el-message-box__message > p,
.el-message-box.package-bulk-delete .el-message-box__message > label { display: block; max-height: 46vh; overflow-y: auto; line-height: 1.6; white-space: pre-line; }
</style>
