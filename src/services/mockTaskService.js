export function createMockTask(type, payload = {}) {
  return {
    id: `${type}-${Date.now()}`,
    type,
    payload,
    status: 'queued',
    progress: 0,
    result: null,
    error: '',
  }
}

export function runMockTask(task, onUpdate) {
  const steps = [
    { status: 'queued', progress: 12 },
    { status: 'submitting', progress: 28 },
    { status: 'processing', progress: 62 },
    { status: 'rendering', progress: 86 },
    { status: 'succeeded', progress: 100 },
  ]

  let index = 0
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      const step = steps[index]
      const nextTask = { ...task, ...step }
      if (step.status === 'succeeded') {
        window.clearInterval(timer)
        nextTask.result = createMockResult(task.type, task.payload, task.id)
        onUpdate(nextTask)
        resolve(nextTask)
        return
      }
      onUpdate(nextTask)
      index += 1
    }, 420)
  })
}

function createMockResult(type, payload, taskId) {
  if (type === 'video') {
    return {
      taskId,
      title: 'AI视频片段',
      duration: '00:06',
      previewUrl: 'mock://video/preview.mp4',
      downloadUrl: 'mock://video/export.mp4',
      description: `已根据“${payload.prompt || '当前作品'}”生成课堂演示视频占位结果。`,
      background: 'linear-gradient(135deg, #111827, #2563eb 52%, #ff7a00)',
    }
  }

  if (type === 'model3d') {
    return {
      taskId,
      title: 'AI 3D模型',
      format: 'GLB / STL / OBJ 预留',
      materialUrl: payload.material?.url || 'mock://materials/current-artwork.png',
      previewUrl: 'mock://model3d/preview.png',
      modelUrl: 'mock://model3d/result.glb',
      description: `已根据“${payload.prompt || '当前作品'}”生成课堂演示级3D模型占位结果。`,
    }
  }

  return {
    taskId,
    title: 'AI任务结果',
    description: `已完成“${payload.prompt || '当前任务'}”的Mock生成流程。`,
  }
}
