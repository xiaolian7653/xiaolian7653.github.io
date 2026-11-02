# Y-STUDIO · 执的个人小站

一个纯静态的个人站点：漓江山水为背景（WebGL 实时渲染），文章 / 日志 / 资料库 / 课程 / 笔记 / 关于 六个章节，所有内容存在浏览器本地（localStorage + IndexedDB），不依赖后端。

本目录是「单文件版 Y-STUDIO.html」整理后的结构：HTML、CSS、JS 拆开，路径全部改为相对路径，可直接双击打开，也可用任意静态服务器托管。

---

## 1. 目录结构

```
web-ready/
├─ index.html                 入口页（唯一页面，六章单页滚动）
├─ css/
│  ├─ tokens.css              变量与基底：配色、字体、间距、暗色变量（原内联样式块 1）
│  └─ site.css                版式与全部组件样式（原内联样式块 2）
├─ js/
│  ├─ app.js                  全部应用逻辑：数据读写、六个章节、编辑器、搜索、明暗切换（原内联脚本 1）
│  ├─ spirit-scene.js         漓江三维场景：山、水、雾、月，随滚动推进（原内联脚本 3）
│  └─ vendor/
│     └─ three.min.js         three.js r160（UMD 构建，MIT），供 spirit-scene.js 使用
├─ assets/
│  ├─ images/
│  │  └─ builtin-cover.jpg    日志「记一条」的内置视频封面（原为内联 base64，现独立成文件）
│  └─ fonts/                  预留：字体目录（当前字体走 Google Fonts CDN，见第 5 节）
├─ _unused/                   预留：判定为未引用的文件放这里（当前为空）
├─ _review/                   预留：需要人工确认的文件放这里（当前为空）
├─ README.md                  本文件
└─ FILE-LIST.md               逐文件清单：来源、用途、是否改过路径
```

**技术形态**：原生 HTML/CSS/JS，无框架、无构建步骤、无 npm 依赖。
`three.min.js` 是原文件内联的第三方库，现在独立成文件，没有改一行代码。

---

## 2. 浏览器直接打开（最快）

双击 `index.html`，或用浏览器打开：

```
file:///D:/下载/web/web-ready/index.html
```

- Chrome / Edge：完整可用（本机实测：页面正常、WebGL 场景正常、localStorage 与 IndexedDB 均可用）
- Firefox：页面与动画可用，但 **file:// 下的 IndexedDB 常被禁用**，日志（图片/视频）功能可能存不进去 → 请改用第 3 节的本地服务器
- 手机上通过聊天软件直接打开 HTML 附件时，行为取决于 App 内置浏览器，不保证 IndexedDB 可用

---

## 3. 本地服务器（推荐，接近真实部署）

在本目录下任选一条命令，然后访问 <http://127.0.0.1:8000/>：

```bash
# Python 3（本机已装）
python -m http.server 8000

# 或 Node
npx serve -l 8000

# 或 PHP
php -S 127.0.0.1:8000
```

指定端口后地址就是 `http://127.0.0.1:<端口>/`，不需要加 `index.html`。

> 重要：站点的数据（文章、日志、资料库、课程）按 **origin** 隔离。
> `file://`、`http://127.0.0.1:8000`、`http://localhost:8000`、换个端口，都是**不同的存储空间**，互相看不到对方的数据。
> 如果你之前在单文件版里存过内容，请固定用同一种打开方式，否则会以为「数据没了」。

---

## 4. 是否需要构建

不需要。没有打包、没有编译、没有依赖安装。
上传到任意静态托管（GitHub Pages / Cloudflare Pages / Nginx / 对象存储）时，把 `web-ready/` 里的内容整体上传即可，入口是 `index.html`。

---

## 5. 外部依赖与离线

| 依赖 | 位置 | 说明 |
|---|---|---|
| Google Fonts（Noto Serif SC、JetBrains Mono） | `index.html` 第 9–11 行 | **唯一的外链**。断网或国内网络不稳时会加载失败 |
| three.js r160 | `js/vendor/three.min.js` | 已本地化，不联网 |

