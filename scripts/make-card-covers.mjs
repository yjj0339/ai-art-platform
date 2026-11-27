// 给工作台 9 张卡生成 3:4 竖版封面图。
//
// 为什么需要这一步：现有内置素材全是横版（1.33 ~ 1.78），而卡片是 3:4 竖版。
// 用 background-size:cover 居中裁切时只保留中间一条竖条，
// 主体偏两侧的图会被裁掉，中间是大片浅色的图（如 paint-generation-canvas-v1）
// 裁出来几乎全白 —— 后台看起来就像「这张卡没图」。
//
// 做法：预先裁成 3:4 存成独立文件，后台与学生端都不再二次裁切，
// 做到「后台看到什么，学生就看到什么」。
//
// 自动选位：把候选裁切条切成小块，算「细节量」（灰度标准差 + 边缘强度），
// 取信息最丰富的一条 —— 通常就是主体所在位置。人眼再复核一次。
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = 'public/assets/student-theme'
const OUT_DIR = 'public/assets/student-theme/cards'
const OUT_W = 720
const OUT_H = 960

// 每张卡用哪张源图 + 构图偏好（auto = 自动找主体；left/right/center = 强制）
const PLAN = [
  { id: 'courses', src: 'gallery-hedgehog-v1.png', mode: 'auto' },
  { id: 'paint', src: 'login-aya-artist-v1.png', mode: 'auto' },
  { id: 'sketchpad', src: 'skill-character-v1.png', mode: 'auto' },
  { id: 'video', src: 'gallery-future-car-v1.png', mode: 'auto' },
  { id: 'canvas', src: 'skill-character-v1.png', mode: 'auto' },
  { id: 'model3d', src: 'gallery-sky-castle-v1.png', mode: 'auto' },
  { id: 'gallery', src: 'gallery-future-car-v1.png', mode: 'auto' },
  { id: 'portfolio', src: 'gallery-hedgehog-v1.png', mode: 'auto' },
  { id: 'reports', src: 'gallery-sky-castle-v1.png', mode: 'auto' },
]

// 算一条竖切片的「信息量」：灰度标准差（有没有对比）+ 边缘强度（有没有细节）。
// 纯白/纯浅色的区域两项都很低，自然被排到最后。
async function sliceScore(buffer, left, width, height) {
  const { data } = await sharp(buffer)
    .extract({ left, top: 0, width, height })
    .greyscale()
    .resize(64, 96, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  let sum = 0
  let sumSq = 0
  const n = data.length
  for (let i = 0; i < n; i += 1) {
    sum += data[i]
    sumSq += data[i] * data[i]
  }
  const mean = sum / n
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean))

  // 水平相邻像素差 = 边缘强度
  let edge = 0
  let cnt = 0
  for (let y = 0; y < 96; y += 1) {
    for (let x = 1; x < 64; x += 1) {
      edge += Math.abs(data[y * 64 + x] - data[y * 64 + x - 1])
      cnt += 1
    }
  }
  edge /= Math.max(1, cnt)

  // 太亮的切片额外扣分：主体通常不是纯白
  const brightPenalty = mean > 240 ? (mean - 240) * 2 : 0
  return sd * 1.6 + edge * 6 - brightPenalty
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const report = []

  for (const item of PLAN) {
    const srcPath = path.join(SRC_DIR, item.src)
    if (!fs.existsSync(srcPath)) {
      console.log('!! 缺源图', item.src)
      continue
    }
    const buffer = await sharp(srcPath).toBuffer()
    const meta = await sharp(buffer).metadata()

    // 目标 3:4：以高度为基准，宽 = 高 * 0.75
    const cropH = meta.height
    let cropW = Math.round(cropH * (OUT_W / OUT_H))
    if (cropW > meta.width) {
      // 源图太窄（比 3:4 还瘦）：改成以宽为基准
      cropW = meta.width
    }
    const maxLeft = Math.max(0, meta.width - cropW)

    let left = Math.round(maxLeft / 2)
    let picked = 'center'
    if (item.mode === 'auto' && maxLeft > 8) {
      // 在可用范围内滑窗，步长取宽度的 1/12，够细又不慢
      const step = Math.max(4, Math.round(cropW / 12))
      let best = -Infinity
      for (let l = 0; l <= maxLeft; l += step) {
        const score = await sliceScore(buffer, l, cropW, cropH)
        if (score > best) {
          best = score
          left = l
        }
      }
      // 收尾：在最优位置附近再细扫一遍，避免步长太粗
      const fine = Math.max(2, Math.round(step / 4))
      for (let l = Math.max(0, left - step); l <= Math.min(maxLeft, left + step); l += fine) {
        const score = await sliceScore(buffer, l, cropW, cropH)
        if (score > best) {
          best = score
          left = l
        }
      }
      picked = `auto(left=${left}, score=${best.toFixed(1)})`
    }

    const outPath = path.join(OUT_DIR, `${item.id}-v1.webp`)
    await sharp(buffer)
      .extract({ left, top: 0, width: cropW, height: cropH })
      .resize(OUT_W, OUT_H, { fit: 'cover', position: 'centre' })
      .webp({ quality: 86 })
      .toFile(outPath)

    const kb = (fs.statSync(outPath).size / 1024).toFixed(1)
    console.log(`${item.id.padEnd(10)} ${item.src.padEnd(32)} ${picked.padEnd(28)} -> ${kb} KB`)
    report.push({ id: item.id, src: item.src, left, cropW, cropH, kb })
  }

  fs.writeFileSync('.workbuddy/shots/crop-report.json', JSON.stringify(report, null, 2))
  console.log('\n共生成', report.length, '张')
}

await main()
