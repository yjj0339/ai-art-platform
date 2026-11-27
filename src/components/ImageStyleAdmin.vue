<template>
  <section class="ax-page st-page">
    <header class="ax-head">
      <div>
        <h2>AI图像功能管理</h2>
        <p>这里配好的风格会直接出现在用户端绘画页的「图像风格」里。一个风格 = 一张方形封面图 + 一句风格提示词 + 一个分类。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" @click="openSettings"><AdminIcon name="settings" plain />模板设置</button>
        <button type="button" class="ax-btn" @click="openCategory"><AdminIcon name="folder" plain />分类设置</button>
        <button type="button" class="ax-btn is-primary" @click="openForm()"><AdminIcon name="plus" plain />新建风格</button>
      </div>
    </header>

    <p class="ax-note is-plain"><span>封面图按<b>正方形 1:1</b>存放（建议 512×512 以上），没上传封面的风格在用户端显示成文字卡。分类留空就归到「推荐」，用户端按首次出现的顺序排分类标签；分类本身在「分类设置」里新建、改名、删除。</span></p>

    <div v-if="loadError" class="ax-note is-bad st-note" role="alert"><span>{{ loadError }}</span><button type="button" class="ax-btn is-sm" @click="loadStyles">重新加载</button></div>
    <p v-if="notice" class="ax-note is-ok">{{ notice }}</p>

    <div v-if="loading" class="ax-card"><div class="ax-empty is-compact" aria-live="polite"><strong>正在读取风格模板…</strong></div></div>
    <div v-else-if="!styles.length" class="ax-card">
      <div class="ax-empty">
        <strong>还没有风格模板</strong>
        <span>用户端现在显示系统自带的 8 个风格。在这里新建风格后，就改由后台配置决定。</span>
      </div>
    </div>

    <template v-else>
      <div class="st-toolbar">
        <nav class="st-groups" aria-label="按分类筛选">
          <button type="button" class="st-chip" :class="{ 'is-active': groupFilter === '__all__' }" @click="groupFilter = '__all__'">全部<em>{{ styles.length }}</em></button>
          <button v-for="group in groupNames" :key="group" type="button" class="st-chip" :class="{ 'is-active': groupFilter === group }" @click="groupFilter = group">{{ group }}<em>{{ countOfGroup(group) }}</em></button>
        </nav>
        <div class="st-tools">
          <button type="button" class="ax-btn is-sm" :class="{ 'is-soft': batchMode }" :aria-pressed="batchMode" @click="toggleBatchMode"><AdminIcon name="check" plain />{{ batchMode ? '退出批量' : '批量管理' }}</button>
          <div class="ax-seg" role="group" aria-label="展示方式">
            <button type="button" :class="{ 'is-active': viewMode === 'grid' }" :aria-pressed="viewMode === 'grid'" @click="setViewMode('grid')">卡片</button>
            <button type="button" :class="{ 'is-active': viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="setViewMode('list')">列表</button>
          </div>
        </div>
      </div>

      <!-- 批量条：进「批量管理」才出现；按钮一直在，没勾选时置灰，不用先勾一个才看得到有哪些功能 -->
      <div v-if="batchMode" class="ax-card st-batch">
        <div class="st-batch-row">
          <strong class="st-batch-count">已选 {{ selectedIds.length }} 个</strong>
          <button type="button" class="ax-btn is-sm is-ghost" :disabled="busy || !visibleStyles.length" @click="togglePickAll">{{ allPicked ? '取消全选' : `全选${groupFilter === '__all__' ? '' : '本分类'}` }}</button>
          <button type="button" class="ax-btn is-sm is-ghost" :disabled="busy || !selectedIds.length" @click="clearSelection">取消选择</button>
          <span class="st-batch-actions">
            <button type="button" class="ax-btn is-sm" :disabled="busy || !selectedIds.length" @click="runBatch('enable')">批量启用</button>
            <button type="button" class="ax-btn is-sm" :disabled="busy || !selectedIds.length" @click="runBatch('disable')">批量停用</button>
            <button type="button" class="ax-btn is-sm" :disabled="busy || !selectedIds.length" @click="openBatchGroup">批量改分类</button>
            <button type="button" class="ax-btn is-sm is-danger" :disabled="busy || !selectedIds.length" @click="runBatch('delete')"><AdminIcon name="trash" plain />批量删除</button>
          </span>
        </div>
        <div v-if="batchGroupOpen" class="st-batch-group">
          <span>把选中的 {{ selectedIds.length }} 个风格移到</span>
          <!-- 用真下拉：批量条默认预填当前分类，用 datalist 会被预填值过滤成只剩一项 -->
          <select v-model="batchGroupName" class="ax-select" aria-label="目标分类">
            <option v-if="batchGroupName && !groupNames.includes(batchGroupName)" :value="batchGroupName">{{ batchGroupName }}</option>
            <option v-for="group in groupNames" :key="group" :value="group">{{ group }}</option>
          </select>
          <button type="button" class="ax-btn is-sm is-primary" :disabled="busy || !batchGroupName" @click="runBatch('group')">确定</button>
          <button type="button" class="ax-btn is-sm is-ghost" @click="batchGroupOpen = false">取消</button>
        </div>
        <small class="ax-hint">勾选下方卡片或行即可操作。删除只删勾选的那几个；在「分类设置」里删分类不会删风格。</small>
      </div>

      <!-- 卡片模式 -->
      <div v-if="viewMode === 'grid'" class="st-grid">
        <article
          v-for="(item, index) in visibleStyles"
          :key="item.id"
          class="st-card"
          :class="{ 'is-off': item.status !== 'enabled', 'is-picked': batchMode && isPicked(item.id), 'is-batch': batchMode }"
          @click="batchMode && togglePick(item.id)"
        >
          <div class="st-cover" :class="{ 'is-empty': !item.coverImageUrl }">
            <img v-if="item.coverImageUrl" :src="item.coverImageUrl" :alt="`${item.name} 封面`" loading="lazy" />
            <span v-else class="st-cover-empty"><AdminIcon name="image" plain />未上传封面</span>
            <span v-if="item.status !== 'enabled'" class="ax-pill is-muted st-cover-tag">{{ item.status === 'archived' ? '已归档' : '已停用' }}</span>
            <label v-if="batchMode" class="st-check" :title="isPicked(item.id) ? '取消选择' : '选择这个风格'" @click.stop>
              <input type="checkbox" :checked="isPicked(item.id)" :aria-label="`选择 ${item.name}`" @change="togglePick(item.id)" />
              <i></i>
            </label>
          </div>
          <div class="st-body">
            <div class="st-title"><strong>{{ item.name }}</strong><em class="ax-tag">{{ item.groupName }}</em></div>
            <p class="st-prompt" :class="{ 'is-empty': !item.prompt }" :title="item.prompt">{{ item.prompt || '未填风格提示词，选中后不会给画面加风格描述' }}</p>
          </div>
          <div class="st-foot" @click.stop>
            <span class="st-order">
              <button type="button" class="st-icon-btn" :disabled="index === 0 || busy" aria-label="上移" title="上移" @click="move(item, -1)"><AdminIcon name="arrowUp" plain /></button>
              <button type="button" class="st-icon-btn" :disabled="index === visibleStyles.length - 1 || busy" aria-label="下移" title="下移" @click="move(item, 1)"><AdminIcon name="arrowDown" plain /></button>
            </span>
            <label class="ax-switch st-switch" :title="item.status === 'enabled' ? '启用中，点击停用' : '点击启用'">
              <input type="checkbox" :checked="item.status === 'enabled'" :disabled="busy" :aria-label="`启用 ${item.name}`" @click.prevent="toggleStatus(item)" />
              <i></i>
            </label>
            <button type="button" class="ax-btn is-sm" @click="openForm(item)">编辑</button>
            <button type="button" class="st-icon-btn is-danger" aria-label="删除" title="删除" @click="removeStyle(item)"><AdminIcon name="trash" plain /></button>
          </div>
        </article>
      </div>

      <!-- 列表模式 -->
      <div v-else class="ax-card is-flush">
        <div class="ax-table-wrap">
          <table class="ax-table st-table">
            <thead>
              <tr>
                <!-- 勾选列只在「批量管理」下出现，平时列表保持干净 -->
                <th v-if="batchMode" class="is-check"><input type="checkbox" :checked="allPicked" :indeterminate.prop="partialPicked" aria-label="全选当前列表" @change="togglePickAll" /></th>
                <th>风格</th>
                <th>分类</th>
                <th>风格提示词</th>
                <th class="is-center">顺序</th>
                <th>状态</th>
                <th class="is-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in visibleStyles" :key="item.id" :class="{ 'is-off': item.status !== 'enabled', 'is-picked': batchMode && isPicked(item.id) }">
                <td v-if="batchMode" class="is-check"><input type="checkbox" :checked="isPicked(item.id)" :aria-label="`选择 ${item.name}`" @change="togglePick(item.id)" /></td>
                <td>
                  <span class="st-cell">
                    <span class="st-thumb"><img v-if="item.coverImageUrl" :src="item.coverImageUrl" :alt="`${item.name} 封面`" loading="lazy" /><AdminIcon v-else name="image" plain /></span>
                    <strong>{{ item.name }}</strong>
                  </span>
                </td>
                <td><em class="ax-tag">{{ item.groupName }}</em></td>
                <td><span class="st-cell-prompt" :title="item.prompt">{{ item.prompt || '—' }}</span></td>
                <td class="is-center">
                  <span class="st-order">
                    <button type="button" class="st-icon-btn" :disabled="index === 0 || busy" aria-label="上移" title="上移" @click="move(item, -1)"><AdminIcon name="arrowUp" plain /></button>
                    <button type="button" class="st-icon-btn" :disabled="index === visibleStyles.length - 1 || busy" aria-label="下移" title="下移" @click="move(item, 1)"><AdminIcon name="arrowDown" plain /></button>
                  </span>
                </td>
                <td><span class="ax-pill" :class="item.status === 'enabled' ? 'is-ok' : 'is-muted'">{{ statusLabel(item.status) }}</span></td>
                <td class="is-right">
                  <span class="st-row-actions">
                    <button type="button" class="ax-btn is-sm" @click="openForm(item)">编辑</button>
                    <button type="button" class="ax-btn is-sm" @click="toggleStatus(item)">{{ item.status === 'enabled' ? '停用' : '启用' }}</button>
                    <button type="button" class="ax-btn is-sm is-danger" @click="removeStyle(item)">删除</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 新建 / 编辑风格 -->
    <el-dialog v-model="formVisible" class="ax-dialog" :title="form.id ? '编辑风格' : '新建风格'" width="min(760px, 94vw)" align-center @close="closeForm">
      <form id="st-style-form" class="st-form" @submit.prevent="submitForm">
        <div class="ax-form">
          <label class="ax-field"><span>风格名称</span><input v-model.trim="form.name" maxlength="40" required placeholder="例如：3D毛绒" /></label>
          <label class="ax-field">
            <span>分类</span>
            <!-- 用真下拉而不是「输入框 + datalist」：datalist 会按已填文字过滤，预填「推荐」时就只剩一项 -->
            <select v-model="form.groupName">
              <option v-if="form.groupName && !groupNames.includes(form.groupName)" :value="form.groupName">{{ form.groupName }}</option>
              <option v-for="group in groupNames" :key="group" :value="group">{{ group }}</option>
            </select>
          </label>
        </div>

        <section class="st-group">
          <h4>模板封面图<small>方形 1:1，直接上传或让 AI 生成</small></h4>
          <div class="st-cover-editor">
            <div class="st-cover-preview" :class="{ 'is-empty': !form.coverImageUrl }">
              <img v-if="form.coverImageUrl" :src="form.coverImageUrl" alt="封面图预览" />
              <span v-else><AdminIcon name="image" plain />1:1</span>
            </div>
            <div class="st-cover-side">
              <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleCoverFile" />
              <div class="st-cover-buttons">
                <button type="button" class="ax-btn is-sm is-soft" :disabled="uploading" @click="coverInput?.click()"><AdminIcon name="upload" plain />{{ uploading ? '上传中…' : form.coverImageUrl ? '更换图片' : '上传图片' }}</button>
                <button type="button" class="ax-btn is-sm" :disabled="generating" @click="generateCover"><AdminIcon name="sparkles" plain />{{ generating ? '生成中…' : 'AI生成封面' }}</button>
                <button v-if="form.coverImageUrl" type="button" class="ax-btn is-sm is-ghost" @click="form.coverImageUrl = ''">移除</button>
              </div>
              <small class="ax-hint">图片会自动居中裁成正方形再存。PNG / JPG / WEBP，不超过 8MB。</small>

              <!--
                AI 出图的输入区：提示词由管理员自己写。
                🔴 绝不拿「风格名称」当提示词——名称只是显示用的标签（比如「3D毛绒」），模型照名字画只会出四个字或随便一张图。
                标题行用 div 而不是 label：label 里放按钮，点标题文字会误触「填入风格提示词」。
              -->
              <div class="ax-field">
                <span class="st-field-head">
                  <label for="st-cover-prompt">封面生成提示词</label>
                  <em>AI 只按这句话画，风格名称不参与</em>
                  <button type="button" class="ax-btn is-sm is-ghost" :disabled="!form.prompt.trim()" title="把下面的「风格提示词」改写成示例图描述填进来" @click="fillCoverPromptFromStyle">填入风格提示词</button>
                </span>
                <textarea id="st-cover-prompt" v-model.trim="form.coverPrompt" rows="2" maxlength="300" placeholder="例如：一只 3D 毛绒质感的红色小熊，正面居中，柔和棚拍光，纯白背景" />
              </div>
              <label class="ax-field">
                <span>出图模型</span>
                <select v-model="form.coverModelId" :title="coverModelLabel">
                  <option value="">自动（用后台默认图像模型）</option>
                  <option v-for="item in coverModelOptions" :key="item.id" :value="item.id">{{ item.label }}</option>
                </select>
                <small v-if="coverModelsLoading">正在读取可用模型…</small>
                <small v-else-if="!coverModelOptions.length" class="st-warn">没读到可用的图像模型。请先到「API 配置」启用图像模型，或者只用上传图片。</small>
                <small v-else>共 {{ coverModelOptions.length }} 个可用图像模型，选「自动」就用后台默认那个。</small>
              </label>
              <p v-if="generating" class="ax-note"><span>AI 正在出图，通常要十几秒，请不要关闭窗口。</span></p>
            </div>
          </div>
        </section>

        <label class="ax-field">
          <span>风格提示词</span>
          <textarea v-model.trim="form.prompt" maxlength="600" rows="3" placeholder="例如：3D毛绒质感风格，柔软绒毛边缘，圆润造型，柔和灯光" />
          <small>用户选中这个风格后，这句话会追加到生成提示词后面。留空则该风格只改名字、不改画面。</small>
        </label>

        <div class="ax-form">
          <label class="ax-field"><span>排序</span><input v-model.number="form.sortOrder" type="number" min="0" /></label>
          <label class="ax-field">
            <span>状态</span>
            <select v-model="form.status"><option value="enabled">启用</option><option value="disabled">停用</option></select>
          </label>
        </div>

        <p v-if="formError" class="ax-note is-bad" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <button type="button" class="ax-btn" @click="closeForm">取消</button>
        <button type="submit" form="st-style-form" class="ax-btn is-primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>

    <!-- 分类设置：只管「分类标签」本身。删分类不会删风格，风格会挪到「推荐」 -->
    <el-dialog v-model="categoryVisible" class="ax-dialog" title="分类设置" width="min(580px, 94vw)" align-center>
      <div class="st-form">
        <p class="ax-note is-plain"><span>分类只是用户端的一排标签，本身不存风格。删除分类时，里面的风格会全部移到「推荐」，<b>风格和封面一张都不会删</b>。</span></p>
        <div class="st-cat-new">
          <input v-model.trim="newCategoryName" class="ax-input" maxlength="30" placeholder="新分类名称，例如：水彩 / 中国风" aria-label="新分类名称" @keyup.enter="addCategory" />
          <button type="button" class="ax-btn is-primary" :disabled="categoryBusy || !newCategoryName" @click="addCategory"><AdminIcon name="plus" plain />新建分类</button>
        </div>

        <div v-if="categoryBusy" class="ax-empty is-compact" aria-live="polite"><strong>处理中…</strong></div>
        <ul v-else class="st-cats">
          <li v-for="group in groups" :key="group.id" class="st-cat">
            <template v-if="editingCategoryId === group.id">
              <input v-model.trim="editingCategoryName" class="ax-input st-cat-rename" maxlength="30" placeholder="改完按回车保存" aria-label="新的分类名称" @keyup.enter="submitRenameCategory" />
              <button type="button" class="ax-btn is-sm is-primary" :disabled="!editingCategoryName" @click="submitRenameCategory">保存</button>
              <button type="button" class="ax-btn is-sm is-ghost" @click="editingCategoryId = ''">取消</button>
            </template>
            <template v-else>
              <AdminIcon :name="group.name === DEFAULT_GROUP ? 'folder' : 'tag'" :tint="group.name === DEFAULT_GROUP ? '#8e8e93' : ''" size="sm" />
              <span class="ax-row-main">
                <strong>{{ group.name }}<em v-if="group.name === DEFAULT_GROUP" class="ax-tag st-lock" title="兜底分类：所有没填分类的风格都归到这里，不能删">兜底分类</em></strong>
                <small>{{ countOfGroup(group.name) }} 个风格 · 启用 {{ countEnabledOfGroup(group.name) }}</small>
              </span>
              <button type="button" class="ax-btn is-sm" title="改个名字，里面的风格跟着改" @click="startRenameCategory(group)"><AdminIcon name="pencil" plain />改名</button>
              <button v-if="group.name !== DEFAULT_GROUP" type="button" class="ax-btn is-sm is-danger" title="只删分类，风格移到「推荐」" @click="removeCategory(group)"><AdminIcon name="trash" plain />删除</button>
            </template>
          </li>
          <li v-if="!groups.length" class="ax-empty is-compact"><span>还没有分类。上面输入一个名字就能建。</span></li>
        </ul>

        <p v-if="categoryError" class="ax-note is-bad" role="alert">{{ categoryError }}</p>
      </div>
      <template #footer>
        <button type="button" class="ax-btn is-primary" @click="categoryVisible = false">完成</button>
      </template>
    </el-dialog>

    <!-- 模板设置 -->
    <el-dialog v-model="settingsVisible" class="ax-dialog" title="模板设置" width="min(620px, 94vw)" align-center>
      <form id="st-settings-form" class="st-form" @submit.prevent="saveSettings">
        <p class="ax-note is-warn"><span>这几项决定用户端「图像风格」面板的外观。目前只保存在<b>你现在用的这个浏览器</b>里：同一台电脑、同一个浏览器打开的用户端刷新后生效，换电脑或换浏览器不会同步。</span></p>

        <div class="ax-form">
          <label class="ax-field">
            <span>默认分类</span>
            <select v-model="settings.defaultGroup">
              <option v-if="settings.defaultGroup && !groupNames.includes(settings.defaultGroup)" :value="settings.defaultGroup">{{ settings.defaultGroup }}</option>
              <option v-for="group in groupNames" :key="group" :value="group">{{ group }}</option>
            </select>
            <small>新建风格时表单里预填的分类。</small>
          </label>
          <label class="ax-field">
            <span>用户端每排几张</span>
            <select v-model.number="settings.columns">
              <option :value="4">4 张（两排一屏 8 个，推荐）</option>
              <option :value="3">3 张（卡片中等）</option>
              <option :value="2">2 张（卡片更大）</option>
            </select>
            <small>面板固定显示两排，超出部分左右滑动。</small>
          </label>
        </div>

        <label class="ax-field">
          <span>用户端面板标题</span>
          <input v-model.trim="settings.panelTitle" maxlength="20" placeholder="图像风格" />
          <small>没填就显示「图像风格」。</small>
        </label>

        <label class="ax-field">
          <span>没配风格时的处理</span>
          <select v-model="settings.fallbackMode">
            <option value="builtin">显示系统自带的 8 个风格（推荐）</option>
            <option value="empty">不显示任何风格，只留「不指定」</option>
          </select>
          <small>系统自带风格没有封面图，用户端会显示首字占位卡。</small>
        </label>

        <div class="st-summary">
          <span><b>{{ styles.length }}</b>个风格</span>
          <span><b>{{ groupNames.length }}</b>个分类</span>
          <span><b>{{ enabledCount }}</b>个启用中</span>
        </div>

        <p v-if="settingsError" class="ax-note is-bad" role="alert">{{ settingsError }}</p>
      </form>
      <template #footer>
        <button type="button" class="ax-btn" @click="settingsVisible = false">取消</button>
        <button type="submit" form="st-settings-form" class="ax-btn is-primary" :disabled="settingsSaving">{{ settingsSaving ? '保存中…' : '保存设置' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminIcon from './admin/AdminIcon.vue'
import { batchImageStyles, createImageStyle, createImageStyleGroup, deleteImageStyle, deleteImageStyleGroup, getImageStylePanelSettings, listAdminImageStyles, listImageStyleGroups, renameImageStyleGroup, reorderImageStyles, saveImageStylePanelSettings, updateImageStyle, uploadImageStyleCover } from '../services/imageStyleGateway'
import { generateArtwork, testAiConnection } from '../services/aiGateway'

const styles = ref([])
const loading = ref(false)
const busy = ref(false)
const saving = ref(false)
const uploading = ref(false)
const generating = ref(false)
const loadError = ref('')
const notice = ref('')
const formError = ref('')
const formVisible = ref(false)
const groupFilter = ref('__all__')
const coverInput = ref(null)
const viewMode = ref('grid')
const selectedIds = ref([])
const batchGroupOpen = ref(false)
const batchGroupName = ref('')
const settingsVisible = ref(false)
const settingsSaving = ref(false)
const settingsError = ref('')

// 批量模式：显式开关。以前要「先随便勾一个」才会冒出批量条，入口太隐蔽，
// 管理员根本不知道有这个功能。现在点顶部「批量管理」进来，卡片/每行左侧才出现勾选框。
const batchMode = ref(false)
// 分类设置弹窗
const categoryVisible = ref(false)
const categoryBusy = ref(false)
const categoryError = ref('')
const newCategoryName = ref('')
const editingCategoryId = ref('')
const editingCategoryName = ref('')
const groups = ref([])
// 兜底分类：所有没填分类的风格都归到这里，所以它不能删（后端也会拦）。
const DEFAULT_GROUP = '推荐'

// 模板设置只影响前端显示偏好，存在浏览器里，不额外开表。
const SETTINGS_KEY = 'image-style-panel-settings-v1'
const defaultSettings = () => ({ defaultGroup: '推荐', columns: 4, panelTitle: '图像风格', fallbackMode: 'builtin' })
const settings = reactive(defaultSettings())

const emptyForm = () => ({ id: '', name: '', groupName: '推荐', prompt: '', coverImageUrl: '', coverPrompt: '', coverModelId: '', sortOrder: 0, status: 'enabled' })
const form = reactive(emptyForm())

// AI 生成封面用的模型清单：直接读 /ai/health 里「配了 Key 且真有图像模型」的平台，
// 不在前端写死模型名，后台换模型后这里自动跟着变。
const coverModelOptions = ref([])
const coverModelsLoading = ref(false)
const COVER_MODEL_KEY = 'image-style-cover-model-v1'

async function loadCoverModels() {
  coverModelsLoading.value = true
  try {
    const health = await testAiConnection()
    const providerData = health?.data?.providers
    const providers = Array.isArray(providerData) ? providerData : Object.entries(providerData || {}).map(([key, value]) => ({ key, ...value }))
    coverModelOptions.value = providers
      .filter((item) => item.configured)
      .flatMap((item) => (item.imageModels || (item.imageModel ? [item.imageModel] : [])).map((model) => ({
        id: `${item.key}::${model}`,
        label: `${item.label || item.key} · ${model}`,
      })))
    // 记住上次用的模型：管理员连续做十几个风格时，不用每次重选。
    if (!form.coverModelId) {
      let saved = ''
      try { saved = localStorage.getItem(COVER_MODEL_KEY) || '' } catch { /* 忽略 */ }
      if (saved && coverModelOptions.value.some((item) => item.id === saved)) form.coverModelId = saved
    }
  } catch {
    coverModelOptions.value = []
  } finally {
    coverModelsLoading.value = false
  }
}

// 分组标签：以「分类表」为准（空分类也能显示），再补上风格里出现但分类表还没有的名字，
// 保证任何一条真实风格都不会因为分类表没同步而看不到标签。
const groupNames = computed(() => {
  const names = []
  groups.value.forEach((item) => { if (item.name && !names.includes(item.name)) names.push(item.name) })
  styles.value.forEach((item) => { if (item.groupName && !names.includes(item.groupName)) names.push(item.groupName) })
  return names
})
const visibleStyles = computed(() => (groupFilter.value === '__all__' ? styles.value : styles.value.filter((item) => item.groupName === groupFilter.value)))
const enabledCount = computed(() => styles.value.filter((item) => item.status === 'enabled').length)
const visibleIds = computed(() => visibleStyles.value.map((item) => item.id))
const allPicked = computed(() => visibleIds.value.length > 0 && visibleIds.value.every((id) => selectedIds.value.includes(id)))
const partialPicked = computed(() => !allPicked.value && visibleIds.value.some((id) => selectedIds.value.includes(id)))

function countOfGroup(group) { return styles.value.filter((item) => item.groupName === group).length }
function countEnabledOfGroup(group) { return styles.value.filter((item) => item.groupName === group && item.status === 'enabled').length }
function statusLabel(status) { return { enabled: '启用中', disabled: '已停用', archived: '已归档' }[status] || status }
function errorMessage(error, fallback) { return error?.response?.data?.message || error?.message || fallback }
function isPicked(id) { return selectedIds.value.includes(id) }

// 模型名很长（Agnes · agnes-image-2.1-flash），窄列里会被截断，用 title 显示全名。
const coverModelLabel = computed(() => {
  if (!form.coverModelId) return '自动（用后台默认图像模型）'
  return coverModelOptions.value.find((item) => item.id === form.coverModelId)?.label || form.coverModelId
})

function applyNotice(text) {
  notice.value = text
  window.setTimeout(() => { if (notice.value === text) notice.value = '' }, 2500)
}

function readLocalSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return saved && typeof saved === 'object' ? saved : null
  } catch { return null }
}
// 面板设置存服务端（以前只存在这台电脑的浏览器里，小画家的平板读不到）。
// 服务端还没保存过、而这台电脑以前存过时，自动搬上去一次，管理员不用重新设置。
async function loadSettings() {
  Object.assign(settings, defaultSettings(), readLocalSettings() || {})
  try {
    const remote = await getImageStylePanelSettings()
    const local = readLocalSettings()
    if (!remote.saved && local) {
      Object.assign(settings, defaultSettings(), await saveImageStylePanelSettings({ ...defaultSettings(), ...local }))
    } else if (remote.settings) {
      Object.assign(settings, defaultSettings(), remote.settings)
    }
  } catch (error) {
    settingsError.value = '读取面板设置失败：' + errorMessage(error, '请稍后再试')
  }
  if (![2, 3, 4].includes(Number(settings.columns))) settings.columns = 4
}
function loadViewMode() {
  try { if (localStorage.getItem(`${SETTINGS_KEY}-view`) === 'list') viewMode.value = 'list' } catch { /* 忽略 */ }
}
function setViewMode(mode) {
  viewMode.value = mode
  try { localStorage.setItem(`${SETTINGS_KEY}-view`, mode) } catch { /* 忽略 */ }
}

