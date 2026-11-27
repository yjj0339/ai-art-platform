<template>
  <main class="teacher-page app-page">
    <aside class="teacher-sidebar">
      <section class="brand-panel">
        <div class="brand-logo">AI</div>
        <div>
          <h1>讲师端</h1>
          <p>课程与授权管理</p>
        </div>
      </section>

      <nav class="teacher-menu" aria-label="讲师端菜单">
        <section v-for="group in menuGroups" :key="group.id" class="menu-group">
          <button type="button" class="menu-group-title" @click="toggleGroup(group.id)">
            <span>{{ group.icon }}</span>
            <strong>{{ group.label }}</strong>
            <em>{{ collapsedGroups.includes(group.id) ? '⌄' : '⌃' }}</em>
          </button>
          <div v-show="!collapsedGroups.includes(group.id)" class="menu-group-list">
            <button
              v-for="item in group.children"
              :key="item.id"
              type="button"
              :class="{ active: activeMenu === item.id }"
              @click="activeMenu = item.id"
            >
              <i></i>
              <div>
                <strong>{{ item.label }}</strong>
                <small>{{ item.desc }}</small>
              </div>
            </button>
          </div>
        </section>
      </nav>

      <footer class="sidebar-footer">
        <button type="button" @click="logout">退出登录</button>
      </footer>
    </aside>

    <section class="teacher-main">
      <header class="teacher-topbar">
        <div>
          <span>{{ currentMenu?.label }}</span>
          <h2>{{ currentMenu?.title }}</h2>
        </div>
        <div class="topbar-actions">
          <button type="button" @click="showProfile">个人中心</button>
          <BaseButton v-if="activeMenu === 'courseManage'" variant="secondary" @click="resetForm">新建空白课程</BaseButton>
          <BaseButton v-if="activeMenu === 'courseManage'" @click="saveCourse">发布并授权</BaseButton>
        </div>
      </header>

      <section class="teacher-content">
        <section v-if="activeMenu === 'overview'" class="overview-grid">
          <article v-for="item in summary" :key="item.label" class="summary-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>

          <article class="panel flow-panel">
            <div class="panel-title">
              <h3>课程到项目报告链路</h3>
              <span>用户学习闭环</span>
            </div>
            <div class="flow-row">
              <span>视频 / PPT</span>
              <b>→</b>
              <span>课堂问答</span>
              <b>→</b>
              <span>创意想法</span>
              <b>→</b>
              <span>AI绘画</span>
              <b>→</b>
              <span>项目报告</span>
            </div>
          </article>

          <article class="panel recent-panel">
            <div class="panel-title">
              <h3>最近发布课程</h3>
              <button type="button" @click="activeMenu = 'courseLibrary'">查看全部</button>
            </div>
            <div class="lesson-list compact">
              <div v-for="course in teacherVisibleCourses.slice(0, 4)" :key="course.id" class="lesson-row">
                <strong>{{ safeText(course.title, '趣味设计课程') }}</strong>
                <span>{{ categoryLabel(course.category) }} · {{ safeText(course.difficulty, '青少年进阶') }}</span>
                <em>{{ course.status === 'published' ? '已发布' : '草稿' }}</em>
              </div>
            </div>
          </article>
        </section>

        <section v-else-if="activeMenu === 'courseManage'" class="course-editor-layout">
          <article class="panel course-builder">
            <div class="panel-title">
              <h3>课程上传 / 编辑</h3>
              <span>先上传课件与课程文档，再解析回填课程信息、选择题和授权</span>
            </div>
            <div class="builder-grid">
              <section class="builder-section full course-basics">
                <div class="builder-section-head">
                  <div>
                    <span>02</span>
                    <strong>课程基础信息</strong>
                  </div>
                  <small>填写主题、适龄范围和课程简介</small>
                </div>
                <div class="section-grid">
                  <label>
                    课程主题
                    <input v-model="form.title" placeholder="例如：奶茶店门头设计趣味课" />
                  </label>
                  <label>
                    课程类型
                    <select v-model="form.category">
                      <option v-for="item in categoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                  </label>
                  <label>
                    难度 / 适龄
                    <input v-model="form.difficulty" placeholder="青少年进阶 · 13-16岁" />
                  </label>
                  <label class="intro-field">
                    课程简介
                    <textarea v-model="form.description" placeholder="可手动填写，也可上传课程文档后一键AI解析生成" />
                  </label>
                </div>
              </section>

              <section class="builder-section full h5-course-settings">
                <div class="builder-section-head">
                  <div><span>H5</span><strong>H5报告风格</strong></div>
                  <small>{{ teacherH5AdminEnabled ? '按本课程设置用户可用风格' : '管理员已统一为平台智能选择' }}</small>
                </div>
                <div v-if="teacherH5Runtime.loading" class="h5-course-status">正在读取管理员设置…</div>
                <template v-else>
                  <div class="h5-mode-grid" :class="{ disabled: !teacherH5AdminEnabled }">
                    <label>
                      <input v-model="form.h5ReportSettings.selectionMode" type="radio" value="auto" />
                      <span><strong>智能自动选择</strong><small>根据课程主题自动匹配已发布模板（默认）</small></span>
                    </label>
                    <label>
                      <input v-model="form.h5ReportSettings.selectionMode" type="radio" value="student" :disabled="!teacherH5AdminEnabled" />
                      <span><strong>允许用户选择</strong><small>用户只能看到管理员与本课程共同允许的模板</small></span>
                    </label>
                  </div>
                  <div v-if="teacherH5AdminEnabled && form.h5ReportSettings.selectionMode === 'student'" class="h5-template-course-grid">
                    <label v-for="template in teacherH5Runtime.templates" :key="template.id" :class="{ selected: form.h5ReportSettings.allowedTemplateIds.includes(template.id) }">
                      <input type="checkbox" :checked="form.h5ReportSettings.allowedTemplateIds.includes(template.id)" @change="toggleTeacherH5Template(template.id)" />
                      <i :style="teacherTemplateSwatch(template)"></i>
                      <span><strong>{{ template.name }}</strong><small>{{ template.description || 'H5报告风格' }}</small></span>
                    </label>
                    <p v-if="!teacherH5Runtime.templates.length">管理员还没有为这个用户版本发布可用模板。</p>
                  </div>
                  <label v-if="teacherH5AdminEnabled && form.h5ReportSettings.selectionMode === 'student' && teacherAllowedH5Templates.length" class="h5-default-template">
                    本课程默认模板
                    <select v-model="form.h5ReportSettings.defaultTemplateId">
                      <option value="">跟随平台智能推荐</option>
                      <option v-for="template in teacherAllowedH5Templates" :key="template.id" :value="template.id">{{ template.name }}</option>
                    </select>
                  </label>
                  <div v-if="!teacherH5AdminEnabled" class="h5-course-status locked">平台已关闭用户自主选择，本课程将使用智能自动选择。</div>
                </template>
              </section>

              <section class="builder-section full course-materials">
                <div class="builder-section-head">
                  <div>
                    <span>01</span>
                    <strong>课程课件与文档</strong>
                  </div>
                  <small>视频、PPT 与课程文档分别上传</small>
                </div>
                <div class="materials-grid">
                  <div class="upload-field video-upload-field">
                    <span>课程视频</span>
                    <input ref="videoFileInput" type="file" accept="video/*" @change="handleVideoFile" />
                    <button type="button" @click="videoFileInput?.click()">上传课程视频</button>
                    <small>{{ form.videoFileName || '支持 MP4 / MOV 视频文件' }}</small>
                  </div>
                  <div class="upload-field ppt-upload-field">
                    <span>课程PPT</span>
                    <input ref="pptFileInput" type="file" accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" @change="handlePptFile" />
                    <button type="button" @click="pptFileInput?.click()">上传PPT课件</button>
                    <small>{{ form.pptFileName || '支持 PPT / PPTX 课件' }}</small>
                  </div>
                  <div class="upload-field document-upload-field">
                    <span>课程文档与AI解析</span>
                    <input ref="docFileInput" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" @change="handleCourseDocumentFile" />
                    <button type="button" @click="docFileInput?.click()">上传PDF / Word文档</button>
                    <button type="button" class="ai-parse-btn" :disabled="!form.documentFileName || documentParsing" @click="parseCourseDocument">
                      {{ documentParsing ? 'AI解析中...' : 'AI解析课程文档' }}
                    </button>
                    <small>{{ form.documentFileName || '上传后可自动填写课程信息、简介和选择题' }}</small>
                    <div class="document-parse-status" :class="documentParseStatus.state">
                      <strong>{{ documentParseStatus.message }}</strong>
                      <p>已读取 {{ documentParseStatus.textLength }} 字 · 识别字段 {{ documentParseStatus.fieldCount }} 项 · 选择题 {{ documentParseStatus.questionCount }} 道</p>
                      <em v-if="documentParseStatus.preview">{{ documentParseStatus.preview }}</em>
                    </div>
                  </div>
                </div>
              </section>

              <section class="builder-section full question-builder-section">
                <div class="builder-section-head question-section-head">
                  <div>
                    <span>03</span>
                    <strong>课程引导性选择题解析结果</strong>
                  </div>
                  <button type="button" class="reparse-question-btn" :disabled="!form.documentFileName || documentParsing" @click="parseCourseDocument">重新解析课程文档</button>
                </div>
                <p class="question-result-note">AI解析课程文档后，会自动回填课程主题、类型、适龄范围、简介，并生成选择题和正确答案。</p>
                <div v-if="questionCards.length" class="choice-question-list">
                  <article v-for="(question, index) in questionCards" :key="`${question.id}-${index}`" class="choice-question-editor">
                    <div class="question-card-top">
                      <span>题目 {{ index + 1 }}</span>
                    </div>
                    <strong class="question-title-text">{{ question.title }}</strong>
                    <div class="choice-option-grid">
                      <div v-for="(option, optionIndex) in question.options" :key="optionIndex" :class="{ correct: question.answer === choiceLabels[optionIndex] }">
                        <b>{{ choiceLabels[optionIndex] }}</b>
                        <span>{{ option }}</span>
                        <em v-if="question.answer === choiceLabels[optionIndex]">正确答案</em>
                      </div>
                    </div>
                  </article>
                </div>
                <div v-else class="question-empty-state">尚未解析课程文档。请先上传 PDF 或 Word 课程文档，再点击“AI解析并生成简介与题目”。</div>
              </section>

              <section class="builder-section full requirement-builder-section">
                <div class="builder-section-head">
                  <div><span>04</span><strong>项目设计需求</strong></div>
                  <div class="builder-section-actions">
                    <button v-if="requirementPanelOpen" type="button" class="add-row-btn" @click="addDesignRequirement">新增要求</button>
                    <button type="button" class="expand-section-btn" @click="requirementPanelOpen = !requirementPanelOpen">{{ requirementPanelOpen ? '收起' : '展开编辑' }}</button>
                  </div>
                </div>
                <p class="question-result-note">课程文档解析后会自动填写尺寸、元素、形象来源、风格和使用场景，发布前可人工确认。</p>
                <div v-if="!requirementPanelOpen" class="collapsed-section-summary">
                  <strong>{{ form.designRequirements.length }} 项设计需求</strong>
                  <span v-for="item in form.designRequirements.slice(0, 5)" :key="item.label">{{ item.label }}</span>
                </div>
                <div v-else class="requirement-editor-list expanded-section-body">
                  <div v-for="(item, index) in form.designRequirements" :key="index" class="requirement-editor-row">
                    <input v-model="item.label" aria-label="需求名称" placeholder="例如：尺寸规格" />
                    <textarea v-model="item.value" aria-label="需求内容" placeholder="填写本项目的具体设计要求" />
                    <button type="button" class="remove-row-btn" aria-label="删除设计需求" @click="removeDesignRequirement(index)">×</button>
                  </div>
                </div>
              </section>

              <section class="builder-section full supporting-material-builder">
                <div class="builder-section-head">
                  <div><span>05</span><strong>用户端配套资料</strong></div>
                  <div class="builder-section-actions">
                    <button v-if="materialPanelOpen" type="button" class="add-row-btn" @click="addMaterial">新增资料</button>
                    <button type="button" class="expand-section-btn" @click="materialPanelOpen = !materialPanelOpen">{{ materialPanelOpen ? '收起' : '展开编辑' }}</button>
                  </div>
                </div>
                <p class="question-result-note">图片会自动压缩后保存；配色、字体和线稿可使用文字说明生成缩略卡片。</p>
                <div v-if="!materialPanelOpen" class="collapsed-section-summary material-summary-strip">
                  <strong>{{ form.materials.length }} 项配套资料</strong>
                  <span v-for="item in form.materials.slice(0, 6)" :key="item.id">{{ materialTypeIcon(item.type) }} {{ item.title }}</span>
                </div>
                <div v-else class="material-editor-list expanded-section-body">
                  <article v-for="(item, index) in form.materials" :key="item.id" class="material-editor-row">
                    <div class="material-editor-preview" :class="`type-${item.type}`">
                      <img v-if="item.preview" :src="item.preview" :alt="item.title" />
                      <span v-else>{{ materialTypeIcon(item.type) }}</span>
                    </div>
                    <div class="material-editor-fields">
                      <select v-model="item.type" aria-label="资料类型">
                        <option value="image">参考图片</option>
                        <option value="lineart">线稿</option>
                        <option value="palette">配色</option>
                        <option value="font">字体</option>
                      </select>
                      <input v-model="item.title" aria-label="资料名称" placeholder="资料名称" />
                      <input v-model="item.description" aria-label="资料说明" placeholder="资料说明" />
                    </div>
                    <label v-if="['image', 'lineart'].includes(item.type)" class="material-upload-button">
                      选择图片
                      <input type="file" accept="image/*" @change="handleMaterialFile($event, index)" />
                    </label>
                    <button type="button" class="remove-row-btn" aria-label="删除配套资料" @click="removeMaterial(index)">×</button>
                  </article>
                </div>
              </section>

              <section class="builder-section full authorization-section">
                <div class="builder-section-head">
                  <div>
                    <span>06</span>
                    <strong>授权范围</strong>
                  </div>
                  <small>仅已授权班级和用户可在用户端学习</small>
                </div>
                <div class="section-grid">
                  <label>
                    授权班级
                    <input v-model="classText" placeholder="AI创意美术A班, 进阶设计班" />
                  </label>
                  <label>
                    授权用户
                    <input v-model="studentText" placeholder="小画家阿橙, 晨晨, 可可" />
                  </label>
                </div>
              </section>
            </div>
          </article>

          <aside class="panel editor-preview">
            <div class="panel-title">
              <h3>课程预览</h3>
              <span>{{ categoryLabel(form.category) }}</span>
            </div>
            <div class="preview-cover">
              <b>{{ categoryLabel(form.category).slice(0, 1) }}</b>
              <strong>{{ form.title }}</strong>
            </div>
            <p>{{ form.description }}</p>
            <div class="preview-meta">
              <span>{{ form.difficulty }}</span>
              <span>PPT {{ parsedPpt.length }} 页</span>
              <span>问答 {{ parsedQuestions.length }} 题</span>
            </div>
            <BaseButton block @click="saveCourse">发布并授权到用户端</BaseButton>
          </aside>
        </section>

        <section v-else-if="activeMenu === 'courseLibrary'" class="edu-dense-page course-library-page">
          <div class="library-title-row">
            <div>
              <h3>课程库</h3>
              <p>统一存储讲师上传的视频、PPT、题目和授权信息</p>
            </div>
            <strong>{{ teacherVisibleCourses.length }} 门课程</strong>
          </div>
          <div class="edu-toolbar">
            <button type="button" class="green-btn" :disabled="!canUploadCourse" @click="activeMenu = 'courseManage'">+ 上传新课程</button>
            <button type="button" :disabled="!canUploadCourse" @click="resetForm(); activeMenu = 'courseManage'">新建空白课程</button>
            <button type="button" :disabled="!selectedCourseIds.length" @click="bulkDeleteCourses">批量删除</button>
            <button type="button" :disabled="!selectedCourseIds.length" @click="clearCourseSelection">取消选择</button>
            <span></span>
            <label>课程名称 <input v-model="courseKeyword" placeholder="搜索课程" /></label>
          </div>
          <div class="filter-line">
            <span>课程类型、年龄段、授权班级、发布状态</span>
            <label><input type="checkbox" :checked="allLibraryCoursesSelected" @change="toggleAllLibraryCourses" /> 全选当前列表</label>
            <b>已选 {{ selectedCourseIds.length }} 门</b>
            <em v-if="courseAccessReady && !canUploadCourse" class="library-perm-hint">当前账号还没有上传课程的权限，请联系管理员在「账号权限 → 权限组」里开通</em>
          </div>
          <section v-if="distributionCourse" class="course-distribution-panel">
            <header>
              <div>
                <strong>发放课程：{{ distributionCourse.title }}</strong>
                <small>可同时发放给多个班级或指定用户，保存后用户端立即可见。</small>
              </div>
              <button type="button" aria-label="关闭发放面板" @click="closeCourseDistribution">×</button>
            </header>
            <div class="distribution-options">
              <fieldset>
                <legend>指定班级</legend>
                <label v-for="item in classOptions" :key="item.value">
                  <input v-model="distributionClassDraft" type="checkbox" :value="item.value" /> {{ item.label }}
                </label>
                <small v-if="!classOptions.length">{{ distributionOptionsError || '机构里还没有班级，请管理员先在「班级管理」里建班级。' }}</small>
              </fieldset>
              <fieldset>
                <legend>指定用户</legend>
                <label v-for="item in studentOptions" :key="item.value">
                  <input v-model="distributionStudentDraft" type="checkbox" :value="item.value" /> {{ item.label }}
                </label>
                <small v-if="!studentOptions.length">{{ distributionOptionsError || '机构里还没有小画家账号。' }}</small>
              </fieldset>
            </div>
            <footer>
              <button type="button" @click="clearCourseDistribution">清空选择</button>
              <button type="button" class="green-btn" @click="saveCourseDistribution">保存发放</button>
            </footer>
          </section>
          <div class="dense-table-wrap library-table-wrap">
            <table class="dense-table library-table">
              <thead>
                <tr>
                  <th><input type="checkbox" :checked="allLibraryCoursesSelected" @change="toggleAllLibraryCourses" /></th>
                  <th>课程名称</th>
                  <th>分类</th>
                  <th>年龄段</th>
                  <th>视频</th>
                  <th>PPT</th>
                  <th>授权班级</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!filteredLibraryCourses.length" class="library-empty-row">
                  <td colspan="10">{{ courseStore.loading && !courseStore.loaded ? '正在读取课程…' : courseStore.loadError ? courseStore.loadError : courseKeyword.trim() ? '没有找到这门课程' : '课程库里还没有课程。自己上传的课、管理员授权给你所在权限组的课都会显示在这里。' }}</td>
                </tr>
                <tr v-for="course in filteredLibraryCourses" :key="course.id">
                  <td><input type="checkbox" :disabled="!isOwnCourse(course)" :checked="selectedCourseIds.includes(course.id)" @change="toggleCourseSelection(course.id)" /></td>
                  <td class="course-name-cell">
                    <a>{{ safeText(course.title, '趣味设计课程') }}</a>
                    <small>{{ isOwnCourse(course) ? '我的上传' : serverAuthMode ? '权限组授权，复制后可发放' : '权限组授权' }}</small>
                  </td>
                  <td>{{ categoryLabel(course.category) }}</td>
                  <td>{{ safeText(course.difficulty || course.ageRange, '青少年进阶') }}</td>
                  <td>{{ courseVideoText(course) }}</td>
                  <td>{{ coursePptText(course) }}</td>
                  <td :title="courseAudienceText(course)">{{ courseAudienceText(course) }}</td>
                  <td><em class="tag-green">{{ course.status === 'published' ? '已发布' : '草稿' }}</em></td>
                  <td>{{ formatDate(course.updatedAt || course.createdAt) }}</td>
                  <td class="row-actions">
                    <button v-if="canDistributeCourse(course)" @click="openCourseDistribution(course)">发放</button>
                    <button v-if="isOwnCourse(course)" @click="editCourse(course)">编辑</button>
                    <button v-if="canUseCourse(course)" @click="duplicateCourse(course)">复制</button>
                    <button v-if="isOwnCourse(course)" @click="deleteCourse(course.id)">删除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="pagination-bar">共 {{ filteredLibraryCourses.length }} 门<button>10条/页</button><b>1</b><span>{{ serverAuthMode ? '课程库数据保存在服务器，换设备登录也能看到' : '课程库数据已保存到本地 Mock 存储' }}</span></footer>
        </section>

        <section v-else-if="activeMenu === 'classManage'" class="edu-dense-page">
          <div class="edu-tabs">
            <button type="button" class="active">一对多</button>
            <button type="button">一对一</button>
          </div>
          <div class="edu-subtabs">
            <button type="button" class="active">在课</button>
            <button type="button">已结班</button>
          </div>
          <div class="edu-toolbar">
            <label>班级 <input placeholder="班级名称" /></label>
            <button type="button" class="green-btn">查询</button>
            <button type="button">重置</button>
            <span></span>
            <button type="button" class="green-btn">+ 新增班级</button>
            <button type="button">班级分组</button>
            <button type="button">导入/导出⌄</button>
            <button type="button" class="orange-btn">批量结班</button>
          </div>
          <div class="filter-line">
            <span>班级讲师⌄</span><span>关联课程⌄</span><span>助教⌄</span><span>教室⌄</span><span>班级分组⌄</span>
            <label><input type="radio" /> 满班</label><label><input type="radio" /> 未满班</label><label><input type="radio" /> 已排课</label>
            <label><input type="checkbox" /> 允许充值上课</label>
          </div>
          <div class="dense-table-wrap">
            <table class="dense-table">
              <thead>
                <tr>
                  <th><input type="checkbox" /></th>
                  <th>排序</th>
                  <th>班级名称</th>
                  <th>类型</th>
                  <th>关联课程</th>
                  <th>班级讲师</th>
                  <th>人数/容量</th>
                  <th>教学进度</th>
                  <th>开课日期</th>
                  <th>助教</th>
                  <th>教室</th>
                  <th>在线选班</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in classRows" :key="row.name">
                  <td><input type="checkbox" /></td>
                  <td class="sort-icons">↓ ↑ 不</td>
                  <td><a>{{ row.name }}</a></td>
                  <td><em class="tag-green">{{ row.type }}</em></td>
                  <td>{{ row.course }}</td>
                  <td>{{ row.teacher }}</td>
                  <td>{{ row.capacity }}</td>
                  <td><span class="mini-progress"><i :style="{ width: row.progressWidth }"></i></span>{{ row.progress }}</td>
                  <td>{{ row.startDate }}</td>
                  <td>{{ row.assistant }}</td>
                  <td>{{ row.room }}</td>
                  <td><span class="switch-off">禁</span></td>
                  <td class="row-actions"><button>用户</button><button>课表</button><button>更多⌄</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="pagination-bar">共55条 <button>10条/页</button><b>1</b><button>2</button><button>3</button><button>4</button><span>前往 1 页</span></footer>
        </section>

        <section v-else-if="activeMenu === 'students'" class="edu-dense-page">
          <div class="edu-tabs">
            <button type="button" class="active">在读用户</button>
            <button type="button">历史用户</button>
            <button type="button">报课明细</button>
            <button type="button">停课记录</button>
            <button type="button">上课讲师设置</button>
          </div>
          <div class="edu-subtabs notice-line">
            <button type="button" class="active">全部</button>
            <button type="button">今日待跟进 <em>(0)</em></button>
            <button type="button">过去未跟进 <em>(3)</em></button>
            <span>用户微信绑定率约90%，提升用户绑定率，能增强用户体验感，提高续费率。</span>
          </div>
          <div class="edu-toolbar">
            <label>用户 <input placeholder="姓名/手机号" /></label>
            <label>考勤卡号 <input placeholder="请输入卡号或刷卡" /></label>
            <button type="button" class="green-btn">查询</button>
            <button type="button">重置</button>
            <button type="button">更多搜索⌄</button>
            <span></span>
            <button type="button" class="green-btn">+ 用户报名</button>
            <button type="button">导入/导出⌄</button>
            <button type="button">批量操作⌄</button>
          </div>
          <div class="filter-line">
            <span>报读课程⌄</span><span>课程状态⌄</span><span>报读班级⌄</span><span>班级讲师⌄</span><span>年级⌄</span><span>用户生日⌄</span>
            <label><input type="checkbox" /> 待分班</label><label><input type="checkbox" /> 在课用户</label><label><input type="checkbox" /> 已停课</label><label><input type="checkbox" /> 有欠课</label>
          </div>
          <div class="dense-table-wrap">
            <table class="dense-table">
              <thead>
                <tr>
                  <th><input type="checkbox" /></th>
                  <th>姓名</th>
                  <th>联系方式</th>
                  <th>用户来源</th>
                  <th>考勤卡</th>
                  <th>在读课程</th>
                  <th>报读班级</th>
                  <th>购买课数</th>
                  <th>剩余课数</th>
                  <th>年级</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in studentTableRows" :key="row.name">
                  <td><input type="checkbox" /></td>
                  <td><a>{{ row.name }} {{ row.gender }}</a></td>
                  <td>{{ row.contact }}</td>
                  <td>{{ row.source }}</td>
                  <td>▣</td>
                  <td>{{ row.course }}</td>
                  <td>{{ row.className }}</td>
                  <td>{{ row.buyLessons }}</td>
                  <td>{{ row.leftLessons }}</td>
                  <td>{{ row.grade }}</td>
                  <td>{{ row.remark }}</td>
                  <td class="row-actions"><button>报名</button><button>编辑</button><button>更多⌄</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-else-if="activeMenu === 'schedule'" class="schedule-page">
          <div class="edu-tabs">
            <button type="button" class="active">视图模式</button>
            <button type="button">列表模式</button>
            <button type="button">排课记录</button>
            <button type="button">临时用户记录</button>
          </div>
          <div class="schedule-tools">
            <div>
              <button type="button" class="active">按时间</button>
              <button type="button">按讲师</button>
              <button type="button">按班级</button>
              <button type="button">按教室</button>
            </div>
            <div>
              <button type="button" class="green-btn">快速排课</button>
              <button type="button">更多⌄</button>
              <button type="button">简单模式⌄</button>
            </div>
          </div>
          <div class="filter-line">
            <span>班级⌄</span><span>用户⌄</span><span>课程⌄</span><span>上课讲师⌄</span><span>助教⌄</span><span>教室⌄</span><span>授课方式⌄</span>
            <button type="button">重置</button>
          </div>
          <div class="week-title"><button>‹</button><strong>2026-07-13 ~ 2026-07-19</strong><button>›</button></div>
          <div class="schedule-board">
            <div class="time-head"></div>
            <div v-for="day in weekDays" :key="day.date" class="day-head">
              <strong>{{ day.label }}</strong>
              <span>共 {{ day.count }} 节课</span>
            </div>
            <template v-for="period in periods" :key="period">
              <div class="period-cell">{{ period }}</div>
              <div v-for="day in weekDays" :key="`${period}-${day.date}`" class="schedule-cell">
                <article v-for="lesson in lessonsBy(day.key, period)" :key="lesson.title" :class="lesson.tone">
                  <span>{{ lesson.title }}</span>
                  <b>{{ lesson.time }}</b>
                </article>
              </div>
            </template>
          </div>
        </section>

        <section v-else-if="activeMenu === 'attendanceRecord'" class="panel data-table">
          <div class="panel-title">
            <h3>点名记录</h3>
            <button type="button">今日点名</button>
          </div>
          <table>
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
                <td>{{ row.date }}</td>
                <td>{{ row.className }}</td>
                <td>{{ row.present }}</td>
                <td>{{ row.leave }}</td>
                <td>{{ row.absent }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeMenu === 'booking'" class="panel data-table">
          <div class="panel-title">
            <h3>约课管理</h3>
            <button type="button">确认约课</button>
          </div>
          <div class="lesson-list">
            <div v-for="row in bookingRows" :key="row.name" class="lesson-row">
              <strong>{{ row.name }} · {{ row.course }}</strong>
              <span>{{ row.time }} · {{ row.status }}</span>
              <em>{{ row.action }}</em>
            </div>
          </div>
        </section>

        <section v-else-if="['quickDeduct', 'classCharge', 'leaveManage'].includes(activeMenu)" class="dashboard-layout">
          <article v-for="item in dailyCards" :key="item.label" class="summary-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
          <article class="panel data-table">
            <div class="panel-title">
              <h3>{{ currentMenu?.title }}</h3>
              <button type="button">{{ activeMenu === 'leaveManage' ? '处理请假' : '确认扣课' }}</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>课程</th>
                  <th>课时</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in chargeRows" :key="row.name">
                  <td>{{ row.name }}</td>
                  <td>{{ row.course }}</td>
                  <td>{{ row.count }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ activeMenu === 'leaveManage' ? '查看请假' : '扣课' }}</td>
                </tr>
              </tbody>
            </table>
          </article>
        </section>

        <section v-else class="dashboard-layout">
          <article v-for="item in dataCards" :key="item.label" class="summary-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
          <article class="panel data-table">
            <div class="panel-title">
              <h3>用户学习明细</h3>
              <button type="button">导出数据</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>课程进度</th>
                  <th>答题得分</th>
                  <th>创意提交</th>
                  <th>AI出图</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in studentRows" :key="row.name">
                  <td>{{ row.name }}</td>
                  <td>{{ row.progress }}</td>
                  <td>{{ row.score }}</td>
                  <td>{{ row.idea }}</td>
                  <td>{{ row.ai }}</td>
                </tr>
              </tbody>
            </table>
          </article>
        </section>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
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

