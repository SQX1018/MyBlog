import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // GitHub Pages 域名；仓库子目录 /MyBlog 在 astro.config.ts 中配置。
    url: "https://sqx1018.github.io/",
    title: "SQX1018的博客",
    description:
      "SQX1018 的个人博客，记录粒子物理研究、毕业论文进展、文献阅读，以及对 AI 工具与世界的思考。",
    author: "SQX1018",
    ogImage: "default-og.jpg",
    lang: "zh-CN",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: "pagefind",
  },
  // 待填写：添加你的真实社交主页或邮箱，支持 github、mail 等图标。
  // 示例格式：{ name: "github", url: "你的完整 GitHub 主页网址" }
  socials: [],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail",     url: "mailto:?subject=%E5%88%86%E4%BA%AB%E4%B8%80%E7%AF%87%E6%96%87%E7%AB%A0&body=" },
  ],
});