async function loadStyles() {
  loading.value = true
  loadError.value = ''
  try {
    styles.value = await listAdminImageStyles()
    if (groupFilter.value !== '__all__' && !groupNames.value.includes(groupFilter.value)) groupFilter.value = '__all__'
    // 删掉已经不存在的勾选，避免批量操作带着失效 ID 发出去
    selectedIds.value = selectedIds.value.filter((id) => styles.value.some((item) => item.id === id))
  } catch (error) {
    loadError.value = errorMessage(error, '风格模板读取失败，请检查登录状态和后端服务。')
  } finally {
    loading.value = false
  }
}

function togglePick(id) {
  selectedIds.value = isPicked(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]
}
function togglePickAll() {
  selectedIds.value = allPicked.value ? [] : [...visibleIds.value]
}
function clearSelection() { selectedIds.value = []; batchGroupOpen.value = false; batchGroupName.value = '' }

// 退出批量模式时一定要清空勾选：否则下次进来会带着上次的隐藏勾选，
// 点一下「批量删除」就删掉看不见的几条。
function toggleBatchMode() {
  batchMode.value = !batchMode.value
  clearSelection()
}

/* ---------------------------- 分类设置 ---------------------------- */

async function loadGroups() {
  try {
    groups.value = await listImageStyleGroups()
  } catch (error) {
    // 分类读失败不能拦住整个页面：风格列表还能用，只是分类下拉退化成风格里出现过的名字。
    groups.value = []
    if (categoryVisible.value) categoryError.value = errorMessage(error, '分类读取失败')
  }
}

