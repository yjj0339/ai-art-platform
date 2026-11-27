<template>
  <!-- 课程中心（2026-11 重新设计）
       列表：上方「继续学习」大卡（当前关注的课程 + 四个学习环节 + 下一步），下方课程库（搜索 / 学习状态 / 分类 / 课程卡）。
       课堂：左边看视频 / 课件 / 资料，右边做随堂练习 / 看任务需求 / 记创意；顶栏左上角「课程列表」回到列表。
       学习记录、保存、提交逻辑全部沿用原来的 script，没有改动接口和数据格式。 -->
  <main class="su-page cc" :class="{ 'is-young': isYoungMode, 'is-lesson': selectedCourse }">
    <template v-if="!selectedCourse">
      <!-- ===== 继续学习 ===== -->
      <section ref="heroRef" class="cc-hero su-panel" aria-label="我的学习">
        <div v-if="learningLoading" class="cc-hero__state" role="status">
          <span class="cc-spinner" aria-hidden="true" />
          <span>正在读取学习记录…</span>
        </div>
        <div v-else-if="learningLoadError" class="cc-hero__state is-error" role="alert">
          <strong>学习记录没读出来</strong>
          <p>{{ learningLoadError }}</p>
          <button type="button" class="su-btn su-btn--primary" @click="loadLearningRecords">重新加载</button>
        </div>
        <template v-else-if="focusCourse">
          <div class="cc-hero__cover">
            <CourseCoverArt :category="focusCourse.category" :cover="courseCoverStyle(focusCourse)" />
          </div>
          <div class="cc-hero__info">
            <p class="cc-eyebrow">
              <i aria-hidden="true" />{{ focusState.status === 'completed' ? '已完成，可以回顾' : focusState.status === 'new' ? '准备开始' : '继续学习' }}
              <span v-if="!serverAuthMode" class="su-badge">演示账号 · 记录存在本机</span>
            </p>
            <h2>{{ focusCourse.title }}</h2>
            <p class="cc-hero__desc">{{ focusCourse.description }}</p>
            <div class="cc-hero__meta">
              <span>{{ focusCourse.ageRange }}</span>
              <span>{{ focusCourse.duration }}</span>
              <span class="su-badge" :class="statusBadgeClass(focusState.status)">{{ learningStatusLabel(focusCourse) }}</span>
            </div>
            <div class="cc-progress" role="progressbar" aria-label="当前课程进度" :aria-valuenow="focusState.progress" aria-valuemin="0" aria-valuemax="100">
              <div class="cc-progress__track"><i :style="{ width: `${focusState.progress}%` }" /></div>
              <span>{{ focusState.done }} / 4 个环节</span>
            </div>
            <p class="cc-next"><small>下一步</small>{{ nextLearningLabel }}</p>
            <div class="cc-hero__actions">
              <button type="button" class="su-btn su-btn--primary su-btn--lg" :disabled="learningSaving" @click="continueLearning">
                {{ focusState.status === 'completed' ? '回顾课程' : focusState.status === 'new' ? '开始学习' : '继续学习' }}
              </button>
              <button type="button" class="su-btn su-btn--lg" @click="courseWorkOpen = true">课程作品</button>
            </div>
            <p class="cc-save" role="status" :class="{ 'is-error': learningSaveError }">
              <template v-if="learningSaving">正在保存学习记录…</template>
              <template v-else-if="learningSaveError">{{ learningSaveError }} <button type="button" @click="retryLearningSave">重试保存</button></template>
              <template v-else>{{ serverAuthMode ? '学习记录已同步到账号' : '学习记录只保存在这台设备' }}</template>
            </p>
          </div>
          <ol class="cc-journey" aria-label="学习环节">
            <li
              v-for="(step, index) in learningSteps"
              :key="step.title"
              :class="{ 'is-done': focusState.steps[index], 'is-next': focusState.next === index }"
            >
              <span class="cc-journey__dot" aria-hidden="true">
                <el-icon v-if="focusState.steps[index]"><Check /></el-icon>
                <template v-else>{{ index + 1 }}</template>
              </span>
              <div>
                <button v-if="index === 3" type="button" class="cc-journey__link" @click="courseWorkOpen = true">{{ step.title }}<el-icon aria-hidden="true"><ArrowRight /></el-icon></button>
                <strong v-else>{{ step.title }}</strong>
                <small>{{ index === 1 && !focusCourse.questions.length ? '本课程无需随堂练习' : step.description }}</small>
              </div>
            </li>
          </ol>
        </template>
        <div v-else class="su-empty cc-hero__empty">
          <span class="su-empty__mark" aria-hidden="true"><el-icon><Reading /></el-icon></span>
          <strong>还没有可以学的课程</strong>
          <p>讲师给你开通课程后，就会出现在这里。</p>
        </div>
      </section>

      <!-- ===== 课程库 ===== -->
      <section class="cc-library" aria-label="全部课程">
        <header class="cc-library__head">
          <div class="su-head">
            <div>
              <h2>全部课程</h2>
              <p>{{ filteredCourses.length }} 门课程{{ keyword.trim() ? ` · 搜索“${keyword.trim()}”` : '' }}</p>
            </div>
          </div>
          <label class="cc-search">
            <el-icon aria-hidden="true"><Search /></el-icon>
            <input v-model="keyword" type="search" placeholder="搜索课程，比如门头、IP、海报" aria-label="搜索课程" />
            <button v-if="keyword" type="button" aria-label="清空搜索" @click="keyword = ''"><el-icon><Close /></el-icon></button>
          </label>
        </header>

        <div class="cc-filters">
          <div class="su-seg" role="radiogroup" aria-label="学习状态">
            <button
              v-for="item in learningFilters"
              :key="item.value"
              type="button"
              role="radio"
              :aria-checked="learningFilter === item.value"
              @click="learningFilter = item.value"
            >
              {{ item.label }}<b v-if="item.value !== 'all' && !learningLoading && !learningLoadError">{{ learningCounts[item.value] }}</b>
            </button>
          </div>
          <div class="cc-cats" role="radiogroup" aria-label="课程分类">
            <button
              v-for="item in visibleCategoryTabs"
              :key="item.value"
              type="button"
              class="su-chip"
              role="radio"
              :aria-checked="currentFilter === item.value"
              @click="currentFilter = item.value"
            >{{ item.label }}</button>
          </div>
        </div>

        <div v-if="filteredCourses.length" class="cc-grid">
          <article
            v-for="course in filteredCourses"
            :key="course.id"
            class="cc-card"
            :class="{ 'is-focused': focusCourse?.id === course.id }"
          >
            <button type="button" class="cc-card__cover" :aria-label="`查看${course.title}的学习情况`" :aria-pressed="focusCourse?.id === course.id" @click="pickCourse(course)">
              <CourseCoverArt :category="course.category" :cover="courseCoverStyle(course)" />
              <span v-if="focusCourse?.id === course.id" class="cc-card__flag">当前关注</span>
            </button>
            <div class="cc-card__body">
              <p class="cc-card__meta"><span>{{ course.ageRange }}</span><span>{{ course.duration }}</span></p>
              <h3><button type="button" @click="pickCourse(course)">{{ course.title }}</button></h3>
              <div class="cc-card__progress" role="progressbar" :aria-label="`${course.title}进度`" :aria-valuenow="learningState(course).progress" aria-valuemin="0" aria-valuemax="100">
                <div class="cc-progress__track"><i :style="{ width: `${learningState(course).progress}%` }" /></div>
              </div>
              <footer class="cc-card__foot">
                <small>{{ learningLoading || learningLoadError ? '学习记录未读取' : `${learningStatusLabel(course)} · ${learningState(course).done}/4` }}</small>
                <button
                  type="button"
                  class="su-btn su-btn--sm"
                  :class="learningState(course).status === 'completed' ? '' : 'su-btn--soft'"
                  :disabled="learningLoading || Boolean(learningLoadError) || learningSaving"
                  @click="openCourse(course)"
                >{{ learningState(course).status === 'completed' ? '回顾' : learningState(course).status === 'learning' ? '继续学习' : '开始学习' }}</button>
              </footer>
            </div>
          </article>
        </div>
        <div v-else-if="!coursesLoading" class="su-empty cc-empty" role="status">
          <span class="su-empty__mark" aria-hidden="true"><el-icon><Search /></el-icon></span>
          <strong>没有符合条件的课程</strong>
          <p>换个关键词，或者看看全部课程。</p>
          <button type="button" class="su-btn su-btn--soft" @click="resetCourseFilters">查看全部课程</button>
        </div>
      </section>
    </template>

    <!-- ===== 课堂 ===== -->
    <section v-else class="cc-lesson">
      <section class="cc-media su-panel" aria-label="课程内容">
        <header class="cc-media__head">
          <div class="su-seg" role="tablist" aria-label="课程内容">
            <button v-for="tab in mediaTabs" :key="tab" type="button" role="tab" :aria-selected="activeMediaTab === tab" @click="activeMediaTab = tab">
              <el-icon aria-hidden="true"><VideoPlay v-if="tab === '视频学习'" /><Document v-else-if="tab === 'PDF课件'" /><Files v-else /></el-icon>{{ tab }}
            </button>
          </div>
          <div class="cc-media__done">
            <span v-if="learningSaving" class="cc-media__state" role="status">正在保存…</span>
            <span v-else-if="learningSaveError" class="cc-media__state is-error" role="alert">{{ learningSaveError }} <button type="button" @click="retryLearningSave">重试</button></span>
            <button
              type="button"
              class="su-btn su-btn--sm"
              :class="learningRecords[selectedCourse.id]?.lessonCompleted ? 'is-done' : 'su-btn--soft'"
              :disabled="learningSaving || Boolean(learningRecords[selectedCourse.id]?.lessonCompleted)"
              @click="completeLesson"
            >
              <el-icon v-if="learningRecords[selectedCourse.id]?.lessonCompleted" aria-hidden="true"><Check /></el-icon>
              {{ learningRecords[selectedCourse.id]?.lessonCompleted ? '已完成课程学习' : '我学完了' }}
            </button>
          </div>
        </header>

        <article v-if="activeMediaTab === '视频学习'" class="cc-stage cc-video">
          <video
            v-if="videoPlayerUrl"
            class="cc-video__player"
            :src="videoPlayerUrl"
            controls
            playsinline
            preload="metadata"
            @ended="completeLesson"
          ></video>
          <div v-else class="cc-video__empty">
            <div class="cc-video__art"><CourseCoverArt :category="selectedCourse.category" :cover="courseCoverStyle(selectedCourse)" /></div>
            <strong>这节课暂时没有可播放的视频</strong>
            <p v-if="selectedCourse.videoAssetId">{{ videoAssetState === 'loading' ? '正在加载视频文件…' : '视频文件没有找到，请讲师重新上传。' }}</p>
            <p v-else>当前课程没有保存可播放的视频文件，可以先看课件。</p>
            <button v-if="pptPageCount" type="button" class="su-btn su-btn--soft" @click="activeMediaTab = 'PDF课件'">去看课件</button>
          </div>
          <p v-if="selectedCourse.videoFileName" class="cc-file">视频文件：{{ selectedCourse.videoFileName }}</p>
        </article>

        <article
          v-else-if="activeMediaTab === 'PDF课件'"
          ref="pptStageFrame"
          class="cc-stage cc-slides"
          :class="{ 'is-fullscreen': coursewareFullscreen }"
        >
          <div class="cc-slides__view">
            <img v-if="currentPptImage" class="cc-slides__img" :src="currentPptImage" :alt="currentPpt.title" />
            <div v-else-if="selectedCourse.pptPdfUrl" ref="pdfFrame" class="cc-slides__pdf">
              <iframe v-if="pdfNativeFallback" class="cc-slides__native" :src="pdfNativeFallbackUrl" title="课程PDF预览"></iframe>
              <canvas v-else ref="pdfCanvas" class="cc-slides__canvas" aria-label="课程PDF页面"></canvas>
              <span v-if="pdfLoading" class="cc-slides__state">正在加载 PDF…</span>
              <span v-else-if="pdfError" class="cc-slides__state is-error">{{ pdfError }}</span>
            </div>
            <div v-else class="cc-slides__text">
              <small>课件 {{ pptIndex + 1 }}</small>
              <h2>{{ currentPpt.title }}</h2>
              <p>{{ currentPpt.body }}</p>
            </div>
          </div>
          <footer class="cc-slides__bar" aria-label="课件翻页">
            <span class="cc-file">
              <template v-if="selectedCourse.pptAssetId && !pptPageCount">课件里没有可展示的 PDF，请讲师重新上传</template>
              <template v-else-if="selectedCourse.pptFileName">{{ selectedCourse.pptFileName }}</template>
            </span>
            <div class="cc-slides__nav">
              <button type="button" class="su-btn su-btn--icon" :disabled="pptIndex === 0" aria-label="上一页" @click="changePpt(-1)"><el-icon><ArrowLeft /></el-icon></button>
              <strong>{{ pptPageCount ? pptIndex + 1 : 0 }} / {{ pptPageCount }}</strong>
              <button type="button" class="su-btn su-btn--icon" :disabled="pptIndex >= pptPageCount - 1" aria-label="下一页" @click="changePpt(1)"><el-icon><ArrowRight /></el-icon></button>
            </div>
            <button type="button" class="su-btn su-btn--icon su-btn--ghost" :aria-label="coursewareFullscreen ? '退出全屏' : '全屏播放'" @click="toggleCoursewareFullscreen">
              <el-icon><Close v-if="coursewareFullscreen" /><FullScreen v-else /></el-icon>
            </button>
          </footer>
        </article>

        <article v-else class="cc-stage cc-materials">
          <button v-for="item in courseMaterials" :key="item.id" type="button" class="cc-material" @click="openMaterial(item)">
            <span class="cc-material__visual" :class="`type-${item.type}`">
              <img v-if="item.preview" :src="item.preview" :alt="item.title" />
              <b v-else>{{ materialTypeIcon(item.type) }}</b>
            </span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </button>
        </article>
      </section>

      <aside class="cc-side su-panel" aria-label="课堂互动">
        <div class="su-seg cc-side__tabs" role="tablist" aria-label="课堂互动">
          <button v-for="tab in interactionTabs" :key="tab" type="button" role="tab" :aria-selected="activeInteractionTab === tab" @click="activeInteractionTab = tab">{{ tab }}</button>
        </div>

        <div class="cc-side__body su-scroll">
          <article v-if="activeInteractionTab === '随堂练习'" class="cc-quiz">
            <p v-if="!choiceQuestions.length" class="cc-muted">这节课没有随堂练习，直接去记录你的创意吧。</p>
            <section
              v-for="(question, questionIndex) in choiceQuestions"
              :key="`${question.title}-${questionIndex}`"
              class="cc-q"
              :data-question-index="questionIndex"
            >
              <header>
                <span class="cc-q__no">{{ questionIndex + 1 }}/{{ choiceQuestions.length }}</span>
                <button
                  type="button"
                  class="cc-q__speak"
                  :class="{ 'is-on': speakingQuestionIndex === questionIndex }"
                  :aria-label="speakingQuestionIndex === questionIndex ? '停止朗读' : '朗读题目'"
                  @click="toggleQuestionSpeech(question, questionIndex)"
                >
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 8v4h3l4 3V5L6 8z" fill="currentColor" /><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.2 5.3a6.6 6.6 0 0 1 0 9.4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
                  {{ speakingQuestionIndex === questionIndex ? '停止' : '朗读' }}
                </button>
              </header>
              <h3>{{ question.title }}</h3>
              <div class="cc-q__options">
                <button
                  v-for="(option, optionIndex) in question.options"
                  :key="option"
                  type="button"
                  class="cc-option"
                  :class="answerOptionClass(question, questionIndex, optionIndex)"
                  :disabled="answersSubmitted"
                  @click="selectChoice(questionIndex, optionIndex)"
                >
                  <b>{{ optionLetter(optionIndex) }}</b>
                  <span>{{ option }}</span>
                </button>
              </div>
              <p v-if="answersSubmitted && answers[questionIndex] !== question.answer" class="cc-q__fix">正确答案：{{ question.answer }}</p>
            </section>
            <footer v-if="choiceQuestions.length" class="cc-quiz__foot">
              <template v-if="answersSubmitted">
                <strong>答对 {{ answerScore }} / {{ choiceQuestions.length }} 题</strong>
                <button type="button" class="su-btn" @click="resetAnswers">重新作答</button>
              </template>
              <button v-else type="button" class="su-btn su-btn--primary su-btn--block su-btn--lg" @click="submitAnswer">提交答案</button>
            </footer>
          </article>

          <article v-else-if="activeInteractionTab === '任务需求'" class="cc-brief">
            <h3>这次要做到</h3>
            <p class="cc-muted">开始创作前，先看看作品要满足哪些条件。</p>
            <div v-for="item in courseRequirements" :key="item.label" class="cc-brief__item">
              <span aria-hidden="true">{{ item.label.slice(0, 1) }}</span>
              <div>
                <strong>{{ item.label }}</strong>
                <small>{{ item.value }}</small>
              </div>
            </div>
          </article>

          <article v-else class="cc-idea">
            <h3>我的创意</h3>
            <p class="cc-muted">想好颜色、招牌文字、装饰……写下来或者说出来，AI 绘图时会用到。</p>
            <textarea v-model="ideaText" class="su-textarea" placeholder="写下你的想法……" @input="markIdeaDirty"></textarea>
            <button type="button" class="su-btn su-btn--block cc-idea__voice" :class="{ 'is-on': voiceListening }" @click="toggleVoice">
              <el-icon aria-hidden="true"><Microphone /></el-icon>{{ voiceListening ? '说完了，停止记录' : '用说话记录创意' }}
            </button>
            <div class="cc-idea__actions">
              <button type="button" class="su-btn" :class="{ 'is-saved': ideaSaved }" @click="saveCreativeIdea">
                <el-icon v-if="ideaSaved" aria-hidden="true"><Check /></el-icon>{{ ideaSaved ? '已保存' : '保存创意' }}
              </button>
              <button type="button" class="su-btn su-btn--primary" @click="startCourseProject">
                <el-icon aria-hidden="true"><MagicStick /></el-icon>用 AI 画出来
              </button>
            </div>
          </article>
        </div>
      </aside>
    </section>

    <el-dialog v-model="courseWorkOpen" title="课程作品" width="min(620px, calc(100vw - 32px))" append-to-body class="cc-dialog">
      <section v-if="focusCourse" class="cc-work">
        <h3>{{ focusCourse.title }}</h3>
        <p v-if="!focusState.related.length" class="cc-muted">完成创作后，可以在这里查看课程作品和讲师反馈。</p>
        <article v-for="project in focusState.related" :key="project.id" class="cc-work__item">
          <div class="cc-work__row">
            <strong>{{ project.title }}</strong>
            <span class="su-badge" :class="focusState.submittedProject?.id === project.id && focusState.submittedVersion ? 'su-badge--ok' : ''">
              {{ focusState.submittedProject?.id === project.id && focusState.submittedVersion ? '已提交' : '未提交' }}
            </span>
          </div>
          <p v-if="project.teacherComment" class="cc-work__comment">讲师反馈：{{ project.teacherComment }}</p>
          <small v-else class="cc-muted">还没有讲师反馈</small>
          <div class="cc-work__actions">
            <button type="button" class="su-btn su-btn--sm" @click="openCourseProject(project)">查看作品</button>
            <button
              type="button"
              class="su-btn su-btn--sm su-btn--primary"
              :disabled="learningSaving || !finalCourseVersion(project) || !focusState.steps.slice(0, 3).every(Boolean)"
              @click="submitCourseWork(project)"
            >提交课程作品</button>
          </div>
        </article>
        <small v-if="focusState.related.length" class="cc-muted">完成前三个环节、选好终稿后才能提交；提交只用于课程学习，不会公开到作品广场。</small>
        <p v-if="learningSaveError" class="cc-work__error" role="alert">{{ learningSaveError }}</p>
        <footer class="cc-work__foot">
          <button type="button" class="su-btn" @click="router.push('/student/portfolio')">我的素材库</button>
          <button type="button" class="su-btn" @click="router.push({ path: '/student/h5-report', query: { difficulty: difficultyStore.current } })">项目报告</button>
        </footer>
      </section>
    </el-dialog>

    <el-dialog v-model="materialPreview.open" :title="materialPreview.item?.title || '配套资料'" width="min(720px, calc(100vw - 32px))" append-to-body class="cc-dialog">
      <section v-if="materialPreview.item" class="cc-material-preview">
        <img v-if="materialPreview.item.preview" :src="materialPreview.item.preview" :alt="materialPreview.item.title" />
        <div v-else class="cc-material__visual is-large" :class="`type-${materialPreview.item.type}`">
          <b>{{ materialTypeIcon(materialPreview.item.type) }}</b>
        </div>
        <p>{{ materialPreview.item.description }}</p>
      </section>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDifficultyStore } from '../stores/difficultyStore'
