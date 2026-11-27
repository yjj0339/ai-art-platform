const DB_NAME = 'art-studio-course-assets'
const DB_VERSION = 1
const STORE_NAME = 'course-assets'

function openCourseAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'assetId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runAssetTransaction(mode, runner) {
  return openCourseAssetDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = runner(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  }))
}

export function createCourseAssetId(kind = 'file') {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function saveCourseAsset(assetId, file, meta = {}) {
  if (!assetId || !file) return Promise.resolve(null)
  const record = {
    assetId,
    file,
    name: file.name || meta.name || '',
    type: file.type || meta.type || '',
    size: file.size || 0,
    kind: meta.kind || 'file',
    updatedAt: new Date().toISOString(),
  }
  return runAssetTransaction('readwrite', (store) => store.put(record)).then(() => record)
}

export function getCourseAsset(assetId) {
  if (!assetId) return Promise.resolve(null)
  return runAssetTransaction('readonly', (store) => store.get(assetId)).then((record) => record || null)
}

export function deleteCourseAsset(assetId) {
  if (!assetId) return Promise.resolve(false)
  return runAssetTransaction('readwrite', (store) => store.delete(assetId)).then(() => true)
}

export function createCourseAssetObjectUrl(record) {
  if (!record?.file) return ''
  return URL.createObjectURL(record.file)
}