function openCategory() {
  categoryError.value = ''
  newCategoryName.value = ''
  editingCategoryId.value = ''
  editingCategoryName.value = ''
  categoryVisible.value = true
  void loadGroups()
}

async function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name) { categoryError.value = '请填写分类名称'; return }
  if (groupNames.value.includes(name)) { categoryError.value = '已经有同名分类了'; return }
  categoryBusy.value = true
  categoryError.value = ''
  try {
    await createImageStyleGroup(name)
    newCategoryName.value = ''
    await loadGroups()
    applyNotice(`分类「${name}」已建好，新建风格时就能选到`)
  } catch (error) {
    categoryError.value = errorMessage(error, '新建分类失败')
  } finally {
    categoryBusy.value = false
  }
}

function startRenameCategory(group) {
  editingCategoryId.value = group.id
  editingCategoryName.value = group.name
  categoryError.value = ''
}

async function submitRenameCategory() {
  const name = editingCategoryName.value.trim()
  const id = editingCategoryId.value
  if (!name) { categoryError.value = '请填写分类名称'; return }
  categoryBusy.value = true
  categoryError.value = ''
  try {
    await renameImageStyleGroup(id, name)
    editingCategoryId.value = ''
    editingCategoryName.value = ''
    await Promise.all([loadGroups(), loadStyles()])
    applyNotice('分类名已改，里面的风格跟着改了')
  } catch (error) {
    categoryError.value = errorMessage(error, '改分类名失败')
  } finally {
    categoryBusy.value = false
  }
}

