// 生成「添加到主屏幕」用的应用图标（从 public/favicon.svg 渲染）
// 用法：node scripts/gen-app-icons.mjs
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'public', 'favicon.svg')
const outDir = path.join(root, 'public', 'icons')

// 图标统一：白底 + 居中的紫色标记，四周留 20% 边距（iOS/安卓裁圆角都不会切到图案）
const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon-180.png', size: 180 },
]

await mkdir(outDir, { recursive: true })

for (const { file, size } of targets) {
  const inner = Math.round(size * 0.6)
  const mark = await sharp(src, { density: 384 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: '#ffffff' },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, file))

  console.log(`generated ${file} (${size}x${size})`)
}
