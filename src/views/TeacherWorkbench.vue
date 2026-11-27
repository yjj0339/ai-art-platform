<template>
  <!-- 讲师端（2026-11-27 界面重做）：外壳和组件跟管理后台同一套苹果「系统设置」风格（admin-shell / admin-ui / admin-apple），
       功能、接口、权限判断都没改。排课、点名、扣课这些页面一直是写死的样例数据，页面上明确标出来，不冒充真功能。 -->
  <main class="admin-shell as-shell teacher-shell" :class="{ 'is-nav-open': navDrawerOpen }">
    <div v-if="navDrawerOpen" class="as-backdrop" aria-hidden="true" @click="navDrawerOpen = false"></div>

    <aside class="as-sidebar" aria-label="讲师端菜单">
      <div class="as-brand">
        <span class="as-brand-mark tw-brand-mark">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="brandIconPath" /></svg>
        </span>
        <span class="as-brand-text">
          <strong>讲师端</strong>
          <small>课程与教学管理</small>
        </span>
        <button class="as-icon-btn as-close" type="button" aria-label="收起菜单" @click="navDrawerOpen = false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <label class="as-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20" /></svg>
        <input v-model.trim="navQuery" type="search" placeholder="搜索功能" aria-label="搜索讲师端功能" @keydown.enter.prevent="openFirstNavMatch" @keydown.esc="navQuery = ''" />
      </label>

      <!-- 当前账号：头像是线条人像图标，不用名字的第一个字 -->
      <div class="as-me">
        <span class="as-avatar tw-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.8" /><path d="M4.8 19.6c1.4-3.2 4.1-4.9 7.2-4.9s5.8 1.7 7.2 4.9c-1.9 1.7-4.4 2.7-7.2 2.7s-5.3-1-7.2-2.7z" /></svg></span>
        <span class="as-me-text">
          <strong>{{ teacherDisplayName }}</strong>
          <small>{{ teacherOrgName }}</small>
        </span>
        <button type="button" class="as-logout" title="退出登录" aria-label="退出登录" @click="logout">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16.5L5.5 12 10 7.5M5.5 12H15" /></svg>
          <span>退出</span>
        </button>
      </div>

      <nav class="as-nav" aria-label="讲师端导航">
        <template v-if="navQuery">
          <button
            v-for="item in navSearchResults"
            :key="item.id"
            type="button"
            class="as-item"
            :class="{ 'is-active': activeMenu === item.id }"
            @click="selectMenu(item.id)"
          >
            <span class="as-icon" :style="{ '--tint': menuIcon(item).tint }"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="menuIcon(item).d" /></svg></span>
            <span class="as-label">{{ item.label }}</span>
            <small v-if="item.groupLabel" class="as-meta">{{ item.groupLabel }}</small>
          </button>
          <p v-if="!navSearchResults.length" class="as-empty">没有找到「{{ navQuery }}」</p>
        </template>
        <template v-else>
          <section v-for="group in menuGroups" :key="group.id" class="as-section">
            <button
              v-if="group.label"
              type="button"
              class="as-section-head"
              :class="{ 'is-closed': isGroupClosed(group) }"
              :aria-expanded="isGroupClosed(group) ? 'false' : 'true'"
              @click="toggleGroup(group.id)"
            >
              <span>{{ group.label }}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
            </button>
            <div v-show="!group.label || !isGroupClosed(group)" class="as-section-body">
              <button
                v-for="item in group.children"
                :key="item.id"
                type="button"
                class="as-item"
                :class="{ 'is-active': activeMenu === item.id }"
                :aria-current="activeMenu === item.id ? 'page' : undefined"
                @click="selectMenu(item.id)"
              >
                <span class="as-icon" :style="{ '--tint': menuIcon(item).tint }"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="menuIcon(item).d" /></svg></span>
                <span class="as-label">{{ item.label }}</span>
              </button>
            </div>
          </section>
        </template>
      </nav>
    </aside>

    <section class="as-main tw-main">
      <!-- 顶栏只做「我在哪」：讲师端 › 分组 › 页面；页面自己的大标题和操作在下面 -->
      <header class="as-topbar" :class="{ 'is-scrolled': topbarScrolled }">
        <button class="as-icon-btn as-menu-btn" type="button" aria-label="打开菜单" @click="navDrawerOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <nav class="as-crumbs" aria-label="当前位置">
          <span class="as-crumb-root">讲师端</span>
          <span v-if="currentGroupLabel" class="as-crumb-group">{{ currentGroupLabel }}</span>
          <strong>{{ currentMenu?.label }}</strong>
        </nav>
        <button type="button" class="as-top-link tw-top-btn" @click="showProfile">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.3-3 3.9-4.5 7-4.5s5.7 1.5 7 4.5" /></svg>
          <span>个人中心</span>
        </button>
      </header>

      <!-- ================= 讲师概况 ================= -->
      <section v-if="activeMenu === 'overview'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>{{ greeting }}，{{ teacherDisplayName }}</h2>
            <p>课程、发放和教学情况一览。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn" @click="selectMenu('courseLibrary')">打开课程库</button>
            <button type="button" class="ax-btn is-primary" :disabled="!canUploadCourse" @click="selectMenu('courseManage')"><AdminIcon name="upload" plain />上传新课程</button>
          </div>
        </header>

        <div class="ax-stats">
          <article v-for="item in summary" :key="item.label" class="ax-stat">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
        </div>

        <div class="tw-overview-grid">
          <article class="ax-card">
            <div class="ax-card-head">
              <div>
                <h3>课程到项目报告</h3>
                <p>小画家一节课的学习闭环，每一步的内容都会进入最后的项目报告。</p>
              </div>
            </div>
            <ol class="tw-flow">
              <li v-for="(step, index) in learningFlow" :key="step.label">
                <AdminIcon :name="step.icon" size="lg" />
                <strong>{{ step.label }}</strong>
                <small>{{ step.note }}</small>
                <i v-if="index < learningFlow.length - 1" class="tw-flow-arrow" aria-hidden="true"></i>
              </li>
            </ol>
          </article>

          <article class="ax-card is-flush tw-recent-card">
            <div class="ax-card-head">
              <div>
                <h3>最近的课程</h3>
                <p>自己上传的和权限组授权的</p>
              </div>
              <button type="button" class="ax-btn is-sm is-ghost" @click="selectMenu('courseLibrary')">查看全部</button>
            </div>
            <div class="tw-recent">
              <div v-for="course in teacherVisibleCourses.slice(0, 5)" :key="course.id" class="tw-recent-row">
                <AdminIcon name="courses" size="sm" :tint="categoryTint(course.category)" />
                <div class="ax-row-main">
                  <strong class="tw-ellipsis">{{ safeText(course.title, '趣味设计课程') }}</strong>
                  <small>{{ categoryLabel(course.category) }} · {{ safeText(course.difficulty, '青少年进阶') }}</small>
                </div>
                <span class="ax-pill" :class="course.status === 'published' ? 'is-ok' : 'is-muted'">{{ course.status === 'published' ? '已发布' : '草稿' }}</span>
              </div>
              <div v-if="!teacherVisibleCourses.length" class="ax-empty is-compact">
                <strong>{{ courseStore.loading && !courseStore.loaded ? '正在读取课程…' : '还没有课程' }}</strong>
                <span v-if="!courseStore.loading">上传第一门课，或者等管理员把课授权给你所在的权限组。</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- ================= 课程上传 / 编辑 ================= -->
      <section v-else-if="activeMenu === 'courseManage'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>{{ editingCourseId ? '编辑课程' : '上传课程' }}</h2>
            <p>先上传课件和课程文档，系统自动解析出课程信息和选择题；确认后发布给班级和小画家。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn" @click="resetForm">新建空白课程</button>
            <button type="button" class="ax-btn is-primary" @click="saveCourse">发布并授权</button>
          </div>
        </header>

        <p v-if="courseAccessReady && !canUploadCourse" class="ax-note is-warn">当前账号还没有上传课程的权限，发布会被拦下。请联系管理员在「账号权限 → 权限组」里开通。</p>
        <p v-if="editingCourseId" class="ax-note tw-page-note">正在编辑「{{ form.title }}」：改完点「发布并授权」保存；点「新建空白课程」放弃这次编辑。</p>

        <div class="tw-editor">
          <div class="tw-editor-main">
            <!-- 1 课件与文档 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">1</span>课件与文档</h3>
                  <p>视频、PPT、课程文档分开上传；文档上传后会自动解析。</p>
                </div>
              </div>
              <div class="tw-uploads">
                <div class="tw-upload" :class="{ 'is-set': form.videoFileName }">
                  <AdminIcon name="video" size="lg" />
                  <div class="tw-upload-text">
                    <strong>课程视频</strong>
                    <small :title="form.videoFileName">{{ form.videoFileName || '支持 MP4 / MOV' }}</small>
                  </div>
                  <input ref="videoFileInput" class="tw-file" type="file" accept="video/*" @change="handleVideoFile" />
                  <button type="button" class="ax-btn is-sm" @click="videoFileInput?.click()">{{ form.videoFileName ? '重新上传' : '上传视频' }}</button>
                </div>
                <div class="tw-upload" :class="{ 'is-set': form.pptFileName }">
                  <AdminIcon name="layers" size="lg" tint="#ff9500" />
                  <div class="tw-upload-text">
                    <strong>PPT 课件</strong>
                    <small :title="form.pptFileName">{{ form.pptFileName || '支持 PPT / PPTX' }}</small>
                  </div>
                  <input ref="pptFileInput" class="tw-file" type="file" accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" @change="handlePptFile" />
                  <button type="button" class="ax-btn is-sm" @click="pptFileInput?.click()">{{ form.pptFileName ? '重新上传' : '上传 PPT' }}</button>
                </div>
                <div class="tw-upload" :class="{ 'is-set': form.documentFileName }">
                  <AdminIcon name="text" size="lg" />
                  <div class="tw-upload-text">
                    <strong>课程文档</strong>
                    <small :title="form.documentFileName">{{ form.documentFileName || 'PDF / Word，用来自动填写' }}</small>
                  </div>
                  <input ref="docFileInput" class="tw-file" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" @change="handleCourseDocumentFile" />
                  <button type="button" class="ax-btn is-sm" @click="docFileInput?.click()">{{ form.documentFileName ? '重新上传' : '上传文档' }}</button>
                </div>
              </div>
              <div class="tw-parse" :class="`is-${documentParseStatus.state}`">
                <span class="tw-parse-dot" aria-hidden="true"></span>
                <div class="tw-parse-text">
                  <strong>{{ documentParsing ? '正在解析…' : documentParseStatus.message }}</strong>
                  <small v-if="showParseCounts">已读取 {{ documentParseStatus.textLength }} 字 · 识别字段 {{ documentParseStatus.fieldCount }} 项 · 选择题 {{ documentParseStatus.questionCount }} 道</small>
                  <small v-else-if="!form.documentFileName">上传 PDF 或 Word 课程文档后，会自动填好课程主题、类型、适龄、简介、设计需求和选择题。</small>
                  <em v-if="documentParseStatus.preview">{{ documentParseStatus.preview }}</em>
                </div>
                <button type="button" class="ax-btn is-sm is-soft" :disabled="!form.documentFileName || documentParsing" @click="parseCourseDocument">{{ documentParsing ? '解析中…' : '解析课程文档' }}</button>
              </div>
            </article>

            <!-- 2 基础信息 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">2</span>基础信息</h3>
                  <p>解析文档后自动填好，也可以直接改。</p>
                </div>
              </div>
              <div class="ax-form">
                <label class="ax-field">
                  <span>课程主题</span>
                  <input v-model="form.title" placeholder="例如：奶茶店门头设计趣味课" />
                </label>
                <label class="ax-field">
                  <span>课程类型</span>
                  <select v-model="form.category">
                    <option v-for="item in categoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
                <label class="ax-field">
                  <span>难度 / 适龄</span>
                  <input v-model="form.difficulty" placeholder="青少年进阶 · 13-16岁" />
                </label>
                <label class="ax-field ax-span-all">
                  <span>课程简介</span>
                  <textarea v-model="form.description" rows="3" placeholder="可以手动填写，也可以上传课程文档后自动生成"></textarea>
                </label>
              </div>
            </article>

            <!-- 3 引导选择题 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">3</span>引导选择题</h3>
                  <p>解析课程文档后自动生成，带正确答案；小画家上课时作答。</p>
                </div>
                <button type="button" class="ax-btn is-sm" :disabled="!form.documentFileName || documentParsing" @click="parseCourseDocument"><AdminIcon name="refresh" plain />重新解析</button>
              </div>
              <ol v-if="questionCards.length" class="tw-questions">
                <li v-for="(question, index) in questionCards" :key="`${question.id}-${index}`" class="tw-question">
                  <div class="tw-question-title">
                    <span>第 {{ index + 1 }} 题</span>
                    <strong>{{ question.title }}</strong>
                  </div>
                  <ul class="tw-options">
                    <template v-for="(option, optionIndex) in question.options" :key="optionIndex">
                      <!-- 题目只有 3 个选项时第 4 格是空的：不显示空白的 D -->
                      <li v-if="option" :class="{ 'is-correct': question.answer === choiceLabels[optionIndex] }">
                        <b>{{ choiceLabels[optionIndex] }}</b>
                        <span>{{ option }}</span>
                        <em v-if="question.answer === choiceLabels[optionIndex]"><AdminIcon name="check" plain />正确答案</em>
                      </li>
                    </template>
                  </ul>
                </li>
              </ol>
              <div v-else class="ax-empty is-compact">
                <strong>还没有选择题</strong>
                <span>上传 PDF 或 Word 课程文档后会自动生成。</span>
              </div>
            </article>

            <!-- 4 项目设计需求 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">4</span>项目设计需求</h3>
                  <p>尺寸、元素、形象来源、风格和使用场景；解析文档后自动填写，发布前确认一下。</p>
                </div>
                <div class="ax-actions">
                  <button v-if="requirementPanelOpen" type="button" class="ax-btn is-sm" @click="addDesignRequirement"><AdminIcon name="plus" plain />新增要求</button>
                  <button type="button" class="ax-btn is-sm is-ghost" @click="requirementPanelOpen = !requirementPanelOpen">{{ requirementPanelOpen ? '收起' : '展开编辑' }}</button>
                </div>
              </div>
              <dl v-if="!requirementPanelOpen" class="tw-kv">
                <div v-for="(item, index) in form.designRequirements" :key="index">
                  <dt>{{ item.label || '未命名' }}</dt>
                  <dd>{{ item.value || '未填写' }}</dd>
                </div>
                <p v-if="!form.designRequirements.length" class="ax-hint">还没有设计需求，点「展开编辑」添加。</p>
              </dl>
              <div v-else class="tw-edit-list">
                <div v-for="(item, index) in form.designRequirements" :key="index" class="tw-req-row">
                  <input v-model="item.label" class="ax-input" aria-label="需求名称" placeholder="例如：尺寸规格" />
                  <textarea v-model="item.value" class="ax-textarea" rows="2" aria-label="需求内容" placeholder="填写这个项目的具体设计要求"></textarea>
                  <button type="button" class="tw-remove" title="删除这一项" aria-label="删除设计需求" @click="removeDesignRequirement(index)"><AdminIcon name="trash" plain /></button>
                </div>
                <p v-if="!form.designRequirements.length" class="ax-hint">还没有设计需求，点「新增要求」加一条。</p>
              </div>
            </article>

            <!-- 5 配套资料 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">5</span>用户端配套资料</h3>
                  <p>参考图、线稿、配色和字体；图片会自动压缩后保存。</p>
                </div>
                <div class="ax-actions">
                  <button v-if="materialPanelOpen" type="button" class="ax-btn is-sm" @click="addMaterial"><AdminIcon name="plus" plain />新增资料</button>
                  <button type="button" class="ax-btn is-sm is-ghost" @click="materialPanelOpen = !materialPanelOpen">{{ materialPanelOpen ? '收起' : '展开编辑' }}</button>
                </div>
              </div>
              <div v-if="!materialPanelOpen" class="tw-material-strip">
                <div v-for="item in form.materials" :key="item.id" class="tw-material-chip">
                  <span class="tw-thumb" :class="`is-${item.type}`">
                    <img v-if="item.preview" :src="item.preview" alt="" />
                    <AdminIcon v-else :name="materialIcon(item.type)" plain />
                  </span>
                  <span class="tw-material-name">
                    <strong>{{ item.title || '未命名资料' }}</strong>
                    <small>{{ materialTypeLabel(item.type) }}</small>
                  </span>
                </div>
                <p v-if="!form.materials.length" class="ax-hint">还没有配套资料，点「展开编辑」添加。</p>
              </div>
              <div v-else class="tw-edit-list">
                <div v-for="(item, index) in form.materials" :key="item.id" class="tw-material-row">
                  <span class="tw-thumb is-lg" :class="`is-${item.type}`">
                    <img v-if="item.preview" :src="item.preview" :alt="item.title" />
                    <AdminIcon v-else :name="materialIcon(item.type)" plain />
                  </span>
                  <div class="tw-material-fields">
                    <select v-model="item.type" class="ax-select" aria-label="资料类型">
                      <option value="image">参考图片</option>
                      <option value="lineart">线稿</option>
                      <option value="palette">配色</option>
                      <option value="font">字体</option>
                    </select>
                    <input v-model="item.title" class="ax-input" aria-label="资料名称" placeholder="资料名称" />
                    <input v-model="item.description" class="ax-input" aria-label="资料说明" placeholder="资料说明" />
                  </div>
                  <label v-if="['image', 'lineart'].includes(item.type)" class="ax-btn is-sm tw-file-btn">
                    {{ item.preview ? '换图片' : '选择图片' }}
                    <input class="tw-file" type="file" accept="image/*" @change="handleMaterialFile($event, index)" />
                  </label>
                  <button type="button" class="tw-remove" title="删除这一项" aria-label="删除配套资料" @click="removeMaterial(index)"><AdminIcon name="trash" plain /></button>
                </div>
                <p v-if="!form.materials.length" class="ax-hint">还没有配套资料，点「新增资料」加一条。</p>
              </div>
            </article>

            <!-- 6 H5 报告风格 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">6</span>H5 报告风格</h3>
                  <p>{{ teacherH5AdminEnabled ? '按这门课设置小画家能选哪些报告风格。' : '管理员已统一为平台智能选择。' }}</p>
                </div>
              </div>
              <p v-if="teacherH5Runtime.loading" class="ax-hint">正在读取管理员设置…</p>
              <template v-else>
                <div class="ax-option-grid">
                  <label class="ax-option">
                    <input v-model="form.h5ReportSettings.selectionMode" type="radio" value="auto" />
                    <span><strong>智能自动选择</strong><small>根据课程主题自动匹配已发布的模板（默认）</small></span>
                  </label>
                  <label class="ax-option" :class="{ 'is-disabled': !teacherH5AdminEnabled }">
                    <input v-model="form.h5ReportSettings.selectionMode" type="radio" value="student" :disabled="!teacherH5AdminEnabled" />
                    <span><strong>允许小画家选择</strong><small>只能选管理员和这门课都允许的模板</small></span>
                  </label>
                </div>
                <div v-if="teacherH5AdminEnabled && form.h5ReportSettings.selectionMode === 'student'" class="tw-templates">
                  <label v-for="template in teacherH5Runtime.templates" :key="template.id" class="ax-option tw-template">
                    <input type="checkbox" :checked="form.h5ReportSettings.allowedTemplateIds.includes(template.id)" @change="toggleTeacherH5Template(template.id)" />
                    <i class="tw-swatch" :style="teacherTemplateSwatch(template)" aria-hidden="true"></i>
                    <span><strong>{{ template.name }}</strong><small>{{ template.description || 'H5 报告风格' }}</small></span>
                  </label>
                  <p v-if="!teacherH5Runtime.templates.length" class="ax-hint">管理员还没有为这个年龄段发布可用的模板。</p>
                </div>
                <label v-if="teacherH5AdminEnabled && form.h5ReportSettings.selectionMode === 'student' && teacherAllowedH5Templates.length" class="ax-field tw-default-template">
                  <span>这门课的默认模板</span>
                  <select v-model="form.h5ReportSettings.defaultTemplateId">
                    <option value="">跟随平台智能推荐</option>
                    <option v-for="template in teacherAllowedH5Templates" :key="template.id" :value="template.id">{{ template.name }}</option>
                  </select>
                </label>
                <p v-if="!teacherH5AdminEnabled" class="ax-note is-plain">平台已关闭小画家自主选择，这门课会使用智能自动选择。</p>
              </template>
            </article>

            <!-- 7 授权范围 -->
            <article class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3><span class="tw-step">7</span>发给谁</h3>
                  <p>只有发到的班级和小画家能在用户端看到这门课；多个名字用逗号隔开。</p>
                </div>
              </div>
              <div class="ax-form">
                <label class="ax-field">
                  <span>授权班级</span>
                  <input v-model="classText" placeholder="AI创意美术A班, 进阶设计班" />
                </label>
                <label class="ax-field">
                  <span>授权小画家</span>
                  <input v-model="studentText" placeholder="小画家阿橙, 晨晨, 可可" />
                </label>
              </div>
            </article>
          </div>

          <!-- 右侧：课程预览 + 发布前检查 -->
          <aside class="tw-editor-side">
            <article class="ax-card tw-preview">
              <div class="tw-preview-cover" :style="{ '--tint': categoryTint(form.category) }">
                <AdminIcon name="courses" size="xl" :tint="categoryTint(form.category)" />
                <span class="tw-preview-cat">{{ categoryLabel(form.category) }}</span>
              </div>
              <h3>{{ form.title || '未命名课程' }}</h3>
              <p>{{ form.description || '还没有课程简介' }}</p>
              <div class="ax-tags">
                <span v-if="form.difficulty" class="ax-tag">{{ form.difficulty }}</span>
                <span class="ax-tag">PPT {{ parsedPpt.length }} 页</span>
                <span class="ax-tag">问答 {{ parsedQuestions.length }} 题</span>
              </div>
              <ul class="tw-checklist" aria-label="发布前检查">
                <li v-for="item in publishChecklist" :key="item.label" :class="{ 'is-done': item.done }">
                  <span class="tw-check" aria-hidden="true"><AdminIcon v-if="item.done" name="check" plain /></span>
                  <span>{{ item.label }}</span>
                  <small>{{ item.done ? item.doneText : item.todoText }}</small>
                </li>
              </ul>
              <button type="button" class="ax-btn is-primary is-block" @click="saveCourse">发布并授权到用户端</button>
              <small class="ax-hint tw-preview-hint">发布后会同步到管理员的课程库。</small>
            </article>
          </aside>
        </div>
      </section>

      <!-- ================= 课程库 ================= -->
      <section v-else-if="activeMenu === 'courseLibrary'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>课程库</h2>
            <p>自己上传的课、管理员授权给你所在权限组的课都在这里；可以发放、编辑、复制。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn" :disabled="!canUploadCourse" @click="resetForm(); selectMenu('courseManage')">新建空白课程</button>
            <button type="button" class="ax-btn is-primary" :disabled="!canUploadCourse" @click="selectMenu('courseManage')"><AdminIcon name="upload" plain />上传新课程</button>
          </div>
        </header>

        <p v-if="courseAccessReady && !canUploadCourse" class="ax-note is-warn">当前账号还没有上传课程的权限，请联系管理员在「账号权限 → 权限组」里开通。</p>

        <div class="ax-stats is-3">
          <article v-for="item in libraryStats" :key="item.label" class="ax-stat">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
        </div>

        <article class="ax-card is-flush tw-library-card">
          <div class="ax-toolbar">
            <label class="ax-search">
              <input v-model="courseKeyword" type="search" placeholder="搜索课程名称、分类、班级" aria-label="搜索课程" />
            </label>
            <span class="ax-grow"></span>
            <template v-if="selectedCourseIds.length">
              <span class="ax-count">已选 {{ selectedCourseIds.length }} 门</span>
              <button type="button" class="ax-btn is-sm" @click="clearCourseSelection">取消选择</button>
              <button type="button" class="ax-btn is-sm is-danger" @click="confirmBulkDeleteCourses"><AdminIcon name="trash" plain />批量删除</button>
            </template>
            <span v-else class="ax-count">共 {{ filteredLibraryCourses.length }} 门</span>
          </div>
          <div v-if="!filteredLibraryCourses.length" class="ax-empty tw-table-empty">
            <strong>{{ courseStore.loading && !courseStore.loaded ? '正在读取课程…' : courseStore.loadError ? '课程读取失败' : courseKeyword.trim() ? '没有找到这门课程' : '课程库里还没有课程' }}</strong>
            <span>{{ courseStore.loadError || (courseKeyword.trim() ? '换个关键词试试。' : '自己上传的课、管理员授权给你所在权限组的课都会显示在这里。') }}</span>
          </div>
          <div v-else class="ax-table-wrap">
            <table class="ax-table tw-library-table">
              <thead>
                <tr>
                  <th class="is-check"><input type="checkbox" :checked="allLibraryCoursesSelected" :disabled="!filteredLibraryCourses.some(isOwnCourse)" title="全选我上传的课程" aria-label="全选当前列表里我上传的课程" @change="toggleAllLibraryCourses" /></th>
                  <th class="tw-col-course">课程</th>
                  <th class="tw-col-category">分类 / 年龄段</th>
                  <th class="tw-col-assets">课件</th>
                  <th class="tw-col-audience">发放范围</th>
                  <th class="tw-col-status">状态</th>
                  <th class="tw-col-updated">更新</th>
                  <th class="is-right tw-col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="course in filteredLibraryCourses" :key="course.id" :class="{ 'is-selected': selectedCourseIds.includes(course.id) }">
                  <td class="is-check">
                    <input type="checkbox" :disabled="!isOwnCourse(course)" :title="isOwnCourse(course) ? '选择' : '只能选择自己上传的课程'" :checked="selectedCourseIds.includes(course.id)" :aria-label="`选择 ${safeText(course.title, '趣味设计课程')}`" @change="toggleCourseSelection(course.id)" />
                  </td>
                  <td class="tw-col-course">
                    <div class="tw-course-cell">
                      <AdminIcon name="courses" size="sm" :tint="categoryTint(course.category)" />
                      <div class="ax-cell-main">
                        <strong class="tw-clamp-2" :title="safeText(course.title, '趣味设计课程')">{{ safeText(course.title, '趣味设计课程') }}</strong>
                        <small>{{ isOwnCourse(course) ? '我的上传' : serverAuthMode ? '权限组授权，复制后可发放' : '权限组授权' }}</small>
                      </div>
                    </div>
                  </td>
                  <td class="tw-col-category">
                    <div class="ax-cell-main">
                      <strong>{{ categoryLabel(course.category) }}</strong>
                      <small>{{ safeText(course.difficulty || course.ageRange, '青少年进阶') }}</small>
                    </div>
                  </td>
                  <td class="tw-col-assets">
                    <div class="tw-assets">
                      <span :class="{ 'is-missing': courseVideoText(course) === '未上传' }" :title="courseVideoText(course)"><AdminIcon name="video" plain />{{ courseVideoText(course) }}</span>
                      <span :class="{ 'is-missing': coursePptText(course) === '未上传' }" :title="coursePptText(course)"><AdminIcon name="layers" plain />{{ coursePptText(course) }}</span>
                    </div>
                  </td>
                  <td class="tw-col-audience">
                    <span class="tw-audience" :class="{ 'is-missing': courseAudienceText(course) === '暂未发放' }" :title="courseAudienceText(course)">{{ courseAudienceText(course) }}</span>
                  </td>
                  <td class="tw-col-status"><span class="ax-pill" :class="course.status === 'published' ? 'is-ok' : 'is-muted'">{{ course.status === 'published' ? '已发布' : '草稿' }}</span></td>
                  <td class="is-num tw-col-updated">{{ formatDate(course.updatedAt || course.createdAt) }}</td>
                  <td class="is-right tw-col-actions">
                    <div class="ax-actions">
                      <button v-if="canDistributeCourse(course)" type="button" class="ax-btn is-sm is-soft" @click="openCourseDistribution(course)">发放</button>
                      <button v-if="isOwnCourse(course)" type="button" class="ax-btn is-sm" @click="editCourse(course)">编辑</button>
                      <button v-if="canUseCourse(course)" type="button" class="ax-btn is-sm" @click="duplicateCourse(course)">复制</button>
                      <button v-if="isOwnCourse(course)" type="button" class="ax-btn is-sm is-danger" @click="confirmDeleteCourse(course)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="ax-pager tw-table-foot">
            <span>{{ serverAuthMode ? '课程库存在服务器上，换设备登录也能看到。' : '演示模式：课程库只存在这台设备的浏览器里。' }}</span>
          </footer>
        </article>
      </section>

      <!-- ================= 以下页面：样例数据（还没接后台） ================= -->
      <!-- 正式用户 -->
      <section v-else-if="activeMenu === 'students'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>正式用户</h2>
            <p>在读小画家的联系方式、报读班级和剩余课时。</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面的名单是虚构的，用来看排版。</span></p>
        <article class="ax-card is-flush">
          <div class="ax-toolbar">
            <label class="ax-search"><input v-model="sampleKeyword" type="search" placeholder="搜索姓名、课程、班级" aria-label="搜索小画家" /></label>
            <span class="ax-grow"></span>
            <span class="ax-count">共 {{ filteredStudentTableRows.length }} 人</span>
          </div>
          <div v-if="!filteredStudentTableRows.length" class="ax-empty is-compact tw-table-empty"><strong>没有找到</strong><span>换个关键词试试。</span></div>
          <div v-else class="ax-table-wrap">
            <table class="ax-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>联系方式</th>
                  <th>在读课程</th>
                  <th>报读班级</th>
                  <th>剩余课时</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in filteredStudentTableRows" :key="row.name">
                  <td>
                    <div class="ax-person is-static">
                      <AdminAvatar role="student" />
                      <div class="ax-cell-main"><strong>{{ row.name }}</strong><small>来源：{{ row.source }}</small></div>
                    </div>
                  </td>
                  <td class="is-nowrap">{{ row.contact }}</td>
                  <td>{{ row.course }}</td>
                  <td><span class="tw-ellipsis tw-cell-wide" :title="row.className">{{ row.className }}</span></td>
                  <td>
                    <div class="tw-meter" :class="{ 'is-low': lessonPercent(row.leftLessons, row.buyLessons) <= 25 }">
                      <span class="tw-bar"><i :style="{ width: `${lessonPercent(row.leftLessons, row.buyLessons)}%` }"></i></span>
                      <small>{{ lessonCount(row.leftLessons) }} / {{ row.buyLessons }}</small>
                    </div>
                  </td>
                  <td class="tw-muted">{{ row.remark }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- 班级管理 -->
      <section v-else-if="activeMenu === 'classManage'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>班级管理</h2>
            <p>班级、关联课程、人数和教学进度。</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面的班级是虚构的，用来看排版。真实班级在管理后台「账号与权限 → 分部与班级」里管理。</span></p>
        <article class="ax-card is-flush">
          <div class="ax-toolbar">
            <label class="ax-search"><input v-model="sampleKeyword" type="search" placeholder="搜索班级、课程、讲师" aria-label="搜索班级" /></label>
            <span class="ax-grow"></span>
            <span class="ax-count">共 {{ filteredClassRows.length }} 个班</span>
          </div>
          <div v-if="!filteredClassRows.length" class="ax-empty is-compact tw-table-empty"><strong>没有找到</strong><span>换个关键词试试。</span></div>
          <div v-else class="ax-table-wrap">
            <table class="ax-table">
              <thead>
                <tr>
                  <th>班级</th>
                  <th>关联课程</th>
                  <th>讲师</th>
                  <th>人数</th>
                  <th>教学进度</th>
                  <th>开课日期</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in filteredClassRows" :key="`${row.name}-${index}`">
                  <td>
                    <div class="ax-cell-main">
                      <strong class="tw-ellipsis tw-cell-wide" :title="row.name">{{ row.name }}</strong>
                      <small>{{ row.type }}</small>
                    </div>
                  </td>
                  <td><span class="tw-ellipsis" :title="row.course">{{ row.course }}</span></td>
                  <td class="is-nowrap">{{ row.teacher }}</td>
                  <td>
                    <div class="tw-meter">
                      <span class="tw-bar"><i :style="{ width: `${fractionPercent(row.capacity)}%` }"></i></span>
                      <small>{{ row.capacity }}</small>
                    </div>
                  </td>
                  <td>
                    <div class="tw-meter is-green">
                      <span class="tw-bar"><i :style="{ width: row.progressWidth }"></i></span>
                      <small>{{ row.progress }}</small>
                    </div>
                  </td>
                  <td class="is-num">{{ row.startDate }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- 课表中心 -->
      <section v-else-if="activeMenu === 'schedule'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>课表中心</h2>
            <p>按周查看每个班的上课时间。</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面是一周的样例课表，用来看排版。</span></p>
        <article class="ax-card is-flush tw-week">
          <div class="ax-card-head">
            <div>
              <h3>2026-07-13 ～ 07-19</h3>
              <p>这周共 {{ weekLessonTotal }} 节课</p>
            </div>
            <div class="tw-legend">
              <span><i class="is-done"></i>已上</span>
              <span><i class="is-todo"></i>待上</span>
            </div>
          </div>
          <div class="tw-week-scroll">
            <div class="tw-week-grid">
              <div class="tw-week-corner"></div>
              <div v-for="day in weekDays" :key="day.date" class="tw-day-head">
                <strong>{{ weekdayName(day) }}</strong>
                <small>{{ day.date.slice(5) }} · {{ day.count }} 节</small>
              </div>
              <template v-for="period in periods" :key="period">
                <div class="tw-period">{{ period }}</div>
                <div v-for="day in weekDays" :key="`${period}-${day.date}`" class="tw-cell">
                  <article v-for="(lesson, index) in lessonsBy(day.key, period)" :key="`${lesson.title}-${index}`" class="tw-lesson" :class="lesson.tone === 'gray' ? 'is-done' : 'is-todo'">
                    <b>{{ lesson.time }}</b>
                    <span>{{ lesson.title }}</span>
                  </article>
                </div>
              </template>
            </div>
          </div>
        </article>
      </section>

      <!-- 点名记录 -->
      <section v-else-if="activeMenu === 'attendanceRecord'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>点名记录</h2>
            <p>每次上课的到课、请假和缺勤人数。</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面的记录是虚构的，用来看排版。</span></p>
        <article class="ax-card is-flush">
          <div class="ax-table-wrap">
            <table class="ax-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>班级</th>
                  <th>到课</th>
                  <th>请假</th>
                  <th>缺勤</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in attendanceRows" :key="row.date">
                  <td class="is-num">{{ row.date }}</td>
                  <td><strong class="tw-strong">{{ row.className }}</strong></td>
                  <td><span class="ax-pill is-ok">{{ row.present }}</span></td>
                  <td><span class="ax-pill" :class="row.leave === '0人' ? 'is-muted' : 'is-info'">{{ row.leave }}</span></td>
                  <td><span class="ax-pill" :class="row.absent === '0人' ? 'is-muted' : 'is-bad'">{{ row.absent }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- 约课管理 -->
      <section v-else-if="activeMenu === 'booking'" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>约课管理</h2>
            <p>小画家的约课申请和确认情况。</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面的约课是虚构的，用来看排版。</span></p>
        <article class="ax-card is-flush">
          <div class="tw-list">
            <div v-for="row in bookingRows" :key="row.name" class="tw-list-row">
              <AdminAvatar role="student" />
              <div class="ax-row-main">
                <strong>{{ row.name }}</strong>
                <small>{{ row.course }} · {{ row.time }}</small>
              </div>
              <span class="ax-pill" :class="statusTone(row.status)">{{ row.status }}</span>
            </div>
          </div>
        </article>
      </section>

      <!-- 快速扣课 / 上课扣费 / 用户请假 -->
      <section v-else-if="['quickDeduct', 'classCharge', 'leaveManage'].includes(activeMenu)" class="ax-page">
        <header class="ax-head">
          <div>
            <h2>{{ currentMenu?.title }}</h2>
            <p>{{ activeMenu === 'leaveManage' ? '小画家的请假申请。' : activeMenu === 'classCharge' ? '上课后确认课消。' : '按签到和上课记录批量扣课时。' }}</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面的数字和名单是虚构的，用来看排版；不会真的扣课时。</span></p>
        <div class="ax-stats">
          <article v-for="item in dailyCards" :key="item.label" class="ax-stat">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
        </div>
        <article class="ax-card is-flush">
          <div class="ax-card-head">
            <div>
              <h3>{{ activeMenu === 'leaveManage' ? '请假申请' : '今日课消' }}</h3>
            </div>
          </div>
          <div class="ax-table-wrap">
            <table class="ax-table">
              <thead>
                <tr>
                  <th>小画家</th>
                  <th>课程</th>
                  <th>课时</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in chargeRows" :key="row.name">
                  <td>
                    <div class="ax-person is-static">
                      <AdminAvatar role="student" />
                      <div class="ax-cell-main"><strong>{{ row.name }}</strong></div>
                    </div>
                  </td>
                  <td>{{ row.course }}</td>
                  <td class="is-num">{{ row.count }}</td>
                  <td><span class="ax-pill" :class="statusTone(row.status)">{{ row.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- 教学数据 -->
      <section v-else class="ax-page">
        <header class="ax-head">
          <div>
            <h2>教学数据</h2>
            <p>课程进度、答题、创意提交和 AI 出图情况。</p>
          </div>
        </header>
        <p class="ax-note tw-page-note tw-sample-note"><AdminIcon name="eye" plain /><span><strong>样例数据</strong>这一页还没有接后台，下面的数字是虚构的，用来看排版。</span></p>
        <div class="ax-stats">
          <article v-for="item in dataCards" :key="item.label" class="ax-stat">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
        </div>
        <article class="ax-card is-flush">
          <div class="ax-card-head">
            <div>
              <h3>学习明细</h3>
            </div>
          </div>
          <div class="ax-table-wrap">
            <table class="ax-table">
              <thead>
                <tr>
                  <th>小画家</th>
                  <th>课程进度</th>
                  <th>答题得分</th>
                  <th>创意提交</th>
                  <th>AI 出图</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in studentRows" :key="row.name">
                  <td>
                    <div class="ax-person is-static">
                      <AdminAvatar role="student" />
                      <div class="ax-cell-main"><strong>{{ row.name }}</strong></div>
                    </div>
                  </td>
                  <td>
                    <div class="tw-meter is-green">
                      <span class="tw-bar"><i :style="{ width: row.progress }"></i></span>
                      <small>{{ row.progress }}</small>
                    </div>
                  </td>
                  <td class="is-num">{{ row.score }}</td>
                  <td><span class="ax-pill" :class="statusTone(row.idea)">{{ row.idea }}</span></td>
                  <td class="is-num">{{ row.ai }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- 发放课程：勾选班级 / 小画家（课程库里点「发放」打开） -->
      <el-dialog
        :model-value="Boolean(distributionCourse)"
        class="ax-dialog tw-dist-dialog"
        :title="`发放课程 · ${distributionCourse ? safeText(distributionCourse.title, '趣味设计课程') : ''}`"
        width="min(640px, 94vw)"
        align-center
        @update:model-value="(open) => { if (!open) closeCourseDistribution() }"
      >
        <p class="ax-hint tw-dist-hint">可以同时发给多个班级和指定的小画家，保存后用户端马上能看到。</p>
        <section class="tw-dist-group">
          <h4>班级 <small v-if="distributionClassDraft.length">已选 {{ distributionClassDraft.length }}</small></h4>
          <div class="ax-tags is-roomy">
            <label v-for="item in classOptions" :key="item.value" class="ax-chip-check">
              <input v-model="distributionClassDraft" type="checkbox" :value="item.value" />
              <span>{{ item.label }}</span>
            </label>
          </div>
          <p v-if="!classOptions.length" class="ax-hint">{{ distributionOptionsError || '机构里还没有班级，请管理员先在「班级管理」里建班级。' }}</p>
        </section>
        <section class="tw-dist-group">
          <h4>指定小画家 <small v-if="distributionStudentDraft.length">已选 {{ distributionStudentDraft.length }}</small></h4>
          <div class="ax-tags is-roomy">
            <label v-for="item in studentOptions" :key="item.value" class="ax-chip-check">
              <input v-model="distributionStudentDraft" type="checkbox" :value="item.value" />
              <span>{{ item.label }}</span>
            </label>
          </div>
          <p v-if="!studentOptions.length" class="ax-hint">{{ distributionOptionsError || '机构里还没有小画家账号。' }}</p>
        </section>
        <template #footer>
          <div class="tw-dist-foot">
            <button type="button" class="ax-btn" @click="clearCourseDistribution">清空选择</button>
            <span class="ax-grow"></span>
            <button type="button" class="ax-btn" @click="closeCourseDistribution">取消</button>
            <button type="button" class="ax-btn is-primary" @click="saveCourseDistribution">保存发放</button>
          </div>
        </template>
      </el-dialog>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminIcon from '../components/admin/AdminIcon.vue'
import AdminAvatar from '../components/admin/AdminAvatar.vue'
import { adminIcon } from '../components/admin/adminIcons.js'
import { useUserStore } from '../stores/userStore'
import { useCourseStore } from '../stores/courseStore'
import { useAccountPermissionStore } from '../stores/accountPermissionStore'
import {
  parseCourseDocument as parseSharedCourseDocument,
  readCourseDocumentText as readSharedCourseDocumentText,
  readCoursePptPages as readSharedCoursePptPages,
} from '../utils/courseUploadParser'
import { uploadCourseAsset, uploadCourseVideoToServer } from '../services/coursePptConversion'
import { createCourseAssetId, saveCourseAsset } from '../stores/courseAssetStore'
import { apiClient } from '../services/apiClient'
// 外观和管理后台同一套（顺序同 AdminDashboard.vue：基础 → 组件 → 外壳 → 苹果风覆盖）
import '../styles/admin-theme.scss'
import '../styles/admin-ui.scss'
import '../styles/admin-shell.scss'
import '../styles/admin-apple.scss'

const router = useRouter()
const userStore = useUserStore()
const courseStore = useCourseStore()
const accountPermissionStore = useAccountPermissionStore()
const activeMenu = ref('overview')
const collapsedGroups = ref([])
const requirementPanelOpen = ref(false)
const materialPanelOpen = ref(false)
const form = reactive(defaultForm())
const editingCourseId = ref('')
const pptText = ref('课程导入｜观察奶茶店门头的招牌、色彩和橱窗\n设计观察｜记录品牌特点和视觉元素\n创作任务｜整理成 AI 绘画项目提示词')
const questionText = ref('')
const choiceLabels = ['A', 'B', 'C', 'D']
const serverAuthMode = import.meta.env.VITE_AUTH_MODE === 'server'
const questionCards = ref([])
const documentSourceText = ref('')
const documentParsing = ref(false)
const documentParseStatus = reactive({
  state: 'idle',
  message: '尚未上传课程文档',
  textLength: 0,
  fieldCount: 0,
  questionCount: 0,
  preview: '',
})
const classText = ref(import.meta.env.VITE_AUTH_MODE === 'server' ? '' : 'AI创意美术A班, 进阶设计班')
const studentText = ref(import.meta.env.VITE_AUTH_MODE === 'server' ? '' : '小画家阿橙, 晨晨, 可可')
const distributionCourseId = ref('')
const distributionClassDraft = ref([])
const distributionStudentDraft = ref([])
const videoFileInput = ref(null)
const pptFileInput = ref(null)
const docFileInput = ref(null)
const courseKeyword = ref('')
const selectedCourseIds = ref([])
const teacherH5Runtime = reactive({ loading: false, edition: null, templates: [], defaultTemplateId: '' })

// 菜单（2026-11-27 讲师端重做）：按用途分区，每项一个图标；页面 id、标题和以前一样，只改了摆法。
// 排课、点名、扣课、请假、教学数据这几页一直是写死的样例数据（还没接后台），页面上会标出来。
const menuGroups = [
  {
    id: 'home',
    label: '',
    children: [
      { id: 'overview', label: '讲师概况', title: '讲师工作台概览', desc: '今日概览', icon: 'dashboard' },
    ],
  },
  {
    id: 'course',
    label: '课程',
    children: [
      { id: 'courseManage', label: '课程管理', title: '课程上传与管理', desc: '上传课程课件', icon: 'upload', tint: '#ff9500' },
      { id: 'courseLibrary', label: '课程库', title: '课程库', desc: '分类课程文件', icon: 'folder' },
    ],
  },
  {
    id: 'education',
    label: '教务中心',
    children: [
      { id: 'students', label: '正式用户', title: '正式用户管理', desc: '信息 / 档案 / 作品', icon: 'accounts' },
      { id: 'classManage', label: '班级管理', title: '班级与授权管理', desc: '班级 / 用户', icon: 'layers', tint: '#30c158' },
      { id: 'schedule', label: '课表中心', title: '课表中心', desc: '排课 / 调课', icon: 'calendar' },
      { id: 'attendanceRecord', label: '点名记录', title: '点名记录', desc: '到课 / 请假', icon: 'checklist' },
      { id: 'booking', label: '约课管理', title: '约课管理', desc: '预约 / 确认', icon: 'clock' },
    ],
  },
  {
    id: 'daily',
    label: '日常课务',
    children: [
      { id: 'quickDeduct', label: '快速扣课', title: '快速扣课', desc: '批量扣课时', icon: 'ticket' },
      { id: 'classCharge', label: '上课扣费', title: '上课扣费', desc: '课消确认', icon: 'coins' },
      { id: 'leaveManage', label: '用户请假', title: '用户请假', desc: '请假审核', icon: 'note' },
    ],
  },
  {
    id: 'insight',
    label: '数据',
    children: [
      { id: 'data', label: '教学数据', title: '教学数据看板', desc: '学习进度与AI生成', icon: 'trendUp', tint: '#00c7be' },
    ],
  },
]

const categoryOptions = [
  { label: '门头设计', value: 'storefront' },
  { label: 'IP形象设计', value: 'ip' },
  { label: '广告设计', value: 'ad' },
  { label: '漫画人物设计', value: 'anime' },
  { label: '产品设计', value: 'product' },
  { label: '室内设计', value: 'interior' },
  { label: '汽车造型设计', value: 'car' },
  { label: '创意画', value: 'creative' },
  { label: '教育绘本', value: 'picturebook' },
]

const flatMenuItems = computed(() => menuGroups.flatMap((group) => group.children))
const currentMenu = computed(() => flatMenuItems.value.find((item) => item.id === activeMenu.value))

// ---- 外壳：侧栏搜索、分组收起、手机抽屉、顶栏（和管理后台同一套交互） ----
const brandIconPath = adminIcon('courses').d
const navDrawerOpen = ref(false)
const navQuery = ref('')
const topbarScrolled = ref(false)
const currentGroup = computed(() => menuGroups.find((group) => group.children.some((item) => item.id === activeMenu.value)))
const currentGroupLabel = computed(() => currentGroup.value?.label || '')
const navSearchResults = computed(() => {
  const keyword = navQuery.value.toLowerCase()
  if (!keyword) return []
  return menuGroups.flatMap((group) => group.children
    .filter((item) => [item.label, item.title, item.desc, group.label].some((text) => String(text || '').toLowerCase().includes(keyword)))
    .map((item) => ({ ...item, groupLabel: group.label })))
})
function menuIcon(item) {
  const base = adminIcon(item.icon)
  return item.tint ? { ...base, tint: item.tint } : base
}
// 当前页面所在的分组总是展开，免得看不到自己选中的是哪一项
function isGroupClosed(group) {
  return collapsedGroups.value.includes(group.id) && group.id !== currentGroup.value?.id
}
function selectMenu(id) {
  activeMenu.value = id
  navDrawerOpen.value = false
  navQuery.value = ''
}
function openFirstNavMatch() {
  if (navSearchResults.value.length) selectMenu(navSearchResults.value[0].id)
}
// 换页（包括点「编辑」、发布后自动跳回课程库）：回到页面顶部；离开课程库就关掉发放弹窗，免得回来时又自己弹出来
watch(activeMenu, (id) => {
  if (id !== 'courseLibrary') closeCourseDistribution()
  sampleKeyword.value = ''
  navDrawerOpen.value = false
  window.scrollTo({ top: 0 })
})
function updateTopbarScrolled() {
  topbarScrolled.value = window.scrollY > 4
}
onMounted(() => {
  updateTopbarScrolled()
  window.addEventListener('scroll', updateTopbarScrolled, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', updateTopbarScrolled))
const teacherDisplayName = computed(() => userStore.user?.name || '讲师')
const teacherOrgName = computed(() => userStore.user?.organization?.name || '讲师')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '上午好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const parsedPpt = computed(() => splitList(pptText.value))
const parsedQuestions = computed(() => parseChoiceQuestions(questionText.value))
const teacherAccount = computed(() => accountPermissionStore.getAccountForUser(userStore.user))
const teacherPermissionGroups = computed(() => (
  teacherAccount.value
    ? accountPermissionStore.groupsForAccount(teacherAccount.value.id).filter((group) => group.permissions?.courseLibraryView)
    : []
))
const teacherVisibleCourses = computed(() => courseStore.coursesForTeacher(
  userStore.user?.id || teacherAccount.value?.id || 'tea-001',
  teacherPermissionGroups.value.map((group) => group.id),
))
const effectiveTeacherPermissions = computed(() => accountPermissionStore.effectivePermissions(teacherAccount.value))
const canUploadCourse = computed(() => Boolean(effectiveTeacherPermissions.value.courseUpload))
const teacherH5EditionKey = computed(() => {
  const text = String(form.difficulty || '')
  if (/13\s*[-–—至]\s*16|高级|专业/i.test(text)) return 'pro'
  if (/10\s*[-–—至]\s*12|进阶/i.test(text)) return 'advanced'
  return 'starter'
})
const teacherH5AdminEnabled = computed(() => teacherH5Runtime.edition?.studentCanChoose === true)
const teacherAllowedH5Templates = computed(() => teacherH5Runtime.templates.filter((template) => form.h5ReportSettings.allowedTemplateIds.includes(template.id)))
const distributionCourse = computed(() => teacherVisibleCourses.value.find((course) => course.id === distributionCourseId.value))
const filteredLibraryCourses = computed(() => {
  const keyword = courseKeyword.value.trim().toLowerCase()
  if (!keyword) return teacherVisibleCourses.value
  return teacherVisibleCourses.value.filter((course) => [
    course.title,
    categoryLabel(course.category),
    course.difficulty,
    course.ageRange,
    course.videoFileName,
    course.pptFileName,
    course.documentFileName,
    ...(course.authorizedClasses || []),
  ].some((item) => String(item || '').toLowerCase().includes(keyword)))
})
const allLibraryCoursesSelected = computed(() => (
  filteredLibraryCourses.value.some(isOwnCourse)
  && filteredLibraryCourses.value.filter(isOwnCourse).every((course) => selectedCourseIds.value.includes(course.id))
))
// 「发放到的班级」以前写死成 2 个班，现在按课程实际发到的班级算
const distributedClassNames = computed(() => [...new Set(teacherVisibleCourses.value
  .flatMap((course) => course.authorizedClasses || [])
  .map((name) => safeText(name, ''))
  .filter(Boolean))])
const summary = computed(() => [
  { label: '可用课程', value: String(teacherVisibleCourses.value.length), note: '本人上传与权限组授权' },
  { label: '发放到的班级', value: String(distributedClassNames.value.length), note: distributedClassNames.value.slice(0, 2).join(' / ') || '还没有发给班级' },
  { label: '课程类型', value: String(categoryOptions.length), note: '门头、IP、广告、产品等' },
  { label: '报告素材', value: '自动同步', note: '问答和创意进入项目报告' },
])

const dataCards = [
  { label: '课程完成率', value: '76%', note: '本周学习数据' },
  { label: '平均正确率', value: '82%', note: '随堂练习统计' },
  { label: '创意提交数', value: '48', note: '文字 / 语音创意' },
  { label: 'AI绘图生成数', value: '126', note: '用户项目出图' },
]

const dailyCards = computed(() => [
  { label: '今日待扣课', value: '12', note: '按签到与上课记录生成' },
  { label: '待确认课消', value: '5', note: '需要讲师确认' },
  { label: '请假申请', value: '3', note: '今日待处理' },
  { label: '课程库文件', value: String(teacherVisibleCourses.value.length), note: '本人上传与组授权课程' },
])

// 发放面板的名单：演示模式用内置名字；服务端模式读本机构真实的班级、小画家（勾的是 ID，重名也不会发错人）
const demoClassOptions = ['AI创意美术A班', '进阶设计班', '低龄启蒙班', '周末综合班']
const demoStudentOptions = ['小画家阿橙', '晨晨', '可可', '多多', '小米', '安安', '乐乐', '一一']
const serverDistribution = reactive({ classes: [], students: [] })
// 讲师课程权限读回来之前不提示「没有权限」，免得一进页面闪一下
const courseAccessReady = ref(!serverAuthMode)
const distributionOptionsError = ref('')
const classOptions = computed(() => (serverAuthMode
  ? serverDistribution.classes.map((item) => ({ value: item.id, label: `${item.name}（${item.studentCount}人）` }))
  : demoClassOptions.map((name) => ({ value: name, label: name }))))
const studentOptions = computed(() => {
  if (!serverAuthMode) return demoStudentOptions.map((name) => ({ value: name, label: name }))
  const nameCount = serverDistribution.students.reduce((counts, item) => counts.set(item.name, (counts.get(item.name) || 0) + 1), new Map())
  const className = new Map(serverDistribution.classes.map((item) => [item.id, item.name]))
  return serverDistribution.students.map((item) => {
    // 同名的小画家后面带上班级，免得勾错
    const classes = (item.classIds || []).map((id) => className.get(id)).filter(Boolean).join('、')
    return { value: item.id, label: nameCount.get(item.name) > 1 ? `${item.name}（${classes || '未分班'}）` : item.name }
  })
})

async function loadDistributionOptions() {
  if (!serverAuthMode) return
  try {
    const { data } = await apiClient.get('/me/course-distribution-options', { timeout: 10000 })
    serverDistribution.classes = Array.isArray(data.classes) ? data.classes : []
    serverDistribution.students = Array.isArray(data.students) ? data.students : []
    distributionOptionsError.value = ''
  } catch (error) {
    distributionOptionsError.value = error?.response?.data?.message || '班级和小画家名单读取失败，请刷新页面重试。'
  }
}

// 编辑表单里删掉了某个班级 / 小画家的名字：对应的 ID 也一起去掉，不然名单上没有了、实际还发着
function keepDistributionIds(existing, payload) {
  const patch = {}
  const pairs = [
    ['authorizedClassIds', 'authorizedClasses', serverDistribution.classes],
    ['authorizedStudentIds', 'authorizedStudents', serverDistribution.students],
  ]
  for (const [idKey, nameKey, list] of pairs) {
    const ids = existing?.[idKey] || []
    if (!ids.length || !list.length) continue
    const names = new Set(payload[nameKey] || [])
    const nameOf = new Map(list.map((item) => [item.id, item.name]))
    patch[idKey] = ids.filter((id) => !nameOf.has(id) || names.has(nameOf.get(id)))
  }
  return patch
}

// 老课程只存了名字：按唯一同名换成 ID，好在面板里勾上
function distributionDraftIds(ids, names, list) {
  const known = new Set(list.map((item) => item.id))
  if (Array.isArray(ids) && ids.length) return ids.filter((id) => known.has(id))
  return (names || []).map((name) => {
    const hits = list.filter((item) => item.name === name)
    return hits.length === 1 ? hits[0].id : ''
  }).filter(Boolean)
}
const studentRows = [
  { name: '小画家阿橙', progress: '80%', score: '92', idea: '已提交', ai: '8张', lessons: '18节', report: '6份', parent: '已绑定' },
  { name: '晨晨', progress: '65%', score: '84', idea: '已提交', ai: '4张', lessons: '12节', report: '4份', parent: '已绑定' },
  { name: '可可', progress: '40%', score: '78', idea: '未提交', ai: '2张', lessons: '9节', report: '2份', parent: '未绑定' },
  { name: '多多', progress: '100%', score: '96', idea: '已提交', ai: '12张', lessons: '22节', report: '8份', parent: '已绑定' },
]

const scheduleRows = [
  { time: '周三 16:30', course: '奶茶店门头设计趣味课', className: 'AI创意美术A班', teacher: '王讲师' },
  { time: '周五 18:00', course: '原创IP形象设计课', className: '进阶设计班', teacher: '王讲师' },
  { time: '周六 09:30', course: '品牌广告海报设计', className: '周末综合班', teacher: '李讲师' },
  { time: '周日 14:00', course: '产品包装设计课', className: 'AI创意美术A班', teacher: '王讲师' },
]

const attendanceRows = [
  { date: '2026-07-15', className: 'AI创意美术A班', present: '12人', leave: '1人', absent: '0人' },
  { date: '2026-07-14', className: '进阶设计班', present: '9人', leave: '0人', absent: '1人' },
  { date: '2026-07-13', className: '周末综合班', present: '15人', leave: '2人', absent: '0人' },
]

const bookingRows = [
  { name: '小画家阿橙', course: '门头设计', time: '周三 16:30', status: '待确认', action: '确认' },
  { name: '晨晨', course: 'IP形象', time: '周五 18:00', status: '已确认', action: '查看' },
  { name: '可可', course: '广告海报', time: '周六 09:30', status: '待调整', action: '改课' },
]

const chargeRows = [
  { name: '小画家阿橙', course: '奶茶店门头设计趣味课', count: '1节', status: '待扣课' },
  { name: '晨晨', course: '原创IP形象设计课', count: '1节', status: '已签到' },
  { name: '可可', course: '品牌广告海报设计', count: '1节', status: '请假中' },
  { name: '多多', course: '产品包装设计课', count: '1节', status: '待确认' },
]

// 演示数据：姓名、电话都是虚构的（真实学员信息不能写进代码）
const studentTableRows = [
  { name: '乐乐 ♂', contact: '妈妈:138****0001', source: '未知', course: '创意联想', className: '2026年7月暑期综合班', buyLessons: '4课时', leftLessons: '4课时', grade: '-', remark: '周末上美术课' },
  { name: '豆豆 ♂', contact: '妈妈:139****0002', source: '未知', course: '书法硬笔', className: '2026年暑期书法硬笔字班', buyLessons: '24课时', leftLessons: '24课时', grade: '-', remark: '-' },
  { name: '果果 ♀', contact: '妈妈:137****0003', source: '未知', course: '书法硬笔', className: '2026年暑期书法硬笔字班', buyLessons: '24课时', leftLessons: '24课时', grade: '-', remark: '-' },
  { name: '米粒 ♀', contact: '妈妈:189****0004', source: '未知', course: '造型基础', className: '造型基础-2班', buyLessons: '35课时', leftLessons: '6课时', grade: '-', remark: '-' },
  { name: '朵朵 ♀', contact: '妈妈:186****0005', source: '未知', course: '创意联想', className: '创意联想-3班', buyLessons: '4课时', leftLessons: '2课时', grade: '-', remark: '-' },
  { name: '天天 ♂', contact: '妈妈:185****0006', source: '未知', course: '创意联想', className: '创意联想综合班', buyLessons: '84课时', leftLessons: '78课时', grade: '-', remark: '-' },
  { name: '阳阳(9岁) ♂', contact: '奶奶:139****0007', source: '内部推荐', course: '创意联想', className: '创意联想综合班', buyLessons: '84课时', leftLessons: '80课时', grade: '-', remark: '-' },
  { name: '小宇 ♂', contact: '妈妈:136****0008', source: '未知', course: '书法硬笔', className: '2026年暑期书法硬笔字班', buyLessons: '84课时', leftLessons: '80课时', grade: '-', remark: '-' },
]

const classRows = [
  { name: '2026年暑期美术综合班（星期天下午1:30-3:30）', type: '综合班', course: '造型艺术（专业升学班）等6门', teacher: '王讲师', capacity: '0/12', progress: '2/9', progressWidth: '22%', startDate: '2026-07-05', assistant: '-', room: '-' },
  { name: '2026年暑期美术综合班（星期六下午3:45-5:45）', type: '综合班', course: '书法软笔,书法硬笔', teacher: '王讲师', capacity: '0/12', progress: '0/9', progressWidth: '0%', startDate: '2026-07-04', assistant: '-', room: '-' },
  { name: '2026年暑期书法硬笔字班7月2日-7月25日', type: '综合班', course: '书法软笔,书法硬笔', teacher: '周讲师', capacity: '3/12', progress: '3/13', progressWidth: '30%', startDate: '2026-07-03', assistant: '-', room: '-' },
  { name: '2026年暑期书法硬笔字班7月2日-7月25日', type: '综合班', course: '书法软笔,书法硬笔', teacher: '周讲师', capacity: '7/12', progress: '11/27', progressWidth: '45%', startDate: '2026-07-02', assistant: '-', room: '-' },
  { name: '2026年7月暑期综合班', type: '综合班', course: '艺术萌芽等9门', teacher: '王讲师', capacity: '1/12', progress: '13/30', progressWidth: '48%', startDate: '2026-06-29', assistant: '-', room: '-' },
  { name: '5月10日星期天晚上7:00母亲节活动3', type: '综合班', course: '造型艺术（专业升学班）等7门', teacher: '李讲师', capacity: '5/12', progress: '1/1 清零', progressWidth: '100%', startDate: '2026-05-10', assistant: '-', room: '-' },
]

const weekDays = [
  { key: 'mon', label: '星期一(2026-07-13)', date: '2026-07-13', count: 2 },
  { key: 'tue', label: '星期二(2026-07-14)', date: '2026-07-14', count: 3 },
  { key: 'wed', label: '星期三(2026-07-15)', date: '2026-07-15', count: 3 },
  { key: 'thu', label: '星期四(2026-07-16)', date: '2026-07-16', count: 2 },
  { key: 'fri', label: '星期五(2026-07-17)', date: '2026-07-17', count: 4 },
  { key: 'sat', label: '星期六(2026-07-18)', date: '2026-07-18', count: 9 },
  { key: 'sun', label: '星期天(2026-07-19)', date: '2026-07-19', count: 6 },
]

const periods = ['上午', '下午', '晚上']
const scheduleLessonMap = {
  'mon-上午': [{ title: '2026年7月暑期综合班', time: '09:30-11:30', tone: 'gray' }],
  'mon-下午': [{ title: '2026年暑期书法硬笔字班', time: '14:15-15:45', tone: 'gray' }],
  'tue-上午': [{ title: '2026年7月暑期综合班', time: '09:30-11:30', tone: 'gray' }],
  'tue-下午': [{ title: '2026年暑期书法硬笔字班', time: '14:15-15:45', tone: 'gray' }],
  'tue-晚上': [{ title: '艺术启蒙班', time: '19:00-20:30', tone: 'green' }],
  'wed-上午': [{ title: '2026年7月暑期综合班', time: '09:30-11:30', tone: 'green' }],
  'wed-下午': [{ title: '2026年暑期书法硬笔字班', time: '14:15-15:45', tone: 'green' }, { title: '2026年暑期书法硬笔字班', time: '16:00-17:30', tone: 'green' }],
  'thu-下午': [{ title: '2026年暑期书法硬笔字班', time: '14:15-15:45', tone: 'green' }, { title: '2026年暑期书法硬笔字班', time: '16:00-17:30', tone: 'green' }],
  'fri-上午': [{ title: '2026年7月暑期综合班', time: '09:30-11:30', tone: 'green' }],
  'fri-下午': [{ title: '2026年暑期书法硬笔字班', time: '14:15-15:45', tone: 'green' }, { title: '2026年暑期书法硬笔字班', time: '16:00-17:30', tone: 'green' }],
  'fri-晚上': [{ title: '造型基础班', time: '18:45-20:45', tone: 'green' }],
  'sat-上午': [{ title: '2026年7月暑期综合班', time: '09:30-11:30', tone: 'green' }, { title: '创意联想/造型基础综合班', time: '09:30-11:30', tone: 'green' }, { title: '艺术启蒙班', time: '10:00-11:30', tone: 'green' }],
  'sat-下午': [{ title: '2026年暑期美术综合班', time: '13:30-15:30', tone: 'green' }, { title: '造型基础-1班', time: '13:30-15:30', tone: 'green' }, { title: '2026年暑期书法硬笔字班', time: '14:15-15:45', tone: 'green' }, { title: '2026年暑期美术综合班', time: '15:45-17:45', tone: 'green' }, { title: '创意联想-3班', time: '15:45-17:45', tone: 'green' }, { title: '2026年暑期书法硬笔字班', time: '16:00-17:30', tone: 'green' }],
  'sun-上午': [{ title: '2026年7月暑期综合班', time: '09:30-11:30', tone: 'green' }, { title: '创意联想-4班', time: '09:30-11:30', tone: 'green' }, { title: '造型基础-1班', time: '09:30-11:30', tone: 'green' }, { title: '实验探索', time: '10:00-11:30', tone: 'green' }],
  'sun-下午': [{ title: '2026年暑期美术综合班', time: '13:30-15:45', tone: 'green' }, { title: '造型基础-2班', time: '15:45-17:45', tone: 'green' }],
}

// ---- 页面上用的小工具（只管显示，不碰数据和接口） ----
const learningFlow = [
  { label: '视频 / PPT', note: '讲师上传课件', icon: 'play' },
  { label: '课堂问答', note: '随堂选择题', icon: 'checklist' },
  { label: '创意想法', note: '文字或语音', icon: 'sparkles' },
  { label: 'AI绘画', note: '生成作品', icon: 'image' },
  { label: '项目报告', note: 'H5 报告', icon: 'report' },
]
const CATEGORY_TINTS = { storefront: '#ff9500', ip: '#ff2d55', ad: '#af52de', anime: '#5856d6', product: '#30b0c7', interior: '#30c158', car: '#0a84ff', creative: '#ff9f0a', picturebook: '#00c7be' }
function categoryTint(value) {
  return CATEGORY_TINTS[value] || '#8e8e93'
}
const libraryStats = computed(() => {
  const own = teacherVisibleCourses.value.filter(isOwnCourse)
  return [
    { label: '全部课程', value: String(teacherVisibleCourses.value.length), note: '我上传的和权限组授权的' },
    { label: '我上传的', value: String(own.length), note: '可以编辑、发放、删除' },
    { label: '还没发放', value: String(own.filter((course) => courseAudienceText(course) === '暂未发放').length), note: '小画家暂时看不到这些课' },
  ]
})
const publishChecklist = computed(() => [
  { label: '课程视频', done: Boolean(form.videoFileName), doneText: '已上传', todoText: '可选' },
  { label: 'PPT 课件', done: Boolean(form.pptFileName), doneText: '已上传', todoText: '可选' },
  { label: '引导选择题', done: questionCards.value.length > 0, doneText: `${questionCards.value.length} 道`, todoText: '解析文档后生成' },
  { label: '发给谁', done: splitList(classText.value).length + splitList(studentText.value).length > 0, doneText: '已填写', todoText: '还没填' },
])
const showParseCounts = computed(() => documentParseStatus.state !== 'idle' || documentParseStatus.textLength > 0)
const sampleKeyword = ref('')
function matchesSample(row, keys) {
  const keyword = sampleKeyword.value.trim().toLowerCase()
  return !keyword || keys.some((key) => String(row[key] || '').toLowerCase().includes(keyword))
}
const filteredStudentTableRows = computed(() => studentTableRows.filter((row) => matchesSample(row, ['name', 'contact', 'course', 'className', 'remark'])))
const filteredClassRows = computed(() => classRows.filter((row) => matchesSample(row, ['name', 'type', 'course', 'teacher'])))
const weekLessonTotal = computed(() => weekDays.reduce((sum, day) => sum + day.count, 0))
function weekdayName(day) {
  return String(day?.label || '').replace(/[(（].*$/, '')
}
function lessonCount(value) {
  return String(value ?? '').replace(/课时$/, '')
}

function lessonPercent(left, total) {
  const rest = parseFloat(left)
  const all = parseFloat(total)
  return all > 0 && Number.isFinite(rest) ? Math.max(0, Math.min(100, Math.round((rest / all) * 100))) : 0
}
function fractionPercent(text) {
  const [part, all] = String(text || '').split('/').map((value) => parseFloat(value))
  return all > 0 && Number.isFinite(part) ? Math.max(0, Math.min(100, Math.round((part / all) * 100))) : 0
}
function statusTone(status) {
  const text = String(status || '')
  if (/已确认|已签到|已提交|已发布/.test(text)) return 'is-ok'
  if (/请假/.test(text)) return 'is-info'
  if (/未提交/.test(text)) return 'is-muted'
  return 'is-warn'
}

function defaultDesignRequirements(category = 'storefront') {
  const presets = {
    storefront: ['横向门头画面，招牌文字清晰可读', '店名、招牌、入口、橱窗或产品符号', '从店铺商品、品牌名称和目标顾客中提取', '亲和、醒目，与店铺定位一致', '实体门店门头与品牌展示'],
    ip: ['完整角色正面稿，缩小后仍容易识别', '角色轮廓、表情、标志配件和主色', '从动物、植物、食物或品牌故事中提取', '造型简洁、特点明确、方便延展动作', '海报、周边、表情包和品牌宣传'],
  }
  const values = presets[category] || ['适合课程最终作品展示', '主题主体、核心文字和必要装饰', '从课程主题与真实需求中提取', '层级清晰，符合目标人群', '课程展示与作品集归档']
  return ['尺寸规格', '必备元素', '形象来源', '风格要求', '使用场景'].map((label, index) => ({ label, value: values[index] }))
}

function defaultMaterials(category = 'storefront') {
  const subject = category === 'ip' ? '角色' : '门头'
  const stamp = Date.now()
  return [
    { id: `material-${stamp}-line`, type: 'lineart', title: `${subject}线稿`, description: '结构与轮廓参考', preview: '' },
    { id: `material-${stamp}-image`, type: 'image', title: '参考图片', description: `${subject}构图参考`, preview: '' },
    { id: `material-${stamp}-color`, type: 'palette', title: '配色表', description: '主色 / 辅色 / 点缀色', preview: '' },
    { id: `material-${stamp}-font`, type: 'font', title: '字体参考', description: '与项目风格一致', preview: '' },
  ]
}

function defaultForm() {
  return {
    title: '奶茶店门头设计趣味课',
    category: 'storefront',
    difficulty: '青少年进阶 · 13-16岁',
    videoUrl: 'mock://video/storefront-design',
    videoAssetId: '',
    videoFileName: '',
    pptAssetId: '',
    pptFileName: '',
    pptPdfUrl: '',
    pptSlideImages: [],
    documentFileName: '',
    description: '把真实商家的门头招牌、色彩和品牌气质做成趣味设计项目，引导用户完成 AI 绘画创作。',
    designRequirements: defaultDesignRequirements('storefront'),
    materials: defaultMaterials('storefront'),
    h5ReportSettings: {
      selectionMode: 'auto',
      allowedTemplateIds: [],
      defaultTemplateId: '',
    },
  }
}

async function loadTeacherH5Runtime() {
  teacherH5Runtime.loading = true
  try {
    const response = await apiClient.get('/h5-report/runtime-config', { params: { difficulty: teacherH5EditionKey.value } })
    teacherH5Runtime.edition = response.data?.edition || null
    teacherH5Runtime.templates = Array.isArray(response.data?.templates) ? response.data.templates : []
    teacherH5Runtime.defaultTemplateId = response.data?.defaultTemplateId || ''
    const availableIds = new Set(teacherH5Runtime.templates.map((template) => template.id))
    form.h5ReportSettings.allowedTemplateIds = form.h5ReportSettings.allowedTemplateIds.filter((id) => availableIds.has(id))
    if (!teacherH5AdminEnabled.value) form.h5ReportSettings.selectionMode = 'auto'
    if (!form.h5ReportSettings.allowedTemplateIds.includes(form.h5ReportSettings.defaultTemplateId)) form.h5ReportSettings.defaultTemplateId = ''
  } catch {
    teacherH5Runtime.edition = null
    teacherH5Runtime.templates = []
    teacherH5Runtime.defaultTemplateId = ''
    form.h5ReportSettings.selectionMode = 'auto'
  } finally {
    teacherH5Runtime.loading = false
  }
}

function toggleTeacherH5Template(templateId) {
  const selected = form.h5ReportSettings.allowedTemplateIds
  form.h5ReportSettings.allowedTemplateIds = selected.includes(templateId)
    ? selected.filter((id) => id !== templateId)
    : [...selected, templateId]
  if (!form.h5ReportSettings.allowedTemplateIds.includes(form.h5ReportSettings.defaultTemplateId)) form.h5ReportSettings.defaultTemplateId = ''
}

function teacherTemplateSwatch(template) {
  const theme = template.theme || {}
  return { background: `linear-gradient(135deg, ${theme.primary || '#2683f5'}, ${theme.accent || '#ff9518'})` }
}

watch(teacherH5EditionKey, loadTeacherH5Runtime)
onMounted(loadTeacherH5Runtime)
// 服务端模式：课程库和「我能不能上传 / 发放课程」都从服务端读（以前讲师端读不到权限，按钮一直是灰的）
onMounted(() => {
  void courseStore.load()
  void loadDistributionOptions()
  accountPermissionStore.loadMyCourseAccess(userStore.user).catch((error) => {
    console.warn('[courses] 讲师课程权限读取失败：', error?.response?.data?.message || error?.message)
  }).finally(() => {
    courseAccessReady.value = true
  })
})

function resetForm() {
  editingCourseId.value = ''
  Object.assign(form, defaultForm())
  documentSourceText.value = ''
  resetDocumentParseStatus()
  pptText.value = '课程导入｜讲师上传的视频或PPT内容\n设计观察｜记录品牌特点和视觉元素\n创作任务｜整理成AI绘画项目提示词'
  // 以前不清：编辑过一门课再点「新建空白课程」，会带着上一门课的授权班级 / 用户
  classText.value = serverAuthMode ? '' : 'AI创意美术A班, 进阶设计班'
  studentText.value = serverAuthMode ? '' : '小画家阿橙, 晨晨, 可可'
  replaceQuestionCards('')
}

function addDesignRequirement() {
  form.designRequirements.push({ label: '其他要求', value: '' })
}

function removeDesignRequirement(index) {
  form.designRequirements.splice(index, 1)
}

function addMaterial() {
  form.materials.push({ id: `material-${Date.now()}`, type: 'image', title: '新的配套资料', description: '', preview: '' })
}

function removeMaterial(index) {
  form.materials.splice(index, 1)
}

// 配套资料的图标和类型名（以前用一个汉字当图标）
function materialIcon(type) {
  return { image: 'image', lineart: 'pencil', palette: 'palette', font: 'text' }[type] || 'folder'
}

function materialTypeLabel(type) {
  return { image: '参考图片', lineart: '线稿', palette: '配色', font: '字体' }[type] || '资料'
}

function compressMaterialImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('图片格式不支持'))
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', .78))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

async function handleMaterialFile(event, index) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning('单张图片不能超过 8MB')
    event.target.value = ''
    return
  }
  try {
    form.materials[index].preview = await compressMaterialImage(file)
    if (!form.materials[index].title || form.materials[index].title === '新的配套资料') form.materials[index].title = file.name.replace(/\.[^.]+$/, '')
    ElMessage.success('配套图片已压缩并加入课程')
  } catch (error) {
    ElMessage.error(error.message || '图片处理失败')
  } finally {
    event.target.value = ''
  }
}

function splitList(value) {
  return String(value || '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
}

function parseChoiceQuestions(value) {
  return String(value || '').split('\n').map((line) => {
    const parts = line.split(/[|｜]/).map((item) => item.trim()).filter(Boolean)
    if (!parts.length) return null
    // 末位若为单个 A/B/C/D，视为正确答案，其余全部当作选项，兼容 3 选项与 4 选项两种写法。
    let answer = 'A'
    if (parts.length > 1 && /^[ABCD]$/i.test(parts[parts.length - 1])) {
      answer = parts.pop().toUpperCase()
    }
    const [title, ...optionList] = parts
    const options = optionList.slice(0, 4)
    if (!title || !options.length) return null
    return {
      type: 'choice',
      title,
      options,
      answer,
    }
  }).filter(Boolean)
}

function createChoiceQuestion(question = {}) {
  const options = Array.isArray(question.options) ? question.options : []
  return {
    id: question.id || `choice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: question.title || '',
    options: [options[0] || '', options[1] || '', options[2] || '', options[3] || ''],
    answer: choiceLabels.includes(question.answer) ? question.answer : 'A',
  }
}

function replaceQuestionCards(value) {
  questionText.value = value
  questionCards.value = parseChoiceQuestions(value).map(createChoiceQuestion)
}

function resetDocumentParseStatus(message = '尚未上传课程文档') {
  Object.assign(documentParseStatus, {
    state: 'idle',
    message,
    textLength: 0,
    fieldCount: 0,
    questionCount: 0,
    preview: '',
  })
}

function setDocumentParseStatus(payload = {}) {
  Object.assign(documentParseStatus, {
    state: payload.state || 'idle',
    message: payload.message || '',
    textLength: payload.textLength || 0,
    fieldCount: payload.fieldCount || 0,
    questionCount: payload.questionCount || 0,
    preview: payload.preview || '',
  })
}

const documentFieldLabels = [
  '课程课题名称',
  '教学课题',
  '课题名称',
  '课程题目',
  '课程标题',
  '教案名称',
  '活动名称',
  '主题名称',
  '教学主题',
  '本课主题',
  '课程主题',
  '课程名称',
  '课程课题',
  '课题',
  '主题',
  '课程画面主题',
  '课程项目主题',
  '作品主题',
  '课程类型',
  '课程分类',
  '项目类型',
  '类型',
  '分类',
  '难度/适龄',
  '难度 / 适龄',
  '难度适龄',
  '难度',
  '适龄范围',
  '适合年龄',
  '课程年龄阶段',
  '适用年龄',
  '适用年级',
  '适龄',
  '年龄段',
  '课程简介',
  '课程介绍',
  '课程说明',
  '课程内容简介',
  '课程概述',
  '课程概况',
  '课程摘要',
  '课程导语',
  '课程背景',
  '课程亮点',
  '教学内容',
  '教学说明',
  '教学简介',
  '简介',
  '介绍',
  '教学目标',
  '课程目标',
  '教学重点',
  '课程回顾主题',
  '趣味问答',
  '课堂问答',
  '互动问答',
  '引导问题',
  '引导性选择题',
  '选择题',
  '作业任务',
  '课堂互动',
  '问题',
  '提问',
  '设计尺寸',
  '尺寸规格',
  '必备元素',
  '需要元素',
  '形象来源',
  '设计来源',
  '风格要求',
  '使用场景',
]

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripMarkdownDecorators(value) {
  return String(value || '')
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[（(]?\d+[）).、]\s*/, '')
    .replace(/^\s*[（(]?[一二三四五六七八九十]+[）).、]\s*/, '')
    .replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
    .trim()
}

function cleanFieldValue(value) {
  return stripMarkdownDecorators(value)
    .replace(/^[:：|｜\-\s]+/, '')
    .replace(/^["“”'《]+|["“”'》]+$/g, '')
    .trim()
}

function normalizeDocumentText(source) {
  const labelPattern = documentFieldLabels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  return String(source || '')
    .replace(/\r/g, '\n')
    .replace(new RegExp(`\\s+(${labelPattern})\\s*[:：]`, 'g'), '\n$1：')
    .replace(/[ \t]+/g, ' ')
}

function normalizeFieldLabel(value) {
  return stripMarkdownDecorators(value)
    .replace(/^#+\s*/, '')
    .replace(/[：:|｜\-\s]/g, '')
    .trim()
}

function getDocumentTableValue(source, labels) {
  const normalizedLabels = labels.map(normalizeFieldLabel).filter(Boolean)
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)

  for (const line of lines) {
    const cells = line.split(/[|｜]/).map((cell) => cleanFieldValue(cell)).filter(Boolean)
    if (cells.length < 2) continue
    for (let index = 0; index < cells.length - 1; index += 1) {
      const label = normalizeFieldLabel(cells[index])
      if (normalizedLabels.includes(label)) return cleanFieldValue(cells[index + 1])
    }
  }

  return ''
}

function hasDocumentField(source, labels) {
  return Boolean(getDocumentField(source, labels))
}

function getDocumentField(source, labels) {
  const tableValue = getDocumentTableValue(source, labels)
  if (tableValue) return tableValue

  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const allLabelPattern = documentFieldLabels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(?:${labelPattern})(?:\\s*[:：|｜\\-—]\\s*|\\s+)?(.*)$`, 'i'))
    if (!match) continue
    let value = (match[1] || '').trim()
    if (!value) {
      const nextLine = lines[index + 1] || ''
      if (!new RegExp(`^(?:${allLabelPattern})(?:\\s*[:：|｜\\-—]|\\s+|$)`, 'i').test(nextLine)) value = nextLine.trim()
    }
    return cleanFieldValue(value.replace(new RegExp(`\\s+(?:${allLabelPattern})\\s*[:：].*$`, 'i'), ''))
  }

  return ''
}

function getDocumentSection(source, labels, maxLines = 4) {
  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const allLabelPattern = documentFieldLabels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(?:${labelPattern})(?:\\s*[:：|｜\\-—]\\s*|\\s+)?(.*)$`, 'i'))
    if (!match) continue
    const result = []
    if ((match[1] || '').trim()) result.push(cleanFieldValue(match[1]))
    for (let offset = index + 1; offset < lines.length && result.length < maxLines; offset += 1) {
      const line = lines[offset]
      if (/^(?:[一二三四五六七八九十]+、|第.+[章节]|课程基本信息|教学流程|课堂流程)/.test(line)) break
      if (isQuestionSectionTitle(line)) break
      if (new RegExp(`^(?:${allLabelPattern})(?:\\s*[:：|｜\\-—]|\\s+|$)`, 'i').test(line)) break
      result.push(line)
    }
    return result.join('；').replace(/\s+/g, ' ').trim()
  }

  return ''
}

function getDocumentLineValue(source, labels) {
  const tableValue = getDocumentTableValue(source, labels)
  if (tableValue) return tableValue

  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)
  for (const line of lines) {
    const match = line.match(new RegExp(`^(?:${labelPattern})(?:\\s*[:：|｜\\-—]\\s*|\\s+)(.+)$`, 'i'))
    if (match?.[1]) return cleanFieldValue(match[1])
  }
  return ''
}

function getDocumentHeadingTitle(source) {
  const lines = String(source || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines.slice(0, 12)) {
    const rawHeading = line.match(/^\s{0,3}#{1,6}\s*(.+)$/)
    const candidate = stripMarkdownDecorators(rawHeading ? rawHeading[1] : line)
    if (!candidate || /^(一|二|三|四|五|六|七|八|九|十)、/.test(candidate)) continue
    if (/^(课程基本信息|教学目标|教学重点|教学流程|课程流程|趣味问答|课堂问答|课程回顾|作业任务)/.test(candidate)) continue
    const titleMatch = candidate.match(/(?:视频教案|课程教案|教案|课程标题|课程题目|课题名称|课程主题|课程课题|课题|主题)\s*[:：]\s*[《“"]?(.+?)[》”"]?$/)
    if (titleMatch?.[1]) return cleanFieldValue(titleMatch[1])
    if (/[《“"].+[》”"]/.test(candidate)) return cleanFieldValue(candidate.replace(/^.*?[《“"](.+?)[》”"].*$/, '$1'))
  }
  return ''
}

function inferCategoryFromText(source, explicitValue = '') {
  const text = `${explicitValue}\n${source || ''}`
  const explicitMatch = categoryOptions.find((item) => text.includes(item.label) || text.includes(item.value))
  if (explicitMatch) return explicitMatch.value

  const keywordGroups = [
    { value: 'storefront', words: ['门头', '招牌', '店铺', '商铺', '橱窗'] },
    { value: 'ip', words: ['IP形象', '吉祥物', '角色形象', '品牌形象'] },
    { value: 'ad', words: ['广告', '海报', '宣传', '版式'] },
    { value: 'anime', words: ['漫画', '人物', '角色设计', '分镜'] },
    { value: 'product', words: ['产品', '包装', '器物', '商品'] },
    { value: 'interior', words: ['室内', '空间', '家居', '软装'] },
    { value: 'car', words: ['汽车', '车身', '交通工具', '造型设计'] },
    { value: 'picturebook', words: ['绘本', '故事书', '儿童故事', '插画书'] },
    { value: 'creative', words: ['梵高', '星月夜', '名画', '色彩', '笔触', '创意表达', '情绪表达', '创意画'] },
  ]
  return keywordGroups.find((group) => group.words.some((word) => text.includes(word)))?.value || form.category
}

function getDocumentCategory(source, explicitValue = '') {
  return inferCategoryFromText(source, explicitValue)
}

function inferAgeDifficulty(source, explicitValue = '') {
  const text = `${explicitValue}\n${source || ''}`
  const ageRange = text.match(/(\d{1,2})\s*(?:-|~|—|至|到)\s*(\d{1,2})\s*岁/)
  if (ageRange) {
    const min = Number(ageRange[1])
    const max = Number(ageRange[2])
    if (max <= 8) return `低龄启蒙 · ${min}-${max}岁`
    if (min >= 16) return `专业提升 · ${min}-${max}岁`
    if (min >= 13 || max >= 13) return `青少年进阶 · ${min}-${max}岁`
    return `少儿基础 · ${min}-${max}岁`
  }

  const plusAge = text.match(/(\d{1,2})\s*岁\s*(?:以上|\+)/)
  if (plusAge) {
    const age = Number(plusAge[1])
    if (age >= 16) return `专业提升 · ${age}岁+`
    if (age >= 13) return `青少年进阶 · ${age}岁+`
    if (age >= 9) return `少儿基础 · ${age}岁+`
    return `低龄启蒙 · ${age}岁+`
  }

  const gradeRange = text.match(/小学\s*(\d)\s*(?:-|~|—|至|到)\s*(\d)\s*年级/)
  if (gradeRange) {
    const min = Number(gradeRange[1])
    const max = Number(gradeRange[2])
    if (max <= 2) return '低龄启蒙 · 6-8岁'
    if (max <= 6) return min >= 5 ? '少儿基础 · 10-12岁' : '少儿基础 · 8-10岁'
  }

  if (/低龄启蒙|5\s*(?:-|~|—|至|到)\s*8\s*岁/.test(text)) return '低龄启蒙 · 5-8岁'
  if (/少儿基础|9\s*(?:-|~|—|至|到)\s*12\s*岁/.test(text)) return '少儿基础 · 9-12岁'
  if (/青少年进阶|13\s*(?:-|~|—|至|到)\s*16\s*岁/.test(text)) return '青少年进阶 · 13-16岁'
  if (/专业提升|16\s*岁\s*(?:以上|\+)/.test(text)) return '专业提升 · 16岁+'
  return ''
}

function cleanCourseSnippet(value, maxLength = 80) {
  return stripMarkdownDecorators(value)
    .replace(/[|｜]/g, '，')
    .replace(/\s+/g, ' ')
    .replace(/[。；;]\s*$/, '')
    .slice(0, maxLength)
}

function buildDescriptionFromCourseText(source, category, title) {
  const descriptionLabels = [
    '课程内容简介',
    '课程简介',
    '课程介绍',
    '课程说明',
    '课程概述',
    '课程概况',
    '课程摘要',
    '课程导语',
    '课程背景',
    '课程亮点',
    '教学内容',
    '教学说明',
    '教学简介',
    '本课简介',
    '简介',
    '介绍',
  ]
  const explicitDescription = getDocumentTableValue(source, descriptionLabels)
    || getDocumentSection(source, descriptionLabels, 5)
    || getDocumentField(source, descriptionLabels)
  if (explicitDescription) return explicitDescription

  const theme = getDocumentField(source, ['课程画面主题', '课程项目主题', '课程回顾主题', '作业任务'])
  const goal = getDocumentSection(source, ['教学目标', '课程目标'], 3)
  const focus = getDocumentSection(source, ['教学重点'], 2)
  const categoryName = categoryLabel(category)
  const subject = cleanCourseSnippet(title || theme || categoryName, 42)
  const goalText = cleanCourseSnippet(goal, 70)
  const focusText = cleanCourseSnippet(focus, 55)

  if (goalText || focusText || theme) {
    return [
      `本课程围绕${subject}展开`,
      goalText ? `引导用户${goalText}` : `引导用户观察${categoryName}中的造型、色彩和视觉表达`,
      focusText ? `重点训练${focusText}` : '完成观察、构思与AI绘画创作',
    ].join('，') + '。'
  }

  return `本课程围绕${categoryName}展开，引导用户从画面主题、色彩关系和创作表达中整理设计思路，并完成AI绘画创作。`
}

function getFallbackQuestions(category) {
  const label = categoryLabel(category)
  return [
    `学习${label}时，第一步应该先做什么？｜观察真实需求和品牌特点｜直接套用模板｜只选择最亮的颜色｜A`,
    '设计方案里最需要说明哪一项？｜为什么这样设计｜用了几个颜色｜图片是否很大｜A',
    'AI绘画提示词应该包含什么？｜对象、风格、颜色、用途和细节｜只写生成图片｜只写好看｜A',
  ]
}

function getDocumentQuestions(source, category) {
  const questionLines = String(source || '').split(/\r?\n/).filter((line) => line.split(/[|｜]/).filter(Boolean).length >= 4)
  const parsed = parseChoiceQuestions(questionLines.join('\n'))
  return parsed.length ? parsed : parseChoiceQuestions(getFallbackQuestions(category).join('\n'))
}

function isQuestionSectionTitle(line) {
  return /^(趣味问答|课堂问答|互动问答|课程问答|课程回顾|课程回顾主题|引导问题|引导性选择题|选择题|问题|提问)\b/.test(line)
}

function isLikelySectionTitle(line) {
  return /^(?:[一二三四五六七八九十]+、|第.+[章节]|课程基本信息|课程目标|教学目标|教学重点|教学难点|教学流程|课堂流程|作业任务|课程简介|课程介绍|课程说明|课件内容|课程总结|素材准备)/.test(line)
}

function normalizeQuestionTitle(value) {
  return cleanFieldValue(value)
    .replace(/^(?:Q\s*)?\d+\s*[.、)）:：-]\s*/i, '')
    .replace(/^(?:问题|提问|题目|问答|选择题)\s*\d*\s*[:：.、-]?\s*/i, '')
    .trim()
}

function normalizeOptionLine(value) {
  const line = cleanFieldValue(value)
  const match = line.match(/^(?:选项\s*)?([ABCD])\s*[.、)）:：-]\s*(.+)$/i)
  return match ? { label: match[1].toUpperCase(), text: cleanFieldValue(match[2]) } : null
}

function normalizeAnswerLine(value) {
  const line = cleanFieldValue(value)
  const match = line.match(/^(?:正确答案|答案|参考答案)\s*[:：]?\s*([ABCD])/i)
  return match?.[1]?.toUpperCase() || ''
}

function parseInlineChoiceQuestion(line) {
  const text = cleanFieldValue(line)
  const answer = normalizeAnswerLine(text) || (text.match(/(?:正确答案|答案|参考答案)\s*[:：]?\s*([ABCD])/i)?.[1]?.toUpperCase() || '')
  const compact = text
    .replace(/(?:正确答案|答案|参考答案)\s*[:：]?\s*[ABCD].*$/i, '')
    .replace(/\s+/g, ' ')
  const match = compact.match(/(.+?)[\s；;，,]*(?:A[.、)）:：-]\s*)(.+?)[\s；;，,]+(?:B[.、)）:：-]\s*)(.+?)[\s；;，,]+(?:C[.、)）:：-]\s*)(.+)$/i)
  if (!match) return null
  // 第三项里可能还带了 D 选项，拆开它，保证 ABCD 四个都能识别。
  const tail = cleanFieldValue(match[4])
  const splitTail = tail.split(/[\s；;，,]+(?:D[.、)）:：-]\s*)/i)
  const optionC = cleanFieldValue(splitTail[0] || '')
  const optionD = splitTail.length > 1 ? cleanFieldValue(splitTail.slice(1).join(' ')) : ''
  const options = [cleanFieldValue(match[2]), cleanFieldValue(match[3]), optionC, optionD].filter(Boolean)
  if (options.length < 2) return null
  return {
    type: 'choice',
    title: normalizeQuestionTitle(match[1]),
    options,
    answer: choiceLabels.includes(answer) ? answer : 'A',
  }
}

function parseChoiceQuestionsFromSection(source) {
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)
  const sectionLines = []
  let inQuestionSection = false

  for (const line of lines) {
    if (isQuestionSectionTitle(line)) {
      inQuestionSection = true
      const afterTitle = line.replace(/^(趣味问答|课堂问答|互动问答|课程问答|课程回顾|课程回顾主题|引导问题|引导性选择题|选择题|问题|提问)\s*[:：]?\s*/, '').trim()
      if (afterTitle) sectionLines.push(afterTitle)
      continue
    }
    if (inQuestionSection && isLikelySectionTitle(line)) break
    if (inQuestionSection) sectionLines.push(line)
  }

  const candidates = sectionLines.length ? sectionLines : lines
  const questions = []
  let current = null
  const flush = () => {
    if (!current?.title) return
    const options = choiceLabels.map((label) => current.options[label]).filter(Boolean)
    if (options.length >= 2) {
      questions.push({
        type: 'choice',
        title: current.title,
        options: options.slice(0, 4),
        answer: choiceLabels.includes(current.answer) ? current.answer : 'A',
      })
    }
    current = null
  }

  for (const line of candidates) {
    const inlineQuestion = parseInlineChoiceQuestion(line)
    if (inlineQuestion?.title && inlineQuestion.options.length >= 2) {
      flush()
      questions.push(inlineQuestion)
      continue
    }

    const option = normalizeOptionLine(line)
    if (option) {
      if (!current) current = { title: '', options: {}, answer: 'A' }
      current.options[option.label] = option.text
      continue
    }

    const answer = normalizeAnswerLine(line)
    if (answer) {
      if (!current) current = { title: '', options: {}, answer: 'A' }
      current.answer = answer
      continue
    }

    const questionTitle = /[?？]$/.test(line) || /^(?:Q\s*)?\d+\s*[.、)）:：-]|^(?:问题|提问|题目|问答|选择题)/i.test(line)
      ? normalizeQuestionTitle(line)
      : ''
    if (questionTitle) {
      flush()
      current = { title: questionTitle, options: {}, answer: 'A' }
    }
  }
  flush()

  return questions.slice(0, 6)
}

function buildQuestionsFromCourseText(source, category, title) {
  const pipeQuestions = String(source || '').split(/\r?\n/).filter((line) => line.split(/[|｜]/).filter(Boolean).length >= 4)
  const parsedPipeQuestions = parseChoiceQuestions(pipeQuestions.join('\n'))
  if (parsedPipeQuestions.length) return parsedPipeQuestions

  const sectionQuestions = parseChoiceQuestionsFromSection(source)
  if (sectionQuestions.length) return sectionQuestions

  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)
  const extracted = []
  let inQuestionSection = false
  for (const line of lines) {
    if (/趣味问答|课程回顾主题|课堂互动|问题|提问|问答|选择题/.test(line)) inQuestionSection = true
    if (inQuestionSection && /[?？]/.test(line)) {
      const questionTitle = line
        .replace(/^(趣味问答|课程回顾主题|课堂互动|问题|提问|问答|选择题)\s*[:：]?\s*/, '')
        .replace(/^[ABC]\s*[.、]\s*/, '')
        .trim()
      if (questionTitle.length >= 6) {
        extracted.push({
          type: 'choice',
          title: questionTitle,
          options: ['结合课程内容认真观察', '随意选择喜欢的效果', '只看图片大小'],
          answer: 'A',
        })
      }
    }
    if (extracted.length >= 3) break
    if (inQuestionSection && /^(?:[一二三四五六七八九十]+、|第.+[章节]|作业任务|教学流程)/.test(line)) inQuestionSection = false
  }
  if (extracted.length) return extracted

  const subject = cleanCourseSnippet(title || categoryLabel(category), 36)
  const categoryName = categoryLabel(category)
  return [
    {
      type: 'choice',
      title: `这节课主要围绕什么主题展开观察与创作？`,
      options: [subject, '页面按钮位置', '文件保存方式'],
      answer: 'A',
    },
    {
      type: 'choice',
      title: `学习${subject}时，最需要关注哪一类画面信息？`,
      options: ['色彩、造型、笔触和情绪表达', '图片文件名', '屏幕亮度'],
      answer: 'A',
    },
    {
      type: 'choice',
      title: `把课堂内容转成AI绘画提示词时，应该写清楚什么？`,
      options: [`${categoryName}主题、风格、色彩和细节`, '只写生成图片', '只写好看'],
      answer: 'A',
    },
  ]
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

function decodeDocumentXml(value) {
  return decodeXmlEntities(String(value || '')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
}

function extractDocxTextFragment(fragment) {
  const textRuns = [...String(fragment || '').matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlEntities(match[1]))
  const text = textRuns.length ? textRuns.join('') : decodeDocumentXml(fragment)
  return text.replace(/\s+/g, ' ').trim()
}

function extractDocxCellText(cellXml) {
  const paragraphs = [...String(cellXml || '').matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => extractDocxTextFragment(match[0]))
    .filter(Boolean)
  return (paragraphs.length ? paragraphs.join(' ') : extractDocxTextFragment(cellXml)).trim()
}

function extractDocxTextFromXml(xml) {
  const source = String(xml || '')
  const tableBlocks = [...source.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
  const tableLines = tableBlocks.flatMap((tableXml) => (
    [...tableXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)].map((rowMatch) => {
      const cells = [...rowMatch[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)]
        .map((cellMatch) => extractDocxCellText(cellMatch[0]))
        .filter(Boolean)
      return cells.join('｜')
    }).filter(Boolean)
  ))

  const withoutTables = source.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, '\n')
  const paragraphLines = [...withoutTables.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => extractDocxTextFragment(match[0]))
    .filter(Boolean)

  return [...tableLines, ...paragraphLines].join('\n').trim()
}

async function readCourseDocumentText(file) {
  const fileName = file.name.toLowerCase()
  if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
    throw new Error('旧版 .doc 暂不支持前端直接解析，请另存为 .docx 后上传')
  }
  if (file.type === 'text/plain' || fileName.endsWith('.txt')) return file.text()

  if (fileName.endsWith('.docx')) {
    const { default: JSZip } = await import('jszip')
    const archive = await JSZip.loadAsync(await file.arrayBuffer())
    const documentXml = archive.file('word/document.xml')
    if (!documentXml) return ''
    return extractDocxTextFromXml(await documentXml.async('text'))
  }

  if (fileName.endsWith('.pdf')) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableWorker: true }).promise
    const pages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent()
      pages.push(content.items.map((item) => item.str).join(' '))
    }
    return pages.join('\n')
  }

  return ''
}

function parseCourseDocumentFields(source, fileName) {
  const documentText = String(source || '')
  const normalizedText = normalizeDocumentText(documentText)
  const textLength = normalizedText.replace(/\s/g, '').length
  const explicitCategory = getDocumentField(documentText, ['课程类型', '课程分类', '项目类型', '类型', '分类'])
  const category = inferCategoryFromText(`${documentText}\n${fileName}`, explicitCategory)
  const categoryName = categoryLabel(category)
  const headingTitle = getDocumentHeadingTitle(documentText)
  const titleLabels = [
    '课程课题名称',
    '教学课题',
    '课题名称',
    '课程题目',
    '课程标题',
    '教案名称',
    '活动名称',
    '主题名称',
    '教学主题',
    '本课主题',
    '课程主题',
    '课程名称',
    '课程课题',
    '课题',
  ]
  const explicitTitle = getDocumentLineValue(documentText, titleLabels)
    || getDocumentField(documentText, titleLabels)
  const themeTitle = getDocumentField(documentText, ['课程画面主题', '课程项目主题', '课程回顾主题', '作业任务'])
  const title = explicitTitle || headingTitle || themeTitle || `${categoryName}趣味课程`
  const explicitDifficulty = getDocumentField(documentText, ['难度/适龄', '难度 / 适龄', '难度适龄', '难度', '适龄范围', '适合年龄', '适龄', '年龄段'])
  const ageStage = getDocumentField(documentText, ['课程年龄阶段', '适用年龄', '适用年级'])
  const difficulty = explicitDifficulty || inferAgeDifficulty(documentText, ageStage) || form.difficulty
  const description = buildDescriptionFromCourseText(documentText, category, title)
  const questions = buildQuestionsFromCourseText(documentText, category, title)
  const designRequirements = [
    { label: '尺寸规格', value: getDocumentField(documentText, ['设计尺寸', '尺寸规格']) },
    { label: '必备元素', value: getDocumentField(documentText, ['必备元素', '需要元素']) },
    { label: '形象来源', value: getDocumentField(documentText, ['形象来源', '设计来源']) },
    { label: '风格要求', value: getDocumentField(documentText, ['风格要求']) },
    { label: '使用场景', value: getDocumentField(documentText, ['使用场景']) },
  ]
  const defaults = defaultDesignRequirements(category)
  designRequirements.forEach((item, index) => { if (!item.value) item.value = defaults[index].value })
  const standardFieldCount = [
    Boolean(explicitTitle),
    Boolean(explicitCategory),
    Boolean(explicitDifficulty),
    hasDocumentField(documentText, ['课程内容简介', '课程简介', '课程介绍', '课程说明', '课程概述', '课程概况', '课程摘要', '课程导语', '课程背景', '课程亮点', '教学内容', '教学说明', '教学简介', '本课简介', '简介', '介绍']),
  ].filter(Boolean).length
  const fieldCount = [
    Boolean(explicitTitle || headingTitle || themeTitle),
    Boolean(explicitCategory || category !== form.category),
    Boolean(explicitDifficulty || ageStage || inferAgeDifficulty(documentText)),
    hasDocumentField(documentText, ['课程内容简介', '课程简介', '课程介绍', '课程说明', '课程概述', '课程概况', '课程摘要', '课程导语', '课程背景', '课程亮点', '教学内容', '教学说明', '教学简介', '本课简介', '简介', '介绍', '教学目标', '课程目标', '教学重点']),
  ].filter(Boolean).length
  const parseMode = standardFieldCount ? 'fields' : (textLength >= 120 ? 'inferred' : 'failed')
  return { title, category, difficulty, description, questions, designRequirements, fieldCount, parseMode }
}

function saveCourse() {
  void persistCourse()
}

async function persistCourse() {
  if (!canUploadCourse.value) {
    ElMessage.warning('当前账号所在权限组没有上传课程权限')
    return
  }
  const payload = {
    ...form,
    ageRange: form.difficulty,
    status: 'published',
    icon: categoryLabel(form.category).slice(0, 1),
    pptPages: parsedPpt.value.map((line) => {
      const [title, body] = line.split(/[|｜]/)
      return { title: title || '课程页', body: body || line }
    }),
    videoAssetId: form.videoAssetId,
    pptAssetId: form.pptAssetId,
    questions: parsedQuestions.value,
    designRequirements: form.designRequirements,
    materials: form.materials,
    h5ReportSettings: {
      selectionMode: teacherH5AdminEnabled.value && form.h5ReportSettings.selectionMode === 'student' ? 'student' : 'auto',
      allowedTemplateIds: teacherH5AdminEnabled.value ? form.h5ReportSettings.allowedTemplateIds : [],
      defaultTemplateId: teacherH5AdminEnabled.value ? form.h5ReportSettings.defaultTemplateId : '',
    },
    authorizedClasses: splitList(classText.value),
    authorizedStudents: splitList(studentText.value),
    authorizedGroupIds: [],
    ownerId: userStore.user?.id || 'tea-001',
    ownerName: userStore.user?.name || '王讲师',
    ownerRole: 'teacher',
  }
  if (serverAuthMode && editingCourseId.value) {
    Object.assign(payload, keepDistributionIds(courseStore.courses.find((item) => item.id === editingCourseId.value), payload))
  }
  try {
    if (editingCourseId.value) {
      await courseStore.updateCourse(editingCourseId.value, payload)
      editingCourseId.value = ''
    } else {
      await courseStore.createCourse(payload)
    }
  } catch (error) {
    ElMessage.error(error?.message || '课程保存失败，请稍后重试')
    return
  }
  ElMessage.success('课程已发布，并同步到管理员课程库')
  activeMenu.value = 'courseLibrary'
}

async function handleVideoFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  form.videoFileName = file.name
  form.videoUrl = `local-video://${file.name}`
  if (serverAuthMode) {
    // 服务端模式：素材必须落到服务器，不能再依赖浏览器 IndexedDB。
    try {
      const asset = await uploadCourseAsset(file, { kind: 'video' })
      if (!asset?.id) throw new Error('素材上传未返回编号')
      form.videoAssetId = asset.id
      form.videoUrl = asset.url || `/api/course-assets/${asset.id}`
      ElMessage.success('课程视频已上传到服务器')
    } catch (error) {
      form.videoAssetId = ''
      form.videoUrl = ''
      form.videoFileName = ''
      event.target.value = ''
      ElMessage.error(error?.response?.data?.message || error?.message || '视频上传失败，请检查网络后重试')
      return
    }
    return
  }
  try {
    const assetId = createCourseAssetId('video')
    await saveCourseAsset(assetId, file, { kind: 'video' })
    form.videoAssetId = assetId
  } catch (error) {
    console.error('save teacher video asset failed', error)
    ElMessage.error('视频保存失败，请重新选择文件')
    event.target.value = ''
    return
  }
  try {
    const uploaded = await uploadCourseVideoToServer(file)
    if (uploaded?.ok && uploaded.videoUrl) form.videoUrl = uploaded.videoUrl
  } catch (uploadError) {
    console.info('server video upload skipped', uploadError?.response?.data || uploadError)
  }
  ElMessage.success('课程视频已加入上传列表')
}

async function handlePptFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  // PPT 文本页始终在本地解析，用于自动生成课程简介与选择题。
  let pages = []
  try {
    pages = await readSharedCoursePptPages(file)
  } catch (error) {
    ElMessage.error(error?.message || 'PPT 内容读取失败，请确认文件为 PPTX 格式')
    event.target.value = ''
    return
  }
  form.pptFileName = file.name
  if (pages.length) {
    pptText.value = pages.map((page) => `${page.title || '课程页'}｜${page.body || ''}`).join('\n')
  }
  form.pptPdfUrl = ''
  form.pptSlideImages = []
  if (serverAuthMode) {
    try {
      const asset = await uploadCourseAsset(file, { kind: 'ppt' })
      if (!asset?.id) throw new Error('素材上传未返回编号')
      form.pptAssetId = asset.id
      form.pptPdfUrl = asset.url || `/api/course-assets/${asset.id}`
      ElMessage.success('课程PPT已上传到服务器')
    } catch (error) {
      form.pptAssetId = ''
      form.pptFileName = ''
      event.target.value = ''
      ElMessage.error(error?.response?.data?.message || error?.message || 'PPT 上传失败，请检查网络后重试')
    }
    return
  }
  try {
    const assetId = createCourseAssetId('ppt')
    await saveCourseAsset(assetId, file, { kind: 'ppt' })
    form.pptAssetId = assetId
  } catch (error) {
    console.error('save teacher ppt asset failed', error)
    ElMessage.error('PPT保存失败，请重新选择文件')
    event.target.value = ''
    return
  }
  ElMessage.success('课程PPT已加入上传列表')
}

async function handleCourseDocumentFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  form.documentFileName = file.name
  setDocumentParseStatus({
    state: 'idle',
    message: `正在读取《${file.name}》`,
    preview: '',
  })
  try {
    documentSourceText.value = await readSharedCourseDocumentText(file)
    parseCourseDocument()
  } catch (error) {
    documentSourceText.value = ''
    const message = error?.message || '文档读取失败，请检查文件格式'
    setDocumentParseStatus({
      state: 'error',
      message,
      preview: '建议上传新版 Word DOCX，或可复制文字的 PDF。',
    })
    ElMessage.warning(message)
  }
}

function getDocumentParseContext() {
  const sourceName = form.documentFileName || form.title
  const normalizedText = normalizeDocumentText(documentSourceText.value)
  const textLength = normalizedText.replace(/\s/g, '').length
  const preview = normalizedText.split(/\n+/).slice(0, 4).join(' / ').slice(0, 140)
  return { sourceName, normalizedText, textLength, preview }
}

function normalizeAiQuestion(question = {}) {
  const options = Array.isArray(question.options) ? question.options.filter(Boolean).slice(0, 3) : []
  while (options.length < 3) options.push(['结合课程内容认真观察', '随意选择喜欢的效果', '只看图片大小'][options.length])
  const answer = String(question.answer || 'A').trim().toUpperCase()
  return {
    title: question.title || question.question || '这节课最重要的观察点是什么？',
    options,
    answer: choiceLabels.includes(answer) ? answer : 'A',
  }
}

function applyParsedCourseDocument(parsed, context, options = {}) {
  const sourceName = context.sourceName
  const category = categoryOptions.some((item) => item.value === parsed.category) ? parsed.category : form.category
  const questions = (parsed.questions?.length ? parsed.questions : buildQuestionsFromCourseText(documentSourceText.value, category, parsed.title))
    .map(normalizeAiQuestion)

  form.title = parsed.title || `${categoryLabel(category)}趣味课程`
  form.category = category
  form.difficulty = parsed.difficulty || form.difficulty
  form.description = parsed.description || buildDescriptionFromCourseText(documentSourceText.value, category, form.title)
  form.designRequirements = parsed.designRequirements?.length ? parsed.designRequirements : defaultDesignRequirements(category)
  pptText.value = parsed.pptPages?.length
    ? parsed.pptPages.map((page) => `${page.title || '课程页'}｜${page.body || page.content || ''}`).join('\n')
    : [
      `课程导入｜认识${categoryLabel(category)}的真实应用场景和设计目标`,
      '观察分析｜从品牌、用户、场景、色彩中提取设计关键词',
      '创作任务｜把观察结果整理成AI绘画提示词并生成作品',
    ].join('\n')
  replaceQuestionCards(questions.map((question) => [question.title, ...question.options, question.answer].join('｜')).join('\n'))
  const recognitionPreview = [
    `识别课题：${cleanCourseSnippet(form.title, 34)}`,
    `识别简介：${cleanCourseSnippet(form.description, 70)}`,
    `选择题：${questions.length}道`,
  ].join(' / ')
  setDocumentParseStatus({
    state: 'success',
    message: options.message || `已解析课程文档《${sourceName}》`,
    textLength: context.textLength,
    fieldCount: parsed.fieldCount ?? ['title', 'category', 'difficulty', 'description'].filter((key) => Boolean(parsed[key])).length,
    questionCount: questions.length,
    preview: options.preview || recognitionPreview || context.preview,
  })
  ElMessage.success(options.toast || `已解析《${sourceName}》并自动填写课程信息与选择题`)
  return true
}

// 课程文档在浏览器里按规则解析（courseUploadParser），不调用 AI；提示文字照实写「已解析」，不写「AI已解析」
function parseCourseDocumentLocal(options = {}) {
  const context = getDocumentParseContext()
  const { sourceName, textLength, preview } = context

  if (!textLength) {
    setDocumentParseStatus({
      state: 'error',
      message: '未读取到课程文档文字，请检查文档是否为新版 DOCX 或文字型 PDF',
      textLength,
      preview: '扫描版 PDF、图片截图、旧版 .doc 不能在前端直接解析。',
    })
    ElMessage.warning('未读取到课程文档文字，请检查文档格式')
    return false
  }

  const parsed = parseSharedCourseDocument(documentSourceText.value, sourceName, {
    category: form.category,
    difficulty: form.difficulty,
  })

  if (parsed.parseMode === 'failed') {
    setDocumentParseStatus({
      state: 'error',
      message: '未读取到可整理的课程正文，请检查文档里是否包含课程内容',
      textLength,
      fieldCount: parsed.fieldCount || 0,
      questionCount: 0,
      preview,
    })
    ElMessage.warning('未读取到可整理的课程正文，请检查文档格式')
    return false
  }

  return applyParsedCourseDocument(parsed, context, {
    message: options.fallbackReason
      ? `AI接口不可用，已使用本地规则整理《${sourceName}》`
      : (parsed.parseMode === 'inferred'
        ? `已根据课程正文智能整理《${sourceName}》的课程信息`
        : `已解析《${sourceName}》并自动填写课程信息`),
    toast: options.fallbackReason
      ? `AI接口不可用，已使用本地规则整理《${sourceName}》`
      : (parsed.parseMode === 'inferred'
        ? `已根据《${sourceName}》正文整理课程信息与选择题`
        : `已解析《${sourceName}》并自动填写课程信息与选择题`),
    preview: options.fallbackReason ? `${preview} / 兜底原因：${options.fallbackReason}`.slice(0, 180) : '',
  })
}

async function parseCourseDocument() {
  if (documentParsing.value) return false
  documentParsing.value = true
  try {
    await Promise.resolve()
    return parseCourseDocumentLocal()
  } finally {
    documentParsing.value = false
  }
}

function toggleCourseSelection(id) {
  const course = teacherVisibleCourses.value.find((item) => item.id === id)
  if (!course || !isOwnCourse(course)) return
  selectedCourseIds.value = selectedCourseIds.value.includes(id)
    ? selectedCourseIds.value.filter((item) => item !== id)
    : [...selectedCourseIds.value, id]
}

function toggleAllLibraryCourses(event) {
  selectedCourseIds.value = event.target.checked
    ? filteredLibraryCourses.value.filter(isOwnCourse).map((course) => course.id)
    : []
}

function clearCourseSelection() {
  selectedCourseIds.value = []
}

async function deleteCourse(id) {
  const course = teacherVisibleCourses.value.find((item) => item.id === id)
  if (!course || !isOwnCourse(course)) {
    ElMessage.warning('只能删除自己上传的课程')
    return
  }
  try {
    if (await courseStore.deleteCourse(id)) {
      selectedCourseIds.value = selectedCourseIds.value.filter((item) => item !== id)
      ElMessage.success('课程已从课程库删除')
    }
  } catch (error) {
    ElMessage.error(error?.message || '删除失败，请稍后重试')
  }
}

async function bulkDeleteCourses() {
  const total = selectedCourseIds.value.length
  try {
    const removed = await courseStore.deleteCourses(selectedCourseIds.value)
    selectedCourseIds.value = []
    if (removed && removed === total) ElMessage.success(`已删除 ${removed} 门课程`)
    else if (removed) ElMessage.warning(`已删除 ${removed} 门；另外 ${total - removed} 门不是你上传的，没有删除`)
    else ElMessage.warning('选中的课程都不是你上传的，没有删除')
  } catch (error) {
    ElMessage.error(error?.message || '删除失败，请稍后重试')
  }
}

// 删除前先确认（以前点「删除」马上就删了）
async function confirmDeleteCourse(course) {
  try {
    await ElMessageBox.confirm(`删除「${safeText(course?.title, '趣味设计课程')}」？删除后课程库里就没有这门课了，小画家也看不到。`, '删除课程', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await deleteCourse(course.id)
}

async function confirmBulkDeleteCourses() {
  const total = selectedCourseIds.value.length
  if (!total) return
  try {
    await ElMessageBox.confirm(`删除选中的 ${total} 门课程？删除后课程库里就没有这些课了，小画家也看不到。`, '批量删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await bulkDeleteCourses()
}

function editCourse(course) {
  if (!isOwnCourse(course)) {
    ElMessage.warning('组授权课程不可直接编辑，可复制后再修改')
    return
  }
  editingCourseId.value = course.id
  documentSourceText.value = ''
  Object.assign(form, {
    title: course.title,
    category: course.category,
    difficulty: course.difficulty || course.ageRange,
    videoUrl: course.videoUrl,
    videoAssetId: course.videoAssetId || '',
    videoFileName: course.videoFileName || '',
    pptAssetId: course.pptAssetId || '',
    pptFileName: course.pptFileName || '',
    pptPdfUrl: course.pptPdfUrl || '',
    pptSlideImages: Array.isArray(course.pptSlideImages) ? [...course.pptSlideImages] : [],
    documentFileName: course.documentFileName || course.pptFileName || '',
    description: course.description,
    designRequirements: (course.designRequirements || defaultDesignRequirements(course.category)).map((item) => ({ ...item })),
    materials: (course.materials || defaultMaterials(course.category)).map((item) => ({ ...item })),
    h5ReportSettings: {
      selectionMode: course.h5ReportSettings?.selectionMode === 'student' ? 'student' : 'auto',
      allowedTemplateIds: [...(course.h5ReportSettings?.allowedTemplateIds || [])],
      defaultTemplateId: course.h5ReportSettings?.defaultTemplateId || '',
    },
  })
  pptText.value = (course.pptPages || []).map((page) => `${page.title}｜${page.body}`).join('\n')
  replaceQuestionCards((course.questions || []).map((question) => (
    typeof question === 'string'
      ? question
      : `${question.title}｜${question.options?.[0] || ''}｜${question.options?.[1] || ''}｜${question.options?.[2] || ''}｜${question.answer || 'A'}`
  )).join('\n'))
  classText.value = (course.authorizedClasses || []).join(', ')
  studentText.value = (course.authorizedStudents || []).join(', ')
  activeMenu.value = 'courseManage'
  loadTeacherH5Runtime()
}

async function duplicateCourse(course) {
  if (!canUseCourse(course)) {
    ElMessage.warning('当前权限组没有使用这门课程的权限')
    return
  }
  try {
    await courseStore.createCourse({
      ...course,
      title: `${safeText(course.title, '趣味设计课程')} 副本`,
      status: 'published',
      ownerId: userStore.user?.id || 'tea-001',
      ownerName: userStore.user?.name || '王讲师',
      ownerRole: 'teacher',
      // 副本是一门新课：不带原课的发放名单，要发给谁再用「发放」选
      authorizedGroupIds: [],
      authorizedClassIds: [],
      authorizedClasses: [],
      authorizedStudentIds: [],
      authorizedStudents: [],
      authorizedOrganization: false,
    })
    ElMessage.success('已复制课程到课程库，需要发给小画家时点「发放」')
  } catch (error) {
    ElMessage.error(error?.message || '复制失败，请稍后重试')
  }
}

function isOwnCourse(course) {
  return course?.ownerId === (userStore.user?.id || teacherAccount.value?.id || 'tea-001')
}

function authorizedTeacherGroups(course) {
  const authorizedIds = new Set(course?.authorizedGroupIds || [])
  return teacherPermissionGroups.value.filter((group) => authorizedIds.has(group.id))
}

function canUseCourse(course) {
  return isOwnCourse(course) || authorizedTeacherGroups(course).some((group) => group.permissions?.courseUse)
}

function canDistributeCourse(course) {
  if (isOwnCourse(course)) {
    return Boolean(effectiveTeacherPermissions.value.courseDistribute)
  }
  // 服务端模式：组授权的课是管理员的，讲师改不了它的发放名单；复制成自己的课再发放
  if (serverAuthMode) return false
  return authorizedTeacherGroups(course).some((group) => group.permissions?.courseUse && group.permissions?.courseDistribute)
}

function openCourseDistribution(course) {
  if (!canDistributeCourse(course)) {
    ElMessage.warning('当前权限组没有发放课程权限')
    return
  }
  distributionCourseId.value = course.id
  if (serverAuthMode) {
    distributionClassDraft.value = distributionDraftIds(course.authorizedClassIds, course.authorizedClasses, serverDistribution.classes)
    distributionStudentDraft.value = distributionDraftIds(course.authorizedStudentIds, course.authorizedStudents, serverDistribution.students)
    loadDistributionOptions()
    return
  }
  distributionClassDraft.value = [...(course.authorizedClasses || [])]
  distributionStudentDraft.value = [...(course.authorizedStudents || [])]
}

function closeCourseDistribution() {
  distributionCourseId.value = ''
  distributionClassDraft.value = []
  distributionStudentDraft.value = []
}

function clearCourseDistribution() {
  distributionClassDraft.value = []
  distributionStudentDraft.value = []
}

async function saveCourseDistribution() {
  const course = distributionCourse.value
  if (!course || !canDistributeCourse(course)) return
  let patch = {
    authorizedClasses: [...distributionClassDraft.value],
    authorizedStudents: [...distributionStudentDraft.value],
    status: 'published',
  }
  if (serverAuthMode) {
    const classes = serverDistribution.classes.filter((item) => distributionClassDraft.value.includes(item.id))
    const students = serverDistribution.students.filter((item) => distributionStudentDraft.value.includes(item.id))
    patch = {
      authorizedClassIds: classes.map((item) => item.id),
      authorizedClasses: classes.map((item) => item.name),
      authorizedStudentIds: students.map((item) => item.id),
      authorizedStudents: students.map((item) => item.name),
      status: 'published',
    }
  }
  try {
    await courseStore.updateCourse(course.id, patch)
  } catch (error) {
    // 服务端只允许改自己建的课；组授权的课由管理员在后台「课程授权」里发给班级
    ElMessage.error(error?.message || '发放失败，请稍后重试')
    return
  }
  ElMessage.success('课程已发放到指定班级和用户')
  closeCourseDistribution()
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 课程库表格：新建课程自动带的演示占位（mock:// 视频、一页「课程导入」）不算上传过
function courseVideoText(course) {
  if (course.videoFileName) return course.videoFileName
  return course.videoUrl && !/^mock:\/\//i.test(course.videoUrl) ? course.videoUrl : '未上传'
}

function coursePptText(course) {
  if (course.pptFileName) return course.pptFileName
  const pages = (course.pptPages || []).filter((page) => !(page?.title === '课程导入' && page?.body === '这里展示讲师上传的PPT内容。'))
  return pages.length ? `${pages.length} 页PPT` : '未上传'
}

// 「授权班级」一栏：全机构 / 班级名 / 单发人数
function courseAudienceText(course) {
  if (course.authorizedOrganization) return '全机构小画家'
  const classes = (course.authorizedClasses || []).filter(Boolean)
  const students = (course.authorizedStudents || []).filter(Boolean)
  if (classes.length && students.length) return `${classes.join('、')} 等，另 ${students.length} 位小画家`
  if (classes.length) return classes.join('、')
  if (students.length) return `${students.length} 位小画家`
  return '暂未发放'
}

function toggleGroup(id) {
  if (collapsedGroups.value.includes(id)) {
    collapsedGroups.value = collapsedGroups.value.filter((item) => item !== id)
  } else {
    collapsedGroups.value = [...collapsedGroups.value, id]
  }
}

function categoryLabel(value) {
  return categoryOptions.find((item) => item.value === value)?.label || '综合项目'
}

function safeText(value, fallback) {
  const text = String(value || '')
  return text && !/[�]/.test(text) && !/(璇|绋|瀹|鍟|闂|杩|鎯|鏂|宀|瑙)/.test(text) ? text : fallback
}

function safeJoin(value) {
  return Array.isArray(value) && value.length ? value.map((item) => safeText(item, '授权班级')).join('、') : '暂未授权'
}

function lessonsBy(dayKey, period) {
  return scheduleLessonMap[`${dayKey}-${period}`] || []
}

function showProfile() {
  router.push('/profile')
  return
  ElMessage.info('讲师个人中心将在账号体系接入后开放')
}

function logout() {
  userStore.logout()
  router.push('/login')
}
</script>

<style scoped lang="scss">
/* ==========================================================================
   讲师端页面专用样式（2026-11-27 重做）
   外壳（侧栏 / 顶栏）、按钮、表格、表单、状态标都直接用后台那套 admin-shell / admin-ui / admin-apple，
   这里只写讲师端自己才有的版块：学习闭环、课程编辑器、课程库单元格、课表、进度条。
   ========================================================================== */

/* ---------- 外壳上的讲师端标识：青绿色（和后台账号列表里讲师头像同色），其余跟后台一致 ---------- */
.tw-brand-mark { background: linear-gradient(180deg, #5fd3c4 0%, #30b0a6 100%); }
.tw-brand-mark svg { fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.tw-avatar { background: linear-gradient(180deg, #5fd3c4 0%, #30b0a6 100%); }
.tw-top-btn { border: 0; font-family: inherit; cursor: pointer; }

/* 按钮里的线条图标：普通按钮 16px、小按钮 14px */
.ax-btn .adm-icon.is-plain { width: 16px; height: 16px; }
.ax-btn.is-sm .adm-icon.is-plain { width: 14px; height: 14px; }

.tw-ellipsis { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tw-strong { color: var(--ax-ink); font-weight: 600; }
.tw-muted { color: var(--ax-muted); }

/* 页面级提示条：页面底色是浅灰，提示条用白底，免得和底色混在一起 */
.tw-page-note { align-items: center; background: #fff; box-shadow: var(--ax-shadow); color: var(--ax-text); }
.tw-sample-note .adm-icon { flex-shrink: 0; width: 16px; height: 16px; color: var(--ax-muted); }
.tw-sample-note strong { margin-right: 8px; color: var(--ax-ink); font-weight: 600; }

/* ---------- 讲师概况 ---------- */
.tw-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 1fr);
  gap: 16px;
  align-items: start;
}
.tw-flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}
.tw-flow li {
  position: relative;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 6px;
  min-width: 0;
  padding: 16px 6px 14px;
  border-radius: 12px;
  background: #f5f5f7;
  text-align: center;
}
.tw-flow strong { color: var(--ax-ink); font-size: 13.5px; font-weight: 600; }
.tw-flow small { color: var(--ax-muted); font-size: 12px; line-height: 1.4; text-wrap: balance; }
.tw-flow-arrow {
  position: absolute;
  top: 50%;
  right: -11px;
  width: 7px;
  height: 7px;
  border-top: 1.8px solid #c7c7cc;
  border-right: 1.8px solid #c7c7cc;
  transform: translateY(-50%) rotate(45deg);
}

.tw-recent { display: grid; padding: 4px 20px 10px; }
.tw-recent-row { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 11px 0; }
.tw-recent-row + .tw-recent-row { border-top: 1px solid var(--ax-line); }
.tw-recent-row .ax-row-main { flex: 1 1 auto; min-width: 0; }
.tw-recent-row .ax-pill { flex-shrink: 0; }

/* ---------- 课程编辑器 ---------- */
.tw-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
.tw-editor-main { display: grid; gap: 16px; min-width: 0; }
.tw-editor-side { position: sticky; top: 68px; min-width: 0; }
.tw-step {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  border-radius: 50%;
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
  font-size: 12px;
  font-weight: 700;
  vertical-align: 1px;
}
.tw-file {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.tw-uploads { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.tw-upload {
  position: relative;
  display: grid;
  justify-items: start;
  align-content: start;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px dashed rgba(60, 60, 67, 0.24);
  border-radius: 12px;
  background: #fafafc;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.tw-upload.is-set { border-style: solid; border-color: rgba(52, 199, 89, 0.4); background: rgba(52, 199, 89, 0.05); }
.tw-upload > .ax-btn { justify-self: stretch; }
.tw-upload-text { display: grid; gap: 2px; width: 100%; min-width: 0; }
.tw-upload-text strong { color: var(--ax-ink); font-size: 13.5px; font-weight: 600; }
.tw-upload-text small { overflow: hidden; color: var(--ax-muted); font-size: 12px; white-space: nowrap; text-overflow: ellipsis; }
.tw-upload.is-set .tw-upload-text small { color: var(--ax-ok); }

.tw-parse {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f5f5f7;
}
.tw-parse-dot { flex-shrink: 0; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #c7c7cc; }
.tw-parse.is-success .tw-parse-dot { background: #34c759; }
.tw-parse.is-error { background: rgba(255, 59, 48, 0.06); }
.tw-parse.is-error .tw-parse-dot { background: #ff3b30; }
.tw-parse-text { display: grid; flex: 1 1 auto; gap: 2px; min-width: 0; }
.tw-parse-text strong { color: var(--ax-ink); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.tw-parse-text small { color: var(--ax-muted); font-size: 12px; line-height: 1.5; }
.tw-parse-text em { color: var(--ax-text); font-size: 12px; font-style: normal; line-height: 1.5; overflow-wrap: anywhere; }
.tw-parse > .ax-btn { flex-shrink: 0; }

.tw-questions { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.tw-question { padding: 14px; border-radius: 12px; background: #f5f5f7; }
.tw-question-title { display: grid; gap: 3px; margin-bottom: 10px; }
.tw-question-title span { color: var(--ax-muted); font-size: 12px; font-weight: 500; }
.tw-question-title strong { color: var(--ax-ink); font-size: 14px; font-weight: 600; line-height: 1.5; }
.tw-options {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tw-options li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08);
  font-size: 13.5px;
}
.tw-options b {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(118, 118, 128, 0.12);
  color: var(--ax-text);
  font-size: 11.5px;
  font-weight: 700;
}
.tw-options li > span { flex: 1 1 auto; min-width: 0; color: var(--ax-text); line-height: 1.45; }
.tw-options li.is-correct { background: rgba(52, 199, 89, 0.07); box-shadow: 0 0 0 1px rgba(52, 199, 89, 0.45); }
.tw-options li.is-correct b { background: #34c759; color: #fff; }
.tw-options em {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
  color: var(--ax-ok);
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  white-space: nowrap;
}
.tw-options em .adm-icon { width: 13px; height: 13px; }

.tw-kv { display: grid; margin: 0; }
.tw-kv > div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid var(--ax-line); }
.tw-kv > div:first-child { padding-top: 0; border-top: 0; }
.tw-kv dt { color: var(--ax-muted); font-size: 13px; }
.tw-kv dd { margin: 0; color: var(--ax-text); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }

.tw-edit-list { display: grid; gap: 10px; }
.tw-req-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 32px; gap: 8px; align-items: start; }
.tw-req-row .ax-textarea { min-height: 60px; }
.tw-remove {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ax-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tw-remove:hover { background: rgba(255, 59, 48, 0.1); color: #d70015; }
.tw-remove:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.tw-remove .adm-icon { width: 16px; height: 16px; }

.tw-material-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.tw-material-chip { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px; border-radius: 10px; background: #f5f5f7; }
.tw-material-name { display: grid; min-width: 0; line-height: 1.3; }
.tw-material-name strong { overflow: hidden; color: var(--ax-ink); font-size: 13px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
.tw-material-name small { color: var(--ax-muted); font-size: 11.5px; }
.tw-thumb {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  color: #8e8e93;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08);
}
.tw-thumb.is-lg { width: 56px; height: 56px; border-radius: 10px; }
.tw-thumb img { width: 100%; height: 100%; object-fit: cover; }
.tw-thumb .adm-icon { width: 18px; height: 18px; }
.tw-thumb.is-lg .adm-icon { width: 22px; height: 22px; }
.tw-thumb.is-image { color: #ff2d55; }
.tw-thumb.is-lineart { color: #0a84ff; }
.tw-thumb.is-palette { color: #ff9500; }
.tw-thumb.is-font { color: #5856d6; }
.tw-material-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto 32px;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  background: #f5f5f7;
}
.tw-material-fields { display: grid; grid-template-columns: 110px minmax(0, 1fr) minmax(0, 1.3fr); gap: 8px; min-width: 0; }
.tw-material-row .ax-input,
.tw-material-row .ax-select { background-color: #fff; }
.tw-file-btn { position: relative; cursor: pointer; }

.ax-option.is-disabled { opacity: 0.5; cursor: not-allowed; }
.tw-templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 10px; }
.tw-template { align-items: center; }
.tw-swatch { flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08); }
.tw-default-template { max-width: 320px; margin-top: 12px; }
.ax-option-grid + .ax-note { margin-top: 12px; }

.tw-preview { display: grid; gap: 12px; }
.tw-preview-cover {
  position: relative;
  display: grid;
  place-items: center;
  height: 128px;
  border-radius: 10px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tint) 10%, #fff) 0%, color-mix(in srgb, var(--tint) 26%, #fff) 100%);
}
.tw-preview-cat {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--ax-text);
  font-size: 12px;
  font-weight: 500;
}
.tw-preview h3 { margin: 0; color: var(--ax-ink); font-size: 16px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.tw-preview p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--ax-muted);
  font-size: 13px;
  line-height: 1.6;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
.tw-checklist { display: grid; margin: 0; padding: 0; border-top: 1px solid var(--ax-line); list-style: none; }
.tw-checklist li { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--ax-line); color: var(--ax-text); font-size: 13px; }
.tw-checklist li > span:nth-child(2) { flex: 1 1 auto; }
.tw-checklist small { color: var(--ax-muted); font-size: 12px; }
.tw-checklist li.is-done small { color: var(--ax-ok); }
.tw-check {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px #c7c7cc;
  color: #fff;
}
.tw-checklist li.is-done .tw-check { background: #34c759; box-shadow: none; }
.tw-check .adm-icon { width: 12px; height: 12px; }
.tw-preview-hint { text-align: center; }

/* ---------- 课程库 ---------- */
.tw-course-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tw-course-cell .ax-cell-main { min-width: 150px; max-width: 260px; }
.ax-table .ax-cell-main > strong.tw-clamp-2 {
  display: -webkit-box;
  overflow: hidden;
  white-space: normal;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.tw-assets { display: grid; gap: 3px; width: 136px; }
.tw-assets > span {
  display: block;
  overflow: hidden;
  color: var(--ax-text);
  font-size: 12.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tw-assets > span.is-missing { color: var(--ax-faint); }
.tw-assets .adm-icon { display: inline-flex; width: 14px; height: 14px; margin-right: 5px; color: var(--ax-muted); vertical-align: -2px; }
.tw-audience { display: block; max-width: 190px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tw-audience.is-missing { color: var(--ax-muted); }
.tw-library-table tr.is-selected td { background: rgba(0, 122, 255, 0.045); }
.tw-library-table input[type='checkbox']:disabled { cursor: not-allowed; opacity: 0.35; }
.tw-table-foot { justify-content: flex-start; }
.tw-table-empty { border-top: 1px solid var(--ax-line); }
.tw-cell-wide { max-width: 260px; }

/* ---------- 样例页：进度条、课表、列表 ---------- */
.tw-meter { display: flex; align-items: center; gap: 8px; min-width: 130px; }
.tw-bar { position: relative; flex: 1 1 auto; min-width: 56px; height: 6px; overflow: hidden; border-radius: 999px; background: rgba(118, 118, 128, 0.14); }
.tw-bar i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: #007aff; }
.tw-meter.is-green .tw-bar i { background: #34c759; }
.tw-meter.is-low .tw-bar i { background: #ff9500; }
.tw-meter small { flex-shrink: 0; color: var(--ax-text); font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }

.tw-week > .ax-card-head { margin: 0; padding-bottom: 14px; border-bottom: 1px solid var(--ax-line); }
.tw-legend { display: flex; gap: 14px; color: var(--ax-muted); font-size: 12.5px; }
.tw-legend span { display: inline-flex; align-items: center; gap: 6px; }
.tw-legend i { width: 10px; height: 10px; border-radius: 3px; }
.tw-legend i.is-done { background: #d1d1d6; }
.tw-legend i.is-todo { background: #007aff; }
.tw-week-scroll { overflow-x: auto; }
.tw-week-grid { display: grid; grid-template-columns: 52px repeat(7, minmax(118px, 1fr)); min-width: 900px; }
.tw-week-corner,
.tw-day-head { border-bottom: 1px solid var(--ax-line); }
.tw-day-head { display: grid; gap: 1px; padding: 10px 10px 8px; border-left: 1px solid var(--ax-line); }
.tw-day-head strong { color: var(--ax-ink); font-size: 13px; font-weight: 600; }
.tw-day-head small { color: var(--ax-muted); font-size: 11.5px; }
.tw-period { padding: 12px 0; border-bottom: 1px solid var(--ax-line); color: var(--ax-muted); font-size: 12px; font-weight: 500; text-align: center; }
.tw-cell { display: grid; align-content: start; gap: 6px; min-height: 96px; padding: 8px; border-bottom: 1px solid var(--ax-line); border-left: 1px solid var(--ax-line); }
.tw-week-grid > :nth-last-child(-n + 8) { border-bottom: 0; }
.tw-lesson { display: grid; gap: 1px; padding: 6px 8px 6px 9px; border-left: 3px solid #007aff; border-radius: 7px; background: rgba(0, 122, 255, 0.08); }
.tw-lesson b { color: #0064d1; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tw-lesson span { color: var(--ax-ink); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
.tw-lesson.is-done { border-left-color: #c7c7cc; background: #f2f2f4; }
.tw-lesson.is-done b,
.tw-lesson.is-done span { color: var(--ax-muted); }

.tw-list { display: grid; }
.tw-list-row { display: flex; align-items: center; gap: 12px; padding: 12px 20px; }
.tw-list-row + .tw-list-row { border-top: 1px solid var(--ax-line); }
.tw-list-row .ax-row-main { flex: 1 1 auto; min-width: 0; }

/* ---------- 发放课程弹窗 ---------- */
.tw-dist-hint { margin: -4px 0 14px; }
.tw-dist-group + .tw-dist-group { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--ax-line); }
.tw-dist-group h4 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 10px; color: var(--ax-ink); font-size: 14px; font-weight: 600; }
.tw-dist-group h4 small { color: #007aff; font-size: 12px; font-weight: 500; }
.tw-dist-foot { display: flex; align-items: center; gap: 8px; }

/* ---------- 响应式 ---------- */
@media (max-width: 1100px) {
  .tw-overview-grid,
  .tw-editor { grid-template-columns: minmax(0, 1fr); }
  .tw-editor-side { position: static; }
}
@media (max-width: 900px) {
  .ax-table td { white-space: nowrap; }
  .tw-flow { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
  .tw-flow-arrow { display: none; }
  .tw-uploads { grid-template-columns: minmax(0, 1fr); }
  .tw-upload { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; justify-items: stretch; }
  .tw-upload > .ax-btn { justify-self: end; }
  .tw-material-fields { grid-template-columns: minmax(0, 1fr); }
  .tw-req-row { grid-template-columns: minmax(0, 1fr) 32px; }
  .tw-req-row .ax-textarea { grid-column: 1; }
  .tw-req-row .tw-remove { grid-row: 1; grid-column: 2; }
}
@media (max-width: 640px) {
  .tw-kv > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .tw-material-row { grid-template-columns: 56px minmax(0, 1fr) 32px; }
  .tw-material-row .tw-file-btn { grid-column: 2; justify-self: start; }
  .tw-parse { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 10px; }
  .tw-parse > .ax-btn { grid-column: 2; justify-self: start; }
  /* 学习闭环 5 步：手机上两列，最后一步「项目报告」占满一行，不留空位 */
  .tw-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tw-flow li:last-child { grid-column: 1 / -1; }
}
@media (max-width: 520px) {
  /* 手机上统计卡保持两列（后台在这个宽度是一列）：讲师可能在手机上用，少往下滑，先看到课程列表 */
  .ax-stats,
  .ax-stats.is-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .ax-stat { gap: 2px; padding: 12px 14px; border-radius: 16px; }
  .ax-stat > strong { font-size: 24px; }
  .ax-stat > small { font-size: 12px; line-height: 1.4; }
}

/* 课程库：按卡片实际宽度排版。宽的时候完整表格；中等宽度收起「更新」「课件」两列；
   平板竖屏、手机上每门课变成一张小卡片，操作按钮直接露出来，不用左右滑 */
.tw-library-card { container: twlib / inline-size; }
.tw-library-table th,
.tw-library-table td { padding-right: 12px; padding-left: 12px; }
.tw-library-table th:first-child,
.tw-library-table td:first-child { padding-left: 16px; }
.tw-library-table th:last-child,
.tw-library-table td:last-child { padding-right: 16px; }
@container twlib (max-width: 1100px) {
  .tw-library-table .tw-col-updated { display: none; }
}
@container twlib (max-width: 1000px) {
  .tw-library-table .tw-col-assets { display: none; }
}
@container twlib (max-width: 860px) {
  .tw-library-table thead { display: none; }
  .tw-library-table,
  .tw-library-table tbody { display: block; }
  .tw-library-table tbody tr {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1fr) auto;
    grid-template-areas:
      'check course course status'
      '.     cat    aud    aud'
      '.     act    act    act';
    gap: 10px 12px;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--ax-line);
  }
  .tw-library-table tbody tr:last-child { border-bottom: 0; }
  .tw-library-table td,
  .tw-library-table td:first-child,
  .tw-library-table td:last-child { display: block; padding: 0; border-bottom: 0; white-space: normal; }
  .tw-library-table td.is-check { grid-area: check; width: auto; }
  .tw-library-table .tw-col-course { grid-area: course; }
  .tw-library-table .tw-col-status { grid-area: status; }
  .tw-library-table .tw-col-category { grid-area: cat; }
  .tw-library-table .tw-col-audience { grid-area: aud; }
  .tw-library-table .tw-col-actions { grid-area: act; text-align: left; }
  .tw-library-table .tw-col-category .ax-cell-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
  .tw-library-table .tw-course-cell .ax-cell-main { min-width: 0; max-width: none; }
  .tw-library-table .tw-audience { max-width: none; }
  .tw-library-table .tw-audience::before { content: '发放范围：'; color: var(--ax-muted); }
  .tw-library-table .tw-col-actions .ax-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 112px)); justify-content: start; }
}
@container twlib (max-width: 480px) {
  .tw-library-table tbody tr {
    grid-template-columns: 22px minmax(0, 1fr) auto;
    grid-template-areas:
      'check course status'
      '.     cat    cat'
      '.     aud    aud'
      '.     act    act';
  }
}
</style>

<style lang="scss">
/* 顶栏「个人中心」是 button（后台那个位置是链接）：全站 button 最低 48px，这里不用 */
.teacher-shell .tw-top-btn { min-height: 0; }
</style>