// 删分类只删「分类」本身，里面的风格全部挪到「推荐」——风格和封面一张都不动。
async function removeCategory(group) {
  const count = countOfGroup(group.name)
  const detail = count
    ? `「${group.name}」下面还有 ${count} 个风格，删除分类后它们会移到「推荐」，风格本身不会删。`
    : `「${group.name}」下面没有风格，删除后只是少一个分类标签。`
  try {
    await ElMessageBox.confirm(detail, '删除分类', { type: 'warning', confirmButtonText: '删除分类' })
  } catch { return }
  categoryBusy.value = true
  categoryError.value = ''
  try {
    const result = await deleteImageStyleGroup(group.id)
    if (editingCategoryId.value === group.id) { editingCategoryId.value = ''; editingCategoryName.value = '' }
    await Promise.all([loadGroups(), loadStyles()])
    applyNotice(result?.moved ? `分类已删除，${result.moved} 个风格已移到「推荐」` : '分类已删除')
  } catch (error) {
    categoryError.value = errorMessage(error, '删除分类失败')
  } finally {
    categoryBusy.value = false
  }
}

function openForm(item = null) {
  Object.assign(form, emptyForm())
  if (item) Object.assign(form, { id: item.id, name: item.name, groupName: item.groupName || '推荐', prompt: item.prompt || '', coverImageUrl: item.coverImageUrl || '', sortOrder: item.sortOrder || 0, status: item.status === 'enabled' ? 'enabled' : 'disabled' })
  else { form.groupName = settings.defaultGroup || '推荐'; form.sortOrder = styles.value.length }
  // 下拉里必须能对上这一项，否则会显示成空白（例如默认分类被删掉了）。
  if (!form.groupName || !groupNames.value.includes(form.groupName)) form.groupName = groupNames.value[0] || '推荐'
  // 页面刚打开、分类还没读回来就点「新建风格」时，下拉里可能只有预填的那一项。
  // 这里再补拉一次，保证下拉打开就是完整分类。
  if (!groups.value.length) loadGroups()
  // 封面提示词预填「风格提示词」的改写版：老风格大多只有一句画风描述，
  // 直接空着会让人以为 AI 又只能靠名字画图。管理员随时可以改。
  if (!form.coverPrompt && form.prompt.trim()) fillCoverPromptFromStyle()
  formError.value = ''
  formVisible.value = true
}
function closeForm() { formVisible.value = false; formError.value = '' }

