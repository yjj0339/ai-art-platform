export const learningSteps = [
  { title: '课程学习', description: '观看视频 / 阅读课件' },
  { title: '随堂练习', description: '完成课程问答' },
  { title: '创意记录', description: '保存自己的设计想法' },
  { title: '作品提交', description: '选择终稿并提交课程作品' },
]

export function courseVersionImage(version) {
  return version?.imageUrl || version?.preview || version?.url || ''
}

export function courseLearningState(course, record = {}, projects = []) {
  const related = projects.filter((project) => project.courseId === course.id)
  const submittedProject = related.find((project) => project.id === record.submittedProjectId)
  const submittedVersion = submittedProject?.versions?.find((version) => version.id === record.submittedVersionId && courseVersionImage(version))
  const hasQuestions = Boolean(course.questions?.length)
  const started = Boolean(record.startedAt || record.lessonCompleted || record.answersSubmitted || record.ideaText || record.ideaVoiceText || related.length)
  const steps = [
    Boolean(record.lessonCompleted),
    hasQuestions ? Boolean(record.answersSubmitted && course.questions.every((_, index) => record.answers?.[index])) : started,
    Boolean(record.ideaSaved && (record.ideaText?.trim() || record.ideaVoiceText?.trim())),
    Boolean(submittedVersion),
  ]
  const done = steps.filter(Boolean).length
  return { steps, done, progress: done * 25, status: done === 4 ? 'completed' : started ? 'learning' : 'new', related, submittedProject, submittedVersion, next: steps.findIndex((value) => !value) }
}
