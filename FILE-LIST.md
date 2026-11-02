# FILE-LIST · 逐文件清单

原项目：`C:\Users\32634\Doubao\chats\2026-10-26\new-chat-3\portfolio-site\`
原入口：`Y-STUDIO.html`（1,105,455 B / 7,257 行，单文件站点）

新项目：`D:\下载\web\web-ready\`
原项目**未做任何修改**，仍在原路径；本目录是独立副本。

---

## 一、纳入项目的文件（7 个）

| # | 原路径 / 原位置 | 新路径 | 类型 | 用途 | 被引用 | 改过路径 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | `Y-STUDIO.html` 全文外壳（第 1–11、2066–2726 行） | `index.html` | HTML | 唯一入口，六章单页 | 是 | 是 | 内联 `<style>`×2 换成 `<link>`；内联 `<script>`×3 换成 `<script src>`；两个位于 `</html>` 之后的脚本移入 `<body>` 末尾 |
| 2 | `Y-STUDIO.html` 第 12–515 行（样式块 1） | `css/tokens.css` | CSS | 配色/字体/间距变量、暗色变量、基底样式 | 是 | 是 | 内容逐字保留（14,990 B / 503 行） |
| 3 | `Y-STUDIO.html` 第 517–2057 行（样式块 2） | `css/site.css` | CSS | 版式与全部组件样式 | 是 | 是 | 内容逐字保留（63,971 B / 1,546 行）；**并回**了原文中误落在样式块外的 4 条规则 |
| 4 | `Y-STUDIO.html` 第 2727–5900 行（脚本 1） | `js/app.js` | JS | 数据读写、六章节渲染、编辑器、搜索、明暗切换 | 是 | 是 | 唯一改动：`BUILTIN_COVER` 由 base64 改为 `assets/images/builtin-cover.jpg`（126,049 B / 3,173 行） |
| 5 | `Y-STUDIO.html` 第 5906–5913 行（脚本 2） | `js/vendor/three.min.js` | JS（第三方） | three.js r160 UMD，MIT | 是 | 是 | 库代码逐字保留；仅剥离与代码同行的 `<script>` 起始标签（669,957 B） |
| 6 | `Y-STUDIO.html` 第 5915–7256 行（脚本 3） | `js/spirit-scene.js` | JS | 漓江三维场景（山/水/雾/月 + 滚动推进） | 是 | 是 | 修复一处 GLSL 报错：`cl` 未声明 → `float cl = smoothstep(0.52, 0.86, c2) * …`（57,606 B / 1,341 行） |
| 7 | `Y-STUDIO.html` 第 4200 行 `data:image/jpeg;base64,…`（116,324 字符） | `assets/images/builtin-cover.jpg` | 图片 | 日志「记一条」的内置视频封面（720×450） | 是 | 是 | base64 解码后 87,241 B；引用处改为相对路径 |

合计：**7 个文件 / 1,076,885 B**（原始单文件 1,105,455 B，差值 = base64 膨胀去掉的部分）

---

## 二、未纳入项目、但已备份的文件（26 个 / 约 16.5 MB）

这些不是运行必需，**没有**放进 `web-ready/`（否则会让交付包从 1 MB 涨到 17 MB）。副本放在 `D:\下载\web\_review\` 下，原目录也原封不动。

| 原路径 | 新路径 | 类型 | 用途 | 被引用 | 备注 |
|---|---|---|---|---|---|
| `_backup\*.html`（19 个） | `_review\backup\` | HTML | 历次改动前的历史快照（before-a11y / before-drawer / before-feat / …） | 否 | 14 MB；仅供回溯，不参与运行 |
| `_shots\*.png` `*.jpg` `report.json`（7 个） | `_review\shots\` | 图片 / JSON | 开发期截图与一次检测报告 | 否 | 2.5 MB |
| `Y-STUDIO.html`（原文件） | `_review\original\Y-STUDIO.original.html` | HTML | 整理前的完整原件，用于比对/回滚 | 否 | 与原件字节一致 |

---

## 三、引用关系一览

```
index.html
├─ css/tokens.css             ← <link>
├─ css/site.css               ← <link>
├─ https://fonts.googleapis.com/css2…   ← 唯一外链（字体，可断网降级）
├─ js/app.js                  ← <script src>
│   └─ assets/images/builtin-cover.jpg  （常量里的相对路径）
├─ js/vendor/three.min.js     ← <script src>（提供全局 THREE）
└─ js/spirit-scene.js         ← <script src>（定义 window.initSpiritScene，用到 THREE）
```

执行顺序：`app.js` → `three.min.js` → `spirit-scene.js`（与原文件一致）。
`app.js` 里没有任何 `THREE` 引用，`spirit-scene.js` 才用；三者都是普通脚本（非 module），无需 `type="module"`，因此 `file://` 下也能跑。

---

## 四、路径修改清单

| 位置 | 原写法 | 新写法 | 原因 |
|---|---|---|---|
| `index.html` head | `<style>…</style>` ×2 | `<link rel="stylesheet" href="css/tokens.css">`、`…/site.css` | 拆分样式 |
| `index.html` body 中 / 末尾 | `<script>…</script>` ×3 | `<script src="js/app.js">`、`js/vendor/three.min.js`、`js/spirit-scene.js` | 拆分脚本 |
| `js/app.js:1474` | `const BUILTIN_COVER = 'data:image/jpeg;base64,…'` | `const BUILTIN_COVER = 'assets/images/builtin-cover.jpg';` | 图片独立；相对 `index.html` 解析，服务器与 `file://` 都成立 |
| `js/spirit-scene.js`（天空着色器） | `cl = smoothstep(0.52, 0.86, cl) * …` | `float cl = smoothstep(0.52, 0.86, c2) * …` | 修 GLSL 编译错误 |
| `css/site.css` 末尾 | — | 追加 4 条 `.cover-*` 规则 | 原本落在样式块外（裸文本），归位 |

**没有改动**的引用：`#posts / #life / #archive / #courses / #notes / #about / #top` 等页内锚点、`href="javascript:void 0"`、Google Fonts 三行——全部原样保留。

---

## 五、大小写与编码检查

- 所有本地引用均为小写文件名，与磁盘实际名称一致（`tokens.css`、`site.css`、`app.js`、`spirit-scene.js`、`three.min.js`、`builtin-cover.jpg`）。
- 所有文本文件均为 **UTF-8 无 BOM**，行尾统一 LF。
- 目录内**无中文文件名**；仅上级路径 `D:\下载\` 含中文（`file://` 下浏览器会自动百分号编码，已实测可用）。
- 无空引用、无重复文件、无失效链接（静态检查见 README 第 8 节与本次交付说明的验证结果）。