function openSettings() {
  loadSettings()
  settingsError.value = ''
  settingsVisible.value = true
}
async function saveSettings() {
  settingsSaving.value = true
  try {
    const payload = {
      defaultGroup: (settings.defaultGroup || '').trim() || '推荐',
      columns: [2, 3, 4].includes(Number(settings.columns)) ? Number(settings.columns) : 4,
      panelTitle: (settings.panelTitle || '').trim() || '图像风格',
      fallbackMode: settings.fallbackMode === 'empty' ? 'empty' : 'builtin',
    }
    const saved = await saveImageStylePanelSettings(payload)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved || payload)) } catch { /* 本机缓存失败不影响服务端保存 */ }
    Object.assign(settings, saved || payload)
    settingsVisible.value = false
    applyNotice('设置已保存，所有设备刷新后生效')
  } catch (error) {
    settingsError.value = '设置保存失败：' + errorMessage(error, '请稍后再试')
  } finally {
    settingsSaving.value = false
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

async function handleCoverFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { formError.value = '请选择 PNG、JPG 或 WEBP 图片'; return }
  if (file.size > 8 * 1024 * 1024) { formError.value = '图片不能超过 8MB，请先压缩后再上传'; return }
  uploading.value = true
  formError.value = ''
  try {
    form.coverImageUrl = await uploadImageStyleCover(await readFileAsDataUrl(file))
    ElMessage.success('封面图已上传，记得点保存')
  } catch (error) {
    formError.value = errorMessage(error, '封面图上传失败')
  } finally {
    uploading.value = false
  }
}