import { useProjectStore } from '../stores/projectStore'
import { useUserStore } from '../stores/userStore'
import { useCourseStore } from '../stores/courseStore'
import { createCourseAssetObjectUrl, getCourseAsset } from '../stores/courseAssetStore'
import { renderCoursePdfOnServer } from '../services/coursePptConversion'
import { ArrowLeft, ArrowRight, Check, Close, Document, Files, FullScreen, MagicStick, Microphone, Reading, Search, VideoPlay } from '@element-plus/icons-vue'
import CourseCoverArt from '../components/student/CourseCoverArt.vue'
import { useStudentTopBar } from '../composables/useStudentTopBar'
import { loadCourseLearning, saveCourseLearning } from '../services/courseLearning'
import { courseLearningState, courseVersionImage, learningSteps } from '../utils/courseLearning'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const difficultyStore = useDifficultyStore()
const userStore = useUserStore()
const courseStore = useCourseStore()
const serverAuthMode = import.meta.env.VITE_AUTH_MODE === 'server'
const learningRecords = ref({})
const learningLoading = ref(true)
const learningLoadError = ref('')
const learningSaveError = ref('')
const learningSaveCount = ref(0)
const learningSaving = computed(() => learningSaveCount.value > 0)
const focusCourseId = ref('')
const learningFilter = ref('all')
const learningFilters = [
  { label: '全部', value: 'all' }, { label: '学习中', value: 'learning' },
  { label: '已完成', value: 'completed' }, { label: '未开始', value: 'new' },
]
let learningWriteQueue = Promise.resolve()
let ideaSaveTimer = null
const unsavedCourses = new Map()