const menuGroups = [
  {
    id: 'education',
    icon: '▣',
    label: '教务中心',
    children: [
      { id: 'students', label: '正式用户', title: '正式用户管理', desc: '信息 / 档案 / 作品' },
      { id: 'courseManage', label: '课程管理', title: '课程上传与管理', desc: '上传课程课件' },
      { id: 'classManage', label: '班级管理', title: '班级与授权管理', desc: '班级 / 用户' },
      { id: 'schedule', label: '课表中心', title: '课表中心', desc: '排课 / 调课' },
      { id: 'attendanceRecord', label: '点名记录', title: '点名记录', desc: '到课 / 请假' },
      { id: 'booking', label: '约课管理', title: '约课管理', desc: '预约 / 确认' },
    ],
  },
  {
    id: 'daily',
    icon: '▦',
    label: '日常课务',
    children: [
      { id: 'quickDeduct', label: '快速扣课', title: '快速扣课', desc: '批量扣课时' },
      { id: 'classCharge', label: '上课扣费', title: '上课扣费', desc: '课消确认' },
      { id: 'overview', label: '讲师概况', title: '讲师工作台概览', desc: '今日概览' },
      { id: 'leaveManage', label: '用户请假', title: '用户请假', desc: '请假审核' },
      { id: 'courseLibrary', label: '课程库', title: '课程库', desc: '分类课程文件' },
      { id: 'data', label: '教学数据', title: '教学数据看板', desc: '学习进度与AI生成' },
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
const summary = computed(() => [
  { label: '可用课程', value: String(teacherVisibleCourses.value.length), note: '本人上传与权限组授权' },
  { label: '授权班级', value: '2', note: 'AI创意美术A班 / 进阶设计班' },
  { label: '课程类型', value: String(categoryOptions.length), note: '门头、IP、广告、产品等' },
  { label: '报告素材', value: '自动同步', note: '问答和创意进入项目报告' },
])

const dataCards = [
  { label: '课程完成率', value: '76%', note: '本周学习数据' },
  { label: '平均正确率', value: '82%', note: '随堂练习统计' },
  { label: '创意提交数', value: '48', note: '文字 / 语音创意' },
  { label: 'AI绘图生成数', value: '126', note: '用户项目出图' },
]

const dailyCards = [
  { label: '今日待扣课', value: '12', note: '按签到与上课记录生成' },
  { label: '待确认课消', value: '5', note: '需要讲师确认' },
  { label: '请假申请', value: '3', note: '今日待处理' },
  { label: '课程库文件', value: String(teacherVisibleCourses.value.length), note: '本人上传与组授权课程' },
]

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

function materialTypeIcon(type) {
  return { image: '图', lineart: '线', palette: '色', font: '字' }[type] || '资'
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
    message: options.message || `AI模型已解析课程文档《${sourceName}》`,
    textLength: context.textLength,
    fieldCount: parsed.fieldCount ?? ['title', 'category', 'difficulty', 'description'].filter((key) => Boolean(parsed[key])).length,
    questionCount: questions.length,
    preview: options.preview || recognitionPreview || context.preview,
  })
  ElMessage.success(options.toast || `AI模型已解析《${sourceName}》并自动填写课程信息与选择题`)
  return true
}

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
        ? `AI已根据《${sourceName}》正文整理课程信息与选择题`
        : `AI已解析《${sourceName}》并自动填写课程信息与选择题`),
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
.teacher-page {
  height: 100vh;
  overflow: hidden;
  padding: 0;
  background: #f5f7fb;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  color: #172033;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  min-height: 48px;
  cursor: pointer;
}

