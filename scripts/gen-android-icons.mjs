// 把 public/icons/icon-512.png 缩成安卓需要的各档 mipmap 图标。
// 用法：node scripts/gen-android-icons.mjs
import { mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'public/icons/icon-512.png')
const resDir = path.join(root, 'android/res')

const targets = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
]

await access(src).catch(() => {
  console.error(`缺少源图：${src}`)
  process.exit(1)
})

for (const [dir, size] of targets) {
  const out = path.join(resDir, dir)
  await mkdir(out, { recursive: true })
  await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, 'ic_launcher.png'))
  console.log(`${dir} -> ${size}x${size}`)
}

// 圆角版本（安卓 7.1+ 自适应图标用，不是所有桌面都读，但放着没坏处）
const adaptive = path.join(resDir, 'mipmap-anydpi-v26')
await mkdir(adaptive, { recursive: true })
console.log('done')