const keyword = ref('')
const currentFilter = ref('all')
const selectedCourse = ref(null)
const courseWorkOpen = ref(false)
const activeMediaTab = ref('视频学习')
const activeInteractionTab = ref('随堂练习')
const pptIndex = ref(0)
const pdfCanvas = ref(null)
const pdfFrame = ref(null)
const pdfDoc = ref(null)
const pdfPageCount = ref(0)
const pdfLoading = ref(false)
const pdfError = ref('')
const pdfNativeFallback = ref(false)
const pptStageFrame = ref(null)
const coursewareFullscreen = ref(false)
const videoPlaying = ref(false)
const videoObjectUrl = ref('')
const videoAssetState = ref('idle')
const pptAssetState = ref('idle')
const courseCoverUrls = ref({})
const answers = ref([])
const answersSubmitted = ref(false)
const speakingQuestionIndex = ref(-1)
const ideaText = ref('')
const ideaVoiceText = ref('')
const ideaSaved = ref(false)
const voiceListening = ref(false)
let voiceRecognition = null
let voiceFinalText = ''
let pdfRenderTask = null
let pdfRenderToken = 0
let pdfRenderInProgress = false
let pdfRenderQueued = false
let pdfResizeObserver = null
const pdfSlideRenderRequests = new Set()
const materialPreview = ref({ open: false, item: null })