function extractDataImage(value) {
  const match = String(value || '').match(/data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+/i)
  return match?.[0] || ''
}

function fillCoverPromptFromStyle() {
  const text = form.prompt.trim()
  if (!text) return
  // 风格提示词通常是「厚涂油画，笔触明显」这种画风描述，直接画不出具体主体，
  // 所以只把画风接在「一张示例图」后面，而不是原样丢给模型。
  form.coverPrompt = `${text}，一张展示该画风的示例图，主体明确、构图完整、细节清晰`
}

// AI 生成封面：让模型按「封面提示词」画一张风格示例图，出图后立刻转存到服务器，避免前端拿着临时链接过期。
// 🔴 绝不用 form.name 当提示词：名称只是标签（「3D毛绒」），模型会把它当画面内容或干脆画成文字。
async function generateCover() {
  const coverPrompt = form.coverPrompt.trim()
  if (!coverPrompt) {
    formError.value = '请先填写「封面生成提示词」再生成。例如：一只 3D 毛绒质感的红色小熊，正面居中，纯白背景'
    return
  }
  // 「自动」= 不传 model，服务端用后台默认图像模型；指定了就把 provider/model 一起带上。
  const [provider, model] = form.coverModelId.includes('::') ? form.coverModelId.split('::') : ['', '']
  generating.value = true
  formError.value = ''
  try {
    const result = await generateArtwork({
      // 出图必须只认管理员写的这句；这里再兜一层「不要文字」，防止模型把风格名画进画面。
      prompt: `${coverPrompt}，不要在画面里出现任何文字`,
      difficulty: 'starter',
      // style 只是记录用途的标签，不参与上游提示词（服务端拼提示词只认 prompt 字段）。
      style: form.name || '风格示例图',
      provider,
      model,
      count: 1,
      ratio: '1:1',
      quality: 'standard',
      returnBase64: true,
    })
    const first = result.results?.[0] || {}
    const image = first.imageUrl || extractDataImage(first.background)
    if (!image) throw new Error('AI 没有返回可用的图片，请检查后台 API 配置')
    form.coverImageUrl = image.startsWith('data:') ? await uploadImageStyleCover(image) : image
    if (form.coverModelId) { try { localStorage.setItem(COVER_MODEL_KEY, form.coverModelId) } catch { /* 忽略 */ } }
    ElMessage.success('封面图已生成，记得点保存')
  } catch (error) {
    formError.value = errorMessage(error, 'AI 生成封面失败')
  } finally {
    generating.value = false
  }
}

