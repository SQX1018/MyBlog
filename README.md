# MyBlog

这是一个基于 **AstroPaper 和 Codex** 构建的个人博客，用来记录学习、生活与个人思考。

[AstroPaper](https://github.com/satnaing/astro-paper) 提供静态博客主题，Codex 协助完成网页设计、中文化和源码修改。项目保留完整源码，使用 Markdown 写作，通过 GitHub Pages 发布，也可以迁移到其他静态网站托管服务。

**访问博客：**[sqx1018.github.io/MyBlog](https://sqx1018.github.io/MyBlog/)

## 功能与设计

- 中文界面，浅色模式使用米白背景、深灰文字与灰色点缀。
- 深色模式使用黑色背景、浅灰文字与蓝色点缀，支持手机、电脑浏览。
- 使用 Markdown / MDX 写文章，支持草稿与分页。
- 支持 LaTeX 公式，使用 `$...$` 写行内公式、`$$...$$` 写独立公式。
- 保留文章列表、标签、按年月归档、RSS 订阅及 Pagefind 搜索。
- 静态输出，通过 GitHub Actions 自动构建并部署到 GitHub Pages。

模板自带的示例文章及附带图片已清空。没有文章时，页面会显示空内容提示；添加自己的文章并重新构建后，文章列表、归档、标签和搜索会随之更新。

## 本地运行

准备 Node.js 24 和 npm，部署流程也使用 Node.js 24。以下命令适用于 Windows PowerShell，在项目目录中运行：

```powershell
npm.cmd install
$env:ASTRO_TELEMETRY_DISABLED = '1'
npm.cmd run dev
```

打开 [http://localhost:4321/MyBlog/](http://localhost:4321/MyBlog/) 预览。若端口被占用，以终端显示的地址为准。保存文件后页面会自动更新，按 `Ctrl+C` 停止服务。

桌面项目也可以通过双击 `启动预览.cmd` 启动。脚本会重启当前项目的预览服务，重新加载源码和开发缓存；修改配色或依赖后若仍看到旧样式，可以双击它，再刷新浏览器。

macOS / Linux 可将命令中的 `npm.cmd` 替换为 `npm`。

## 写文章

在 `src/content/posts/` 中新建 `.md` 或 `.mdx` 文件，例如 `my-first-post.md`：

```markdown
---
title: 我的第一篇文章
pubDatetime: 2026-10-12T08:00:00+08:00
description: 用一句话介绍这篇文章。
tags:
  - 生活
draft: false
---

在这里写正文，支持 Markdown。
```

将标题、发布日期、摘要、标签和正文改为自己的内容。`draft: true` 表示草稿，暂不公开；可添加 `featured: true` 将文章放入首页精选区。文章目录里的 `.gitkeep` 只用于保留空文件夹，不会显示为文章。

新增、修改或删除文章后，运行 `npm.cmd run build` 更新搜索索引。本地开发时，搜索使用最近一次构建的索引。

图片可放在 `public/images/` 下，在文章中用 `![图片说明](/images/文件夹/图片.png)` 引用。路径中有空格时，用尖括号包住路径：`![图片说明](</images/带空格的文件夹/图片.png>)`。构建时会自动添加 GitHub Pages 的 `/MyBlog` 路径前缀。

公式会在构建时通过 KaTeX 排版，样式和字体随网站一起发布，无需加载外部公式服务。

## 修改个人信息和设计

| 位置                                            | 用途                                        |
| ----------------------------------------------- | ------------------------------------------- |
| `astro-paper.config.ts`                         | 博客名称、简介、作者、社交链接及功能开关    |
| `src/content/pages/about.md`                    | 关于页面                                    |
| `src/content/posts/`                            | Markdown / MDX 文章                         |
| `src/styles/`                                   | 字体、配色与样式                            |
| `src/i18n/lang/zh-CN.ts`                        | 中文界面文案                                |
| `src/components/`、`src/layouts/`、`src/pages/` | 组件、布局与页面结构                        |
| `astro.config.ts`                               | Astro 配置与 GitHub Pages 的 `/MyBlog` 路径 |

首页和关于页中的“待填写”内容需要替换为自己的真实信息。

项目中的 [AGENTS.md](AGENTS.md) 记录了供 Codex 参考的项目约定。修改时，可以明确说明想要的效果、需要保留的功能和验证方式，例如：

> 请把首页文章列表改为单列，每篇显示标题、日期和两行摘要，手机上保持易读。保留文章内容和链接，完成后运行 npm.cmd run build 验证。

更详细的本地操作说明见 [开始使用.md](开始使用.md)。

## 构建与预览

```powershell
$env:ASTRO_TELEMETRY_DISABLED = '1'
npm.cmd run build
npm.cmd run preview
```

构建会检查类型、生成 `dist/` 静态网站，并通过 `scripts/build-search.mjs` 调用 Pagefind 官方 Node API，将搜索索引写入 `dist/pagefind/` 和 `public/pagefind/`。更新索引时会清除旧文件，让已删除的文章退出搜索。

运行 `preview` 后，使用终端显示的地址查看构建结果。

## 发布与更新

仓库：[SQX1018/MyBlog](https://github.com/SQX1018/MyBlog)。自动部署配置位于 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。

在 [仓库 Pages 设置](https://github.com/SQX1018/MyBlog/settings/pages) 中，将 **Build and deployment → Source** 设为 **GitHub Actions**。

日常更新流程：

1. 修改文章、个人信息或设计，在本地预览。
2. 运行 `npm.cmd run build` 检查构建。
3. 在 GitHub Desktop 中填写提交说明，点击 **Commit to main**，再点击 **Push origin**。
4. 在 [Actions](https://github.com/SQX1018/MyBlog/actions) 中等待 **Build blog** 和 **Publish blog** 成功，然后查看博客。

推送到 `main` 分支会自动启动部署，也可以在 Actions 的 **Deploy to GitHub Pages** 中使用 **Run workflow** 手动运行。

## 致谢与许可

本项目基于 [Sat Naing](https://github.com/satnaing) 及贡献者开发的 [AstroPaper](https://github.com/satnaing/astro-paper)，使用 Astro、TypeScript、Tailwind CSS 和 Pagefind。

项目沿用 MIT 许可，保留原作者版权声明，详见 [LICENSE](LICENSE)。