const categoryTabs = [
  { label: '全部课程', value: 'all' },
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

const mediaTabs = ['视频学习', 'PDF课件', '配套资料']
const interactionTabs = ['随堂练习', '任务需求', '创意想法']

const ageLabel = computed(() => {
  const map = {
    junior: '低龄启蒙',
    starter: '少儿基础',
    advanced: '青少年进阶',
    pro: '专业提升',
  }
  return map[difficultyStore.current] || '青少年进阶'
})
const isYoungMode = computed(() => ['junior', 'starter'].includes(difficultyStore.current))
// 分类只显示「有课」的，点进去不会是一片空白
const visibleCategoryTabs = computed(() => categoryTabs.filter((item) => item.value === 'all' || demoCourses.value.some((course) => course.category === item.value)))
function resetCourseFilters() {
  keyword.value = ''
  currentFilter.value = 'all'
  learningFilter.value = 'all'
}
function statusBadgeClass(status) {
  return status === 'completed' ? 'su-badge--ok' : status === 'learning' ? 'su-badge--accent' : ''
}
// 点课程卡：上方「继续学习」大卡换成这门课；大卡已经滚出屏幕时顺手滚回去，让人看到变化
const heroRef = ref(null)
function pickCourse(course) {
  focusCourseId.value = course.id
  const hero = heroRef.value
  if (hero && hero.getBoundingClientRect().top < 0) hero.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 服务端模式：只列管理员 / 讲师发给这个账号的课；课程库里一门都没有时才放内置示例课，免得新机构打开是空的
const coursesLoading = computed(() => serverAuthMode && !courseStore.loaded && !courseStore.loadError)
const demoCourses = computed(() => {
  const stored = courseStore.authorizedCourses || []
  const normalized = stored.map((course, index) => normalizeDisplayCourse(course, index))
  if (serverAuthMode && (coursesLoading.value || normalized.length)) return normalized
  const ids = new Set(normalized.map((course) => course.id))
  return [...normalized, ...fallbackCourses.filter((course) => !ids.has(course.id))]
})

function learningState(course) {
  return courseLearningState(course, learningRecords.value[course.id] || {}, projectStore.projects)
}
function learningStatusLabel(course) {
  return learningFilters.find((item) => item.value === learningState(course).status)?.label || '未开始'
}
const learningCounts = computed(() => demoCourses.value.reduce((counts, course) => {
  counts[learningState(course).status]++
  return counts
}, { learning: 0, completed: 0, new: 0 }))
const focusCourse = computed(() => demoCourses.value.find((course) => course.id === focusCourseId.value) || demoCourses.value[0])
const focusState = computed(() => focusCourse.value ? learningState(focusCourse.value) : null)
const nextLearningLabel = computed(() => [
  '观看视频或阅读课件后，确认完成学习', '完成并提交随堂练习',
  '保存你的创意记录', '选择终稿并提交课程作品',
][focusState.value?.next] || '查看作品与讲师反馈')

async function loadLearningRecords() {
  learningLoading.value = true
  learningLoadError.value = ''
  try {
    learningRecords.value = await loadCourseLearning(userStore.user)
    const requested = demoCourses.value.find((course) => course.id === route.query.course || course.title === route.query.course)
    const latest = Object.entries(learningRecords.value).sort((a, b) => String(b[1].lastStudiedAt || '').localeCompare(String(a[1].lastStudiedAt || '')))[0]?.[0]
    focusCourseId.value = requested?.id || latest || demoCourses.value[0]?.id || ''
  } catch (error) {
    learningLoadError.value = error.response?.data?.message || '学习记录读取失败，请检查网络后重试。'
  } finally {
    learningLoading.value = false
  }
}

function persistLearning(course, patch) {
  if (learningLoading.value || learningLoadError.value) return Promise.resolve(false)
  const owner = userStore.user
  const now = new Date().toISOString()
  learningRecords.value[course.id] = { ...learningRecords.value[course.id], ...patch, lastStudiedAt: now }
  unsavedCourses.set(course.id, course)
  learningSaveCount.value++
  const write = learningWriteQueue.then(async () => {
    const snapshot = { ...learningRecords.value[course.id] }
    try {
      if (userStore.user?.id !== owner?.id || userStore.user?.organization?.id !== owner?.organization?.id) throw new Error('登录账号已变化，请重新登录后保存。')
      const saved = await saveCourseLearning(owner, course, snapshot, learningRecords.value)
      learningRecords.value[course.id] = { ...learningRecords.value[course.id], _documentId: saved._documentId, _version: saved._version }
      if (learningRecords.value[course.id].lastStudiedAt === snapshot.lastStudiedAt) unsavedCourses.delete(course.id)
      learningSaveError.value = unsavedCourses.size ? learningSaveError.value : ''
      return true
    } catch (error) {
      learningSaveError.value = error.response?.data?.message || '学习记录保存失败，当前变更尚未同步，请检查网络或登录状态后重试。'
      return false
    } finally {
      learningSaveCount.value--
    }
  })
  learningWriteQueue = write
  return write
}
async function retryLearningSave() {
  for (const course of [...unsavedCourses.values()]) await persistLearning(course, {})
}
function finalCourseVersion(project) {
  return project.versions?.find((version) => version.id === project.finalVersionId && courseVersionImage(version))
}
function openCourseProject(project) {
  projectStore.openProject(project.id)
  router.push('/student/paint')
}
async function submitCourseWork(project) {
  const version = finalCourseVersion(project)
  if (!focusCourse.value || !version || !focusState.value.steps.slice(0, 3).every(Boolean)) return
  if (await persistLearning(focusCourse.value, { submittedProjectId: project.id, submittedVersionId: version.id, submittedAt: new Date().toISOString() })) {
    ElMessage.success('课程作品提交记录已保存')
  }
}
async function continueLearning() {
  const course = focusCourse.value
  if (course && (focusState.value.next === 3 || focusState.value.status === 'completed')) {
    courseWorkOpen.value = true
    return
  }
  if (!course || !await openCourse(course)) return
  await nextTick()
  const next = learningState(course).next
  activeInteractionTab.value = next === 2 || next === 3 ? '创意想法' : '随堂练习'
  if (next === 0 && !videoPlayerUrl.value) activeMediaTab.value = 'PDF课件'
}
async function returnToCourses() {
  if (ideaSaveTimer && !await saveLearningDraft()) return
  await learningWriteQueue
  selectedCourse.value = null
}
async function completeLesson() {
  if (selectedCourse.value && !learningRecords.value[selectedCourse.value.id]?.lessonCompleted) {
    if (await persistLearning(selectedCourse.value, { lessonCompleted: true })) ElMessage.success('课程学习已记录')
  }
}

const filteredCourses = computed(() => {
  const word = keyword.value.trim()
  return demoCourses.value.filter((course) => {
    const matchCategory = currentFilter.value === 'all' || course.category === currentFilter.value
    const matchKeyword = !word || `${course.title}${course.description}`.includes(word)
    const matchStatus = learningFilter.value === 'all' || learningState(course).status === learningFilter.value
    return matchCategory && matchKeyword && matchStatus
  })
})

const currentPpt = computed(() => selectedCourse.value?.pptPages?.[pptIndex.value] || { title: '课程导入', body: '请选择课程。' })
const pptPageCount = computed(() => Math.max(
  selectedCourse.value?.pptSlideImages?.length || 0,
  selectedCourse.value?.pptPages?.length || 0,
  pdfPageCount.value || (selectedCourse.value?.pptPdfUrl ? 1 : 0),
))
const currentPptImage = computed(() => selectedCourse.value?.pptSlideImages?.[pptIndex.value] || '')
const hasPdfCourseware = computed(() => Boolean(selectedCourse.value?.pptPdfUrl))
const pdfDisplayPageCount = computed(() => pdfNativeFallback.value ? 1 : pptPageCount.value)
const pdfNativeFallbackUrl = computed(() => (
  selectedCourse.value?.pptPdfUrl
    ? `${selectedCourse.value.pptPdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
    : ''
))
const videoPlayerUrl = computed(() => {
  if (videoObjectUrl.value) return videoObjectUrl.value
  const url = selectedCourse.value?.videoUrl || ''
  if (!url || url.startsWith('mock://') || url.startsWith('local-video://')) return ''
  return url
})
const choiceQuestions = computed(() => (selectedCourse.value?.questions || []).map(normalizeChoiceQuestion))
const courseRequirements = computed(() => selectedCourse.value?.designRequirements?.length
  ? selectedCourse.value.designRequirements
  : defaultRequirements(selectedCourse.value?.category))
const courseMaterials = computed(() => selectedCourse.value?.materials?.length
  ? selectedCourse.value.materials
  : defaultCourseMaterials(selectedCourse.value?.category))
const answerScore = computed(() => choiceQuestions.value.reduce((score, question, index) => (
  score + (answers.value[index] === question.answer ? 1 : 0)
), 0))
const videoProgress = computed(() => videoPlaying.value ? 68 : 60)

watch(selectedCourse, (course) => {
  loadCourseAssets(course)
  if (!course) return
  const cache = readLearningCache(course.id)
  answers.value = cache.answers || course.questions.map(() => '')
  answersSubmitted.value = Boolean(cache.answersSubmitted)
  stopQuestionSpeech()
  ideaText.value = cache.ideaText || ''
  ideaVoiceText.value = cache.ideaVoiceText || ''
  ideaSaved.value = Boolean(cache.ideaSaved)
  pptIndex.value = cache.pptIndex || 0
  activeMediaTab.value = '视频学习'
  activeInteractionTab.value = '随堂练习'
  loadPdfCourseware(course?.pptPdfUrl || '')
  ensureCoursePdfSlideImages(course)
}, { immediate: true })

watch(pptIndex, () => {
  if (activeMediaTab.value === mediaTabs[1]) renderPdfPage()
})

watch(activeMediaTab, (tab) => {
  if (tab === mediaTabs[1]) renderPdfPage()
})

function revokeVideoObjectUrl() {
  if (videoObjectUrl.value) {
    URL.revokeObjectURL(videoObjectUrl.value)
    videoObjectUrl.value = ''
  }
}

async function loadCourseAssets(course) {
  revokeVideoObjectUrl()
  videoPlaying.value = false
  videoAssetState.value = course?.videoAssetId ? 'loading' : 'empty'
  pptAssetState.value = course?.pptAssetId ? 'ready' : 'empty'
  if (!course?.videoAssetId) return
  try {
    const record = await getCourseAsset(course.videoAssetId)
    if (selectedCourse.value?.id !== course.id) return
    if (!record?.file) {
      videoAssetState.value = 'missing'
      return
    }
    videoObjectUrl.value = createCourseAssetObjectUrl(record)
    videoAssetState.value = 'ready'
  } catch (error) {
    console.error('load course video asset failed', error)
    videoAssetState.value = 'error'
  }
}

async function ensureCoursePdfSlideImages(course) {
  if (!course?.id || !course.pptPdfUrl || course.pptSlideImages?.length) return
  const requestKey = `${course.id}:${course.pptPdfUrl}`
  if (pdfSlideRenderRequests.has(requestKey)) return
  pdfSlideRenderRequests.add(requestKey)
  try {
    const rendered = await renderCoursePdfOnServer(course.pptPdfUrl)
    const images = (rendered?.slides || []).map((slide) => slide.imageUrl).filter(Boolean)
    if (!images.length || selectedCourse.value?.id !== course.id) return
    const patch = { pptSlideImages: images }
    // 只缓存在页面里：小画家没有改课程的权限，转出来的页图不写回服务端
    courseStore.patchLocal(course.id, patch)
    selectedCourse.value = {
      ...selectedCourse.value,
      ...patch,
    }
    pptIndex.value = Math.min(pptIndex.value, images.length - 1)
  } catch (error) {
    console.info('course pdf image rendering skipped', error?.response?.data || error)
  }
}

function resetPdfCourseware() {
  pdfRenderToken += 1
  pdfRenderQueued = false
  if (pdfRenderTask) {
    pdfRenderTask.cancel()
    pdfRenderTask = null
  }
  pdfDoc.value = null
  pdfPageCount.value = 0
  pdfLoading.value = false
  pdfError.value = ''
  pdfNativeFallback.value = false
  const canvas = pdfCanvas.value
  const context = canvas?.getContext('2d')
  if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
}

async function loadPdfCourseware(url) {
  resetPdfCourseware()
  if (!url) return
  const token = pdfRenderToken
  pdfLoading.value = true
  try {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    const doc = await getDocument({ url }).promise
    if (token !== pdfRenderToken) return
    pdfDoc.value = doc
    pdfPageCount.value = doc.numPages || 0
    if (pptIndex.value >= pdfPageCount.value) pptIndex.value = Math.max(0, pdfPageCount.value - 1)
    await renderPdfPage()
  } catch (error) {
    if (token !== pdfRenderToken) return
    console.error('load course pdf failed', error)
    pdfError.value = 'PDF 加载失败，请重新上传课件'
  } finally {
    if (token === pdfRenderToken) pdfLoading.value = false
  }
}

async function renderPdfPage() {
  if (pdfRenderInProgress) {
    pdfRenderQueued = true
    return
  }
  pdfRenderInProgress = true
  try {
    do {
      pdfRenderQueued = false
      await renderPdfPageOnce()
    } while (pdfRenderQueued)
  } finally {
    pdfRenderInProgress = false
    if (pdfRenderQueued) renderPdfPage()
  }
}

async function renderPdfPageOnce() {
  if (pdfNativeFallback.value || activeMediaTab.value !== mediaTabs[1] || !pdfDoc.value || !hasPdfCourseware.value) return
  await nextTick()
  if (pdfNativeFallback.value || activeMediaTab.value !== mediaTabs[1] || !pdfDoc.value || !hasPdfCourseware.value) return
  const canvas = pdfCanvas.value
  const frame = pdfFrame.value
  if (!canvas || !frame) return
  const total = pdfPageCount.value || pdfDoc.value.numPages || 0
  if (!total) return
  const pageNumber = Math.min(Math.max(pptIndex.value + 1, 1), total)
  const token = pdfRenderToken
  let activeTask = null
  try {
    const page = await pdfDoc.value.getPage(pageNumber)
    if (token !== pdfRenderToken) return
    if (pageNumber !== Math.min(Math.max(pptIndex.value + 1, 1), total)) {
      pdfRenderQueued = true
      return
    }
    const baseViewport = page.getViewport({ scale: 1 })
    const bounds = frame.getBoundingClientRect()
    const availableWidth = Math.max(240, bounds.width - 8)
    const availableHeight = Math.max(220, bounds.height - 8)
    const scale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)
    const viewport = page.getViewport({ scale })
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    activeTask = page.render({ canvasContext: context, viewport })
    pdfRenderTask = activeTask
    await activeTask.promise
    if (token === pdfRenderToken) pdfError.value = ''
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') {
      if (token === pdfRenderToken) pdfRenderQueued = true
      return
    }
    console.error('render course pdf page failed', error)
    if (token === pdfRenderToken) {
      pdfNativeFallback.value = true
      pdfError.value = ''
    }
  } finally {
    if (pdfRenderTask === activeTask) pdfRenderTask = null
  }
}

function normalizeDisplayCourse(course = {}, index = 0) {
  const preset = fallbackCourses.find((item) => item.id === course.id) || fallbackCourses[index % fallbackCourses.length]
  const usePresetDemo = course.id === 'course-storefront-001'
  return {
    ...preset,
    ...course,
    title: !usePresetDemo && readable(course.title) ? course.title : preset.title,
    description: !usePresetDemo && readable(course.description) ? course.description : preset.description,
    category: course.category || preset.category,
    ageRange: readable(course.ageRange) ? course.ageRange : preset.ageRange,
    duration: course.duration || preset.duration,
    progress: course.progress ?? preset.progress,
    cover: course.cover || preset.cover,
    icon: readable(course.icon) ? course.icon : preset.icon,
    pptPages: course.pptPages?.length ? course.pptPages.map((page, pageIndex) => ({
      title: readable(page.title) ? page.title : preset.pptPages[pageIndex % preset.pptPages.length].title,
      body: readable(page.body) ? page.body : preset.pptPages[pageIndex % preset.pptPages.length].body,
    })) : preset.pptPages,
    pptAssetId: course.pptAssetId || '',
    pptFileName: course.pptFileName || '',
    pptPdfUrl: course.pptPdfUrl || '',
    pptSlideImages: Array.isArray(course.pptSlideImages) ? course.pptSlideImages : [],
    questions: !usePresetDemo && course.questions?.length ? course.questions.map((question, questionIndex) => (
      normalizeChoiceQuestion(question, preset.questions[questionIndex % preset.questions.length])
    )) : preset.questions.map((question) => normalizeChoiceQuestion(question)),
    videoUrl: course.videoUrl || preset.videoUrl,
  }
}

function courseCoverStyle(course) {
  return courseCoverUrls.value[course.id] || course.cover
}

async function loadCourseCoverAssets() {
  const records = await Promise.all(courseStore.courses.map(async (course) => {
    if (!course.coverAssetId) return null
    try {
      const asset = await getCourseAsset(course.coverAssetId)
      return asset?.file ? [course.id, `url("${createCourseAssetObjectUrl(asset)}") center / cover no-repeat`] : null
    } catch (error) {
      console.info('course cover asset load skipped', error)
      return null
    }
  }))
  courseCoverUrls.value = Object.fromEntries(records.filter(Boolean))
}

function normalizeChoiceQuestion(question = {}, fallback = '这节课最重要的设计重点是什么？') {
  if (typeof question === 'string') {
    return {
      type: 'choice',
      title: readable(question) ? question : fallback,
      options: ['突出品牌特点', '随意堆满装饰', '只写文字'],
      answer: 'A',
    }
  }
  return {
    type: 'choice',
    title: readable(question.title || question.text) ? (question.title || question.text) : fallback,
    options: Array.isArray(question.options) && question.options.length ? question.options : ['突出品牌特点', '随意堆满装饰', '只写文字'],
    answer: question.answer || 'A',
  }
}

function optionLetter(index) {
  return String.fromCharCode(65 + index)
}

function defaultRequirements(category = 'storefront') {
  const presets = {
    storefront: ['横向门头画面，招牌文字清晰可读', '店名、招牌、入口、橱窗或产品符号', '从店铺商品、品牌名称和目标顾客中提取', '亲和、醒目，与店铺定位一致', '实体门店门头与品牌展示'],
    ip: ['完整角色正面稿，缩小后仍容易识别', '角色轮廓、表情、标志配件和主色', '从动物、植物、食物或品牌故事中提取', '造型简洁、特点明确、方便延展动作', '海报、周边、表情包和品牌宣传'],
    ad: ['竖版海报构图，重点信息在首屏可见', '主标题、核心画面、品牌信息和行动提示', '从宣传对象、活动主题和目标人群中提取', '层级清晰、主题醒目、文字易读', '线上宣传海报与线下展示'],
  }
  const values = presets[category] || ['适合课程最终作品展示', '主题主体、核心文字和必要装饰', '从课程主题与真实需求中提取', '层级清晰，符合目标人群', '课程展示与作品集归档']
  return ['尺寸规格', '必备元素', '形象来源', '风格要求', '使用场景'].map((label, index) => ({ label, value: values[index] }))
}

function defaultCourseMaterials(category = 'storefront') {
  const subject = category === 'ip' ? '角色' : (category === 'ad' ? '海报' : '门头')
  return [
    { id: `${category}-line`, type: 'lineart', title: `${subject}线稿`, description: '结构与轮廓参考', preview: '' },
    { id: `${category}-image`, type: 'image', title: '参考图片', description: `${subject}构图参考`, preview: '' },
    { id: `${category}-color`, type: 'palette', title: '配色表', description: '主色 / 辅色 / 点缀色', preview: '' },
    { id: `${category}-font`, type: 'font', title: '字体参考', description: '与项目风格一致', preview: '' },
  ]
}

function materialTypeIcon(type) {
  return { image: '图', lineart: '线', palette: '色', font: '字' }[type] || '资'
}

function openMaterial(item) {
  materialPreview.value = { open: true, item }
}

function answerOptionClass(question, questionIndex, optionIndex) {
  const letter = optionLetter(optionIndex)
  const selected = answers.value[questionIndex] === letter
  if (!answersSubmitted.value) return { selected }
  return {
    selected,
    correct: letter === question.answer,
    wrong: selected && letter !== question.answer,
  }
}

function stopQuestionSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  speakingQuestionIndex.value = -1
}

function toggleQuestionSpeech(question, questionIndex) {
  if (!('speechSynthesis' in window)) {
    ElMessage.warning('当前浏览器不支持题目朗读')
    return
  }
  if (speakingQuestionIndex.value === questionIndex) {
    stopQuestionSpeech()
    return
  }
  stopQuestionSpeech()
  const optionText = question.options.map((option, index) => `${optionLetter(index)}，${option}`).join('。')
  const utterance = new SpeechSynthesisUtterance(`${question.title}。${optionText}`)
  utterance.lang = 'zh-CN'
  utterance.rate = .92
  utterance.onend = () => { if (speakingQuestionIndex.value === questionIndex) speakingQuestionIndex.value = -1 }
  utterance.onerror = () => { speakingQuestionIndex.value = -1 }
  speakingQuestionIndex.value = questionIndex
  window.speechSynthesis.speak(utterance)
}

function selectChoice(questionIndex, optionIndex) {
  if (answersSubmitted.value) return
  answers.value[questionIndex] = optionLetter(optionIndex)
  saveLearningDraft()
}

function readable(value) {
  return Boolean(value && !/[�]/.test(String(value)) && !/(璇|绋|瀹|鍟|闂|杩|鎯|鏂|宀|瑙)/.test(String(value)))
}

async function openCourse(course) {
  if (learningLoading.value || learningLoadError.value) return false
  focusCourseId.value = course.id
  if (!await persistLearning(course, { startedAt: learningRecords.value[course.id]?.startedAt || new Date().toISOString() })) {
    ElMessage.error(learningSaveError.value)
    return false
  }
  selectedCourse.value = course
  return true
}

function changePpt(step) {
  const total = pptPageCount.value
  if (!total) return
  pptIndex.value = Math.min(Math.max(pptIndex.value + step, 0), total - 1)
  saveLearningDraft()
}

function syncCoursewareFullscreen() {
  coursewareFullscreen.value = document.fullscreenElement === pptStageFrame.value
  if (coursewareFullscreen.value) renderPdfPage()
}

async function toggleCoursewareFullscreen() {
  const target = pptStageFrame.value
  if (!target) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else if (target.requestFullscreen) {
      await target.requestFullscreen()
    } else {
      ElMessage.warning('当前浏览器不支持全屏播放')
    }
  } catch (error) {
    console.error('toggle courseware fullscreen failed', error)
    ElMessage.warning('全屏播放失败，请检查浏览器权限')
  }
}

async function submitAnswer() {
  const firstMissing = choiceQuestions.value.findIndex((_, index) => !answers.value[index])
  if (firstMissing >= 0) {
    ElMessage.warning(`请先完成第 ${firstMissing + 1} 题`)
    document.querySelector(`[data-question-index="${firstMissing}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    return
  }
  answersSubmitted.value = true
  if (await saveLearningDraft()) ElMessage.success(`答案已提交，本次答对 ${answerScore.value} 题`)
}

function resetAnswers() {
  answers.value = choiceQuestions.value.map(() => '')
  answersSubmitted.value = false
  saveLearningDraft()
  ElMessage.info('已解除锁定，可以重新作答')
}

function readLearningCache(courseId) {
  return learningRecords.value[courseId] || {}
}

function saveLearningDraft() {
  clearTimeout(ideaSaveTimer)
  ideaSaveTimer = null
  if (!selectedCourse.value) return Promise.resolve(false)
  return persistLearning(selectedCourse.value, {
    answers: answers.value,
    answersSubmitted: answersSubmitted.value,
    ideaText: ideaText.value,
    ideaVoiceText: ideaVoiceText.value,
    ideaSaved: ideaSaved.value,
    pptIndex: pptIndex.value,
  })
}

function markIdeaDirty() {
  ideaSaved.value = false
  clearTimeout(ideaSaveTimer)
  ideaSaveTimer = setTimeout(saveLearningDraft, 600)
}

function stopVoiceRecognition() {
  if (voiceRecognition) voiceRecognition.stop()
  voiceRecognition = null
  voiceListening.value = false
  if (ideaVoiceText.value.trim()) saveLearningDraft()
}

function toggleVoice() {
  if (voiceListening.value) {
    stopVoiceRecognition()
    ElMessage.success('语音创意已记录')
    return
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) {
    ElMessage.warning('当前浏览器不支持语音识别，请使用最新版 Edge 或 Chrome')
    return
  }

  ideaSaved.value = false
  voiceFinalText = (ideaText.value.trim() || ideaVoiceText.value.trim())
  const recognition = new Recognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.onstart = () => {
    voiceListening.value = true
    ElMessage.info('请开始说话，再点击一次结束记录')
  }
  recognition.onresult = (event) => {
    let interimText = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0]?.transcript || ''
      if (event.results[index].isFinal) voiceFinalText += text
      else interimText += text
    }
    ideaVoiceText.value = `${voiceFinalText}${interimText}`.trim()
    ideaText.value = ideaVoiceText.value
    markIdeaDirty()
  }
  recognition.onerror = (event) => {
    voiceListening.value = false
    voiceRecognition = null
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      ElMessage.error('麦克风权限被拒绝，请允许浏览器使用麦克风后重试')
    } else if (event.error !== 'aborted') {
      ElMessage.error('语音识别失败，请检查麦克风后重试')
    }
  }
  recognition.onend = () => {
    voiceListening.value = false
    voiceRecognition = null
    if (ideaVoiceText.value.trim()) saveLearningDraft()
  }
  voiceRecognition = recognition
  recognition.start()
}

