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
