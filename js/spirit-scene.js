/* Y-STUDIO · 漓江神道三维场景（原 index 内联脚本 3，且位于文档结束之后）*/

function initSpiritScene(host) {
  "use strict";

  /* ──────────────────────────────────────────────────────────────
     0 · 总配置：先看这里，所有构图数字都在这一块
     ────────────────────────────────────────────────────────────── */
  const CFG = {
    fov: 30,                  // 长焦：把空间压住
    near: 0.4,
    far: 6200,
    camStart: { x: 0.0, y: 1.52, z: 36 },
    camEndZ: -250,            // 推进到陵台前停下
    pitch: 0.046,             // 抬一点，让陵台顶压过地平线
    lookY: 4.2,

    scrollPx: 4200,           // 滚多少像素走完全程
    dollyDamp: 2.6,           // 前进阻尼（越小越“重”）
    parallaxX: 2.35,          // 鼠标横向带来的位移（米）
    parallaxY: 0.42,
    yawAmount: 0.020,
    parallaxDamp: 2.1,

    fogNear: 130,
    fogFar: 2150,
    mistFade: 0.80,           // 山脚雾（越小山脚越早化掉）

    waterX: 2.6,              // 水面从这条线往右

    sunDir: [-0.52, 0.26, -0.82]   // 右前方偏低的斜阳
  };

  const PAL = {
    skyTop:   [0.788, 0.827, 0.800],
    skyMid:   [0.898, 0.906, 0.862],
    skyLow:   [0.949, 0.941, 0.902],
    sun:      [1.000, 0.976, 0.906],
    fog:      [0.902, 0.914, 0.874],
    water:    [0.240, 0.325, 0.322],
    waterDeep:[0.148, 0.226, 0.230],
    rockNear: [0.112, 0.168, 0.142],
    rockMid:  [0.214, 0.286, 0.246],
    rockFar:  [0.639, 0.702, 0.667],
    veg:      [0.176, 0.232, 0.156],
    stone:    [0.690, 0.678, 0.616],
    path:     [0.737, 0.722, 0.655],
    reed:     [0.494, 0.510, 0.396]
  };

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ──────────────────────────────────────────────────────────────
     1 · 基座：渲染器 / 相机 / 时钟
     ────────────────────────────────────────────────────────────── */
  let canvas = host.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "spirit-canvas";
    host.appendChild(canvas);
  }
  const VW = () => Math.max(1, host.clientWidth);
  const VH = () => Math.max(1, host.clientHeight);
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: "high-performance", alpha: false
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(VW(), VH(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(PAL.skyLow[0], PAL.skyLow[1], PAL.skyLow[2], THREE.SRGBColorSpace);

  const camera = new THREE.PerspectiveCamera(CFG.fov, VW() / VH(), CFG.near, CFG.far);
  camera.position.set(CFG.camStart.x, CFG.camStart.y, CFG.camStart.z);
  camera.rotation.order = "YXZ";

  const clock = new THREE.Clock();

  /* 小工具 */
  const rnd = (() => { let s = 20261031; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
  const rr = (a, b) => a + (b - a) * rnd();
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const c3 = (a) => new THREE.Color().setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);

  /* ──────────────────────────────────────────────────────────────
     2 · 天空：一整屏的渐变 + 一枚被雾化开的日轮
     ────────────────────────────────────────────────────────────── */
  const skyUniforms = {
    uTop:   { value: c3(PAL.skyTop) },
    uMid:   { value: c3(PAL.skyMid) },
    uLow:   { value: c3(PAL.skyLow) },
    uSun:   { value: c3(PAL.sun) },
    uSunDir:{ value: v3(CFG.sunDir).normalize() },
    uTime:  { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      depthTest: false, depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uTop, uMid, uLow, uSun, uSunDir;
        uniform float uTime;
        varying vec2 vUv;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p){
          float a = .5, s = 0.0;
          for(int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.02; a *= .5; }
          return s;
        }

        void main(){
          float y = vUv.y;
          vec3 col = mix(uLow, uMid, smoothstep(0.30, 0.62, y));
          col = mix(col, uTop, smoothstep(0.58, 1.0, y));

          // 日轮：压在右上，被雾吃掉边
          vec2 sp = vUv - vec2(0.685, 0.545);
          sp.x *= 1.75;
          float d = length(sp);
          float glow = smoothstep(0.42, 0.0, d);
          col = mix(col, uSun, glow * 0.55);
          float core = smoothstep(0.085, 0.020, d);
          col = mix(col, vec3(1.0, 0.985, 0.945), core * 0.72);

          // 陵台后方的暖光（逆光的落点）
          vec2 gp = vUv - vec2(0.50, 0.335);
          gp.x *= 2.1;
          float glow2 = smoothstep(0.46, 0.0, length(gp));
          col = mix(col, vec3(1.0, 0.972, 0.902), glow2 * 0.30);

          // 斜阳在地平线上方拉一条暖带
          float warm = smoothstep(0.42, 0.30, y) * smoothstep(0.05, 0.26, y);
          float side = smoothstep(0.15, 0.95, vUv.x);
          col = mix(col, vec3(0.996, 0.958, 0.878), warm * side * 0.42);

          // 卷云：两层，各自往不同方向漂，越靠地平线越被压薄
          vec2 cp = vec2(vUv.x * 3.2 + uTime * 0.004, vUv.y * 6.4 - uTime * 0.002);
          float c1 = fbm(cp);
          float c2 = fbm(vec2(vUv.x * 7.5 - uTime * 0.009, vUv.y * 14.0 + uTime * 0.003));
          float cirrus = smoothstep(0.60, 0.94, c1 * 0.66 + c2 * 0.34);
          cirrus *= smoothstep(0.20, 0.62, y) * (1.0 - smoothstep(0.80, 1.0, y));
          col = mix(col, vec3(0.988, 0.980, 0.952), cirrus * 0.38);
          float cl = smoothstep(0.52, 0.86, c2) * smoothstep(0.34, 0.95, y) * 0.20;
          col = mix(col, vec3(0.988, 0.984, 0.958), cl);

          // 地平线附近再压一层暖雾，让远山有“落”的地方
          col = mix(col, uLow * 1.02, smoothstep(0.34, 0.02, y) * 0.55);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  /* ──────────────────────────────────────────────────────────────
     3 · 峰林：喀斯特石峰的生成与材质
     ────────────────────────────────────────────────────────────── */

  // 单位高度 1、半径 ~1 的石峰：竖壁、微鼓、圆顶，带不规则起伏
  function karstGeometry(seed, radial = 84, rings = 58, topBias = 0, wide = 0) {
    const r = (() => { let s = seed * 9301 + 49297; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
    // 大尺度轮廓：几处外凸/内凹，让山体不是正圆
    const lobes = [];
    const lobeN = 3 + Math.floor(r() * 3);
    for (let i = 0; i < lobeN; i++) lobes.push({ a: r() * 6.283, w: rr0(2.4, 4.6, r), amp: rr0(0.12, 0.26, r) });
    const lean = rr0(-0.15, 0.15, r);
    const summit = { x: rr0(-0.18, 0.18, r), z: rr0(-0.18, 0.18, r) };

    // 溶蚀竖沟：主沟 + 次沟，随高度缓慢倾斜（真石的沟是一路下来的，不是直桶）
    const fluteF = 9 + Math.floor(r() * 7);        // 主沟条数（9-15）
    const fluteF2 = 21 + Math.floor(r() * 13);     // 次沟条数
    const drift = rr0(-1.5, 1.5, r);               // 沟槽随高度的旋转量
    const flutePh = r() * 6.283;

    const topStyle = r();                          // 0 圆顶 → 1 尖顶
    const topP = 2.55 - 1.35 * topStyle;
    const topQ = (0.60 + 0.30 * topStyle) * (1.0 - 0.32 * wide);
    const tTop = Math.min(0.885, Math.max(0.55, 0.72 + 0.15 * r() + topBias + 0.055 * wide));

    // 双峰：约一半的山有一个副峰，副峰偏在一侧、矮 20-40%
    const twin = r() < 0.72
      ? { a: r() * 6.283, h: rr0(0.60, 0.84, r), w: rr0(0.40, 0.95, r) }
      : null;
    // 侧壁台阶（层理/崩塌面）
    const shelf = r() < 0.55 ? rr0(0.36, 0.62, r) : 0;
    // 山脚溶蚀内收（喀斯特塔的“细脚”）
    const under = rr0(0.08, 0.19, r) * (1.0 - 0.55 * wide);

    const pos = [], nor = [], col = [], idx = [];
    const cBase = c3(PAL.rockNear), cTop = c3(PAL.rockMid);

    for (let j = 0; j <= rings; j++) {
      const u = j / rings;                          // 均匀参数
      // 前 62% 的 ring 铺到下段，剩下 38% 全给收顶，收顶段才够圆
      const tMid = 0.62;
      const t0 = 0.10;                              // 收顶段起点（相对 tTa 往下 0.10）
      const uSplit = tMid;
      // 先按均匀 t 估一个 tTa，用来切分（tTa 每角度不同，切割线也跟着变，网格仍是四边面）
      for (let i = 0; i < radial; i++) {
        const a = (i / radial) * Math.PI * 2;

        // 这个角度的高度线：既决定双峰，也决定 ring 的分布
        let tTa = tTop
          + 0.045 * Math.sin(a * 2.0 + seed * 3.1)
          + 0.026 * Math.sin(a * 3.4 - seed * 1.7);
        if (twin) {
          const d = Math.abs(Math.atan2(Math.sin(a - twin.a), Math.cos(a - twin.a)));
          const g = Math.exp(-(d * d) / (2 * twin.w * twin.w * 0.16));
          tTa = tTa + (Math.min(0.930, twin.h + 0.10) - tTa) * g;
        }
        tTa = Math.min(0.945, Math.max(0.42, tTa));   // 不能让高度线越过 1，否则顶上是一个平口管子

        // 收顶段起点压到 tTa-0.10，剩下的 ring 全给收顶（顶才不会被平均成平顶）
        const cut = Math.max(0.15, tTa - 0.10);
        const t = u <= 0.62
          ? (u / 0.62) * cut
          : cut + ((u - 0.62) / 0.38) * (1 - cut);

        // 侧壁剖面：山脚碎石外撇 → 溶蚀内收 → 下段外鼓 → 中段近直 → 顶部收圆
        const rubble = 0.085 * smoothstepJS(0.085, 0.0, t);
        const undercut = -under * smoothstepJS(0.20, 0.04, t);
        const bulge = 0.050 * smoothstepJS(0.04, 0.26, t) * (1 - smoothstepJS(0.52, 0.88, t));
        const shoulder = 0.032 * Math.sin(Math.PI * smoothstepJS(0.54, 0.84, t));
        const waist = -0.022 * Math.sin(Math.PI * Math.min(1, t * 1.02));
        let prof = 1.0 + rubble + undercut + bulge + shoulder + waist;
        if (shelf) {
          const dsh = (t - shelf) / 0.075;
          prof += 0.030 * Math.exp(-dsh * dsh);
        }
        prof = Math.max(prof, 0.004);

        let bump = 0;
        for (const L of lobes) {
          const d = Math.abs(Math.atan2(Math.sin(a - L.a), Math.cos(a - L.a)));
          bump += L.amp * Math.cos(d * L.w);
        }

        // 悬挑：快到顶的那一圈往外翻出去，翻出去的方位随角度变，翻完立刻收
        // 悬挑只在“到顶之前”鼓出去，收顶段绝不参与，否则会在顶上压出一块平板
        const overBand = smoothstepJS(tTa - 0.165, tTa - 0.085, t)
                       * (1.0 - smoothstepJS(tTa - 0.070, tTa - 0.012, t));
        const overAmt = 0.058 * (1.0 - 0.55 * wide) * overBand * (0.55 + 0.45 * Math.sin(a * (2.0 + (seed % 3)) + seed * 1.3));
        const lip = 1.0 + 0.018 * smoothstepJS(tTa - 0.13, tTa - 0.03, t)
                            * (1.0 - smoothstepJS(tTa - 0.02, tTa + 0.05, t))
                      + overAmt;
        const uu = Math.min(1.0, Math.max(0.0, (t - tTa) / Math.max(0.02, 1 - tTa)));
        const crown = lip * (t <= tTa ? 1.0 : Math.pow(1.0 - uu, topQ));

        // 溶蚀沟槽：一路下来、越往上越浅但不断；用 |sin| 造出有棱的竖槽
        const ph = a * fluteF * 0.5 + flutePh + drift * t;
        const groove = Math.pow(Math.abs(Math.sin(ph)), 0.62);
        const flute = -0.084 * groove * (0.40 + 0.80 * (1.0 - t * 0.38));
        const flute2 = -0.026 * Math.pow(Math.abs(Math.sin(a * fluteF2 * 0.5 - seed * 2.3 + 1.6 * t)), 0.7);

        const cragAmt = 0.046 * (0.55 + 0.85 * t * t);
        const crag = cragAmt * Math.sin(a * (2.0 + (seed % 5)) + 1.7 * t)
                   + 0.028 * Math.sin(a * (5.0 + (seed % 7)) - 0.9 * t)
                   + 0.014 * Math.sin(a * (9.0 + (seed % 11)) + 3.1 * t);

        const rad = prof * crown * (1 + bump + flute + flute2 + crag);
        const x = Math.cos(a) * rad + lean * t * t + summit.x * Math.pow(t, 2.6);
        const z = Math.sin(a) * rad + summit.z * Math.pow(t, 2.6);
        pos.push(x, t * (0.985 + 0.030 * Math.sin(a * 2.0 + seed * 3.1)), z);

        // 法线：近似外向 + 顶面朝上（细节法线交给 computeVertexNormals 补）
        const up = Math.pow(t, 4.5);
        let nx = Math.cos(a), nz = Math.sin(a);
        const ny = up * 2.6 - 0.14 * (1 - t);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / nl, ny / nl, nz / nl);

        // 顶点色：下湿上干，沟槽里更暗，顶上带草
        const wet = 0.58 + 0.42 * Math.pow(1 - t, 0.8);
        const underLip = smoothstepJS(tTa - 0.105, tTa - 0.030, t)
                       * (1.0 - smoothstepJS(tTa - 0.016, tTa + 0.014, t));
        const tuft = 0.5 + 0.5 * Math.sin(a * (3.0 + (seed % 6)) + seed * 2.1);
        const veg = smoothstepJS(0.74, 1.0, t) * (0.30 + 0.55 * tuft);
        const apron = smoothstepJS(0.075, 0.0, t);      // 山脚植被坡
        const streak = 0.88 + 0.24 * r();
        const shade = (1.0 - 0.60 * groove)
                    * (0.92 + 0.08 * Math.min(1.0, t * 2.2))
                    * (1.0 - 0.20 * underLip);   // 沟底压暗 + 山脚压一层 + 悬挑下压一层
        const cr = cBase.r * wet * streak * shade;
        const cg = cBase.g * wet * streak * shade;
        const cb = cBase.b * wet * streak * shade;
        const tt = Math.pow(t, 0.85);
        let vr = lerp(cr, cTop.r, tt) * (1 - veg) + PAL.veg[0] * veg;
        let vg = lerp(cg, cTop.g, tt) * (1 - veg) + PAL.veg[1] * veg;
        let vb = lerp(cb, cTop.b, tt) * (1 - veg) + PAL.veg[2] * veg;
        // 山脚压一层暗绿，让山像是从灌木里长出来的
        vr = lerp(vr, PAL.veg[0] * 0.62, apron * 0.85);
        vg = lerp(vg, PAL.veg[1] * 0.66, apron * 0.85);
        vb = lerp(vb, PAL.veg[2] * 0.60, apron * 0.85);
        col.push(vr, vg, vb);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < radial; i++) {
        const a = j * radial + i;
        const b = j * radial + ((i + 1) % radial);
        const c = (j + 1) * radial + i;
        const d = (j + 1) * radial + ((i + 1) % radial);
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();   // 让竖沟真的有起伏（手算法线太光滑，山像塑料）
    g.computeBoundingSphere();
    return g;
  }
  function rr0(a, b, r) { return a + (b - a) * r(); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstepJS(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // 山的材质：高度雾 + 竖向皴理 + 逆光边缘
  function peakMaterial(opts) {
    const o = Object.assign({ tint: 1.0, vegMix: 1.0, mirror: 0, fogNear: CFG.fogNear, fogFar: CFG.fogFar }, opts);
    return new THREE.ShaderMaterial({
      uniforms: {
        uFog:       { value: c3(PAL.fog) },
        uFogNear:   { value: o.fogNear },
        uFogFar:    { value: o.fogFar },
        uMist:      { value: CFG.mistFade },
        uTint:      { value: o.tint },
        uVegMix:    { value: o.vegMix },
        uMirror:    { value: o.mirror },
        uSunDir:    { value: v3(CFG.sunDir).normalize() },
        uSunCol:    { value: c3(PAL.sun) },
        uTime:      { value: 0 },
        uCamZ:      { value: 0 },
        uWaterY:    { value: 0.0 }
      },
      vertexColors: true,
      transparent: !!o.mirror,
      side: o.mirror ? THREE.DoubleSide : THREE.FrontSide,
      vertexShader: `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying vec3 vColor;
        varying float vDepth;
        varying float vLocalY;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vLocalY = position.y;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vColor = color;
          vec4 mv = viewMatrix * wp;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uFog, uSunCol, uSunDir;
        uniform float uFogNear, uFogFar, uMist, uTint, uVegMix, uMirror, uTime, uCamZ, uWaterY;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying vec3 vColor;
        varying float vDepth;
        varying float vLocalY;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main(){
          vec3 n = normalize(vNormalW);
          vec3 sunDir = normalize(uSunDir);
          float ndl = clamp(dot(n, sunDir), 0.0, 1.0);
          float wrap = clamp(dot(n, sunDir) * 0.5 + 0.5, 0.0, 1.0);

          vec3 base = vColor * uTint;

          // 竖向皴理：沿高度拉长的高频噪，模拟石壁上的水痕
          float streak = noise(vec2(vWorld.x * 2.6 + vWorld.z * 2.2, vWorld.y * 0.55));
          float streak2 = noise(vec2(vWorld.x * 7.4 + vWorld.z * 6.1, vWorld.y * 1.9));
          float groove = noise(vec2(vWorld.x * 0.34 + vWorld.z * 0.29, vWorld.y * 0.035));
          float groove2 = noise(vec2(vWorld.x * 0.85 + vWorld.z * 0.71, vWorld.y * 0.06));
          base *= 0.90 + 0.14 * streak + 0.05 * streak2;
          base *= 0.78 + 0.34 * groove;
          base *= 0.94 + 0.10 * groove2;

          // 墨色：上淡下浓，光只做很弱的乘法（不要塑料高光）
          float vert = smoothstep(0.02, 0.98, vLocalY);
          vec3 col = base * (0.66 + 0.34 * vert) * (0.86 + 0.22 * wrap);
          col += uSunCol * pow(ndl, 3.0) * 0.04;
          col = mix(col, col * vec3(0.88, 0.95, 1.07), 1.0 - wrap);

          // 边缘提亮：把山脊勾出来
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.5);
          col += uSunCol * fres * wrap * 0.14;

          // 距离雾
          float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
          f = pow(f, 1.18);

          // 山脚雾：越低越化开（桂林的关键）
          float hFade = smoothstep(0.0, 0.34, vLocalY);
          float patchy = 0.62 + 0.55 * noise(vec2(vWorld.x * 0.0055, vWorld.z * 0.0055 + uTime * 0.012));
          float mist = (1.0 - hFade) * uMist * 1.12 * patchy;

          col = mix(col, uFog, clamp(f + mist * (1.0 - f * 0.5), 0.0, 1.0));

          if (uMirror > 0.5) {
            float wob = sin(vWorld.x * 0.55 + uTime * 0.55) * 0.05 + sin(vWorld.z * 0.31 - uTime * 0.42) * 0.04;
            // 横向水纹：越靠外越碎，倒影被切成一条条
            float r1 = noise(vec2(vWorld.x * 0.10, vWorld.z * 1.30 - uTime * 0.16));
            float r2 = noise(vec2(vWorld.x * 0.34, vWorld.z * 4.10 - uTime * 0.30));
            float band = smoothstep(0.34, 0.82, r1 * 0.7 + r2 * 0.3);
            col = mix(col * vec3(0.88, 0.95, 1.0), uFog, 0.30 + max(0.0, -wob) * 1.4 + band * 0.18);
            float a = (0.52 + 0.30 * band) * (1.0 - clamp(vDepth / 3400.0, 0.0, 1.0));
            gl_FragColor = vec4(col, a);
            return;
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
  }

  const peakMats = {
    near: peakMaterial({ tint: 1.00, vegMix: 1.00 }),
    mid:  peakMaterial({ tint: 1.86, vegMix: 0.74, fogNear: 260, fogFar: 3000 }),
    far:  peakMaterial({ tint: 3.30, vegMix: 0.40, fogNear: 520, fogFar: 4200 }),
    far2: peakMaterial({ tint: 5.10, vegMix: 0.16, fogNear: 900, fogFar: 5600 })
  };
  const mirrorMat = peakMaterial({ tint: 1.30, vegMix: 0.50, mirror: 1, fogNear: 1400, fogFar: 7200 });

  let peakIdx = 0;
  const peaks = [];           // {mesh, mirror}
  const peakMatList = [];

  function addPeak(x, z, height, radius, band, rotY) {
    const slim = height / Math.max(1e-3, radius);
    const wide = Math.min(1, Math.max(0, (1.62 - slim) / 0.72));
    const geo = karstGeometry(Math.floor(rnd() * 9999) + 1, 66, 46, (peakIdx++ % 4 - 1.5) * 0.052, wide);
    const mat = peakMats[band] || peakMats.mid;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.scale.set(radius, height, radius * rr(0.82, 1.18));
    mesh.rotation.y = rotY != null ? rotY : rr(0, 6.28);
    scene.add(mesh);
    peaks.push(mesh);

    // 临水的山才有倒影
    if (x > CFG.waterX + 6 && band !== "far2") {
      const m = new THREE.Mesh(geo, mirrorMat);
      m.position.set(x, 0, z);
      m.scale.set(radius, -height * 0.96, radius * mesh.scale.z / radius);
      m.rotation.y = mesh.rotation.y;
      m.renderOrder = 1;
      scene.add(m);
      peaks.push(m);
    }
    peakMatList.push(mat);
    return mesh;
  }

  /* 山的落位：长焦下所有山都退远，靠“几重门”拉纵深 */
  const PEAK_PLAN = [
    // ① 主峰（右）：高、近，压住画面
    { x:  138, z: -880, h: 268, r: 52, b: "near", kids: [[-46, 74, 0.40]] },
    // ② 左侧配峰：矮一些、远一些
    { x: -118, z: -1040, h: 158, r: 44, b: "near", kids: [[38, 72, 0.44]] },
    // ③ 馒头山（宽矮），破开竖向节奏
    { x: -300, z: -820, h: 108, r: 78, b: "mid", kids: [] },
    { x:  392, z: -1140, h: 124, r: 86, b: "mid", kids: [] },
    // ④ 中景塔群：两两相叠
    { x:  -26, z: -1460, h: 246, r: 56, b: "mid", kids: [[64, 110, 0.42]] },
    { x:  236, z: -1620, h: 208, r: 48, b: "mid", kids: [[-58, 96, 0.40]] },
    { x: -470, z: -1520, h: 176, r: 44, b: "mid", kids: [] },
    // ⑤ 远峰：一层淡影
    { x:  560, z: -2100, h: 300, r: 66, b: "far", kids: [[-70, 120, 0.36]] },
    { x: -640, z: -2260, h: 268, r: 60, b: "far", kids: [[56, 104, 0.34]] },
    { x:   40, z: -2400, h: 292, r: 62, b: "far", kids: [] },
    // ⑥ 天际线
    { x: -340, z: -3400, h: 420, r: 96, b: "far2", kids: [[90, 170, 0.32]] },
    { x:  420, z: -3600, h: 440, r: 100, b: "far2", kids: [[-86, 180, 0.30]] },
    { x: 1100, z: -3400, h: 360, r: 88, b: "far2", kids: [] },
    { x: -1120, z: -3600, h: 390, r: 92, b: "far2", kids: [] }
  ];
  function addCluster(p) {
    addPeak(p.x, p.z, p.h, p.r, p.b);
    (p.kids || []).forEach(k => addPeak(p.x + k[0], p.z + k[1], p.h * k[2], p.r * (0.55 + k[2] * 0.5), p.b));
  }
  PEAK_PLAN.forEach(addCluster);

  // 散落的中景峰，让两侧不空（避开神道正前方）
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -700 - rnd() * 1500;
    const x = side * (200 + rnd() * 620);
    addPeak(x, z, 90 + rnd() * 150, 20 + rnd() * 26, z < -1800 ? "far2" : "far");
  }

  /* ── 地面 / 水面 / 神道 ─────────────────────────────────── */
  // 陆地：只铺左岸（水面从 waterX 开始）
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      uFog: { value: c3(PAL.fog) },
      uNear: { value: c3([0.520, 0.556, 0.470]) },
      uFar:  { value: c3([0.704, 0.730, 0.660]) },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec3 vWorld; varying float vDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFog, uNear, uFar; uniform float uTime;
      varying vec3 vWorld; varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
      }
      float fbm(vec2 p){ float a=.5,s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 col = mix(uNear, uFar, clamp(noise(vWorld.xz * 0.012), 0.0, 1.0));
        float n = fbm(vWorld.xz * 0.09) * 0.55 + noise(vWorld.xz * 0.5) * 0.45;
        col *= 0.86 + 0.28 * n;
        // 靠近神道的草更亮一些，远处压暗成一体
        float edge = smoothstep(34.0, 5.0, abs(vWorld.x));
        col = mix(col, col * 1.10, edge);
        float f = clamp((vDepth - 60.0) / 1400.0, 0.0, 1.0);
        col = mix(col, uFog, pow(f, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 4200, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-377.4, -0.02, -1200);
  scene.add(ground);

  // 水面：从 waterX 向右，半透明让倒影透出来
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uFog:   { value: c3(PAL.fog) },
      uDeep:  { value: c3(PAL.waterDeep) },
      uShal:  { value: c3(PAL.water) },
      uSky:   { value: c3(PAL.skyLow) },
      uSun:   { value: c3(PAL.sun) },
      uTime:  { value: 0 },
      uOpacity: { value: 0.64 },
      uShore:   { value: 2.6 }
    },
    transparent: true, depthWrite: false,
    vertexShader: `
      varying vec3 vWorld; varying float vDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFog, uDeep, uShal, uSky, uSun;
      uniform float uTime, uOpacity, uShore;
      varying vec3 vWorld; varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
      }
      void main(){
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);

        // 风纹：极扁的噪（x 频率低、z 频率高），慢慢往下游漂
        float w1 = noise(vec2(vWorld.x * 0.07, vWorld.z * 0.85 - uTime * 0.07));
        float w2 = noise(vec2(vWorld.x * 0.26, vWorld.z * 2.60 - uTime * 0.13));
        float w3 = noise(vec2(vWorld.x * 0.90, vWorld.z * 8.00 - uTime * 0.26));
        float ripple = w1 * 0.55 + w2 * 0.30 + w3 * 0.15;
        float band = smoothstep(0.52, 0.94, ripple);      // 一条条横向的亮痕

        vec3 col = mix(uDeep, uShal, 0.16 + 0.46 * ripple);       // 水体压暗
        col = mix(col, uSky, fres * 0.46);
        col += uSun * pow(ripple, 9.0) * 0.22;
        col += uFog * band * 0.04;
        col = mix(col, uFog * 0.92, 0.08 + 0.14 * (1.0 - ripple));

        // 江心一道朝镜头的反光：贴右岸的一条水带被光打亮，越近越实
        float pathX = smoothstep(8.0, 22.0, vWorld.x) * (1.0 - smoothstep(30.0, 96.0, vWorld.x));
        float pathZ = smoothstep(-1500.0, -260.0, vWorld.z);
        float glit  = 0.5 + 0.5 * sin(vWorld.z * 0.23 + w3 * 6.2831);
        float path  = pathX * pathZ * (0.30 + 0.70 * glit) * smoothstep(0.30, 0.82, ripple);
        col = mix(col, uSky * 1.08 + uSun * 0.10, clamp(path * 0.52, 0.0, 0.58));

        float f = clamp((vDepth - 520.0) / 2600.0, 0.0, 1.0);
        col = mix(col, uFog, pow(f, 0.80));

        // 岸线：不是一条直缝，随 z 起伏；近岸是浅水，颜色更沉、透明度更低
        float sn = noise(vec2(vWorld.z * 0.17, 7.3)) * 0.95 + noise(vec2(vWorld.z * 0.85, 2.1)) * 0.40;
        float shoreX = uShore + sn * 0.62;
        float shoreFade = smoothstep(shoreX, shoreX + 0.95, vWorld.x);
        col = mix(col * 0.82, col, shoreFade);
        // 亮痕处 alpha 低一点：倒影从缝里透出来
        gl_FragColor = vec4(col, uOpacity * (1.0 - 0.55 * f) * (0.86 + 0.18 * band) * (0.86 + 0.14 * shoreFade));
      }
    `
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 4200, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(CFG.waterX + 800, 0.0, -1200);
  water.renderOrder = 2;
  scene.add(water);

  // 青石神道：石板缝 + 苔痕 + 边缘吃进草里
  const pathMat = new THREE.ShaderMaterial({
    uniforms: {
      uFog:   { value: c3(PAL.fog) },
      uStone: { value: c3([0.588, 0.578, 0.520]) },
      uMoss:  { value: c3([0.430, 0.480, 0.372]) },
      uTime:  { value: 0 }
    },
    vertexShader: `
      varying vec3 vWorld; varying float vDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFog, uStone, uMoss; uniform float uTime;
      varying vec3 vWorld; varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
      }
      float fbm(vec2 p){ float a=.5,s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
      void main(){
        float z = vWorld.z;
        float x = vWorld.x;

        float rowH = 1.42;
        float row = floor(z / rowH);
        float rz = fract(z / rowH);
        float off = mod(row, 2.0) * 0.5;
        float colW = 1.06;
        float cx = (x + off * colW) / colW;
        float colId = floor(cx);
        float rx = fract(cx);

        float jz = smoothstep(0.0, 0.035, rz) * smoothstep(1.0, 0.965, rz);
        float jx = smoothstep(0.0, 0.030, rx) * smoothstep(1.0, 0.970, rx);
        float joint = min(jz, jx);

        float grain = fbm(vec2(x * 1.6, z * 1.1));
        vec3 col = uStone * (0.88 + 0.26 * grain);
        col *= 0.94 + 0.08 * joint;

        float crack = 1.0 - joint;
        col = mix(col, uMoss, clamp(crack * 0.78, 0.0, 0.9));
        col *= 1.0 - crack * 0.22;

        // 碎板：整条路里约 16% 的石板裂成两块、或缺一角
        float cid = hash(vec2(row * 1.7 + 0.3, colId * 3.1 + 0.7));
        float broken = step(cid, 0.16);
        float cut = 0.30 + 0.40 * hash(vec2(row * 5.3, colId * 2.9));
        float crackLine = broken * (1.0 - smoothstep(0.0, 0.018, abs(rx - cut)));
        col *= 1.0 - 0.58 * crackLine;
        col = mix(col, uMoss * 0.74, crackLine * 0.55);
        float chip = broken * step(0.70, rx) * step(rz, 0.26);   // 右下缺一角
        col *= 1.0 - 0.34 * chip;
        col = mix(col, uMoss * 0.80, chip * 0.45);

        // 板缝里的水光：偶尔亮一下
        col += vec3(0.05) * crack * pow(noise(vec2(z * 0.4, uTime * 0.1)), 3.0);

        // 近景湿痕：靠近相机那一段石板是潮的，缝更深、面更暗、有一道顺光的薄亮
        float near = smoothstep(52.0, 5.0, vDepth);
        float wet = fbm(vec2(x * 0.62, z * 0.34)) * 0.6 + fbm(vec2(x * 2.1, z * 1.15)) * 0.4;
        float dampness = smoothstep(0.46, 0.86, wet) * near;
        col *= 1.0 - 0.26 * dampness;                       // 潮处压暗
        col *= 1.0 - 0.30 * crack * near;                    // 近处板缝更深
        float sheen = pow(clamp(1.0 - abs(fract((x * 0.5 + z * 0.06)) - 0.5) * 2.0, 0.0, 1.0), 6.0);
        col += vec3(0.055, 0.058, 0.050) * sheen * near * (0.35 + 0.65 * dampness);

        // 两侧被草吃掉
        float edge = smoothstep(2.25, 1.55, abs(x));
        col = mix(uMoss * 0.88, col, edge);

        float f = clamp((vDepth - 40.0) / 1600.0, 0.0, 1.0);
        col = mix(col, uFog, pow(f, 1.05));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1200, 1, 1), pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.015, -540);
  scene.add(path);

  /* ── 陵台 / 石像生 / 石灯 ─────────────────────────────────── */
  const stoneCol = c3([0.470, 0.478, 0.452]);
  const stoneMat = new THREE.ShaderMaterial({
    uniforms: {
      uFog: { value: c3(PAL.fog) },
      uCol: { value: stoneCol },
      uSun: { value: c3(PAL.sun) },
      uSunDir: { value: v3(CFG.sunDir).normalize() }
    },
    vertexShader: `
      varying vec3 vWorld; varying vec3 vN; varying float vDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFog, uCol, uSun, uSunDir;
      varying vec3 vWorld; varying vec3 vN; varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
      }
      void main(){
        vec3 n = normalize(vN);
        float ndl = clamp(dot(n, normalize(uSunDir)), 0.0, 1.0);
        // 按高度分三段：台基压暗、台身中性、栏板/台门提亮
        float hy = vWorld.y;
        float base = 1.0 - smoothstep(2.6, 3.4, hy);            // 0 台基
        float body = smoothstep(2.6, 3.4, hy) * (1.0 - smoothstep(7.4, 8.6, hy));
        float top  = smoothstep(7.4, 8.6, hy);
        vec3 tone = uCol * (0.74 + 0.55 * base * 0.10) ;
        tone = mix(tone, uCol * 1.00, body);
        tone = mix(tone, uCol * 1.16, top);
        tone *= 0.86 + 0.14 * base;                              // 台基更闷

        vec3 col = tone * (0.80 + 0.30 * ndl);
        col += uSun * pow(ndl, 4.0) * 0.05;
        // 环境补光：背光面别死黑，靠天光托一点
        col += uFog * 0.16;

        // 三层颗粒：大块斑驳 / 中频石面 / 细颗粒
        float nn = noise(vWorld.xz * 0.42) * 0.55 + noise(vWorld.xz * 1.35 + vWorld.y * 0.8) * 0.45;
        float fine = noise(vWorld.xz * 7.2 + vWorld.y * 3.1);
        col *= 0.93 + 0.11 * nn;
        col *= 0.955 + 0.09 * fine;
        // 石缝：竖向的浅痕
        col *= 0.97 + 0.05 * noise(vec2(vWorld.y * 2.4, vWorld.x * 0.8 + vWorld.z * 0.8));
        // 水渍：从台基往上蔓，越往上越淡
        float damp = smoothstep(4.2, 0.2, hy) * noise(vec2(vWorld.x * 0.6, vWorld.z * 0.6));
        col *= 1.0 - 0.16 * damp;
        float f = clamp((vDepth - 80.0) / 2200.0, 0.0, 1.0);
        col = mix(col, uFog, pow(f, 1.05));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  // 陵台：三级石台 + 前神阶 + 望柱栏板 + 台门 + 无字碑（全部按米制，不再靠 scale 拉伸）
  const TERRACE_Z = -330;
  const terrace = new THREE.Group();
  terrace.position.set(0, 0, TERRACE_Z);
  scene.add(terrace);

  const box = (w, h, d, x, y, z, rot) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    m.position.set(x, y, z);
    if (rot) m.rotation.y = rot;
    terrace.add(m);
    return m;
  };

  // 三级台体
  const TIERS = [
    { w: 26.0, h: 3.2, d: 16.0, y: 1.60 },
    { w: 21.0, h: 3.0, d: 12.5, y: 4.70 },
    { w: 16.0, h: 2.8, d: 9.00, y: 7.50 }
  ];
  TIERS.forEach(t => box(t.w, t.h, t.d, 0, t.y, 0));

  // 台前神阶：正中一条，宽 5.2，台阶一路铺到第一级顶
  {
    const steps = 7, sw = 5.2, sd = 0.72, sh = 3.2 / steps;
    for (let i = 0; i < steps; i++) {
      box(sw, sh, sd, 0, sh * (i + 0.5), 8.0 - i * sd);
    }
    // 阶两侧的垂带
    [-1, 1].forEach(sg => box(0.6, 0.5, steps * sd + 0.4, sg * (sw / 2 + 0.3), 0.25 + steps * sh * 0.5, 8.0 - (steps - 1) * sd / 2));
  }

  // 第二、三级各自的小台阶（对称的两折）
  [[3.2, 21.0, 12.5], [6.2, 16.0, 9.0]].forEach(([yb, w, d]) => {
    const steps = 4, sw = 3.6, sd = 0.62, sh = 1.5 / steps;
    for (let i = 0; i < steps; i++) {
      box(sw, sh, sd, 0, yb - 1.5 + sh * (i + 0.5), d / 2 + 0.4 - i * sd);
    }
  });

  // 望柱 + 栏板：沿每级台顶的左右与前后沿各排一道
  function balustrade(w, d, y, skipFront) {
    const n = Math.max(3, Math.round(w / 2.4));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + (w / n) * i;
      [-1, 1].forEach(sg => {
        if (skipFront && sg > 0 && Math.abs(x) < 3.4) return;  // 台阶口留空
        box(0.42, 1.05, 0.42, x, y + 0.52, sg * (d / 2 - 0.3));
      });
      if (i < n) box(w / n - 0.42, 0.30, 0.26, x + w / n / 2, y + 0.62, (d / 2 - 0.3));
    }
    const m = Math.max(3, Math.round(d / 2.4));
    for (let i = 0; i <= m; i++) {
      const z = -d / 2 + (d / m) * i;
      [-1, 1].forEach(sg => box(0.42, 1.05, 0.42, sg * (w / 2 - 0.3), y + 0.52, z));
    }
  }
  balustrade(26.0, 16.0, 3.2, true);
  balustrade(21.0, 12.5, 6.2, true);
  balustrade(16.0, 9.0, 8.9, true);

  // 台门：两根方柱 + 柱头 + 斗拱 + 横楣 + 顶盖 + 门槛石
  [-3.4, 3.4].forEach(x => {
    box(1.35, 0.55, 1.35, x, 8.9 + 0.28, -3.2);          // 柱础
    box(1.15, 6.2, 1.15, x, 8.9 + 3.1, -3.2);            // 柱身
    box(1.62, 0.42, 1.62, x, 8.9 + 6.20, -3.2);          // 柱头
    [-0.72, 0.72].forEach(dz => box(1.05, 0.34, 0.52, x, 8.9 + 6.55, -3.2 + dz));  // 斗拱
  });
  box(9.6, 0.95, 1.6, 0, 8.9 + 6.95, -3.2);              // 横楣
  box(10.4, 0.36, 2.1, 0, 8.9 + 7.58, -3.2);             // 楣上压顶
  box(7.4, 0.55, 1.9, 0, 8.9 + 7.95, -3.2);              // 顶盖
  box(0.9, 0.30, 2.6, 0, 8.9 + 0.15, -3.2);              // 门槛石

  // 无字碑：须弥座 + 碑身 + 碑首
  box(3.1, 0.34, 2.0, 0, 6.2 + 0.17, 3.0);               // 座下枋
  box(2.6, 0.55, 1.6, 0, 6.2 + 0.61, 3.0);               // 座束腰
  box(2.9, 0.28, 1.85, 0, 6.2 + 1.03, 3.0);              // 座上枋
  box(1.7, 4.6, 0.62, 0, 6.2 + 1.17 + 2.3, 3.0);         // 碑身
  box(2.15, 0.30, 1.05, 0, 6.2 + 1.17 + 4.6 + 0.15, 3.0); // 碑首
  box(1.55, 0.30, 0.80, 0, 6.2 + 1.17 + 4.6 + 0.45, 3.0); // 碑额

  // 石像生：一尊由几个零件拼成，最后合成一个几何体（不逐件 drawcall）
  const mergeParts = (parts) => {
    const pos = [], nor = [];
    const m4 = new THREE.Matrix4();
    const tmp = new THREE.Object3D();
    for (const pt of parts) {
      tmp.position.set(pt.x || 0, pt.y || 0, pt.z || 0);
      tmp.rotation.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      m4.copy(tmp.matrix);
      pt.geo.applyMatrix4(m4);
      const p = pt.geo.attributes.position.array, nn = pt.geo.attributes.normal.array;
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      for (let i = 0; i < nn.length; i++) nor.push(nn[i]);
      pt.geo.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    return geo;
  };

  function statue(x, z, side, kind, scale) {
    const bodyH = kind === "horse" ? 1.10 : 1.46;
    const parts = [
      { geo: new THREE.BoxGeometry(1.45, 0.40, 1.45), y: 0.20 },
      {
        geo: new THREE.CylinderGeometry(
          kind === "horse" ? 0.40 : 0.32, kind === "horse" ? 0.56 : 0.44, bodyH, 6, 1),
        y: 0.40 + bodyH / 2
      },
      {
        geo: new THREE.IcosahedronGeometry(kind === "horse" ? 0.29 : 0.23, 0),
        y: 0.40 + bodyH + (kind === "horse" ? 0.30 : 0.21),
        z: kind === "horse" ? 0.15 : 0
      }
    ];
    if (kind === "horse") {
      parts.push({
        geo: new THREE.CylinderGeometry(0.19, 0.25, 0.70, 5),
        y: 0.40 + bodyH + 0.17, z: 0.10, rx: 0.40
      });
    }
    const mesh = new THREE.Mesh(mergeParts(parts), stoneMat);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.scale.setScalar(scale);
    scene.add(mesh);
    return mesh;
  }

  // 尺度收一档、往路外挪一点：镜头贴着一根 3 米石像走过去时不该挡画面
  for (let i = 0; i < 4; i++) {
    const z = -96 - i * 54;
    const kind = i % 2 === 0 ? "horse" : "official";
    statue(-4.7, z, -1, kind, 0.72);
    statue(-8.1, z + 12, -1, kind === "horse" ? "official" : "horse", 0.72);
  }

  // 石灯
  const lampMat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: c3(PAL.fog) }, uCol: { value: c3([0.640, 0.632, 0.570]) } },
    vertexShader: `varying float vDepth;
      void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vec4 mv=viewMatrix*wp; vDepth=-mv.z;
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `precision highp float; uniform vec3 uFog,uCol;
      varying float vDepth;
      void main(){ vec3 c=uCol*0.94; float f=clamp((vDepth-40.0)/1700.0,0.0,1.0);
        c=mix(c,uFog,pow(f,1.05)); gl_FragColor=vec4(c,1.0); }`
  });
  function lantern(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    return g;
  }
  // 石灯只用一次几何：四件合体后做 InstancedMesh
  const lampGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.30, 0.42, 0.26, 6), y: 0.13 },
    { geo: new THREE.CylinderGeometry(0.14, 0.18, 1.05, 6), y: 0.80 },
    { geo: new THREE.BoxGeometry(0.46, 0.40, 0.46), y: 1.52 },
    { geo: new THREE.ConeGeometry(0.37, 0.27, 4), y: 1.86, ry: Math.PI / 4 }
  ]);
  const LAMP_N = 24;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, LAMP_N);
  {
    const d = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < 12; i++) {
      const z = -14 - i * 20;
      [-3.15, 3.15].forEach((x, j) => {
        d.position.set(x, 0, j === 0 ? z : z - 10);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        lamps.setMatrixAt(k++, d.matrix);
      });
    }
    lamps.count = k;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.frustumCulled = false;
    scene.add(lamps);
  }


  /* ── 前景芦苇 ─────────────────────────────────────────────── */
  const reedGeo = (() => {
    const p = [], idx = [], col = [];
    const seg = 6, w0 = 0.030;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const w = w0 * (1 - t * 0.88);
      p.push(-w, t, 0, w, t, 0);
      const c = lerp(0.42, 1.06, 1 - t);
      col.push(0.150 * c, 0.178 * c, 0.104 * c, 0.196 * c, 0.222 * c, 0.132 * c);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  })();

  const reedMat = new THREE.ShaderMaterial({
    uniforms: {
      uFog: { value: c3(PAL.fog) }, uTime: { value: 0 }, uSun: { value: c3(PAL.sun) },
      uWind: { value: 0.5 }
    },
    vertexColors: true, transparent: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime, uWind;
      varying vec3 vC; varying float vDepth; varying float vT;
      void main(){
        vC = color;
        vec3 p = position;
        float h = p.y;
        float seed = modelMatrix[3].x * 0.31 + modelMatrix[3].z * 0.17;
        float sway = sin(uTime * 0.95 + seed) * 0.09 + sin(uTime * 0.47 + seed * 1.7) * 0.055;
        p.x += sway * h * h * uWind;
        vT = h;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFog, uSun;
      varying vec3 vC; varying float vDepth; varying float vT;
      void main(){
        vec3 c = vC * (0.80 + 0.42 * vT);
        c += uSun * pow(vT, 3.0) * 0.05;
        c = mix(c, uFog, clamp(vDepth / 260.0, 0.0, 0.55));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });

  // 近景剪影：一根根贴在镜头两侧，只做“框”用
  const nearReedMat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: c3(PAL.fog) }, uTime: { value: 0 } },
    vertexColors: true, transparent: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec3 vC; varying float vT; varying float vDepth;
      void main(){
        vC = color;
        vec3 q = position;
        float seed = modelMatrix[3].x * 0.7 + modelMatrix[3].z * 0.31;
        q.x += (sin(uTime * 0.8 + seed) * 0.10 + sin(uTime * 0.37 + seed * 2.1) * 0.06) * q.y * q.y;
        vT = q.y;
        vec4 wp = modelMatrix * instanceMatrix * vec4(q, 1.0);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uFog;
      varying vec3 vC; varying float vT; varying float vDepth;
      void main(){
        vec3 c = vC * (0.55 + 0.30 * vT);
        c = mix(c, uFog, clamp((vDepth - 4.0) / 120.0, 0.0, 0.34));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });
  const nearReeds = new THREE.InstancedMesh(reedGeo, nearReedMat, 130);
  {
    const dummy = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < 900 && k < 130; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (3.0 + Math.pow(rnd(), 1.2) * 9.0);
      const z = 6 - rnd() * 34;
      const h = 0.8 + Math.pow(rnd(), 1.5) * 1.7;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(rr(-0.22, 0.22), rr(0, 6.28), rr(-0.3, 0.3));
      dummy.scale.set(rr(1.0, 2.2), h, 1);
      dummy.updateMatrix();
      nearReeds.setMatrixAt(k++, dummy.matrix);
    }
    nearReeds.count = k;
    nearReeds.instanceMatrix.needsUpdate = true;
    nearReeds.frustumCulled = false;
    scene.add(nearReeds);
  }

  const REED_N = 2600;
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, REED_N);
  const dummy = new THREE.Object3D();
  let nReed = 0;
  for (let i = 0; i < REED_N * 3 && nReed < REED_N; i++) {
    const rightBank = i % 5 === 0;
    const x = rightBank
      ? CFG.waterX + rr(-0.3, 2.4)          // 水边一小溜
      : -(2.9 + Math.pow(rnd(), 1.5) * 26); // 左岸草坡
    const z = 30 - rnd() * 700;
    if (!rightBank && Math.abs(x) < 2.85) continue;
    const h = 0.45 + Math.pow(rnd(), 1.8) * 1.85;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(rr(-0.16, 0.16), rr(0, 6.28), rr(-0.20, 0.20));
    dummy.scale.set(rr(0.65, 1.5), h, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(nReed++, dummy.matrix);
  }
  reeds.count = nReed;
  reeds.instanceMatrix.needsUpdate = true;
  reeds.frustumCulled = false;
  scene.add(reeds);

  /* ── 雾带：分层水汽 ───────────────────────────────────────── */
  const mists = [];
  function mistPlane(z, y, w, h, opacity, seed) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: c3(PAL.fog) }, uOpacity: { value: opacity },
        uSeed: { value: seed }, uTime: { value: 0 }
      },
      transparent: true, depthWrite: false, depthTest: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColor; uniform float uOpacity, uSeed, uTime;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
        }
        float fbm(vec2 p){ float a=.5,s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
        void main(){
          float band = smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.62, vUv.y);
          float drift = fbm(vec2(vUv.x * 3.0 + uSeed, vUv.y * 1.8 + uTime * 0.006));
          float a = band * uOpacity * (0.55 + 0.60 * drift);
          a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          gl_FragColor = vec4(uColor, a);
        }
      `
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(0, y, z);
    m.renderOrder = 3;
    scene.add(m);
    mists.push({ mesh: m, mat, base: opacity, z });
    return m;
  }
  mistPlane(-14, 1.15, 130, 16, 0.16, 1.7);
  mistPlane(-46, 1.35, 220, 26, 0.14, 2.1);
  mistPlane(-104, 1.60, 340, 40, 0.12, 2.6);
  mistPlane(-300, 16, 1100, 96, 0.30, 3.3);
  mistPlane(-560, 22, 1400, 130, 0.34, 7.1);
  mistPlane(-860, 28, 1800, 170, 0.36, 11.7);
  mistPlane(-1150, 30, 2000, 190, 0.20, 19.4);
  mistPlane(-1350, 34, 2400, 230, 0.30, 16.2);
  mistPlane(-1700, 40, 2800, 270, 0.18, 23.1);
  mistPlane(-2000, 46, 3200, 320, 0.30, 21.8);
  mistPlane(-2800, 60, 4200, 420, 0.26, 27.4);

  /* ──────────────────────────────────────────────────────────────
     8 · 相机运镜：滚动推进 + 鼠标视差，全部临界阻尼
     ────────────────────────────────────────────────────────────── */
  const state = {
    targetProg: 0, prog: 0,
    targetNx: 0, nx: 0,
    targetNy: 0, ny: 0,
    frames: 0
  };

  // 进度由容器在视口中滚过的距离决定（不劫持页面滚动）
  function onScroll() {
    const r = host.getBoundingClientRect();
    const vh = innerHeight || 1;
    const start = vh * 0.92;                       // 区块顶刚进入
    const span  = Math.max(220, r.height + vh * 0.55);
    const p = (start - r.top) / span;
    state.targetProg = Math.min(1, Math.max(0, p));
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  function onPointer(e) {
    const t = e.touches ? e.touches[0] : e;
    const r = host.getBoundingClientRect();
    state.targetNx = Math.min(1, Math.max(-1, ((t.clientX - r.left) / Math.max(1, r.width)) * 2 - 1));
    state.targetNy = Math.min(1, Math.max(-1, ((t.clientY - r.top) / Math.max(1, r.height)) * 2 - 1));
  }

  function damp(cur, target, lambda, dt) {
    return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  }

  const camBase = new THREE.Vector3();
  const railBar = host.querySelector(".rail-bar");

  function updateCamera(dt) {
    state.prog = damp(state.prog, state.targetProg, CFG.dollyDamp, dt);
    state.nx = damp(state.nx, state.targetNx, CFG.parallaxDamp, dt);
    state.ny = damp(state.ny, state.targetNy, CFG.parallaxDamp * 0.8, dt);

    const p = state.prog;
    const eased = p * p * (3 - 2 * p);

    const z = CFG.camStart.z + (CFG.camEndZ - CFG.camStart.z) * eased;
    const x = CFG.camStart.x + state.nx * CFG.parallaxX;
    const yBase = CFG.camStart.y + Math.sin(eased * Math.PI) * 0.35;
    const y = yBase - state.ny * CFG.parallaxY
      + (REDUCED ? 0 : Math.sin(performance.now() * 0.00042) * 0.035);

    camera.position.set(x, y, z);
    camera.rotation.set(
      CFG.pitch - state.ny * 0.006 + (REDUCED ? 0 : Math.sin(performance.now() * 0.00031) * 0.0016),
      -state.nx * CFG.yawAmount,
      state.nx * 0.004
    );

    if (railBar) railBar.style.transform = `translateY(${(1 - p) * 106}px)`;
  }

  host.addEventListener("pointermove", onPointer, { passive: true });

  /* ──────────────────────────────────────────────────────────────
     9 · 主循环
     ────────────────────────────────────────────────────────────── */
  function resize() {
    camera.aspect = VW() / VH();
    camera.updateProjectionMatrix();
    renderer.setSize(VW(), VH(), false);
  }
  addEventListener("resize", resize);

  let t = 0;
  let running = true;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    updateCamera(dt);

    skyUniforms.uTime.value = t;

    waterMat.uniforms.uTime.value = t;
    pathMat.uniforms.uTime.value = t;
    groundMat.uniforms.uTime.value = t;
    reedMat.uniforms.uTime.value = t;
    nearReedMat.uniforms.uTime.value = t;

    for (const m of mists) {
      m.mat.uniforms.uTime.value = t;
      const dist = camera.position.z - m.z;
      const fade = smoothstepJS(6, 120, dist);
      m.mat.uniforms.uOpacity.value = m.base * fade;
      m.mesh.visible = fade > 0.01;
    }

    for (const mat of peakMatList) mat.uniforms.uTime.value = t;
    mirrorMat.uniforms.uTime.value = t;

    renderer.render(scene, camera);

    if (state.frames === 1) {
      const b = host.querySelector(".spirit-boot");
      if (b) { b.classList.add("done"); setTimeout(() => b.remove(), 1400); }
    }
    state.frames++;
    requestAnimationFrame(frame);
  }

  resize();
  frame();

  // 调试入口：控制台里改 __guilin.CFG 再刷新即可试参数
  host.__spirit = { CFG, state, scene, camera, renderer };

  // 滚轮 / 键盘 / 指针
  // （事件在 §8 已挂好）
  return { pause: () => running = false, play: () => { if (!running) { running = true; frame(); } }, resize: resize, setProgress: (v) => { state.targetProg = Math.min(1, Math.max(0, v)); } };
}

(function () {
  const host = document.getElementById("spirit");
  if (!host) return;

  const boot = document.getElementById("spiritBoot");
  let api = null, tried = false, visible = false;

  function start() {
    if (tried) return;
    tried = true;
    try {
      api = initSpiritScene(host);
      const c = host.querySelector("canvas.spirit-canvas");
      if (c) c.style.opacity = "0";
      requestAnimationFrame(() => {
        if (c) {
      c.style.transition = "opacity 900ms ease";
      c.style.opacity = "1";
      // 兜底：万一合成层不跑过渡，1 秒后强制落地，别留半透明
      setTimeout(() => { c.style.transition = "none"; c.style.opacity = "1"; }, 1000);
    }
      });
      if (boot) { boot.classList.add("done"); setTimeout(() => boot.remove(), 800); }
    } catch (err) {
      console.warn("[spirit]", err);
      if (boot) boot.textContent = "ERR·" + (err && err.message ? err.message : String(err));
    }
  }

  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      visible = e.isIntersecting;
      if (visible && !tried) start();
      else if (api) visible ? api.play() : api.pause();
    }
  }, { rootMargin: "300px 0px 300px 0px", threshold: 0 });

  io.observe(host);

  // 页面滚回顶部时停一下，省电
  document.addEventListener("visibilitychange", () => {
    if (!api) return;
    if (document.hidden) api.pause();
    else if (visible) api.play();
  });

  addEventListener("resize", () => { if (api) api.resize(); });
})();

