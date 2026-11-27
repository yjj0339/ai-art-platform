import { apiClient } from './apiClient'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const documentType = 'course-learning'

export function learningStorageKey(user) {
  return `art-studio-course-learning-user-${encodeURIComponent(user?.organization?.id || 'demo')}-${encodeURIComponent(user?.id || '')}-${encodeURIComponent(user?.account || user?.name || '')}`
}

export async function loadCourseLearning(user) {
  if (!user || user.role !== 'student') throw new Error('请使用用户账号查看课程情况。')
  if (!SERVER_AUTH_MODE) {
    return JSON.parse(localStorage.getItem(learningStorageKey(user)) || '{}')
  }
  const { data } = await apiClient.get('/me/documents', { params: { type: documentType }, timeout: 10000 })
  const records = {}
  for (const document of data.documents || []) {
    if (!document.resourceKey || records[document.resourceKey]) continue
    records[document.resourceKey] = { ...document.data, _documentId: document.id, _version: document.version }
  }
  return records
}

export async function saveCourseLearning(user, course, record, records) {
  if (!user || user.role !== 'student') throw new Error('请使用用户账号保存学习记录。')
  const { _documentId, _version, ...payload } = record
  if (!SERVER_AUTH_MODE) {
    localStorage.setItem(learningStorageKey(user), JSON.stringify({ ...records, [course.id]: payload }))
    return payload
  }
  const response = _documentId
    ? await apiClient.patch(`/me/documents/${_documentId}`, { title: course.title, data: payload, version: _version }, { timeout: 10000 })
    : await apiClient.post('/me/documents', { type: documentType, resourceKey: course.id, title: course.title, data: payload }, { timeout: 10000 })
  return { ...response.data.document.data, _documentId: response.data.document.id, _version: response.data.document.version }
}
