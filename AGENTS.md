# 项目说明

这是基于 AstroPaper 的静态个人博客，项目位于 Windows 桌面上的 MyBlog 文件夹。

- 使用 npm：`npm.cmd run dev` 预览，`npm.cmd run build` 检查类型并生成静态网站。
- 文章位于 `src/content/posts/`；关于页位于 `src/content/pages/about.md`。
- 个人信息配置位于 `astro-paper.config.ts`。模板作者、示例文章和链接属于演示内容。
- 保留 MIT 的 LICENSE 文件。修改布局时保留用户文章和文章链接，除非用户要求调整。
- 用户的建设目标是免费长期运营，并自行修改源码；保持静态输出和可迁移结构。
- 本地设计任务完成后验证构建，说明改动和预览方法。是否上传或部署按当前用户请求执行。
- 构建时通过 `scripts/build-search.mjs` 调用 Pagefind 官方 Node API，并用 Node 写入发布和开发用搜索索引，以兼容 Windows。
- 在受限执行环境运行 Astro 前，为当前进程设置 `$env:ASTRO_TELEMETRY_DISABLED = '1'`，避免向项目外的 AppData 写入遥测配置。

## 文章图片

- 图片统一存放在 `C:\Users\HP\Desktop\MyBlog\public\images\`，项目内相对路径为 `public/images/`。可按文章建立子文件夹。
- Markdown 图片地址从 `/images/` 开始，不包含 `public` 或 Windows 本地路径。例如：`![图片说明](/images/LED低温蓝移调研/01_blueshift_direction.png)`。
- 图片路径包含空格时，用尖括号包住地址：`![图片说明](</images/带空格的文件夹/图片.png>)`。
- 构建时会自动为图片地址添加 GitHub Pages 的 `/MyBlog` 前缀，文章中无需手动添加。上述示例的本地预览地址为 `http://127.0.0.1:4321/MyBlog/images/LED低温蓝移调研/01_blueshift_direction.png`，发布后的地址为 `https://sqx1018.github.io/MyBlog/images/LED低温蓝移调研/01_blueshift_direction.png`。
- 接收新文章时，先在 `public/images/` 下查找配图并核对文件名，再修正文章引用；保留已有图片和有效引用。

## 思想观测站设计总结（2026-10-24）

- 在 `feature/cosmic-blue-design` 分支完成“科技、星空、哲学”视觉重设计，保留 AstroPaper 的文章、搜索、归档、RSS、Markdown、公式、标签和深浅色机制。
- 首页名称为“SQX1018的博客”，主标题为“测量宇宙 / 思考世界”，包含作者专业与毕业论文简介；桌面容器约 1120px，主视觉约 480px，手机图形约 200px 高，390×844 首屏可见首篇文章标题。
- `src/components/ThoughtAtlas.astro` 是原创 SVG 主视觉：抽象粒子径迹、交点、探测几何和稀疏星点，仅作艺术表达，不展示虚构实验数据、地理坐标或实时状态。
- `src/components/HeroParticles.astro` 提供首页局部粒子动画和指针扰动；桌面 42 个、手机 22 个粒子。必须继续尊重 `prefers-reduced-motion`，不得影响文字阅读和链接操作。
- `src/styles/observatory.css` 集中维护视觉层；`src/styles/theme.css` 维护双色令牌。深色为 `#05090F`、`#E9F1FA`、`#63B3FF`，浅色为 `#F4F6FA`、`#17212E`、`#2563EB`。
- 文章列表采用编号与细分隔线；文章页使用纯色背景、约 720px 正文列，桌面正文 17px、手机 16px、行高约 1.9。标题使用正文主色，蓝色用于链接和章节标记。
- `public/fonts/` 保存本地 Google Sans Code 字体及许可证。分享图由本地静态字体生成，避免构建时访问 Google Fonts；不要再改回构建期联网下载字体。
- 2026-10-24 验证：14 个页面及搜索索引构建成功，类型检查 0 错误、0 警告、0 提示；桌面与手机、图片、表格、KaTeX、键盘操作、粒子动画、减少动态效果及连续首页—文章主题一致性均通过。
- 验证脚本与截图保存在被忽略的 `work/` 目录。后续设计修改后，应运行 `ASTRO_TELEMETRY_DISABLED=1 npm.cmd run build`，并复查 390×844 首屏和文章阅读布局。