.teacher-sidebar {
  min-height: 0;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand-panel {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 10px;
  border-bottom: 1px solid #edf0f5;
}

.brand-logo {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff7a00, #ff9f1c);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 900;
}

.brand-panel h1,
.teacher-topbar h2,
.panel-title h3 {
  margin: 0;
  color: #111827;
}

.brand-panel p,
.teacher-topbar span,
.panel-title span,
.summary-card small,
.lesson-row span,
.editor-preview p {
  margin: 4px 0 0;
  color: #64748b;
}

.teacher-menu {
  display: grid;
  gap: 12px;
  overflow: auto;
}

.menu-group {
  display: grid;
  gap: 6px;
}

.teacher-menu .menu-group-title {
  min-height: 42px;
  border: 0;
  border-radius: 12px;
  background: #1f2937;
  color: #fff;
  display: grid;
  grid-template-columns: 34px 1fr 22px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}

.menu-group-title span {
  color: #fff;
  font-size: 18px;
}

.menu-group-title em {
  color: #9ca3af;
  font-style: normal;
  text-align: right;
}

.menu-group-list {
  display: grid;
  gap: 4px;
}

.menu-group-list button {
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #334155;
  display: grid;
  grid-template-columns: 24px 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  text-align: left;
}

.menu-group-list button i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #9ca3af;
  justify-self: center;
}

