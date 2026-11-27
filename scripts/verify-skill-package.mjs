// 技能包链路验收：导入 SKILL.md → 转成草稿玩法 → 发布 → 学生端技能玩法列表出现该卡
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/verify-skill-package.mjs
// 说明：全程不调真实出图接口，测试环节用假回包。跑完自动清理自己造的数据。

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const ADMIN = { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }

const results = []
const pass = (name, detail = '') => { results.push({ ok: true, name }); console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`) }
const fail = (name, detail = '') => { results.push({ ok: false, name }); console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`) }

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify(ADMIN),
  })
  if (!res.ok) throw new Error(`登录失败 ${res.status}`)
  const raw = res.headers.getSetCookie?.() || []
  return raw.map((c) => c.split(';')[0]).join('; ')
}

const SAMPLE = `---
name: verify-sample-poster
display_name: 验收示例海报
description: 用于验收的技能包样例，生成极简留白风格宣传海报
version: 1.0.0
author: verify-script
tags:
  - 海报设计
  - 极简
examples_zh:
  - 帮我做一张秋季画展的宣传海报，暖橙主视觉，大标题留白，构图居中
  - 生成一张少儿美术招生海报，清新绿色调，画面有手绘质感
---

# 验收示例海报

当学生想要一张宣传海报时，使用下面的方式：

提示词：一张秋季画展宣传海报，暖橙色主视觉，居中构图，大标题留白，纸质质感

\`\`\`bash
python render.py --input poster.json
\`\`\`
`