async function submitForm() {
  if (!form.name.trim()) { formError.value = '请填写风格名称'; return }
  saving.value = true
  formError.value = ''
  try {
    const payload = { name: form.name, groupName: form.groupName, prompt: form.prompt, coverImageUrl: form.coverImageUrl, sortOrder: Number(form.sortOrder || 0), status: form.status }
    if (form.id) await updateImageStyle(form.id, payload)
    else await createImageStyle(payload)
    closeForm()
    await loadStyles()
    applyNotice('已保存，用户端刷新后生效')
  } catch (error) {
    formError.value = errorMessage(error, '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(item) {
  busy.value = true
  try {
    await updateImageStyle(item.id, { name: item.name, groupName: item.groupName, prompt: item.prompt, coverImageUrl: item.coverImageUrl, sortOrder: item.sortOrder, status: item.status === 'enabled' ? 'disabled' : 'enabled' })
    await loadStyles()
    applyNotice(item.status === 'enabled' ? '已停用，用户端不再显示' : '已启用')
  } catch (error) {
    ElMessage.error(errorMessage(error, '状态更新失败'))
  } finally {
    busy.value = false
  }
}

// 上移/下移只交换相邻两张，然后把完整顺序提交给后端，避免只改一个值导致顺序错乱。
async function move(item, offset) {
  const list = visibleStyles.value
  const index = list.findIndex((entry) => entry.id === item.id)
  const target = list[index + offset]
  if (!target) return
  const all = [...styles.value]
  const from = all.findIndex((entry) => entry.id === item.id)
  const to = all.findIndex((entry) => entry.id === target.id)
  if (from < 0 || to < 0) return
  const [moved] = all.splice(from, 1)
  all.splice(to, 0, moved)
  busy.value = true
  try {
    await reorderImageStyles(all.map((entry) => entry.id))
    styles.value = all.map((entry, position) => ({ ...entry, sortOrder: position }))
    applyNotice('顺序已更新')
  } catch (error) {
    ElMessage.error(errorMessage(error, '排序失败'))
    await loadStyles()
  } finally {
    busy.value = false
  }
}

async function removeStyle(item) {
  try {
    await ElMessageBox.confirm(`删除「${item.name}」后用户端将不再显示这个风格，确定继续吗？`, '删除风格', { type: 'warning', confirmButtonText: '删除' })
    await deleteImageStyle(item.id, 'permanent')
    await loadStyles()
    applyNotice('已删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(errorMessage(error, '删除失败'))
  }
}

function openBatchGroup() {
  batchGroupOpen.value = true
  batchGroupName.value = groupFilter.value === '__all__' ? (groupNames.value[0] || settings.defaultGroup || '推荐') : groupFilter.value
}

// 批量操作：一次请求搞定一批，避免点一次发几十条请求。
async function runBatch(action) {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  if (action === 'group' && !batchGroupName.value.trim()) { ElMessage.warning('请填写要移到哪个分组'); return }
  if (action === 'delete') {
    try {
      await ElMessageBox.confirm(`将永久删除选中的 ${ids.length} 个风格（含封面图），用户端不再显示，确定继续吗？`, '批量删除', { type: 'warning', confirmButtonText: '删除' })
    } catch { return }
  }
  busy.value = true
  try {
    const payload = { ids, action }
    if (action === 'group') payload.groupName = batchGroupName.value.trim()
    const result = await batchImageStyles(payload)
    await loadStyles()
    clearSelection()
    const failed = Array.isArray(result?.failed) ? result.failed : []
    if (failed.length) ElMessage.warning(`成功 ${result?.done ?? 0} 个，失败 ${failed.length} 个：${failed[0].message}`)
    else applyNotice(`批量操作完成，共 ${result?.done ?? ids.length} 个`)
  } catch (error) {
    ElMessage.error(errorMessage(error, '批量操作失败'))
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadViewMode()
  void loadStyles()
  void loadGroups()
  void loadCoverModels()
})
</script>

<style scoped>
/* AI 图像功能管理（2026-11-26 第二版）：分类筛选 + 方形封面卡片墙 / 列表，批量条，三个 iOS 弹窗；组件类名一律 st- 前缀 */
.st-note { align-items: center; }
.st-note > span { flex: 1 1 auto; }

.st-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.st-groups { display: flex; flex: 1 1 320px; gap: 6px; min-width: 0; padding: 2px; overflow-x: auto; scrollbar-width: none; }
.st-groups::-webkit-scrollbar { display: none; }
.st-chip { display: inline-flex; flex: none; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border: 1px solid var(--ax-glass-edge); border-radius: 999px; background: var(--ax-surface); color: var(--ax-text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
.st-chip > em { color: var(--ax-muted); font-size: 12px; font-style: normal; font-weight: 500; font-variant-numeric: tabular-nums; }
.st-chip:hover { color: var(--ax-ink); }
.st-chip.is-active { border-color: transparent; background: var(--ax-ink); color: #fff; }
.st-chip.is-active > em { color: rgba(255, 255, 255, 0.7); }
.st-chip:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.st-tools { display: flex; flex: none; align-items: center; gap: 10px; }

.st-batch { display: grid; gap: 10px; padding: 14px 18px; }
.st-batch-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.st-batch-count { margin-right: 4px; color: var(--ax-ink); font-size: 14px; font-variant-numeric: tabular-nums; }
.st-batch-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.st-batch-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--ax-surface-2); color: var(--ax-text); font-size: 13px; }
.st-batch-group > .ax-select { min-width: 160px; }

.st-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(208px, 1fr)); gap: 16px; }
.st-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ax-glass-edge);
  border-radius: var(--ax-radius-lg);
  background: var(--ax-surface);
  box-shadow: var(--ax-shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  -webkit-backdrop-filter: var(--ax-blur);
  backdrop-filter: var(--ax-blur);
}
.st-card:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 18px 40px rgba(16, 24, 40, 0.1); }
.st-card.is-batch { cursor: pointer; }
.st-card.is-picked { border-color: transparent; box-shadow: 0 0 0 2px var(--ax-brand), var(--ax-shadow); }
.st-cover { position: relative; overflow: hidden; aspect-ratio: 1 / 1; background: linear-gradient(135deg, rgba(0, 122, 255, 0.1), rgba(175, 82, 222, 0.12)); }
.st-cover > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.st-card.is-off .st-cover > img { filter: grayscale(0.75); opacity: 0.7; }
.st-cover-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ax-muted); font-size: 12.5px; }
.st-cover-empty > .adm-icon.is-plain { width: 26px; height: 26px; }
.st-cover-tag { position: absolute; right: 10px; bottom: 10px; background: rgba(255, 255, 255, 0.92) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
.st-check { position: absolute; top: 10px; left: 10px; display: grid; place-items: center; width: 30px; height: 30px; cursor: pointer; }
.st-check > input { position: absolute; opacity: 0; pointer-events: none; }
.st-check > i { display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid rgba(255, 255, 255, 0.95); border-radius: 50%; background: rgba(0, 0, 0, 0.18); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18); transition: background 0.15s ease, border-color 0.15s ease; }
.st-check > input:checked + i { border-color: #fff; background: var(--ax-brand); }
.st-check > input:checked + i::after { content: ''; width: 9px; height: 5px; margin-top: -3px; border-bottom: 2.2px solid #fff; border-left: 2.2px solid #fff; transform: rotate(-45deg); }
.st-check > input:focus-visible + i { box-shadow: 0 0 0 3px var(--ax-brand-ring); }

.st-body { display: grid; flex: 1 1 auto; align-content: start; gap: 6px; padding: 12px 14px 10px; }
.st-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.st-title > strong { overflow: hidden; color: var(--ax-ink); font-size: 15px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
.st-title > .ax-tag { flex: none; }
.st-prompt { display: -webkit-box; overflow: hidden; min-height: calc(1.5em * 2); margin: 0; color: var(--ax-text); font-size: 12.5px; line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.st-prompt.is-empty { color: var(--ax-faint); }
.st-foot { display: flex; align-items: center; gap: 6px; padding: 8px 10px 12px 8px; border-top: 1px solid var(--ax-line); cursor: default; }
.st-foot > .st-switch { margin-left: auto; }
.st-order { display: inline-flex; gap: 2px; }
.st-icon-btn { display: grid; place-items: center; width: 30px; height: 30px; min-height: 0; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--ax-muted); cursor: pointer; transition: background 0.12s ease, color 0.12s ease; }
.st-icon-btn:hover:not(:disabled) { background: var(--ax-fill); color: var(--ax-brand); }
.st-icon-btn.is-danger:hover:not(:disabled) { background: var(--ax-bad-soft); color: var(--ax-bad); }
.st-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.st-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.st-icon-btn > .adm-icon.is-plain { width: 16px; height: 16px; }

.st-table tr.is-off td { color: var(--ax-muted); }
.st-table tr.is-picked td { background: rgba(var(--ax-brand-rgb), 0.05); }
.st-cell { display: flex; align-items: center; gap: 12px; min-width: 150px; }
.st-cell > strong { color: var(--ax-ink); font-weight: 600; white-space: nowrap; }
.st-thumb { display: grid; flex: none; overflow: hidden; place-items: center; width: 44px; height: 44px; border-radius: 11px; background: var(--ax-fill); color: var(--ax-muted); }
.st-thumb > img { width: 100%; height: 100%; object-fit: cover; }
.st-table tr.is-off .st-thumb > img { filter: grayscale(0.75); opacity: 0.7; }
.st-cell-prompt { display: -webkit-box; overflow: hidden; min-width: 220px; max-width: 420px; color: var(--ax-text); line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.st-row-actions { display: inline-flex; flex-wrap: nowrap; justify-content: flex-end; gap: 6px; }

/* 弹窗 */
.st-form { display: grid; gap: 14px; }
.st-group { display: grid; gap: 12px; padding: 16px; border-radius: 16px; background: var(--ax-surface-2); }
.st-group > h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 0; color: var(--ax-ink); font-size: 14px; font-weight: 700; }
.st-group > h4 small { color: var(--ax-muted); font-size: 12px; font-weight: 400; }
.st-cover-editor { display: grid; grid-template-columns: 168px minmax(0, 1fr); align-items: start; gap: 18px; }
.st-cover-preview { display: grid; overflow: hidden; place-items: center; aspect-ratio: 1 / 1; border-radius: 16px; background: #fff; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08); }
.st-cover-preview.is-empty { border: 1.5px dashed var(--ax-line-strong); background: rgba(255, 255, 255, 0.6); box-shadow: none; }
.st-cover-preview > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.st-cover-preview > span { display: grid; justify-items: center; gap: 6px; color: var(--ax-muted); font-size: 12.5px; font-weight: 600; }
.st-cover-preview > span > .adm-icon.is-plain { width: 26px; height: 26px; }
.st-cover-side { display: grid; gap: 12px; min-width: 0; }
.st-cover-side > .ax-hint { margin-top: -4px; }
.st-cover-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.st-field-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.st-field-head > label { color: var(--ax-ink); font-size: 13px; font-weight: 600; cursor: pointer; }
.st-field-head > em { color: var(--ax-muted); font-size: 12px; font-style: normal; font-weight: 400; }
.st-field-head > .ax-btn { margin-left: auto; }
.st-warn { color: var(--ax-warn) !important; }

.st-cat-new { display: flex; gap: 8px; }
.st-cat-new > .ax-input { flex: 1 1 auto; min-width: 0; }
.st-cats { display: grid; margin: 0; padding: 0; overflow: hidden; border-radius: 16px; background: var(--ax-surface-2); list-style: none; }
.st-cat { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 8px 14px; border-bottom: 1px solid var(--ax-line); }
.st-cat:last-child { border-bottom: 0; }
.st-cat > .ax-row-main { flex: 1 1 auto; }
.st-cat > .ax-row-main > strong { display: flex; align-items: center; gap: 8px; }
.st-cat-rename { flex: 1 1 auto; min-width: 0; }
.st-lock { height: 20px; padding: 0 7px; font-size: 11.5px; font-style: normal; font-weight: 500; }
.st-summary { display: flex; gap: 8px; }
.st-summary > span { display: grid; flex: 1 1 0; gap: 2px; padding: 10px 14px; border-radius: 12px; background: var(--ax-surface-2); color: var(--ax-muted); font-size: 12.5px; }
.st-summary b { color: var(--ax-ink); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }

@media (max-width: 760px) {
  .st-batch-actions { margin-left: 0; }
  .st-cover-editor { grid-template-columns: minmax(0, 1fr); }
  .st-cover-preview { width: 148px; }
}
@media (max-width: 560px) {
  .st-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .st-cat { flex-wrap: wrap; }
}
</style>