function buildCourseProjectPayload(course) {
  const courseAnswers = choiceQuestions.value.map((question, index) => {
    const selected = answers.value[index] || ''
    const optionIndex = selected ? selected.charCodeAt(0) - 65 : -1
    return {
      question: question.title,
      answer: selected,
      answerText: optionIndex >= 0 ? question.options[optionIndex] : '',
    }
  })
  const answerText = courseAnswers.map((item) => `${item.question}：${item.answer || '暂未填写'}${item.answerText ? ` ${item.answerText}` : ''}`).join('；')
  const idea = [...new Set([ideaText.value.trim(), ideaVoiceText.value.trim()].filter(Boolean))].join('；')
  const prompt = idea

  return {
    title: course.title,
    type: '课程创作',
    prompt,
    courseId: course.id,
    courseTitle: course.title,
    courseCategory: course.category,
    courseDescription: course.description,
    courseAnswers,
    courseIdeaText: ideaText.value.trim(),
    courseIdeaVoiceText: ideaVoiceText.value.trim(),
    courseMaterials: [
      { type: 'video', title: '视频课程', url: course.videoUrl },
      ...(course.pptPages || []).map((page, index) => ({ type: 'ppt', title: `课件 ${index + 1}：${page.title}`, body: page.body })),
    ],
    ideaRawAnswers: [course.title, answerText, idea, course.description],
    ideaSummary: `课程《${course.title}》学习后，小画家形成的项目想法：${idea || answerText}`,
  }
}

