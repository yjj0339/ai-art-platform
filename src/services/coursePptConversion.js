import { apiClient } from './apiClient'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('PPT文件读取失败'))
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.includes(',') ? value.split(',').pop() : value)
    }
    reader.readAsDataURL(file)
  })
}

/**
 * 上传课程素材（封面 / 视频 / 课件）到服务端，返回 { id, url, ... }。
 *
 * 直接把 File 当请求体发裸二进制，不走 base64：
 *  - base64 会让体积膨胀 33%，一个 500MB 的视频上传时浏览器还要多占 670MB 内存，平板直接崩；
 *  - 裸流可以带上传进度（onUploadProgress），老师能看见「传了百分之多少」而不是干等。
 *
 * 失败一律抛出，由调用方弹明确的错误提示 —— 以前的写法是 catch 之后 console.info 静默降级，
 * 结果服务端没存上、老师以为传上去了，学生端打开是黑屏。
 */
export async function uploadCourseAsset(file, { kind, onProgress } = {}) {
  if (!file) return null
  const response = await apiClient.post('/course-assets', file, {
    params: { kind, name: file.name },
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    // 课程视频动辄几百兆，axios 默认 4 分钟超时不够用。
    timeout: kind === 'video' ? 30 * 60 * 1000 : 10 * 60 * 1000,
    onUploadProgress: onProgress
      ? (event) => {
          if (!event.total) return
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      : undefined,
  })
  return response.data?.asset || null
}

export async function deleteCourseAssetOnServer(assetId) {
  if (!assetId) return false
  await apiClient.delete(`/course-assets/${encodeURIComponent(assetId)}`)
  return true
}

export async function convertCoursePptOnServer(file) {
  if (!file) return null
  const dataBase64 = await fileToBase64(file)
  const response = await apiClient.post('/course-ppt/convert', {
    fileName: file.name,
    fileType: file.type,
    dataBase64,
  })
  return response.data
}

export async function uploadCourseVideoToServer(file) {
  if (!file) return null
  const dataBase64 = await fileToBase64(file)
  const response = await apiClient.post('/course-video/upload', {
    fileName: file.name,
    fileType: file.type,
    dataBase64,
  })
  return response.data
}

export async function uploadCoursePdfToServer(file) {
  if (!file) return null
  const dataBase64 = await fileToBase64(file)
  const response = await apiClient.post('/course-pdf/upload', {
    fileName: file.name,
    fileType: file.type || 'application/pdf',
    dataBase64,
  })
  return response.data
}

export async function renderCoursePdfOnServer(pdfUrl) {
  if (!pdfUrl) return null
  const response = await apiClient.post('/course-pdf/render', { pdfUrl })
  return response.data
}
