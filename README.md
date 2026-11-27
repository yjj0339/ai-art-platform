# AI 创意美术教学平台 MVP

这是面向学生、教师、家长、学校和校区管理员的 AI 创意美术教学平台。项目将持续迭代，并以“真实可用、数据安全、易用稳定、可部署维护”为优先级。

## 当前范围

- 学生端：AI 绘画、无限画布、AI 视频、AI 3D、课程、作品集、H5 报告。
- 教师端：课程与教学管理。
- 家长端：绑定学生的学习与作品查看。
- 管理员端：账号权限、课程资源、AI 模型与报告模板配置。
- 后端：AI 网关、课程文件和报告配置服务。

当前功能状态以 `docs/项目总览与当前状态.md` 和 `docs/功能基线与回归清单.md` 为准；页面或代码存在不代表已通过用户验收。

## 技术栈

- 前端：Vue 3、Vue Router、Pinia、Element Plus、Vite、SCSS。
- 创作与展示：Fabric.js、Three.js、ECharts、PDF.js、HTML2Canvas、jsPDF、PptxGenJS。
- 后端：Node.js。
- 正式数据目标：PostgreSQL；文件资源使用独立持久化目录。
- 包管理器：pnpm。

## 本地运行

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

常用命令：

```powershell
pnpm dev:web
pnpm dev:server
pnpm build
pnpm preview
```

后端默认运行在 `http://127.0.0.1:3000`。前端通过 `/api` 访问后端；具体前端地址以 Vite 启动输出为准。

### Windows 一键预览

双击项目根目录的 `启动本地预览.cmd`，脚本会自动清理本项目残留进程、后台启动前后端、等待服务就绪并打开学生端预览。关机或异常后重新双击即可恢复；需要停止时双击 `停止本地预览.cmd`。如需登录 Windows 后自动启动，可运行 `设置开机启动预览.cmd`；取消则运行 `取消开机启动预览.cmd`。

## 环境配置

- 前端本地配置使用 `.env.local`，不得提交密钥。
- 后端配置从 `server/.env.example` 复制为 `server/.env`，API Key 只保存在服务端。
- 业务文件数据目录通过 `AI_DATA_DIR` 配置，不能在发布代码时覆盖。

## 项目结构

```text
src/        前端页面、组件、状态和服务
server/     后端接口、鉴权和服务端数据访问
public/     浏览器直接使用的静态资源
scripts/    启动与项目脚本
docs/       当前项目文档、规则、验收和设计资料
```

## 关键文档

- `AGENTS.md`：Codex 强制工作规则和质量门禁。
- `docs/项目总览与当前状态.md`：唯一当前状态入口。
- `docs/功能基线与回归清单.md`：功能验证和回归证据。
- `docs/账号权限与数据隔离规则.md`：多学校、多校区和角色数据隔离规则。
- `docs/已知问题清单.md`：当前故障和解决方案。
- `docs/版本迭代计划.md`：迭代顺序。
- `docs/部署说明.md`：服务器部署和持久化要求。