async function saveCreativeIdea() {
  if (!selectedCourse.value) return
  const idea = [...new Set([ideaText.value.trim(), ideaVoiceText.value.trim()].filter(Boolean))].join('；')
  if (!idea) {
    ElMessage.warning('请先填写创意想法')
    return
  }
  ideaSaved.value = true
  if (!await saveLearningDraft()) return
  if (projectStore.currentProject?.courseId !== selectedCourse.value.id) {
    projectStore.startNewProject(difficultyStore.current)
  }
  projectStore.saveCurrentProject(buildCourseProjectPayload(selectedCourse.value))
  ElMessage.success('创意想法已保存到项目报告素材')
}

async function startCourseProject() {
  if (!selectedCourse.value) return
  const idea = [...new Set([ideaText.value.trim(), ideaVoiceText.value.trim()].filter(Boolean))].join('；')
  if (!idea) {
    activeInteractionTab.value = '创意想法'
    ElMessage.warning('请先填写创意想法，再进入 AI 绘画')
    return
  }
  const course = selectedCourse.value
  ideaSaved.value = true
  if (!await saveLearningDraft()) return
  projectStore.startNewProject(difficultyStore.current)
  projectStore.setCurrentProject({
    ...projectStore.currentProject,
    ...buildCourseProjectPayload(course),
  })
  router.push('/student/paint')
}

onMounted(() => {
  // 服务端模式：先拉到这个账号能看的课程，再定位上次学到的那门课、加载封面
  courseStore.load().finally(() => {
    loadLearningRecords()
    loadCourseCoverAssets()
  })
  if ('ResizeObserver' in window) {
    pdfResizeObserver = new ResizeObserver(() => {
      if (activeMediaTab.value === mediaTabs[1]) renderPdfPage()
    })
    watch(pdfFrame, (frame) => {
      pdfResizeObserver.disconnect()
      if (frame) pdfResizeObserver.observe(frame)
    }, { immediate: true })
  }
  window.addEventListener('resize', renderPdfPage)
  document.addEventListener('fullscreenchange', syncCoursewareFullscreen)
})

onBeforeUnmount(() => {
  if (ideaSaveTimer) saveLearningDraft()
  resetPdfCourseware()
  pdfResizeObserver?.disconnect()
  window.removeEventListener('resize', renderPdfPage)
  document.removeEventListener('fullscreenchange', syncCoursewareFullscreen)
  revokeVideoObjectUrl()
  stopQuestionSpeech()
  stopVoiceRecognition()
})

// 共用顶栏：上课时显示课程名和进度，左上角变成「课程列表」（回到列表视图，不离开页面）
const topBar = useStudentTopBar()
watch(() => [selectedCourse.value?.id, selectedCourse.value ? learningState(selectedCourse.value).progress : 0, ageLabel.value], () => {
  if (!selectedCourse.value) {
    topBar.reset()
    return
  }
  topBar.set({
    title: selectedCourse.value.title,
    subtitle: `${ageLabel.value} · 已学 ${learningState(selectedCourse.value).progress}%`,
    back: { label: '课程列表', action: returnToCourses },
    path: route.path,
  })
}, { immediate: true })

const fallbackCourses = [
  {
    id: 'course-storefront-001',
    title: '奶茶店门头设计趣味课',
    category: 'storefront',
    ageRange: '青少年进阶',
    duration: '45分钟',
    progress: 30,
    cover: 'linear-gradient(135deg, #e8f6ee, #f8e7b6)',
    icon: '门',
    description: '观察真实奶茶店招牌、门头色彩和品牌符号，整理成自己的 AI 绘画创意。',
    videoUrl: 'mock://video/storefront-design',
    pptPages: [
      { title: '观察真实商家', body: '店名、商品、顾客和周边环境都会影响门头设计。' },
      { title: '提炼品牌关键词', body: '用温暖、清新、专业、可爱等词语描述店铺气质。' },
      { title: '设计门头草图', body: '确定招牌形状、主色、字体和图形符号。' },
    ],
    questions: ['奶茶店门头设计最需要突出什么？', '你想使用哪三种颜色？', '招牌上要出现文字、图案还是吉祥物？'],
  },
  {
    id: 'course-ip-001',
    title: '原创IP形象设计课',
    category: 'ip',
    ageRange: '青少年进阶',
    duration: '40分钟',
    progress: 55,
    cover: 'linear-gradient(135deg, #fce7f3, #ddd6fe)',
    icon: 'IP',
    description: '把品牌或故事变成原创角色，设计外形、表情、动作和颜色。',
    videoUrl: 'mock://video/ip-character',
    pptPages: [
      { title: '角色从哪里来', body: '角色可以来自动物、植物、食物、工具或一个小故事。' },
      { title: '设计性格', body: '先想清楚它是勇敢、害羞、聪明还是调皮。' },
    ],
    questions: ['你的角色叫什么名字？', '它有什么特别的性格？', '它身上最容易被记住的特点是什么？'],
  },
  {
    id: 'course-ad-001',
    title: '品牌广告海报设计',
    category: 'ad',
    ageRange: '青少年进阶',
    duration: '35分钟',
    progress: 0,
    cover: 'linear-gradient(135deg, #dbeafe, #fef3c7)',
    icon: '广',
    description: '学习海报主视觉、标题留白和画面层级，生成适合展示的广告设计。',
    videoUrl: 'mock://video/poster-design',
    pptPages: [{ title: '海报的视觉中心', body: '让观众第一眼看到最重要的信息。' }],
    questions: ['你的海报要宣传什么？', '最重要的标题是什么？'],
  },
  {
    id: 'course-product-001',
    title: '产品包装设计课',
    category: 'product',
    ageRange: '青少年进阶',
    duration: '50分钟',
    progress: 15,
    cover: 'linear-gradient(135deg, #dcfce7, #ccfbf1)',
    icon: '品',
    description: '为饮料、文具或礼盒设计包装结构、标签图形和展示效果。',
    videoUrl: 'mock://video/product-package',
    pptPages: [{ title: '包装的三件事', body: '保护产品、传达品牌、吸引顾客。' }],
    questions: ['你要设计什么产品？', '包装上最需要突出什么信息？'],
  },
]
</script>