.teacher-menu button > span {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 900;
}

.teacher-menu strong {
  display: block;
  font-size: 15px;
}

.teacher-menu small {
  display: none;
  color: #94a3b8;
  font-size: 12px;
}

.menu-group-list button.active {
  border-color: rgba(255, 122, 0, .34);
  background: #fff7ed;
  color: #ff7a00;
}

.menu-group-list button.active i {
  background: #ff7a00;
}

.sidebar-footer {
  margin-top: auto;
  display: grid;
  gap: 10px;
}

.sidebar-footer button {
  min-height: 42px;
}

.sidebar-footer button,
.topbar-actions button,
.panel-title button,
.auth-list button,
.student-grid button {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  color: #334155;
  font-weight: 800;
}

.teacher-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.teacher-topbar {
  height: 76px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
}

.teacher-topbar h2 {
  font-size: 22px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.teacher-content {
  min-height: 0;
  flex: 1;
  padding: 18px;
  overflow: auto;
}

.overview-grid,
.dashboard-layout {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.panel,
.summary-card {
  background: #fff;
  border: 1px solid #edf0f5;
  border-radius: 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .06);
}

.summary-card {
  min-height: 128px;
  padding: 18px;
  display: grid;
  gap: 6px;
}

.summary-card span {
  color: #64748b;
}

.summary-card strong {
  color: #ff7a00;
  font-size: 28px;
}

.panel {
  padding: 18px;
}

.flow-panel {
  grid-column: span 3;
}

.recent-panel {
  grid-column: span 1;
}

.panel-title {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.flow-row {
  min-height: 110px;
  border-radius: 14px;
  background: #fff7ed;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.flow-row span {
  border-radius: 999px;
  padding: 10px 14px;
  background: #fff;
  color: #111827;
  font-weight: 900;
}

.flow-row b {
  color: #ff7a00;
  font-size: 22px;
}

.course-editor-layout,
.auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
}

.builder-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.builder-grid label {
  display: grid;
  gap: 7px;
  color: #111827;
  font-weight: 900;
}

.builder-grid .full {
  grid-column: 1 / -1;
}

.intro-field textarea {
  min-height: 84px;
}

.upload-field {
  min-height: 92px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
}

.upload-field.full {
  grid-column: 1 / -1;
}

.upload-field span {
  grid-column: 1 / -1;
  color: #111827;
  font-weight: 900;
}

.upload-field input[type='file'] {
  display: none;
}

.upload-field button {
  min-height: 40px;
  border: 1px solid #20c997;
  border-radius: 8px;
  background: #20c997;
  color: #fff;
  font-weight: 900;
}

.upload-field .ai-parse-btn {
  border-color: #ff7a00;
  background: #ff7a00;
}

.document-upload-field {
  grid-template-columns: auto auto minmax(0, 1fr);
}

.upload-field small {
  min-width: 0;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-builder {
  padding: 20px;
}

.course-builder .panel-title {
  margin-bottom: 16px;
}

.course-builder .builder-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.builder-section {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fbfcfe;
  padding: 16px;
}

.course-materials {
  order: 1;
}

.course-basics {
  order: 2;
}

.question-builder-section {
  order: 3;
}

.requirement-builder-section {
  order: 4;
}

.supporting-material-builder {
  order: 5;
}

.authorization-section {
  order: 6;
}

.h5-course-settings { order: 3; }
.h5-mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.h5-mode-grid label { min-height: 78px; padding: 13px 14px; border: 1px solid #dce6f2; border-radius: 12px; display: flex; align-items: flex-start; gap: 10px; background: #fff; cursor: pointer; }
.h5-mode-grid label:has(input:checked) { border-color: #2683f5; box-shadow: 0 0 0 3px rgba(38,131,245,.1); }
.h5-mode-grid input { margin-top: 4px; accent-color: #2683f5; }
.h5-mode-grid span { display: grid; gap: 5px; }
.h5-mode-grid small,.h5-template-course-grid small { color: #718096; font-weight: 500; line-height: 1.45; }
.h5-mode-grid.disabled { opacity: .65; }
.h5-template-course-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.h5-template-course-grid label { padding: 10px; border: 1px solid #dde7f2; border-radius: 12px; display: grid; grid-template-columns: auto 58px 1fr; align-items: center; gap: 9px; background: #fff; cursor: pointer; }
.h5-template-course-grid label.selected { border-color: #2683f5; background: #f5faff; }
.h5-template-course-grid i { width: 58px; height: 42px; border-radius: 9px; }
.h5-template-course-grid span { display: grid; gap: 3px; }
.h5-template-course-grid p { grid-column: 1/-1; margin: 0; color: #7b8797; }
.h5-default-template { max-width: 420px; margin-top: 14px; }
.h5-course-status { padding: 12px 14px; border-radius: 10px; color: #56708e; background: #f2f7fc; font-weight: 700; }
.h5-course-status.locked { margin-top: 12px; color: #8a5a13; background: #fff7e7; }

.builder-section-head {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.builder-section-head > div {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #0f172a;
}

.builder-section-head > div span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff1e6;
  color: #f97316;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 900;
}

.builder-section-head > div strong {
  font-size: 16px;
}

.builder-section-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

.builder-section-head small,
.question-result-note {
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.section-grid,
.materials-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.section-grid label {
  min-width: 0;
}

.intro-field textarea {
  min-height: 96px;
}

.materials-grid .upload-field {
  min-height: 126px;
  align-content: center;
}

.materials-grid .document-upload-field {
  grid-column: 1 / -1;
  min-height: 104px;
  grid-template-columns: max-content max-content minmax(0, 1fr);
}

.materials-grid .document-upload-field small {
  grid-column: 1 / -1;
}

.document-parse-status {
  grid-column: 1 / -1;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
}

.document-parse-status strong {
  color: #334155;
  font-size: 13px;
}

.document-parse-status p,
.document-parse-status em {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.document-parse-status em {
  font-style: normal;
  white-space: normal;
  word-break: break-word;
}

.document-parse-status.success {
  border-color: #86efac;
  background: #f0fdf4;
}

.document-parse-status.success strong {
  color: #15803d;
}

.document-parse-status.error {
  border-color: #fed7aa;
  background: #fff7ed;
}

.document-parse-status.error strong {
  color: #c2410c;
}

.materials-grid .document-upload-field button {
  white-space: nowrap;
}

.materials-grid .document-upload-field .ai-parse-btn:disabled,
.reparse-question-btn:disabled {
  cursor: not-allowed;
  opacity: .45;
}

.question-builder-section {
  background: #fff;
}

.question-section-head {
  margin-bottom: 6px;
}

.reparse-question-btn {
  min-height: 40px;
  border: 1px solid #f97316;
  border-radius: 8px;
  background: #fff7ed;
  color: #ea580c;
  padding: 0 12px;
  font-weight: 900;
}

.question-result-note {
  margin: 0 0 14px;
}

.choice-question-list {
  display: grid;
  gap: 10px;
}

.choice-question-editor {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 14px;
}

.question-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.question-card-top span {
  color: #f97316;
  font-size: 13px;
  font-weight: 900;
}

.question-title-text {
  display: block;
  color: #0f172a;
  line-height: 1.5;
}

.choice-option-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.choice-option-grid > div {
  min-width: 0;
  min-height: 54px;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  padding: 8px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  color: #475569;
  font-size: 13px;
}

.choice-option-grid > div.correct {
  border-color: #6ee7b7;
  background: #ecfdf5;
  color: #047857;
}

.choice-option-grid b {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #eef2f7;
  color: #475569;
  display: grid;
  place-items: center;
  font-size: 12px;
}

.choice-option-grid .correct b {
  background: #10b981;
  color: #fff;
}

.choice-option-grid span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice-option-grid em {
  grid-column: 2;
  color: #059669;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.question-empty-state {
  min-height: 92px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  display: grid;
  place-items: center;
  padding: 16px;
  text-align: center;
  line-height: 1.6;
}

.add-row-btn {
  min-height: 38px;
  border: 1px solid #20c997;
  border-radius: 8px;
  padding: 0 12px;
  background: #ecfdf5;
  color: #047857;
  font-weight: 900;
}

.expand-section-btn {
  min-height: 38px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 0 14px;
  background: #eff6ff;
  color: #2563eb;
  cursor: pointer;
  font-weight: 900;
  white-space: nowrap;
}

.collapsed-section-summary {
  min-height: 54px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.collapsed-section-summary strong {
  color: #0f172a;
  font-size: 14px;
  margin-right: 4px;
}

.collapsed-section-summary span {
  min-height: 28px;
  border-radius: 999px;
  padding: 5px 10px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.expanded-section-body {
  margin-top: 6px;
}

.material-summary-strip span {
  background: #ecfdf5;
  color: #047857;
}

.requirement-editor-list,
.material-editor-list {
  display: grid;
  gap: 10px;
}

.requirement-editor-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) 36px;
  gap: 10px;
  align-items: start;
}

.requirement-editor-row textarea {
  min-height: 48px;
}

.remove-row-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: #fee2e2;
  color: #dc2626;
  font-size: 22px;
}

.material-editor-row {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) auto 36px;
  gap: 10px;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
}

.material-editor-preview {
  width: 82px;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: #e8f8f2;
  color: #0f766e;
  display: grid;
  place-items: center;
  font-size: 24px;
  font-weight: 900;
}

.material-editor-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-editor-preview.type-palette { background: linear-gradient(135deg, #bbf7d0 0 33%, #d6a15a 33% 66%, #fff 66%); }
.material-editor-preview.type-font { font-family: 'Microsoft YaHei', sans-serif; background: #fff7ed; color: #9a3412; }
.material-editor-preview.type-lineart { background: repeating-linear-gradient(135deg, #f8fafc 0 8px, #e2e8f0 8px 9px); }

.material-editor-fields {
  display: grid;
  grid-template-columns: 130px minmax(130px, .7fr) minmax(180px, 1fr);
  gap: 8px;
}

.material-upload-button {
  min-height: 38px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 0 12px;
  background: #eff6ff;
  color: #2563eb;
  display: grid;
  place-items: center;
  cursor: pointer;
  font-weight: 900;
  white-space: nowrap;
}

.material-upload-button input { display: none; }

@media (max-width: 760px) {
  .section-grid,
  .materials-grid,
  .choice-option-grid {
    grid-template-columns: 1fr;
  }

  .materials-grid .document-upload-field {
    grid-template-columns: 1fr;
  }

  .requirement-editor-row,
  .material-editor-row,
  .material-editor-fields {
    grid-template-columns: 1fr;
  }
}

input,
textarea,
select {
  min-height: 48px;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
  background: #fff;
}

textarea {
  min-height: 84px;
  resize: vertical;
}

.editor-preview {
  display: grid;
  gap: 14px;
  align-content: start;
}

.preview-cover {
  min-height: 180px;
  border-radius: 16px;
  background: linear-gradient(135deg, #fff3e6, #dbeafe);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
}

.preview-cover b {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: #ff7a00;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 28px;
}

.preview-cover strong {
  color: #111827;
  font-size: 18px;
}

.preview-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-meta span {
  border-radius: 999px;
  padding: 7px 10px;
  background: #f1f5f9;
  color: #475569;
  font-weight: 800;
  font-size: 13px;
}

.lesson-list {
  display: grid;
  gap: 12px;
}

.lesson-list.compact {
  gap: 10px;
}

.lesson-row {
  min-height: 74px;
  border-radius: 14px;
  background: #f8fafc;
  padding: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
}

.lesson-row strong {
  color: #111827;
}

.lesson-row em {
  grid-row: 1 / 3;
  grid-column: 2;
  align-self: center;
  border-radius: 999px;
  background: #fff3e6;
  color: #ff7a00;
  padding: 7px 10px;
  font-style: normal;
  font-weight: 900;
}

.published-panel,
.data-table {
  min-height: 560px;
}

.course-library-page {
  min-height: 680px;
}

.library-title-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
}

.library-title-row h3 {
  color: #0f172a;
  font-size: 22px;
}

.library-title-row p {
  color: #64748b;
  margin-top: 4px;
}

.library-title-row strong {
  border-radius: 999px;
  background: #e8f8f2;
  color: #0f766e;
  padding: 8px 12px;
}

.library-table-wrap {
  border: 1px solid #edf0f5;
}

.course-distribution-panel {
  border: 1px solid #b7ead8;
  border-radius: 6px;
  padding: 12px;
  background: #f0fdf8;
  display: grid;
  gap: 10px;
}

.course-distribution-panel header,
.course-distribution-panel footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.course-distribution-panel header > div {
  display: grid;
  gap: 3px;
}

.course-distribution-panel header strong {
  color: #0f172a;
}

.course-distribution-panel header small {
  color: #64748b;
}

.course-distribution-panel header > button {
  width: 32px;
  height: 32px;
  border: 1px solid #dbe2ea;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 20px;
}

.distribution-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.distribution-options fieldset {
  margin: 0;
  border: 1px solid #d9eee7;
  border-radius: 5px;
  padding: 9px;
  display: flex;
  align-items: center;
  gap: 8px 14px;
  flex-wrap: wrap;
}

.distribution-options legend {
  padding: 0 5px;
  color: #0f766e;
  font-weight: 900;
}

.distribution-options label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.course-distribution-panel footer {
  justify-content: flex-end;
}

.course-distribution-panel footer button {
  min-height: 34px;
  border: 1px solid #dbe2ea;
  border-radius: 4px;
  padding: 0 12px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-weight: 800;
}

.library-table {
  min-width: 940px !important;
  table-layout: fixed;
}

.library-table th,
.library-table td {
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-table th:nth-child(1),
.library-table td:nth-child(1) {
  width: 34px;
}

.library-table th:nth-child(2),
.library-table td:nth-child(2) {
  width: 150px;
}

.course-name-cell a,
.course-name-cell small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.course-name-cell small {
  margin-top: 2px;
  color: #64748b;
  font-size: 11px;
}

.library-table th:nth-child(5),
.library-table td:nth-child(5),
.library-table th:nth-child(6),
.library-table td:nth-child(6),
.library-table th:nth-child(7),
.library-table td:nth-child(7) {
  width: 112px;
}

.library-table th:nth-child(10),
.library-table td:nth-child(10) {
  width: 184px;
}

.library-table .row-actions {
  gap: 4px;
}

.library-table .row-actions button {
  min-height: 28px;
  padding: 0 7px;
  font-size: 12px;
}

.edu-toolbar button:disabled,
.pagination-bar button:disabled {
  cursor: not-allowed;
  opacity: .45;
}

.auth-list,
.student-grid {
  display: grid;
  gap: 12px;
}

.auth-list button.active,
.student-grid button:hover {
  border-color: rgba(255, 122, 0, .34);
  background: #fff7ed;
  color: #ff7a00;
}

.data-table {
  grid-column: 1 / -1;
}

.edu-dense-page,
.schedule-page {
  min-height: 100%;
  border: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow: hidden;
}

.edu-tabs,
.edu-subtabs,
.edu-toolbar,
.filter-line,
.schedule-tools,
.week-title,
.pagination-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.edu-tabs {
  border-bottom: 1px solid #e5e7eb;
}

.edu-tabs button,
.edu-subtabs button,
.edu-toolbar button,
.filter-line button,
.schedule-tools button,
.pagination-bar button,
.row-actions button {
  min-height: 32px;
  border: 1px solid #dbe2ea;
  border-radius: 3px;
  background: #fff;
  color: #334155;
  padding: 0 12px;
  font-size: 13px;
}

.edu-tabs button {
  min-width: 86px;
  border-bottom: 0;
  border-radius: 3px 3px 0 0;
}

.edu-tabs button.active,
.edu-subtabs button.active,
.schedule-tools button.active {
  border-color: #20c997;
  background: #fff;
  color: #0f172a;
  box-shadow: inset 0 2px 0 #20c997;
}

.edu-subtabs.notice-line {
  background: #e8f8f2;
  padding: 0 8px;
}

.edu-subtabs.notice-line span {
  flex: 1;
  min-width: 360px;
  color: #166534;
  font-size: 12px;
}

.edu-subtabs em {
  color: #ef4444;
  font-style: normal;
}

.edu-toolbar label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #0f172a;
  font-size: 13px;
}

.edu-toolbar input {
  width: 132px;
  min-height: 32px;
  border-radius: 3px;
  font-size: 13px;
}

.edu-toolbar > span {
  flex: 1;
}

.green-btn {
  border-color: #20c997 !important;
  background: #20c997 !important;
  color: #fff !important;
}

.orange-btn {
  border-color: #f59e0b !important;
  background: #fff7ed !important;
  color: #f97316 !important;
}

.filter-line {
  color: #334155;
  font-size: 13px;
}

.filter-line span {
  color: #0f766e;
}

.filter-line label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.filter-line .library-perm-hint {
  color: #b45309;
  font-style: normal;
  font-weight: 700;
}

.library-empty-row td {
  padding: 36px 12px;
  color: #64748b;
  text-align: center;
  white-space: normal;
}

.dense-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-top: 1px solid #edf0f5;
}

.dense-table {
  min-width: 1320px;
  font-size: 13px;
}

.dense-table th {
  height: 44px;
  background: #f3f6fa;
  color: #1f2937;
  white-space: nowrap;
}

.dense-table td {
  height: 58px;
  white-space: nowrap;
  vertical-align: middle;
}

.dense-table a {
  color: #1677ff;
  font-weight: 800;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-actions button:nth-child(1) {
  border-color: #99f6e4;
  color: #10b981;
}

.row-actions button:nth-child(2) {
  border-color: #fed7aa;
  color: #f97316;
}

.row-actions button:nth-child(3) {
  border-color: #bfdbfe;
  color: #1677ff;
}

.tag-green {
  color: #10b981;
  font-style: normal;
  font-weight: 900;
}

.sort-icons {
  color: #10b981;
  letter-spacing: 3px;
}

.mini-progress {
  width: 72px;
  height: 14px;
  border-radius: 999px;
  background: #e5eaf1;
  display: inline-flex;
  vertical-align: middle;
  margin-right: 6px;
  overflow: hidden;
}

.mini-progress i {
  height: 100%;
  border-radius: inherit;
  background: #20c997;
}

.switch-off {
  width: 40px;
  height: 20px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #64748b;
  display: inline-grid;
  place-items: center;
  font-size: 12px;
}

.pagination-bar {
  justify-content: flex-end;
  min-height: 40px;
  color: #64748b;
  font-size: 13px;
}

.pagination-bar b {
  width: 30px;
  height: 30px;
  border-radius: 3px;
  background: #20c997;
  color: #fff;
  display: grid;
  place-items: center;
}

.schedule-tools {
  justify-content: space-between;
}

.week-title {
  justify-content: flex-end;
}

.week-title button {
  min-height: 28px;
  border: 1px solid #dbe2ea;
  border-radius: 4px;
  background: #fff;
}

.schedule-board {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 72px repeat(7, minmax(126px, 1fr));
  grid-template-rows: 64px repeat(3, minmax(170px, 1fr));
  overflow: auto;
  border: 1px solid #dbe2ea;
}

.time-head,
.day-head,
.period-cell,
.schedule-cell {
  border-right: 1px solid #dbe2ea;
  border-bottom: 1px solid #dbe2ea;
}

.day-head {
  background: #f8fafc;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  color: #111827;
  text-align: center;
  font-size: 13px;
}

.day-head span {
  color: #0f766e;
}

.period-cell {
  display: grid;
  place-items: center;
  color: #334155;
  background: #fbfdff;
}

.schedule-cell {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.schedule-cell article {
  min-height: 26px;
  border-radius: 5px;
  padding: 5px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: #fff;
  font-size: 11px;
  line-height: 1.2;
}

.schedule-cell article.green {
  background: #39d0b2;
}

.schedule-cell article.gray {
  background: #9ca3af;
}

.schedule-cell article span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-cell article b {
  flex: 0 0 auto;
  font-size: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  height: 52px;
  border-bottom: 1px solid #edf0f5;
  text-align: left;
  color: #334155;
}

th {
  color: #64748b;
  font-weight: 900;
}

@media (max-width: 1100px) {
  .teacher-page {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .overview-grid,
  .dashboard-layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow-panel,
  .recent-panel {
    grid-column: 1 / -1;
  }

  .course-editor-layout,
  .auth-layout {
    grid-template-columns: 1fr;
  }
}
</style>