async function main() {
  const cookie = await login()
  const api = async (path, options = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie, ...(options.headers || {}) },
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON 原样返回 */ }
    return { status: res.status, json, text }
  }

  const createdPackageIds = []
  const createdSkillIds = []

  try {
    // 1. 导入
    const imported = await api('/api/admin/ai-skill-packages/import', {
      method: 'POST',
      body: JSON.stringify({ items: [{ fileName: 'SKILL.md', content: SAMPLE }] }),
    })
    if (imported.status !== 201 || !imported.json?.imported?.length) {
      fail('导入技能包', `status=${imported.status} ${imported.text.slice(0, 200)}`)
      return
    }
    const pkg = imported.json.imported[0]
    createdPackageIds.push(pkg.id)
    pass('导入技能包', `id=${pkg.id.slice(0, 14)}… title=${pkg.title}`)

    // 2. 解析质量
    if (pkg.title === '验收示例海报') pass('frontmatter 标题提取')
    else fail('frontmatter 标题提取', `实际=${pkg.title}`)
    if (pkg.promptCandidates.length >= 2) pass('候选提示词提取', `${pkg.promptCandidates.length} 条`)
    else fail('候选提示词提取', `只有 ${pkg.promptCandidates.length} 条`)
    if (!pkg.promptCandidates.some((c) => /render\.py|python/.test(c))) pass('过滤掉脚本命令行')
    else fail('过滤掉脚本命令行', '候选里混进了 python 命令')
    if (pkg.metadata.hasScripts === true) pass('识别出带脚本')
    else fail('识别出带脚本', `hasScripts=${pkg.metadata.hasScripts}`)

    // 3. 去重
    const dup = await api('/api/admin/ai-skill-packages/import', {
      method: 'POST',
      body: JSON.stringify({ items: [{ fileName: 'SKILL.md', content: SAMPLE }] }),
    })
    if (dup.json?.skipped?.length === 1 && !dup.json?.imported?.length) pass('重复导入被拦下')
    else fail('重复导入被拦下', dup.text.slice(0, 160))

    // 4. 列表能看到
    const list = await api('/api/admin/ai-skill-packages?status=pending')
    if (list.json?.packages?.some((item) => item.id === pkg.id)) pass('待整理列表包含新导入')
    else fail('待整理列表包含新导入', `共 ${list.json?.packages?.length ?? 0} 条`)

    // 5. 详情带正文
    const detail = await api(`/api/admin/ai-skill-packages/${pkg.id}`)
    if (detail.json?.package?.body?.includes('验收示例海报')) pass('详情返回正文')
    else fail('详情返回正文', `body 长度=${detail.json?.package?.body?.length ?? 0}`)

    // 6. 转成图像玩法（草稿）
    const convert = await api(`/api/admin/ai-skill-packages/${pkg.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ skillType: 'image', promptTemplate: '{{subject}}，极简留白，居中构图' }),
    })
    if (convert.status !== 201 || !convert.json?.skill?.id) {
      fail('转成草稿玩法', `status=${convert.status} ${convert.text.slice(0, 300)}`)
      return
    }
    const skill = convert.json.skill
    createdSkillIds.push(skill.id)
    pass('转成草稿玩法', `id=${skill.id.slice(0, 14)}… status=${skill.status}`)

    if (skill.status === 'draft') pass('转出的玩法是草稿状态')
    else fail('转出的玩法是草稿状态', `status=${skill.status}`)

    const cfg = skill.draftConfiguration || {}
    if (cfg.runtime?.promptTemplate === '{{subject}}，极简留白，居中构图') pass('提示词写入 runtime')
    else fail('提示词写入 runtime', JSON.stringify(cfg.runtime?.promptTemplate))
    if (cfg.presentation?.coverUrl === '') pass('封面为空时转出仍成功')
    else fail('封面为空时转出仍成功', JSON.stringify(cfg.presentation))

    // 7. 技能包状态变为 converted
    const afterConvert = await api(`/api/admin/ai-skill-packages/${pkg.id}`)
    if (afterConvert.json?.package?.status === 'converted' && afterConvert.json?.package?.convertedSkillId === skill.id) {
      pass('技能包标记为已转换并回填玩法 ID')
    } else {
      fail('技能包标记为已转换并回填玩法 ID', JSON.stringify(afterConvert.json?.package?.status))
    }

    // 8. 已转换的不许被改回 pending
    const revert = await api('/api/admin/ai-skill-packages/bulk', {
      method: 'POST', body: JSON.stringify({ ids: [pkg.id], status: 'pending' }),
    })
    if (revert.json?.updatedIds?.length === 0) pass('已转换的不允许改回未整理')
    else fail('已转换的不允许改回未整理', revert.text.slice(0, 160))

    // 9. 学生端此时看不到（草稿 + 未发布 + 未分配）
    const studentList1 = await api('/api/ai-skills?type=image')
    if (!(studentList1.json?.skills || []).some((item) => item.id === skill.id)) pass('草稿玩法学生端看不到')
    else fail('草稿玩法学生端看不到', '草稿出现在了学生列表里')

    // 10. 未测试不允许发布
    const earlyPublish = await api(`/api/admin/ai-skills/${skill.id}/publish`, { method: 'POST', body: '{}' })
    if (earlyPublish.status >= 400) pass('未测试不允许发布', `status=${earlyPublish.status}`)
    else fail('未测试不允许发布', '没测试也发布成功了')

    // 11. 假测试（不出真图）→ 再发布
    const fakeTest = await api(`/api/admin/ai-skills/${skill.id}/test`, {
      method: 'POST',
      body: JSON.stringify({ values: { subject: '验收用画面', ratio: '1:1', count: '1' }, mock: true }),
    })
    if (fakeTest.status < 400) pass('测试接口可调用', `status=${fakeTest.status}`)
    else fail('测试接口可调用', `status=${fakeTest.status} ${fakeTest.text.slice(0, 200)}`)

    // 12. 标记测试通过 → 发布 → 学生端能看到
    // 注：分配没有独立接口，publishAdminSkill 里对 organization 范围的玩法会自动 ensureAssignment。
    // 所以「发布成功」本身就等于「分配到本机构」，直接断言最终结果更有意义。
    const markTested = await api(`/api/admin/ai-skills/${skill.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ configuration: { ...skill.configuration, runtime: { ...(skill.configuration?.runtime || {}), testedAt: new Date().toISOString() } } }),
    })
    const publish = await api(`/api/admin/ai-skills/${skill.id}/publish`, { method: 'POST', body: '{}' })
    if (publish.status < 400 && publish.json?.skill?.status === 'published') pass('测试通过后可发布', `status=${publish.json.skill.status}`)
    else fail('测试通过后可发布', `status=${publish.status} ${publish.text.slice(0, 200)}`)

    // 13. 发布后学生端「技能玩法」列表能看到这张卡
    const studentList2 = await api('/api/ai-skills?type=image')
    const visible = (studentList2.json?.skills || []).find((item) => item.id === skill.id)
    if (visible) pass('发布后学生端技能玩法出现该卡', `title=${visible.title}`)
    else fail('发布后学生端技能玩法出现该卡', `学生列表里没有，共 ${(studentList2.json?.skills || []).length} 个`)
  } finally {
    // 清理：删玩法 + 删技能包，不留痕
    for (const id of createdSkillIds) {
      await api(`/api/admin/ai-skills/${id}`, { method: 'DELETE' }).catch(() => {})
    }
    if (createdPackageIds.length) {
      await api('/api/admin/ai-skill-packages/bulk', {
        method: 'POST', body: JSON.stringify({ action: 'delete', ids: createdPackageIds }),
      }).catch(() => {})
    }
    console.log('— 已清理本次造的测试数据 —')
  }

  const failed = results.filter((item) => !item.ok)
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('脚本异常：', error?.message || error)
  process.exitCode = 1
})