<style scoped lang="scss">
/* ===== 课程中心 · 列表 ===== */
.cc:not(.is-lesson) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
}
.cc-hero,
.cc-library { width: min(100%, 1320px); }

/* 继续学习大卡：封面 | 信息 | 学习环节 */
.cc-hero {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr) minmax(240px, 290px);
  align-items: center;
  gap: clamp(16px, 2.2vw, 30px);
  padding: clamp(14px, 1.6vw, 20px);
}
.cc-hero__cover {
  aspect-ratio: 4 / 3;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6), 0 10px 26px rgba(31, 35, 64, 0.08);
}
.cc-hero__info { display: grid; gap: 10px; min-width: 0; align-content: center; }
.cc-eyebrow {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  color: var(--su-accent);
  font-size: 13px;
  font-weight: 700;
}
.cc-eyebrow > i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px var(--su-accent-soft);
}
.cc-hero h2 {
  margin: 0;
  color: var(--su-ink);
  font-size: clamp(20px, 2.1vw, 26px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}
.cc-hero__desc {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--su-text);
  font-size: 14px;
  line-height: 1.6;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.cc-hero__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; color: var(--su-muted); font-size: 13px; }
.cc-progress { display: flex; align-items: center; gap: 12px; }
.cc-progress__track { flex: 1 1 auto; height: 8px; border-radius: 999px; background: var(--su-surface-3); overflow: hidden; }
.cc-progress__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #9d92f2, var(--su-accent));
  transition: width 0.45s ease;
}
.cc-progress > span { color: var(--su-muted); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.cc-next { margin: 0; display: flex; align-items: baseline; gap: 8px; color: var(--su-ink); font-size: 14px; font-weight: 600; line-height: 1.5; }
.cc-next small {
  flex: 0 0 auto;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--su-warn-soft);
  color: var(--su-warn);
  font-size: 12px;
  font-weight: 700;
}
.cc-hero__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.cc-save { margin: 0; color: var(--su-muted); font-size: 12.5px; line-height: 1.5; }
.cc-save.is-error { color: var(--su-err); }
.cc-save button,
.cc-media__state button {
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--su-accent);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

/* 四个学习环节（竖排时间线） */
.cc-journey { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; align-self: center; }
.cc-journey li { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 9px 12px; border-radius: 14px; }
.cc-journey li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 27px;
  top: 43px;
  bottom: -13px;
  width: 2px;
  border-radius: 2px;
  background: var(--su-surface-3);
}
.cc-journey li.is-done:not(:last-child)::after { background: #bde8d9; }
.cc-journey li.is-next { background: var(--su-accent-soft); }
.cc-journey__dot {
  position: relative;
  z-index: 1;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--su-surface-3);
  color: var(--su-muted);
  font-size: 13px;
  font-weight: 700;
}
.is-done .cc-journey__dot { background: var(--su-ok); color: #fff; font-size: 15px; }
.is-next .cc-journey__dot { background: var(--su-accent); color: #fff; box-shadow: 0 0 0 4px rgba(108, 92, 231, 0.16); }
.cc-journey li > div { display: grid; gap: 2px; min-width: 0; padding-top: 5px; }
.cc-journey strong,
.cc-journey__link { color: var(--su-ink); font-size: 14px; font-weight: 700; }
.cc-journey small { color: var(--su-muted); font-size: 12px; line-height: 1.45; }
.cc-journey__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.cc-journey__link:hover { color: var(--su-accent); }

.cc-hero__state {
  grid-column: 1 / -1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--su-muted);
  font-size: 14px;
  text-align: center;
}
.cc-hero__state strong { color: var(--su-ink); font-size: 16px; }
.cc-hero__state p { margin: 0; }
.cc-hero__state.is-error p { color: var(--su-err); }
.cc-hero__empty { grid-column: 1 / -1; }
.cc-spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--su-accent-soft);
  border-top-color: var(--su-accent);
  border-radius: 50%;
  animation: cc-spin 0.8s linear infinite;
}
@keyframes cc-spin { to { transform: rotate(360deg); } }

/* 课程库 */
.cc-library { display: grid; gap: 14px; }
.cc-library__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.cc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 340px);
  min-height: 46px;
  padding: 0 6px 0 16px;
  border: 1px solid var(--su-line-strong);
  border-radius: 999px;
  background: #fff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.cc-search:focus-within { border-color: rgba(108, 92, 231, 0.55); box-shadow: 0 0 0 3px var(--su-accent-ring); }
.cc-search > .el-icon { color: var(--su-muted); font-size: 17px; }
.cc-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 44px;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--su-ink);
  font: inherit;
  font-size: 14.5px;
}
.cc-search input::placeholder { color: var(--su-faint); }
.cc-search input::-webkit-search-cancel-button { display: none; }
.cc-search button {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--su-surface-3);
  color: var(--su-muted);
  cursor: pointer;
}
.cc-filters { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cc-filters .su-seg { flex: 0 0 auto; }
.cc-filters .su-seg b {
  min-width: 18px;
  height: 18px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: rgba(31, 35, 64, 0.07);
  font-size: 11px;
  font-weight: 700;
}
.cc-filters .su-seg [aria-checked='true'] b { background: var(--su-accent-soft); }
.cc-cats {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 8px;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent);
  mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent);
}
.cc-cats::-webkit-scrollbar { display: none; }
.cc-cats .su-chip:last-child { margin-right: 28px; }

.cc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(236px, 1fr)); gap: 18px; }
.cc-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--su-line);
  border-radius: 20px;
  background: #fff;
  box-shadow: var(--su-shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.cc-card:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(31, 35, 64, 0.04), 0 16px 34px rgba(31, 35, 64, 0.1); }