字体加载失败时不会报错、也不会白屏，会退回 CSS 里声明的后备字体（思源宋体 / 系统衬线体），排版略变但可用。

**想彻底离线**：把 Google Fonts 的 woff2 下载到 `assets/fonts/`，在 `css/tokens.css` 顶部加 `@font-face`，再删掉 `index.html` 里那三行 `<link>`（`preconnect` ×2 + 样式表）。Noto Serif SC 中文字体按 unicode-range 切成上百个子集，文件较多，非必需不建议做。

---

## 6. 数据与隐私

- 文章 / 日志 / 资料库 / 课程：`localStorage`（键名以 `ystudio` 开头）
- 日志里的图片、视频：`IndexedDB`（数据库 `ystudio-media`），列表里只存 blob 引用
- 明暗偏好、视图模式：`localStorage`
- 没有任何请求发往自己的服务器；唯一的外部请求是 Google Fonts。清理浏览器站点数据 = 清空全部内容，**没有云端备份**，重要内容请用「日志 → 全部导出」定期导出。

---

## 7. 已知问题与注意事项

1. **关于页文案与新结构不一致**（保留原文未改，需你决定）：
   - `index.html` 中「关于」第 2 段仍写着「整个站点是一个 HTML 文件：样式、画山的那段着色器、数据读写，全都写在同一份文档里」
   - 「关于」信息栏 `Files` 一项仍是「1 个 HTML」
   现在实际是 1 个 HTML + 2 个 CSS + 3 个 JS + 1 张图。要改的话只改这两处文案即可。
2. **中文路径**：当前放在 `D:\下载\web\web-ready\`，用 `file://` 打开没问题（浏览器会把中文百分号编码）。但部署到服务器时建议换成纯英文路径，省掉个别工具/旧服务器对非 ASCII 路径的兼容问题。
3. **本地服务器不要用中文目录名之外的怪字符**；端口被占用时换一个（如 8001），换端口等于换 origin，见第 3 节。
4. **移动端**已在 390×844 实测：目录折叠成汉堡按钮，六栏布局正常。
5. `_backup/`、`_shots/` 两个原目录**没有**放进本项目（它们不是运行必需），副本放在 `D:\下载\web\_review\` 下；原目录原封不动保留在 `C:\Users\32634\Doubao\chats\2026-10-26\new-chat-3\portfolio-site\`。

---

## 8. 这次整理做了什么

**拆分**：单个 1.06 MB 的 HTML → 7 个文件（HTML + 2 CSS + 3 JS + 1 图片），总量 1.05 MB。

**修掉的三处结构问题**（都会影响浏览器解析，属于「改结构不改业务」）：

1. 有 4 条 CSS 规则（`.cover-row / .cover-hint / .cover-prev / .cover-prev img`）原本落在 `</style>` 和 `<body>` 之间，成了页面顶部的裸文本 → 已并回 `css/site.css` 末尾。
2. 原始文件里有 2 个 `<script>` 位于 `</html>` 之后（three.js 与三维场景），HTML 不合法 → 已移入 `<body>` 末尾，**保持原有执行顺序**（app → three → scene）。
3. three.js 脚本块的起始标签与库代码在同一行，拆分时已剥离标签，避免 JS 里出现 `<script>` 造成语法错误。

**修掉的一处运行时报错**：
天空着色器里 `cl` 变量未声明就参与赋值（`cl = smoothstep(0.52, 0.86, cl) * ...`），导致 `THREE.WebGLProgram: Fragment shader is not compiled`。已改为 `float cl = smoothstep(0.52, 0.86, c2) * ...`，保留原本想要的「第二层卷云」效果。**修复后控制台无报错。**

**路径处理**：内联 base64 封面 → `assets/images/builtin-cover.jpg`，`app.js` 里的常量改为相对路径 `assets/images/builtin-cover.jpg`；其余资源原本就没有外部本地引用（无 `url()`、无 `<img src>` 静态引用、无 `fetch` 本地文件），因此没有别的路径需要改。