.cc-card.is-focused { border-color: rgba(108, 92, 231, 0.5); box-shadow: 0 0 0 3px var(--su-accent-ring), var(--su-shadow); }
.cc-card__cover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.cc-card__flag {
  position: absolute;
  left: 10px;
  top: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--su-accent);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(31, 35, 64, 0.08);
}
.cc-card__body { display: grid; gap: 8px; padding: 12px 14px 14px; flex: 1 1 auto; align-content: start; }
.cc-card__meta { margin: 0; display: flex; gap: 10px; color: var(--su-muted); font-size: 12.5px; }
.cc-card h3 { margin: 0; }
.cc-card h3 button {
  display: -webkit-box;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: none;
  color: var(--su-ink);
  font: inherit;
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.cc-card h3 button:hover { color: var(--su-accent); }
.cc-card__progress .cc-progress__track { height: 6px; }
.cc-card__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.cc-card__foot small { min-width: 0; overflow: hidden; color: var(--su-muted); font-size: 12.5px; white-space: nowrap; text-overflow: ellipsis; }
.cc-empty { border: 1px dashed var(--su-line-strong); border-radius: 20px; background: rgba(255, 255, 255, 0.6); }

/* ===== 课堂 ===== */
.cc.is-lesson {
  height: calc(100dvh - var(--app-top));
  min-height: 0;
  padding: 14px clamp(12px, 1.6vw, 20px);
  overflow: hidden;
}
.cc-lesson {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 31vw, 400px);
  gap: 14px;
}
.cc-media { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 12px; }
.cc-media__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cc-media__head .su-seg button { display: inline-flex; align-items: center; gap: 6px; }
.cc-media__done { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cc-media__state { color: var(--su-muted); font-size: 12.5px; }
.cc-media__state.is-error { color: var(--su-err); }
.su-btn.is-done:disabled { opacity: 1; border-color: transparent; background: var(--su-ok-soft); color: var(--su-ok); }

.cc-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; border-radius: 16px; background: #f2f3f9; }
.cc-video { display: flex; flex-direction: column; }
.cc-video__player { flex: 1 1 auto; width: 100%; min-height: 0; background: #16182a; object-fit: contain; }
.cc-video__empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
}
.cc-video__art { width: min(340px, 72%); aspect-ratio: 16 / 10; margin-bottom: 10px; overflow: hidden; border-radius: 20px; box-shadow: var(--su-shadow); }
.cc-video__empty strong { color: var(--su-ink); font-size: 16px; font-weight: 700; }
.cc-video__empty p { margin: 0 0 6px; color: var(--su-muted); font-size: 13.5px; line-height: 1.6; }
.cc-video > .cc-file { padding: 8px 14px; background: #fff; border-top: 1px solid var(--su-line); }
.cc-file { min-width: 0; overflow: hidden; color: var(--su-muted); font-size: 12.5px; white-space: nowrap; text-overflow: ellipsis; }

.cc-slides { display: flex; flex-direction: column; }
.cc-slides.is-fullscreen { border-radius: 0; background: #eef0f7; }
.cc-slides__view { position: relative; flex: 1 1 auto; min-height: 0; }
.cc-slides__img,
.cc-slides__pdf,
.cc-slides__text { position: absolute; inset: 14px; }
.cc-slides__img { width: calc(100% - 28px); height: calc(100% - 28px); object-fit: contain; }
.cc-slides__pdf { display: grid; place-items: center; }
.cc-slides__canvas { border-radius: 10px; background: #fff; box-shadow: 0 8px 26px rgba(31, 35, 64, 0.12); }
.cc-slides__native { width: 100%; height: 100%; border: 0; border-radius: 10px; background: #fff; }
.cc-slides__state { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 8px 14px; border-radius: 999px; background: rgba(255, 255, 255, 0.92); color: var(--su-text); font-size: 13px; }
.cc-slides__state.is-error { color: var(--su-err); }
.cc-slides__text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: clamp(20px, 4vw, 56px);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(31, 35, 64, 0.08);
}
.cc-slides__text small { color: var(--su-accent); font-size: 13px; font-weight: 700; }
.cc-slides__text h2 { margin: 0; color: var(--su-ink); font-size: clamp(22px, 2.6vw, 34px); font-weight: 700; letter-spacing: -0.02em; }
.cc-slides__text p { margin: 0; max-width: 34em; color: var(--su-text); font-size: clamp(15px, 1.5vw, 18px); line-height: 1.75; }
.cc-slides__bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: #fff;
  border-top: 1px solid var(--su-line);
}
.cc-slides__bar > button { justify-self: end; }
.cc-slides__nav { display: flex; align-items: center; gap: 10px; }
.cc-slides__nav strong { min-width: 64px; color: var(--su-ink); font-size: 14px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }

.cc-materials {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  align-content: start;
  gap: 14px;
  padding: 14px;
  overflow: auto;
}
.cc-material {
  display: grid;
  gap: 6px;
  min-height: 0;
  padding: 10px 10px 12px;
  border: 1px solid var(--su-line);
  border-radius: 16px;
  background: #fff;
  color: var(--su-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.cc-material:hover { border-color: rgba(108, 92, 231, 0.4); transform: translateY(-1px); }
.cc-material strong { font-size: 14px; font-weight: 700; }
.cc-material small { color: var(--su-muted); font-size: 12px; line-height: 1.45; }
.cc-material__visual {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--su-surface-3);
}
.cc-material__visual img { width: 100%; height: 100%; object-fit: cover; }
.cc-material__visual b { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: #fff; font-size: 22px; font-weight: 700; }
.cc-material__visual.type-lineart { background: linear-gradient(140deg, #eef0f7, #e3e6f3); }
.cc-material__visual.type-lineart b { color: #4a5071; }
.cc-material__visual.type-image { background: linear-gradient(140deg, #dcefff, #e7e0ff); }
.cc-material__visual.type-image b { color: #3b7fd9; }
.cc-material__visual.type-palette { background: linear-gradient(140deg, #ffe8dc, #fff3cc); }
.cc-material__visual.type-palette b { color: #e0703a; }
.cc-material__visual.type-font { background: linear-gradient(140deg, #dff6ea, #dceeff); }
.cc-material__visual.type-font b { color: #14a383; }
.cc-material__visual.is-large { aspect-ratio: 16 / 9; }

/* 右侧：随堂练习 / 任务需求 / 创意 */
.cc-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 12px; }
.cc-side__tabs { align-self: stretch; }
.cc-side__tabs button { flex: 1 1 0; }
.cc-side__body { flex: 1 1 auto; min-height: 0; padding: 2px 4px 4px; }
.cc-muted { margin: 0; color: var(--su-muted); font-size: 13px; line-height: 1.6; }
.cc-side h3 { margin: 0 0 4px; color: var(--su-ink); font-size: 17px; font-weight: 700; }

.cc-quiz { display: grid; gap: 14px; }
.cc-q { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--su-line); border-radius: 16px; background: #fff; scroll-margin: 12px; }
.cc-q header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cc-q__no { color: var(--su-accent); font-size: 12.5px; font-weight: 700; }
.cc-q__speak {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--su-line-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--su-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.cc-q__speak.is-on { border-color: transparent; background: var(--su-accent); color: #fff; }
.cc-q h3 { margin: 0; color: var(--su-ink); font-size: 15px; font-weight: 700; line-height: 1.55; }
.cc-q__options { display: grid; gap: 8px; }
.cc-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 8px 12px 8px 8px;
  border: 1px solid var(--su-line-strong);
  border-radius: 14px;
  background: #fff;
  color: var(--su-ink);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cc-option b {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--su-surface-3);
  color: var(--su-text);
  font-size: 13px;
}
.cc-option:hover:not(:disabled) { border-color: rgba(108, 92, 231, 0.45); }
.cc-option.selected { border-color: var(--su-accent); background: var(--su-accent-soft); }
.cc-option.selected b { background: var(--su-accent); color: #fff; }
.cc-option.correct { border-color: var(--su-ok); background: var(--su-ok-soft); }
.cc-option.correct b { background: var(--su-ok); color: #fff; }
.cc-option.wrong { border-color: var(--su-err); background: var(--su-err-soft); }
.cc-option.wrong b { background: var(--su-err); color: #fff; }
.cc-option:disabled { cursor: default; }
.cc-q__fix { margin: 0; color: var(--su-ok); font-size: 13px; font-weight: 600; }
.cc-quiz__foot { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0 2px; background: linear-gradient(180deg, transparent, var(--su-surface) 30%); }
.cc-quiz__foot strong { color: var(--su-ink); font-size: 15px; }

.cc-brief { display: grid; gap: 10px; }
.cc-brief__item { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--su-line); border-radius: 14px; background: #fff; }
.cc-brief__item > span {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--su-accent-soft);
  color: var(--su-accent);
  font-size: 15px;
  font-weight: 700;
}
.cc-brief__item div { display: grid; gap: 3px; min-width: 0; }
.cc-brief__item strong { color: var(--su-ink); font-size: 14px; font-weight: 700; }
.cc-brief__item small { color: var(--su-text); font-size: 13px; line-height: 1.55; }

.cc-idea { display: grid; gap: 10px; }
.cc-idea .su-textarea { min-height: 150px; }
.cc-idea__voice.is-on { border-color: transparent; background: var(--su-err-soft); color: var(--su-err); }
.cc-idea__actions { display: grid; grid-template-columns: 1fr 1.3fr; gap: 10px; }
.cc-idea__actions .su-btn.is-saved { border-color: transparent; background: var(--su-ok-soft); color: var(--su-ok); }

/* 弹窗内容 */
.cc-work { display: grid; gap: 12px; }
.cc-work h3 { margin: 0; color: var(--su-ink); font-size: 17px; font-weight: 700; }
.cc-work__item { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--su-line); border-radius: 16px; background: var(--su-surface-2); }
.cc-work__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cc-work__row strong { color: var(--su-ink); font-size: 15px; }
.cc-work__comment { margin: 0; color: var(--su-text); font-size: 13.5px; line-height: 1.6; }
.cc-work__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cc-work__error { margin: 0; color: var(--su-err); font-size: 13px; }
.cc-work__foot { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 4px; border-top: 1px solid var(--su-line); padding-top: 14px; }
.cc-material-preview { display: grid; gap: 12px; }
.cc-material-preview img { width: 100%; max-height: 60dvh; object-fit: contain; border-radius: 14px; background: var(--su-surface-2); }
.cc-material-preview p { margin: 0; color: var(--su-text); font-size: 14px; line-height: 1.6; }

/* 低龄：字和按钮再大一点 */
.cc.is-young .cc-card h3 button { font-size: 16.5px; }
.cc.is-young .cc-option { min-height: 52px; font-size: 15px; }
.cc.is-young .cc-hero h2 { font-size: clamp(22px, 2.3vw, 28px); }

/* ===== 响应式 ===== */
@media (max-width: 1180px) {
  .cc-hero { grid-template-columns: minmax(200px, 250px) minmax(0, 1fr) minmax(230px, 260px); }
}
@media (max-width: 1024px) {
  .cc-hero { grid-template-columns: minmax(200px, 260px) minmax(0, 1fr); }
  .cc-journey { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .cc-journey li { flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--su-line); background: #fff; }
  .cc-journey li.is-next { border-color: transparent; }
  .cc-journey li:not(:last-child)::after { display: none; }
  .cc-journey li > div { padding-top: 0; }
  .cc-lesson { grid-template-columns: minmax(0, 1fr) 320px; }
}
@media (max-width: 860px) {
  .cc-filters { flex-wrap: wrap; }
  .cc-filters .su-seg { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .cc-cats { flex-basis: 100%; }
  .cc-search { width: 100%; }
  /* 竖屏平板 / 手机：课堂改成上下排，整页滚动 */
  .cc.is-lesson { height: auto; overflow: visible; }
  .cc-lesson { height: auto; grid-template-columns: 1fr; }
  .cc-stage { flex: none; height: clamp(260px, 62vw, 560px); }
  .cc-materials { height: auto; }
  .cc-side__body { overflow: visible; }
}
@media (max-width: 640px) {
  .cc:not(.is-lesson) { gap: 18px; }
  .cc-hero { grid-template-columns: 1fr; }
  .cc-hero__cover { aspect-ratio: 16 / 9; }
  .cc-journey { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cc-hero__actions .su-btn { flex: 1 1 0; }
  .cc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .cc-card__body { padding: 10px 11px 12px; }
  .cc-card h3 button { font-size: 14.5px; }
  .cc-card__foot { flex-direction: column; align-items: stretch; }
  .cc-card__foot .su-btn { width: 100%; }
  .cc-media__head { flex-direction: column; align-items: stretch; }
  .cc-media__head .su-seg button { flex: 1 1 0; justify-content: center; padding: 0 8px; }
  .cc-media__done { justify-content: flex-end; }
  .cc-slides__bar { grid-template-columns: 1fr auto; }
  .cc-slides__bar > .cc-file { display: none; }
}
@media (max-width: 380px) {
  .cc-grid { grid-template-columns: 1fr; }
}
</style>
