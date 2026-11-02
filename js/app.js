/* Y-STUDIO · 应用逻辑（原 index 内联脚本 1）*/
(function () {
  'use strict';

  /* ── 0 · 小工具 ─────────────────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) document.documentElement.classList.add('no-motion');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1900);
  }

  /* ── 1 · 纸纹 ───────────────────────────────────────── */
  (function grain() {
    try {
      const n = 150, c = document.createElement('canvas');
      c.width = c.height = n;
      const g = c.getContext('2d');
      const img = g.createImageData(n, n);
      for (let i = 0; i < img.data.length; i += 4) {
        /* 接近白，靠 multiply 只压出极淡的纸纹，不能是灰——灰会整页发暗 */
        const v = 238 + (Math.random() * 17 - 8);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      document.documentElement.style.setProperty('--grain', 'url(' + c.toDataURL() + ')');
    } catch (e) { /* 无所谓 */ }
  })();

  /* ── 2 · 山水背景：WebGL ────────────────────────────── */
  const VERT = `
    attribute vec2 a_pos;
    void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;

    uniform vec2  u_res;
    uniform float u_time;
    uniform vec2  u_mouse;
    uniform float u_scroll;
    uniform vec3  u_tod;      /* x=夜 y=暮 z=晨，均由本地时间算 */

    const float HORIZON = 0.335;

    float hash(vec2 p){
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0;
      float a = 0.52;
      for (int i = 0; i < 5; i++){
        v += a * noise(p);
        p = p * 2.07 + vec2(13.7, 7.9);
        a *= 0.5;
      }
      return v;
    }

    /* 喀斯特峰林：一堆尖锥叠在一起，max() 取最高，峰顶就是尖的 */
    float cones(vec2 p){
      vec2 g  = p * vec2(4.4, 5.4);
      vec2 ip = floor(g);
      vec2 fp = fract(g);
      float m = 0.0;
      for (int y = -1; y <= 1; y++){
        for (int x = -1; x <= 1; x++){
          vec2 o   = vec2(float(x), float(y));
          vec2 rnd = vec2(hash(ip + o), hash(ip + o + vec2(13.7, 5.1)));
          vec2 c   = o + rnd - fp;
          float r  = length(c * vec2(1.0, 0.78));
          float t  = 0.42 + 0.92 * hash(ip + o + vec2(31.3, 17.9));
          m = max(m, (0.62 - r * 1.30) * t);
        }
      }
      return clamp(m * 1.45, 0.0, 1.0);
    }

    /* 一层的高度：大小两组峰林 + 很慢的底 */
    float ridgeH(float x, float seed, float t){
      float drift = t * 0.010;
      float a = cones(vec2(x * 1.55 + seed * 5.0 + drift, seed * 1.7));
      float b = cones(vec2(x * 3.30 + seed * 9.1 - drift * 0.6, seed * 4.3 + 8.0));
      float base = fbm(vec2(x * 2.2 + seed * 3.0, seed * 2.0)) * 0.16;
      return clamp(a * 0.74 + b * 0.32 + base, 0.0, 1.0);
    }

    vec3 skyCol(vec2 p){
      float v = smoothstep(HORIZON - 0.05, 1.02, p.y);
      vec3 low  = vec3(0.976, 0.966, 0.922);
      vec3 high = vec3(0.788, 0.850, 0.822);
      vec3 c = mix(low, high, pow(v, 0.88));

      /* 日轮 + 光晕 */
      vec2 sp = vec2(0.775, 0.512 - u_scroll * 0.05) + vec2(u_mouse.x, -u_mouse.y) * 0.018;
      float d = length((p - sp) * vec2(1.0, 1.12));
      c += vec3(1.0, 0.950, 0.824) * exp(-d * 9.0) * 0.16;
      float disc = smoothstep(0.026, 0.019, d);
      c = mix(c, vec3(1.0, 0.986, 0.936), disc * 0.94);

      /* 高空薄云 */
      float cl = fbm(vec2(p.x * 2.3 + u_time * 0.005, p.y * 5.2 + 2.4));
      c = mix(c, vec3(0.990, 0.988, 0.972), smoothstep(0.58, 0.95, cl) * 0.24 * smoothstep(0.46, 0.98, p.y));
      return c;
    }

    vec3 land(vec2 p){
      vec3 c = skyCol(p);

      vec3 haze = vec3(0.948, 0.951, 0.925);
      vec3 far  = vec3(0.596, 0.672, 0.632);
      vec3 near = vec3(0.078, 0.168, 0.146);

      for (int i = 0; i < 5; i++){
        float fi = float(i);
        float k  = fi / 4.0;

        /* 远山高、近山低；pow 把偶尔冒出来的尖顶压回去 */
        float amp = mix(0.300, 0.135, k);
        float h   = ridgeH(p.x, 1.0 + fi * 3.1, u_time);
        float top = HORIZON + amp * pow(h, 1.55) * 0.92;

        /* 山脊上方一小条雾，把后一层隔开 */
        float above = p.y - top;
        if (above > 0.0 && above < 0.038){
          c = mix(c, haze, smoothstep(0.038, 0.0, above) * (0.26 - 0.04 * k));
        }

        if (p.y < top){
          vec3 ink = mix(far, near, pow(k, 1.05));
          ink = mix(ink, haze, (1.0 - k) * 0.42);

          /* 山脚溶进水面：越近的那层，脚下雾越浓 */
          float baseFog = smoothstep(0.095, 0.0, p.y - HORIZON) * (0.62 - 0.26 * k);
          ink = mix(ink, haze, baseFog);

          /* 山体自上而下略沉 */
          ink *= mix(1.0, 0.90, smoothstep(0.0, max(amp * 1.2, 0.02), top - p.y));

          c = ink;
        }
      }
      return c;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / u_res;
      float aspect = u_res.x / max(u_res.y, 1.0);
      vec2 p = vec2((uv.x - 0.5) * aspect * 0.52 + 0.5, uv.y);

      float t = u_time + u_scroll * 2.2;

      vec3 col;

      if (p.y >= HORIZON){
        col = land(p);
      } else {
        float dy = HORIZON - p.y;

        /* 水面：倒影 + 波纹 + 碎光，越远越淡 */
        float rip = sin(dy * 30.0 + t * 0.45) * 0.0045
                  + sin(dy * 11.0 - t * 0.24 + 1.2) * 0.0070
                  + sin(p.x * 7.0 + dy * 20.0) * 0.0018;
        vec2 mp = vec2(p.x + rip * (0.5 + dy * 3.0),
                       HORIZON + dy * 0.94 + rip * 2.0);
        vec3 refl = land(mp);

        vec3 waterBase = mix(vec3(0.880, 0.902, 0.880), vec3(0.612, 0.694, 0.656),
                             smoothstep(0.0, 0.345, dy));
        /* 靠岸的倒影最实，往下越淡 */
        float reflAmt = 0.60 * (1.0 - smoothstep(0.0, 0.26, dy) * 0.82);
        col = mix(waterBase, refl, reflAmt);

        /* 岸线：一层很薄的雾，把山脚和水面接上 */
        col = mix(col, vec3(0.952, 0.954, 0.930), smoothstep(0.115, 0.0, dy) * 0.70);
        col += vec3(0.014, 0.016, 0.014) * smoothstep(0.014, 0.0, dy);

        /* 横向水纹 */
        float l1 = sin(p.y * 230.0 + noise(vec2(p.x * 7.0, p.y * 24.0 + t * 0.18)) * 7.0);
        col += vec3(0.022, 0.026, 0.022) * smoothstep(0.82, 1.0, l1)
             * smoothstep(0.02, 0.12, dy) * (1.0 - smoothstep(0.14, 0.30, dy));
        float l2 = sin(p.y * 88.0 - t * 0.20 + p.x * 3.0);
        col += vec3(0.012, 0.014, 0.012) * smoothstep(0.90, 1.0, l2) * smoothstep(0.0, 0.18, dy);

        /* 日影在水面拉出的一条亮 */
        float gl = exp(-pow((p.x - 0.775) * 8.5, 2.0) - dy * 8.0);
        col += vec3(1.0, 0.952, 0.838) * gl * 0.18;
      }

      /* ── 昼夜 ───────────────────────────────────────────── */
      float nT  = clamp(u_tod.x, 0.0, 1.0);
      float dT  = clamp(u_tod.y, 0.0, 1.0);
      float aT  = clamp(u_tod.z, 0.0, 1.0);
      float band = smoothstep(HORIZON + 0.36, HORIZON - 0.04, p.y);

      /* 暮：地平线暖、天顶偏紫 */
      if (dT > 0.001){
        vec3 warm = col * vec3(1.10, 0.93, 0.84) + vec3(0.070, 0.026, 0.004) * band;
        vec3 violet = mix(warm, warm * vec3(0.94, 0.90, 1.06), smoothstep(HORIZON, 1.0, p.y));
        col = mix(col, violet, dT * 0.92);
      }
      /* 晨：比暮更淡更青 */
      if (aT > 0.001){
        /* 晨：天顶青灰，地平线淡粉，整体雾一点、淡一点 */
        float hi = smoothstep(HORIZON - 0.05, 1.0, p.y);
        vec3 pale = col * vec3(0.99, 0.99, 1.02);
        pale += vec3(0.055, 0.075, 0.090) * hi;                 /* 青灰天顶 */
        pale += vec3(0.085, 0.055, 0.045) * (1.0 - hi) * band;  /* 淡粉地平线 */
        float lum = dot(pale, vec3(0.299, 0.587, 0.114));
        pale = mix(pale, vec3(lum) * vec3(1.02, 1.00, 1.01), 0.38);
        col = mix(col, pale, aT * 0.90);
      }
      /* 夜：整体压暗偏冷；水面留一点天光 */
      if (nT > 0.001){
        float ny = smoothstep(0.0, 1.0, uv.y);
        vec3 deep = col * vec3(0.24, 0.30, 0.42);
        deep = mix(deep, vec3(0.075, 0.105, 0.155), 0.30 + 0.30 * ny);
        col = mix(col, deep, nT);

        /* 星：只在天空，带一点闪 */
        float sky = smoothstep(HORIZON - 0.02, HORIZON + 0.26, p.y);
        vec2 sp = p * vec2(120.0, 86.0) + 3.7;
        vec2 si = floor(sp);
        float seed = hash(si);
        float tw = 0.5 + 0.5 * sin(u_time * 1.6 + seed * 61.0);
        float dotSz = smoothstep(0.40, 0.02, length(fract(sp) - 0.5));
        float star = step(0.9955, seed) * dotSz * tw;
        col += vec3(0.82, 0.88, 1.0) * star * sky * nT * 1.5;

        /* 月：右上，带一圈薄晕 */
        vec2 mp = vec2(0.775, 0.700);
        float md = length((p - mp) * vec2(aspect, 1.0));
        float moon = smoothstep(0.0300, 0.0205, md);
        float halo = smoothstep(0.115, 0.0230, md);
        col += vec3(0.93, 0.95, 1.0) * moon * nT * 0.95;
        col += vec3(0.42, 0.50, 0.72) * halo * halo * nT * 0.16;
        /* 月在水面的一条倒影 */
        float ml = exp(-pow((p.x - mp.x) * 9.0, 2.0)) * smoothstep(HORIZON, 0.0, p.y);
        col += vec3(0.55, 0.62, 0.80) * ml * nT * 0.07;
      }

      /* 纸感：颗粒 + 极轻的暖纸压色 + 暗角 */
      float g = hash(gl_FragCoord.xy + fract(u_time) * 97.0) - 0.5;
      col += g * 0.012;
      vec3 paperTone = mix(vec3(0.945, 0.937, 0.902), vec3(0.070, 0.086, 0.100), clamp(u_tod.x, 0.0, 1.0));
      col = mix(col, paperTone, mix(0.038, 0.10, clamp(u_tod.x, 0.0, 1.0)));

      vec2 q = uv - 0.5;
      col *= 1.0 - dot(q, q) * 0.18;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  /* 昼夜：按本地时间算三个权重，另支持 ?time=night|dusk|dawn|day 强制 */
  const TOD = { night: 0, dusk: 0, dawn: 0 };
  (function computeTOD () {
    function weights (h) {
      let night = 0, dusk = 0, dawn = 0;
      if (h < 5)        { night = 1; }
      else if (h < 6.5) { const k = (h - 5) / 1.5; night = 1 - k; dawn = k; }
      else if (h < 8)   { const k = (h - 6.5) / 1.5; dawn = 1 - k; }
      else if (h < 16)  { /* 白天 */ }
      else if (h < 18)  { dusk = (h - 16) / 2; }
      else if (h < 20)  { const k = (h - 18) / 2; dusk = 1 - k; night = k; }
      else              { night = 1; }
      return { night, dusk, dawn };
    }
    /* 手动选择：?time=xxx 优先，其次 localStorage，最后按时钟 */
    const qs = (new URLSearchParams(location.search).get('time') || '').toLowerCase();
    const TKEY = 'my_tod';
    let manual = qs;
    if (manual) { try { localStorage.setItem(TKEY, manual); } catch (_) {} }
    else { try { manual = (localStorage.getItem(TKEY) || '').toLowerCase(); } catch (_) {} }
    const forced = ['night','dusk','dawn','day'].indexOf(manual) >= 0 ? manual : '';
    function apply () {
      const d = new Date();
      const h = d.getHours() + d.getMinutes() / 60;
      let w = weights(h);
      if (forced === 'night') w = { night: 1, dusk: 0, dawn: 0 };
      else if (forced === 'dusk') w = { night: 0, dusk: 1, dawn: 0 };
      else if (forced === 'dawn') w = { night: 0, dusk: 0, dawn: 1 };
      else if (forced === 'day') w = { night: 0, dusk: 0, dawn: 0 };
      TOD.night = w.night; TOD.dusk = w.dusk; TOD.dawn = w.dawn;

      /* 主题：夜/暮偏暗，晨/白天用亮纸 */
      const dark = w.night > 0.5;
      const root = document.documentElement;
      if (root.dataset.time !== (dark ? 'night' : 'day')) {
        root.dataset.time = dark ? 'night' : 'day';
        root.dataset.phase = forced || (w.night > 0.5 ? 'night' : w.dusk > 0.5 ? 'dusk' : w.dawn > 0.5 ? 'dawn' : 'day');
        document.dispatchEvent(new CustomEvent('todchange', { detail: { ...w, phase: root.dataset.phase } }));
      }
    }
    apply();
    setInterval(apply, 60000);
    /* 系统改了时间/时区也能跟上 */
    document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
    /* 顶栏开关：自动 → 昼 → 夜 */
    const btn = document.getElementById('todBtn');
    const labels = { '': '自动', day: '昼', night: '夜' };
    function paintBtn () {
      if (!btn) return;
      btn.textContent = forced === 'night' ? '夜' : forced === 'day' ? '昼' : '自动';
      btn.title = forced ? '点一下切换（当前：' + (forced === 'day' ? '白天' : '夜间') + '）' : '跟随本地时间：' + (TOD.night > 0.5 ? '夜' : TOD.dusk > 0.5 ? '暮' : TOD.dawn > 0.5 ? '晨' : '昼');
    }
    if (btn) btn.addEventListener('click', () => {
      const next = !forced ? 'night' : forced === 'night' ? 'day' : '';
      try { if (next) localStorage.setItem(TKEY, next); else localStorage.removeItem(TKEY); } catch (_) {}
      const u = new URL(location.href);
      if (next) u.searchParams.set('time', next); else u.searchParams.delete('time');
      location.replace(u.toString());
    });
    paintBtn();

    window.__ystudio = window.__ystudio || {};
    window.__ystudio.tod = TOD;
  })();

  const canvas = $('#gl');
  let glOK = false;

  function initGL() {
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance'
    }) || canvas.getContext('experimental-webgl');

    if (!gl) { fallback2D(); return; }

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { fallback2D(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('link:', gl.getProgramInfoLog(prog));
      fallback2D();
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 3, -1, -1, 3
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      res: gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      mouse: gl.getUniformLocation(prog, 'u_mouse'),
      scroll: gl.getUniformLocation(prog, 'u_scroll'),
      tod: gl.getUniformLocation(prog, 'u_tod')
    };

    glOK = true;

    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      W = Math.max(1, Math.round(window.innerWidth * dpr));
      H = Math.max(1, Math.round(window.innerHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
      gl.uniform2f(U.res, W, H);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', e => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    let scrollN = 0;
    const onScrollGL = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollN = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    };
    window.addEventListener('scroll', onScrollGL, { passive: true });
    onScrollGL();

    let start = performance.now();

    function frame(now) {
      if (!glOK) return;
      const t = (now - start) / 1000;
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;
      gl.uniform1f(U.time, t);
      gl.uniform2f(U.mouse, mouse.x, mouse.y);
      gl.uniform1f(U.scroll, scrollN);
      if (U.tod) gl.uniform3f(U.tod, TOD.night, TOD.dusk, TOD.dawn);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    }

    if (reduced) {
      /* 减少动效：只画一帧静态画面 */
      gl.uniform1f(U.time, 12.0);
      gl.uniform2f(U.mouse, 0, 0);
      gl.uniform1f(U.scroll, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      window.addEventListener('resize', () => {
        gl.uniform2f(U.res, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }, { passive: true });
    } else {
      requestAnimationFrame(frame);
    }

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      glOK = false;
      fallback2D();
    });
  }

  /* ── 3 · 兜底：2D 静态山水 ──────────────────────────── */
  function fallback2D() {
    if (!canvas || canvas.dataset.fallback === '1') return;
    canvas.dataset.fallback = '1';
    glOK = false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(window.innerWidth * dpr);
    const H = Math.round(window.innerHeight * dpr);
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) { canvas.style.display = 'none'; return; }

    const horizon = H * (1 - 0.335);

    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#C9D5CE');
    sky.addColorStop(0.62, '#E6E5DA');
    sky.addColorStop(1, '#F4F1E7');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, horizon);

    const sun = g.createRadialGradient(W * 0.705, horizon * 0.62, 0, W * 0.705, horizon * 0.62, W * 0.26);
    sun.addColorStop(0, 'rgba(255,251,238,.95)');
    sun.addColorStop(0.16, 'rgba(255,247,224,.55)');
    sun.addColorStop(1, 'rgba(255,247,224,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, horizon);

    const tones = ['#C3CEC7', '#A5B6AD', '#7E958A', '#567063', '#2C443A'];
    for (let i = 0; i < 5; i++) {
      const amp = H * (0.085 + i * 0.058) * 1.5;
      g.beginPath();
      g.moveTo(0, horizon);
      for (let x = 0; x <= W; x += W / 90) {
        const n = Math.sin(x * 0.0042 + i * 2.1) * 0.5 + Math.sin(x * 0.011 + i * 5.7) * 0.28 + Math.sin(x * 0.026 + i) * 0.12;
        const y = horizon - amp * (0.42 + n * 0.5);
        g.lineTo(x, y);
      }
      g.lineTo(W, horizon);
      g.closePath();
      g.fillStyle = tones[i];
      g.globalAlpha = 0.92;
      g.fill();
      g.globalAlpha = 1;
    }

    const water = g.createLinearGradient(0, horizon, 0, H);
    water.addColorStop(0, '#C9D3CB');
    water.addColorStop(0.35, '#9FB2A8');
    water.addColorStop(1, '#6C8378');
    g.fillStyle = water;
    g.fillRect(0, horizon, W, H - horizon);

    g.globalAlpha = 0.20;
    for (let y = horizon; y < H; y += 3 * dpr) {
      g.fillStyle = '#F1EFE4';
      g.fillRect(0, y, W, Math.max(1, dpr * 0.8));
    }
    g.globalAlpha = 1;

    const mist = g.createLinearGradient(0, horizon - H * 0.12, 0, horizon + H * 0.10);
    mist.addColorStop(0, 'rgba(244,241,231,0)');
    mist.addColorStop(0.5, 'rgba(244,241,231,.72)');
    mist.addColorStop(1, 'rgba(244,241,231,0)');
    g.fillStyle = mist;
    g.fillRect(0, horizon - H * 0.12, W, H * 0.22);
  }

  initGL();

  /* ── 4 · 数据 ───────────────────────────────────────── */
  const KEY = 'my_archive_v2';
  const CKEY = 'my_courses_v1';

  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];

  let courses = [];
  try { courses = JSON.parse(localStorage.getItem(CKEY)) || []; } catch (e) { courses = []; }
  if (!Array.isArray(courses)) courses = [];

  const saveItems = () => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); }
    catch (e) { toast('存不进去了，浏览器配额可能满了'); }
  };
  const saveCourses = () => {
    try { localStorage.setItem(CKEY, JSON.stringify(courses)); }
    catch (e) { toast('存不进去了，浏览器配额可能满了'); }
  };

  const SUBJECTS = [
    { key: 'math', name: '高等数学', color: '#3E6B58' },
    { key: 'chem', name: '无机化学', color: '#2F6F6A' },
    { key: 'eng', name: '英语', color: '#8A6A3C' },
    { key: 'env', name: '环境导论', color: '#55744C' },
    { key: 'pol', name: '政治', color: '#7A5560' }
  ];

  const updateHeroCounts = () => {
    const a = $('#liveItems'), b = $('#liveCourses'), c = $('#livePosts'), d = $('#liveLife');
    if (a) a.textContent = items.length;
    if (b) b.textContent = courses.length;
    if (c) c.textContent = (typeof posts !== 'undefined' ? posts.length : 0);
    if (d) d.textContent = (typeof lifeLogs !== 'undefined' ? lifeLogs.length : 0);
  };


  /* ── 4b · 文章（列表 / 阅读 / 写作 / 草稿 / 归档 / 导入导出） ── */
  const PKEY = 'my_posts_v1';
  const VKEY = 'my_posts_view';
  let posts = [];
  try { posts = JSON.parse(localStorage.getItem(PKEY)) || []; } catch (e) { posts = []; }
  if (!Array.isArray(posts)) posts = [];

  let activeTag = '';
  let q = '';
  let lastList = [];
  let view = 'list';
  try { view = localStorage.getItem(VKEY) || 'list'; } catch (e) {}
  if (view !== 'archive') view = 'list';

  const savePosts = () => {
    try { localStorage.setItem(PKEY, JSON.stringify(posts)); }
    catch (e) { toast('存不进去了，浏览器配额可能满了'); }
  };

  const postListEl = $('#postList');
  const postEmptyEl = $('#postEmpty');
  const postCountEl = $('#postCount');
  const postTagsEl = $('#postTags');

  const pad2 = n => (n < 10 ? '0' + n : '' + n);
  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  };
  const charsOf = body => String(body || '').replace(/\s/g, '').length;
  const excerptOf = body => String(body || '').replace(/^##\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 92);
  const readMin = body => Math.max(1, Math.round(charsOf(body) / 420));

  const sortedPosts = () =>
    posts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));

  const norm = s => String(s || '').toLowerCase();
  const hit = p => !q ||
    norm(p.title).indexOf(q) >= 0 || norm(p.body).indexOf(q) >= 0 || norm(p.tag).indexOf(q) >= 0;

  const visiblePosts = () => {
    let list = sortedPosts().filter(hit);
    if (activeTag === '__draft') list = list.filter(p => p.draft);
    else {
      list = list.filter(p => !p.draft);          // 草稿不进正式列表
      if (activeTag) list = list.filter(p => (p.tag || '').trim() === activeTag);
    }
    return list;
  };

  function renderTags() {
    if (!postTagsEl) return;
    const tags = Array.from(new Set(posts.filter(p => !p.draft).map(p => (p.tag || '').trim()).filter(Boolean)));
    const drafts = posts.filter(p => p.draft).length;
    const items = ['<button data-tag=""' + (activeTag === '' ? ' class="on"' : '') + '>全部</button>']
      .concat(tags.map(t => '<button data-tag="' + escapeHtml(t) + '"' +
        (activeTag === t ? ' class="on"' : '') + '>' + escapeHtml(t) + '</button>'));
    if (drafts) items.push('<button data-tag="__draft"' + (activeTag === '__draft' ? ' class="on"' : '') +
      '>草稿 ' + drafts + '</button>');
    postTagsEl.hidden = tags.length === 0 && drafts === 0;
    postTagsEl.innerHTML = items.join('');
    $$('button', postTagsEl).forEach(b => b.addEventListener('click', () => {
      activeTag = b.dataset.tag || '';
      renderTags(); renderBody();
    }));
  }

  function updateHeroLatest() {
    const box = $('#heroLatest');
    if (!box) return;
    const list = posts.filter(p => !p.draft).sort((a, b) =>
      (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0)));
    const p = list[0];
    if (!p) { box.hidden = true; return; }
    $('#heroLatestTitle').textContent = p.title;
    $('#heroLatestDate').textContent = fmtDate(p.date).replace(/^0/, '');
    box.hidden = false;
  }

  /* 封面：选图 → 压到 640 宽 → 存 dataURL */
  let pendingCover = '';
  const coverFile = $('#pCoverFile');
  const coverPrev = $('#pCoverPrev');
  const coverClear = $('#pCoverClear');
  const coverHint = $('#pCoverHint');

  function paintCover() {
    if (!coverPrev) return;
    if (pendingCover) {
      coverPrev.hidden = false;
      coverPrev.innerHTML = '<img src="' + pendingCover + '" alt="">';
      if (coverClear) coverClear.hidden = false;
      if (coverHint) coverHint.textContent = '已选，列表里会显示这张';
    } else {
      coverPrev.hidden = true;
      coverPrev.innerHTML = '';
      if (coverClear) coverClear.hidden = true;
      if (coverHint) coverHint.textContent = '不选就在列表里显示序号';
    }
  }

  function shrinkCover(file) {
    return new Promise((ok, no) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const w = 480, h = 480;   // 列表里是方图版，直接方裁
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        const s = Math.max(w / img.width, h / img.height);
        const dw = img.width * s, dh = img.height * s;
        g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error('读不了这张图')); };
      img.src = url;
    });
  }

  if ($('#pCover')) $('#pCover').addEventListener('click', () => coverFile && coverFile.click());
  if (coverFile) coverFile.addEventListener('change', async () => {
    const f = coverFile.files && coverFile.files[0];
    if (!f) return;
    try {
      pendingCover = await shrinkCover(f);
      paintCover();
    } catch (e) {
      toast('这张图读不了，换一张试试');
    } finally {
      coverFile.value = '';
    }
  });
  if (coverClear) coverClear.addEventListener('click', () => { pendingCover = ''; paintCover(); });


  /* ── 精选卡 ── */
  const featEl = $('#featCard');
  function renderFeat() {
    if (!featEl) return;
    const list = (typeof posts !== 'undefined' ? posts : []).filter(p => !p.draft);
    if (!list.length) { featEl.hidden = true; return; }
    const byDate = list.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.ts || 0) - (a.ts || 0));
    const pick = byDate.find(p => p.featured) || byDate.find(p => p.cover) || byDate[0];
    if (!pick) { featEl.hidden = true; return; }

    featEl.hidden = false;
    $('#featKicker').textContent = pick.featured ? 'FEATURED · 置顶' : 'LATEST · 最近一篇';
    $('#featTab').textContent = pick.featured ? 'PINNED' : 'LATEST';
    $('#featTitle').textContent = pick.title || '(无题)';
    $('#featExcerpt').textContent = excerptOf(pick.body);
    const words = String(pick.body || '').replace(/\\s/g, '').length;
    $('#featMeta').innerHTML =
      '<span>' + fmtDate(pick.date) + '</span><i class="dot"></i>' +
      (pick.tag ? '<span>' + escapeHtml(pick.tag) + '</span><i class="dot"></i>' : '') +
      '<span>' + words + ' 字 · ' + Math.max(1, Math.round(words / 420)) + ' 分钟</span>';

    const shot = $('#featShot');
    shot.querySelectorAll('img').forEach(n => n.remove());
    if (pick.cover) {
      $('#featNo').style.display = 'none';
      const img = document.createElement('img');
      img.src = pick.cover; img.alt = '';
      shot.appendChild(img);
    } else {
      $('#featNo').style.display = '';
      $('#featNo').textContent = '01';
    }
    const open = () => openPost(pick.id);
    $('#featGo').onclick = open;
    $('#featTitle').onclick = e => { e.preventDefault(); open(); };
    shot.onclick = open;
    featEl.classList.add('js-in');
  }

  // 鼠标：自绘光标 + 三层视差（借 ricoui 的手感，幅度按层递增）
  (function mouseFX() {
    if (matchMedia('(pointer: coarse)').matches) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dot = $('#curDot'), ring = $('#curRing');
    const frame = document.querySelector('.feat-frame');
    const dA = $('#decoA'), dB = $('#decoB');
    let tx = innerWidth / 2, ty = innerHeight / 2, mx = 0, my = 0;
    let dx = tx, dy = ty, rx = tx, ry = ty;
    let f1 = 0, f2 = 0, a1 = 0, a2 = 0, b1 = 0, b2 = 0, raf = 0;
    const HOT = '.feat-case, .feat-text h3, .post, .pcell, .kb-item > summary, .btn, .chip, .tod-btn, .more > button, a, .spirit-cap';

    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      mx = e.clientX / innerWidth - .5;
      my = e.clientY / innerHeight - .5;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    document.addEventListener('pointerover', e => {
      const t = e.target && e.target.closest ? e.target.closest(HOT) : null;
      document.body.classList.toggle('cur-hot', !!t);
    });
    document.addEventListener('pointerleave', () => document.body.classList.remove('cur-hot'));

    function loop() {
      dx += (tx - dx) * .40; dy += (ty - dy) * .40;
      rx += (tx - rx) * .13; ry += (ty - ry) * .13;
      if (dot) dot.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) translate(-50%,-50%)';
      if (ring) ring.style.transform = 'translate(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px) translate(-50%,-50%)';
      if (!reduce) {
        f1 += (mx * 22 - f1) * .08; f2 += (my * 22 - f2) * .08;
        a1 += (mx * 40 - a1) * .08; a2 += (my * 40 - a2) * .08;
        b1 += (mx * 52 - b1) * .08; b2 += (my * 52 - b2) * .08;
        if (frame) frame.style.transform = 'translate3d(' + f1.toFixed(2) + 'px,' + f2.toFixed(2) + 'px,0)';
        if (dA) dA.style.transform = 'translate3d(' + a1.toFixed(2) + 'px,' + a2.toFixed(2) + 'px,0)';
        if (dB) dB.style.transform = 'translate3d(' + b1.toFixed(2) + 'px,' + b2.toFixed(2) + 'px,0)';
      }
      const busy = Math.abs(tx - rx) > .4 || Math.abs(ty - ry) > .4 ||
                   Math.abs(mx * 52 - b1) > .15 || Math.abs(my * 52 - b2) > .15;
      raf = busy ? requestAnimationFrame(loop) : 0;
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };
    addEventListener('pointerdown', wake, { passive: true });
    addEventListener('scroll', wake, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
    });
    window.__ystudio.curTest = (x, y) => {
      tx = x; ty = y; mx = x / innerWidth - .5; my = y / innerHeight - .5;
      for (let i = 0; i < 90; i++) loop();
      document.body.classList.add('cur-on');
      return { dx, dy, rx, ry, f1, a1, b1 };
    };
    document.body.classList.add('cur-on');
    if (!raf) raf = requestAnimationFrame(loop);
  })();

  function renderBody() {
    if (!postListEl) return;
    const list = visiblePosts();
    lastList = list;
    if (postCountEl) postCountEl.textContent = q ? '匹配 ' + list.length + ' 篇' : '共 ' + list.length + ' 篇';
    if (postEmptyEl) {
      postEmptyEl.hidden = list.length > 0;
      postEmptyEl.textContent = activeTag === '__draft'
        ? '还没有草稿。写东西时点「存草稿」，它会先待在这里。'
        : '还没有文章。点「写一篇」，第一句就够开始。';
    }

    if (view === 'archive') {
      const groups = new Map();
      list.forEach(p => {
        const k = (p.date || '').slice(0, 7) || '未标日期';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p);
      });
      let html = '<div class="arch">';
      let first = true;
      Array.from(groups.keys()).sort().reverse().forEach(k => {
        const arr = groups.get(k);
        const label = /^\d{4}-\d{2}$/.test(k) ? k.slice(0, 4) + ' 年 ' + k.slice(5) + ' 月' : k;
        html += '<details class="arch-group"' + (first ? ' open' : '') + '>' +
          '<summary>' + label + '<span class="n">' + arr.length + ' 篇</span></summary>' +
          arr.map(p =>
            '<div class="arch-item" data-id="' + escapeHtml(String(p.id)) + '">' +
              '<span class="d">' + fmtDate(p.date).slice(5) + '</span>' +
              '<span class="t">' + escapeHtml(p.title || '无题') + '</span>' +
              (p.tag ? '<span class="g">' + escapeHtml(p.tag) + '</span>' : '') +
            '</div>').join('') +
          '</details>';
        first = false;
      });
      html += '</div>';
      postListEl.innerHTML = html;
      $$('.arch-item', postListEl).forEach(el =>
        el.addEventListener('click', () => openPost(el.dataset.id)));
    } else {
      postListEl.innerHTML = list.map((p, i) =>
        '<article class="post has-plate reveal' + (p.draft ? ' draft' : '') + '" data-id="' + escapeHtml(String(p.id)) + '">' +
          '<figure class="post-plate">' +
            (p.cover
              ? '<img class="pa" src="' + escapeHtml(p.cover) + '" alt="" loading="lazy">' +
                '<img class="pb" src="' + escapeHtml(p.cover) + '" alt="" loading="lazy">' +
                '<span class="hint">CLOSER</span>'
              : '<span class="no">' + String(i + 1).padStart(2, '0') + '</span>') +
          '</figure>' +
          '<div class="post-main">' +
            '<div class="post-top">' +
              '<span class="post-date">' + fmtDate(p.date) + '</span>' +
              (p.tag ? '<span class="post-tag">' + escapeHtml(p.tag) + '</span>' : '') +
            '</div>' +
            '<div class="post-title-row"><h3>' + escapeHtml(p.title || '无题') + '</h3></div>' +
            '<p class="post-ex">' + escapeHtml(excerptOf(p.body)) + (String(p.body || '').length > 92 ? '…' : '') + '</p>' +
            '<div class="post-foot"><span>' + charsOf(p.body) + ' 字</span>' +
              '<span>' + readMin(p.body) + ' 分钟</span></div>' +
          '</div>' +
        '</article>'
      ).join('');
      $$('.post', postListEl).forEach(el => el.addEventListener('click', () => openPost(el.dataset.id)));
    }
    if (window.__ystudio && window.__ystudio.revealNow) window.__ystudio.revealNow();
    updateHeroLatest();
    try { renderFeat(); } catch (e) {}
  }

  /* ── 阅读器 + 锚点 ─────────────────────────────────── */
  const readerMask = $('#readerMask');
  let openId = null;

  function setHash(id) {
    try {
      const base = location.pathname + location.search;
      history.replaceState(null, '', id ? base + '#post-' + encodeURIComponent(id) : base);
    } catch (e) {}
  }

  function openPost(id, keepHash) {
    const p = posts.find(x => String(x.id) === String(id));
    if (!p || !readerMask) return;
    openId = p.id;
    $('#rDate').textContent = fmtDate(p.date) + (p.tag ? '   ·   ' + p.tag : '');
    $('#rTitle').textContent = p.title || '无题';
    $('#rMeta').textContent = charsOf(p.body) + ' 字  ·  约 ' + readMin(p.body) + ' 分钟读完' +
      (p.draft ? '   ·   草稿' : '');
    $('#rBody').innerHTML = String(p.body || '').split(/\n\s*\n/).map(block => {
      const lines = block.split('\n');
      if (lines[0].trim().startsWith('## '))
        return '<h4>' + escapeHtml(lines[0].trim().slice(3)) + '</h4>' +
          (lines.length > 1 ? '<p>' + escapeHtml(lines.slice(1).join(' ')) + '</p>' : '');
      return '<p>' + escapeHtml(lines.join(' ')) + '</p>';
    }).join('');
    readerMask.classList.add('show');
    document.documentElement.style.overflow = 'hidden';
    updateReaderNav();
    if (keepHash !== false) setHash(p.id);
  }

  function updateReaderNav() {
    const prev = $('#rPrev'), next = $('#rNext'), pos = $('#rPos');
    const i = lastList.findIndex(p => String(p.id) === String(openId));
    const n = lastList.length;
    if (pos) pos.textContent = (i >= 0 && n) ? (i + 1) + ' / ' + n : '';
    if (prev) prev.disabled = !(i > 0);
    if (next) next.disabled = !(i >= 0 && i < n - 1);
  }

  function closeReader() {
    if (!readerMask) return;
    readerMask.classList.remove('show');
    document.documentElement.style.overflow = '';
    const id = openId;
    openId = null;
    if (id) setHash('');
  }

  /* ── 编辑器（含草稿） ──────────────────────────────── */
  const postMask = $('#postMask');
  let editingId = null;

  function openEditor(id, draftMode) {
    if (!postMask) return;
    editingId = id || null;
    const p = id ? posts.find(x => String(x.id) === String(id)) : null;
    const asDraft = draftMode || (p && p.draft);
    $('#postTitle').textContent = p ? (p.draft ? '改草稿' : '改这一篇') : (asDraft ? '写草稿' : '写一篇');
    $('#pTitle').value = p ? (p.title || '') : '';
    $('#pDate').value = p ? (p.date || '') : new Date().toISOString().slice(0, 10);
    $('#pTag').value = p ? (p.tag || '') : '';
    $('#pBody').value = p ? (p.body || '') : '';
    pendingCover = (p && p.cover) ? p.cover : '';
    paintCover();
    const _feat = $('#pFeat'); if (_feat) _feat.checked = !!(p && p.featured);
    postMask.classList.add('show');
    setTimeout(() => $('#pTitle').focus(), 60);
  }

  function closeEditor() { if (postMask) postMask.classList.remove('show'); }


  function applyFeatured(p) {
    const on = !!($('#pFeat') && $('#pFeat').checked);
    p.featured = on;
    if (on) posts.forEach(q => { if (q !== p) q.featured = false; });
  }

  function commit(draft) {
    const title = ($('#pTitle').value || '').trim();
    const body = ($('#pBody').value || '').trim();
    if (!title && !body) { toast('标题或正文，写一个再存'); return; }
    const date = ($('#pDate').value || new Date().toISOString().slice(0, 10));
    const tag = ($('#pTag').value || '').trim();

    if (editingId) {
      const p = posts.find(x => String(x.id) === String(editingId));
      if (p) { p.title = title || '无题'; p.body = body; p.date = date; p.tag = tag;
        applyFeatured(p);
               p.draft = !!draft; p.cover = pendingCover || ''; }
      toast(draft ? '存在草稿里了' : '改好了');
    } else {
      const np = { id: 'p' + Date.now(), title: title || '无题', body, date, tag,
                  draft: !!draft, cover: pendingCover || '', ts: Date.now() };
      posts.push(np);
      applyFeatured(np);
      toast(draft ? '存在草稿里了' : '存进文章了');
    }
    savePosts();
    if (draft) activeTag = '__draft';
    else if (activeTag === '__draft') activeTag = '';
    renderTags(); renderBody(); closeEditor();
    if (window.__ystudio && window.__ystudio.updateCounts) window.__ystudio.updateCounts();
  }

  /* ── 导出 / 导入 ──────────────────────────────────── */
  function exportPosts() {
    const payload = { app: 'Y-STUDIO', kind: 'posts', version: 1,
      exportedAt: new Date().toISOString(), count: posts.length, posts };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'y-studio-posts-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('导出 ' + posts.length + ' 篇');
  }

  function importPosts(file) {
    const fr = new FileReader();
    fr.onload = () => {
      let data = null;
      try { data = JSON.parse(String(fr.result)); } catch (e) { toast('这个文件不是 JSON'); return; }
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.posts) ? data.posts : null);
      if (!list) { toast('文件里没找到文章数组'); return; }
      const clean = list.filter(p => p && typeof p === 'object' && (p.title || p.body)).map(p => ({
        id: String(p.id || ('p' + Date.now() + Math.floor(Math.random() * 999))),
        title: String(p.title || '无题'),
        body: String(p.body || ''),
        date: String(p.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        tag: String(p.tag || ''),
        draft: !!p.draft,
        cover: String(p.cover || ''),
        ts: Number(p.ts) || Date.now(),
      }));
      if (!clean.length) { toast('里面没有能认的文章'); return; }
      if (!confirm('导入 ' + clean.length + ' 篇？同 id 的会被覆盖，其余追加。')) return;
      const byId = new Map(posts.map(p => [p.id, p]));
      clean.forEach(p => byId.set(p.id, p));
      posts = Array.from(byId.values());
      savePosts(); activeTag = ''; renderTags(); renderBody();
      if (window.__ystudio && window.__ystudio.updateCounts) window.__ystudio.updateCounts();
      toast('导入完成，现在共 ' + posts.length + ' 篇');
    };
    fr.readAsText(file, 'utf-8');
  }

  /* ── 绑定 ─────────────────────────────────────────── */
  if ($('#writeBtn')) $('#writeBtn').addEventListener('click', () => openEditor(null, false));
  if ($('#pSave')) $('#pSave').addEventListener('click', () => commit(false));
  if ($('#pDraft')) $('#pDraft').addEventListener('click', () => commit(true));
  if ($('#pCancel')) $('#pCancel').addEventListener('click', closeEditor);
  if ($('#rClose')) $('#rClose').addEventListener('click', closeReader);
  if (readerMask) readerMask.addEventListener('click', e => { if (e.target === readerMask) closeReader(); });
  if (postMask) postMask.addEventListener('click', e => { if (e.target === postMask) closeEditor(); });
  if ($('#rEdit')) $('#rEdit').addEventListener('click', () => { const id = openId; closeReader(); openEditor(id); });
  if ($('#rDel')) $('#rDel').addEventListener('click', () => {
    if (!openId) return;
    if (!confirm('删掉这一篇？删了就找不回来了。')) return;
    posts = posts.filter(x => String(x.id) !== String(openId));
    savePosts(); closeReader(); renderTags(); renderBody();
    if (window.__ystudio && window.__ystudio.updateCounts) window.__ystudio.updateCounts();
    toast('删掉了');
  });

  if ($('#exportBtn')) $('#exportBtn').addEventListener('click', exportPosts);
  if ($('#importBtn') && $('#importFile')) {
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) importPosts(f);
      e.target.value = '';
    });
  }
  if ($('#postSearch')) $('#postSearch').addEventListener('input', e => {
    q = String(e.target.value || '').trim().toLowerCase();
    renderBody();
  });

  const goSibling = step => {
    const i = lastList.findIndex(p => String(p.id) === String(openId));
    if (i < 0) return;
    const p = lastList[i + step];
    if (p) openPost(p.id);
  };
  if ($('#rPrev')) $('#rPrev').addEventListener('click', () => goSibling(-1));
  if ($('#rNext')) $('#rNext').addEventListener('click', () => goSibling(1));

  if ($('#viewList')) $('#viewList').addEventListener('click', () => {
    view = 'list'; try { localStorage.setItem(VKEY, view); } catch (e) {}
    $('#viewList').classList.add('on'); $('#viewArch').classList.remove('on'); renderBody();
  });
  if ($('#viewArch')) $('#viewArch').addEventListener('click', () => {
    view = 'archive'; try { localStorage.setItem(VKEY, view); } catch (e) {}
    $('#viewArch').classList.add('on'); $('#viewList').classList.remove('on'); renderBody();
  });

  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    const readerOpen = readerMask && readerMask.classList.contains('show');
    const postOpen = postMask && postMask.classList.contains('show');

    if (e.key === 'Escape') {
      if (typing && e.target.id === 'postSearch') { e.target.value = ''; q = ''; renderBody(); e.target.blur(); return; }
      if (readerOpen) closeReader();
      else if (postOpen) closeEditor();
      return;
    }
    if (typing) return;

    if (e.key === '/' && !readerOpen && !postOpen) {
      const s = $('#postSearch');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
      return;
    }
    if (readerOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const i = lastList.findIndex(p => String(p.id) === String(openId));
      if (i < 0) return;
      const j = e.key === 'ArrowLeft' ? i - 1 : i + 1;
      if (lastList[j]) { e.preventDefault(); openPost(lastList[j].id); }
    }
  });

  renderTags();
  if (view === 'archive' && $('#viewArch')) { $('#viewArch').classList.add('on'); $('#viewList').classList.remove('on'); }
  renderBody();

  // 打开带 #post-xxx 的链接时直接展开那一篇
  (function fromHash() {
    const m = /^#post-(.+)$/.exec(location.hash || '');
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    if (posts.some(p => String(p.id) === id)) setTimeout(() => openPost(id), 120);
  })();

  /* ── 4c · 生活日志（IndexedDB） ────────────────────── */
  const LDB_NAME = 'ystudio_life';
  let lifeDb = null;
  let lifeLogs = [];
  let lifeReady = false;
  let lifeSeedLock = false;   // 调试种子生效后，别让 IDB 的异步结果把它覆盖

  function openLifeDb() {
    return new Promise((resolve, reject) => {
      let done = false;
      const doneOnce = (v, err) => { if (done) return; done = true; err ? reject(err) : resolve(v); };
      try {
        const req = indexedDB.open(LDB_NAME, 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('logs')) {
            const s = db.createObjectStore('logs', { keyPath: 'id' });
            s.createIndex('date', 'date');
          }
          if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
        };
        req.onsuccess = () => { lifeDb = req.result; doneOnce(lifeDb); };
        req.onerror = () => doneOnce(null, req.error || new Error('idb'));
        req.onblocked = () => doneOnce(null, new Error('blocked'));
      } catch (e) { doneOnce(null, e); }
      setTimeout(() => doneOnce(null, new Error('timeout')), 4000);
    });
  }

  const idb = (store, mode) => lifeDb.transaction(store, mode).objectStore(store);
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function loadLife() {
    try {
      if (!lifeDb) await openLifeDb();
      const all = await reqP(idb('logs', 'readonly').getAll());
      lifeLogs = (all || []).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
      lifeReady = true;
      if (lifeSeedLock) return;
    } catch (e) {
      lifeReady = false;
      console.warn('生活日志用的存储打不开：', e);
    }
    renderLife();
    if (window.__ystudio && window.__ystudio.updateCounts) window.__ystudio.updateCounts();
  }

  const lifeListEl = $('#lifeList');
  const lifeEmptyEl = $('#lifeEmpty');
  const lifeCountEl = $('#lifeCount');
  const lifeUrlCache = new Map();

  function mediaUrl(m) {
    if (m.url) return m.url;                       // 测试用直链
    if (lifeUrlCache.has(m.id)) return lifeUrlCache.get(m.id);
    return '';
  }

  async function hydrateMedia(media) {
    for (const m of media) {
      if (m.url || lifeUrlCache.has(m.id)) continue;
      try {
        const rec = await reqP(idb('media', 'readonly').get(m.id));
        if (rec && rec.blob) lifeUrlCache.set(m.id, URL.createObjectURL(rec.blob));
        if (rec && rec.thumb && !m.thumbUrl) lifeUrlCache.set(m.id + ':t', URL.createObjectURL(rec.thumb));
      } catch (e) {}
    }
  }

  const lifeMonthOpen = new Map();
  function monthKeyOf(d) {
    const s = String(d || '');
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
    if (/^\d{4}/.test(s)) return s.slice(0, 4);
    return '未标日期';
  }
  function monthLabelOf(k) {
    if (/^\d{4}-\d{2}$/.test(k)) return k.slice(0, 4) + ' 年 ' + Number(k.slice(5, 7)) + ' 月';
    if (/^\d{4}$/.test(k)) return k + ' 年';
    return k;
  }
  function entryHtml(e) {
    const media = e.media || [];
    const id = escapeHtml(String(e.id));
    return '<article class="life-item" data-id="' + id + '">' +
      '<span class="life-date">' + fmtDate(e.date) + '</span>' +
      '<div class="life-tools">' +
        '<button data-exp="' + id + '" title="导出这条（zip）">导出</button>' +
        '<button data-del="' + id + '" title="删掉这条">删</button>' +
      '</div>' +
      (e.title ? '<h3 class="life-title">' + escapeHtml(e.title) + '</h3>' : '') +
      (e.text ? '<div class="life-text">' + escapeHtml(e.text) + '</div>' : '') +
      (media.length ? '<div class="life-media">' + media.map((m, i) =>
        '<div class="life-thumb" data-i="' + i + '">' +
          '<img alt="" src="' + escapeHtml(m.thumbUrl || (m.cover === 'builtin' ? BUILTIN_COVER : mediaUrl({ id: m.id + ':t' }))) + '">' +
          (m.kind === 'video'
            ? '<span class="play"><i>▶</i></span>' + (m.dur ? '<span class="dur">' + m.dur + '</span>' : '')
            : '') +
        '</div>').join('') + '</div>' : '') +
    '</article>';
  }

  function renderLife() {
    if (!lifeListEl) return;
    if (lifeCountEl) lifeCountEl.textContent = '共 ' + lifeLogs.length + ' 条';
    if (lifeEmptyEl) lifeEmptyEl.hidden = lifeLogs.length > 0;

    const groups = [];
    lifeLogs.forEach(e => {
      const k = monthKeyOf(e.date);
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k: k, list: [] }; groups.push(g); }
      g.list.push(e);
    });

    lifeListEl.innerHTML = groups.map((g, gi) => {
      const open = lifeMonthOpen.has(g.k) ? lifeMonthOpen.get(g.k) : (gi === 0);
      return '<div class="life-month-wrap">' +
        '<button class="life-month" data-month="' + escapeHtml(g.k) + '">' +
          '<span class="m">' + escapeHtml(monthLabelOf(g.k)) + '</span>' +
          '<span class="n">' + g.list.length + ' 条</span>' +
          '<span class="caret">' + (open ? '−' : '+') + '</span>' +
        '</button>' +
        '<div class="life-month-body"' + (open ? '' : ' hidden') + '>' +
          g.list.map(entryHtml).join('') +
        '</div>' +
      '</div>';
    }).join('');

    lifeListEl.querySelectorAll('.life-month').forEach(btn => {
      btn.addEventListener('click', () => {
        const body = btn.nextElementSibling;
        const wasOpen = !(body && body.hidden);
        lifeMonthOpen.set(btn.dataset.month, !wasOpen);
        if (body) body.hidden = wasOpen;
        const c = btn.querySelector('.caret');
        if (c) c.textContent = wasOpen ? '+' : '−';
      });
    });

    lifeLogs.forEach(e => {
      const node = lifeListEl.querySelector('.life-item[data-id="' + String(e.id).replace(/"/g, '') + '"]');
      if (!node) return;
      (e.media || []).forEach((m, i) => {
        const th = node.querySelector('.life-thumb[data-i="' + i + '"]');
        if (th) th.addEventListener('click', () => openLightbox(e, i));
      });
      const del = node.querySelector('[data-del]');
      if (del) del.addEventListener('click', ev => {
        ev.stopPropagation();
        if (!confirm('删掉这条日志？里面的照片视频也一起删。')) return;
        deleteLife(e.id);
      });
      const exp = node.querySelector('[data-exp]');
      if (exp) exp.addEventListener('click', ev => { ev.stopPropagation(); exportLife(e.id); });
    });

    refreshQuota();
    if (!lifeReady) return;
    (async () => {
      for (const e of lifeLogs) {
        const media = e.media || [];
        if (!media.length) continue;
        await hydrateMedia(media);
        lifeListEl.querySelectorAll('.life-item[data-id="' + String(e.id) + '"] .life-thumb img').forEach((img, i) => {
          const m = media[i];
          if (!m || m.cover === 'builtin') return;
          const t = m.thumbUrl || mediaUrl({ id: m.id + ':t' });
          if (t && img.src !== t) img.src = t;
        });
      }
    })();
  }

  async function deleteLife(id) {
    try {
      const e = lifeLogs.find(x => String(x.id) === String(id));
      if (e && lifeDb) {
        const tx = lifeDb.transaction(['logs', 'media'], 'readwrite');
        tx.objectStore('logs').delete(e.id);
        (e.media || []).forEach(m => {
          tx.objectStore('media').delete(m.id);
          const u = lifeUrlCache.get(m.id); if (u) { URL.revokeObjectURL(u); lifeUrlCache.delete(m.id); }
          const t = lifeUrlCache.get(m.id + ':t'); if (t) { URL.revokeObjectURL(t); lifeUrlCache.delete(m.id + ':t'); }
        });
      }
      lifeLogs = lifeLogs.filter(x => String(x.id) !== String(id));
      renderLife();
      if (window.__ystudio && window.__ystudio.updateCounts) window.__ystudio.updateCounts();
      toast('删掉了');
      refreshQuota();
    } catch (err) { toast('删不掉：' + (err && err.name || err)); }
  }

  /* ── 导出（自带一个 store 模式 zip，无第三方库）────── */
  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  async function makeZip(files) {
    const enc = new TextEncoder(), parts = [], cent = [];
    let off = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const nm = enc.encode(f.name), crc = crc32(data);
      const d = new DataView(new ArrayBuffer(30));
      d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x0800, true); d.setUint16(8, 0, true);
      d.setUint16(10, 0, true); d.setUint16(12, 0, true);
      d.setUint32(14, crc, true); d.setUint32(18, data.length, true); d.setUint32(22, data.length, true);
      d.setUint16(26, nm.length, true); d.setUint16(28, 0, true);
      parts.push(new Uint8Array(d.buffer), nm, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nm.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true);
      c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, off, true);
      cent.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const cs = cent.reduce((n, x) => n + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cs, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(cent, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/^\s+|\s+$/g, '').slice(0, 50);
  }
  function fileNo(i, m) {
    const ext = (m.name || '').match(/\.[A-Za-z0-9]+$/);
    return String(i + 1).padStart(2, '0') + (ext ? ext[0].toLowerCase() : (m.kind === 'video' ? '.mp4' : '.jpg'));
  }
  function mdOf(e) {
    const L = ['# ' + (e.title || fmtDate(e.date)), '', '日期：' + (e.date || ''), ''];
    if (e.text) L.push(e.text, '');
    const media = e.media || [];
    if (media.length) { L.push('## 文件', ''); media.forEach((m, i) => L.push('- ' + fileNo(i, m) + (m.name ? '（' + m.name + '）' : ''))); }
    return L.join('\n');
  }
  async function blobOfMedia(m) {
    if (m.url) { try { const r = await fetch(m.url); return await r.blob(); } catch (e) { return null; } }
    const rec = await reqP(idb('media', 'readonly').get(m.id));
    return rec && rec.blob ? rec.blob : null;
  }

  async function exportLife(id) {
    const e = lifeLogs.find(x => String(x.id) === String(id));
    if (!e) return;
    if (!lifeDb) { try { await openLifeDb(); } catch (err) { toast('存储打不开，导不了'); return; } }
    toast('打包中…');
    const files = [];
    const media = e.media || [];
    for (let i = 0; i < media.length; i++) {
      try { const b = await blobOfMedia(media[i]); if (b) files.push({ name: fileNo(i, media[i]), blob: b }); } catch (err) {}
    }
    files.push({ name: '日志.md', blob: new Blob([mdOf(e)], { type: 'text/markdown;charset=utf-8' }) });
    const zip = await makeZip(files);
    downloadBlob(zip, (e.date || 'log') + '-' + (safeName(e.title) || '日志') + '.zip');
    toast('导出好了');
  }

  async function exportAllLife() {
    if (!lifeLogs.length) { toast('还没有日志'); return; }
    if (!lifeDb) { try { await openLifeDb(); } catch (err) { toast('存储打不开，导不了'); return; } }
    toast('打包中…');
    const files = [];
    for (const e of lifeLogs) {
      const dir = (e.date || 'log') + '-' + (safeName(e.title) || '日志') + '/';
      const media = e.media || [];
      for (let i = 0; i < media.length; i++) {
        try { const b = await blobOfMedia(media[i]); if (b) files.push({ name: dir + fileNo(i, media[i]), blob: b }); } catch (err) {}
      }
      files.push({ name: dir + '日志.md', blob: new Blob([mdOf(e)], { type: 'text/markdown;charset=utf-8' }) });
    }
    const zip = await makeZip(files);
    downloadBlob(zip, 'y-studio-life-' + new Date().toISOString().slice(0, 10) + '.zip');
    toast('导出好了（' + files.length + ' 个文件）');
  }

  /* ── 配额 ─────────────────────────────────────────── */
  function fmtBytes(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  async function refreshQuota() {
    const el = $('#lifeQuota');
    if (!el || !navigator.storage || !navigator.storage.estimate) return;
    try {
      const est = await navigator.storage.estimate();
      el.textContent = est && est.quota ? ('已用 ' + fmtBytes(est.usage) + ' / ' + fmtBytes(est.quota)) : '';
    } catch (e) { el.textContent = ''; }
  }

  /* ── 灯箱 ─────────────────────────────────────────── */
  const lightbox = $('#lightbox');
  let lbEntry = null, lbIndex = 0;

  function openLightbox(entry, i) {
    if (!lightbox) return;
    lbEntry = entry; lbIndex = i;
    paintLightbox();
    lightbox.classList.add('show');
    document.documentElement.style.overflow = 'hidden';
  }

  function paintLightbox() {
    const media = (lbEntry && lbEntry.media) || [];
    const m = media[lbIndex];
    const stage = $('#lbStage'), meta = $('#lbMeta');
    if (!m || !stage) return;
    const full = m.url || mediaUrl(m);
    stage.innerHTML = m.kind === 'video'
      ? '<video src="' + escapeHtml(full) + '" controls autoplay playsinline></video>'
      : '<img alt="" src="' + escapeHtml(full) + '">';
    if (meta) meta.textContent = [lbEntry.title || fmtDate(lbEntry.date),
      (lbIndex + 1) + ' / ' + media.length, m.name || ''].filter(Boolean).join('   ·   ');
    const prev = $('#lbPrev'), next = $('#lbNext');
    if (prev) prev.style.visibility = lbIndex > 0 ? 'visible' : 'hidden';
    if (next) next.style.visibility = lbIndex < media.length - 1 ? 'visible' : 'hidden';
  }

  function closeLightbox() {
    if (!lightbox) return;
    const v = lightbox.querySelector('video'); if (v) v.pause();
    $('#lbStage').innerHTML = '';
    lightbox.classList.remove('show');
    document.documentElement.style.overflow = '';
  }

  /* ── 编辑器：选文件 → 缩放 / 取首帧 ─────────────────── */
  const lifeMask = $('#lifeMask');
  let pending = [];           // {kind, name, blob, thumb, w, h, dur, url}
  let editingLife = null;

  // 内置视频封面（用户指定的「秋日富士」，已压到 720×450）
  const BUILTIN_COVER = 'assets/images/builtin-cover.jpg';

  function fmtDur(sec) {
    if (!isFinite(sec) || sec <= 0) return '';
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  async function shrinkImage(file, maxSide, quality) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', quality));
    return { blob, w, h };
  }

  async function firstFrame(file) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
    await new Promise((res, rej) => {
      v.onloadeddata = res; v.onerror = rej;
      setTimeout(res, 3000);
    });
    try { v.currentTime = Math.min(0.3, (v.duration || 1) * 0.1); } catch (e) {}
    await new Promise(res => setTimeout(res, 260));
    const w = v.videoWidth || 320, h = v.videoHeight || 180;
    const scale = Math.min(1, 420 / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale));
    cv.height = Math.max(1, Math.round(h * scale));
    try { cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); } catch (e) {}
    const thumb = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.78));
    URL.revokeObjectURL(url);
    return { thumb, dur: fmtDur(v.duration), w, h };
  }

  function paintPending() {
    const grid = $('#mediaGrid');
    if (!grid) return;
    grid.innerHTML = pending.map((p, i) =>
      '<div class="media-cell">' +
        '<img alt="" src="' + escapeHtml(p.url) + '">' +
        '<span class="k">' + (p.kind === 'video' ? '视频' : '照片') + '</span>' +
        '<button class="x" data-i="' + i + '">×</button>' +
        (p.kind === 'video' ? '<button class="cov" data-cov="' + i + '">封面</button>' : '') +
      '</div>').join('');
    grid.querySelectorAll('.x').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      if (pending[i] && pending[i].url) URL.revokeObjectURL(pending[i].url);
      pending.splice(i, 1);
      paintPending();
    }));
    grid.querySelectorAll('.cov').forEach(b => b.addEventListener('click', () => openCoverPick(+b.dataset.cov)));
  }

  async function addFiles(files, kind) {
    for (const f of Array.from(files || [])) {
      try {
        if (kind === 'video') {
          const info = await firstFrame(f);
          pending.push({ kind: 'video', name: f.name, blob: f, thumb: info.thumb,
            firstThumb: info.thumb, dur: info.dur, w: info.w, h: info.h,
            url: URL.createObjectURL(info.thumb) });
        } else {
          const big = await shrinkImage(f, 1600, 0.84);
          const small = await shrinkImage(f, 420, 0.78);
          pending.push({ kind: 'photo', name: f.name, blob: big.blob, thumb: small.blob,
            w: big.w, h: big.h, url: URL.createObjectURL(small.blob) });
        }
      } catch (e) { toast('这个文件读不了：' + (f.name || '')); }
    }
    paintPending();
  }

  /* ── 视频封面 ─────────────────────────────────────── */
  let coverTarget = -1;
  function openCoverPick(i) {
    coverTarget = i;
    const p = $('#coverPick');
    if (p) p.hidden = false;
    if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function closeCoverPick() {
    coverTarget = -1;
    const p = $('#coverPick');
    if (p) p.hidden = true;
  }
  function b64ToBlob(u) {
    const cut = u.indexOf(',');
    const mime = u.slice(5, u.indexOf(';'));
    const bin = atob(u.slice(cut + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function applyCover(blob, from) {
    if (coverTarget < 0 || !pending[coverTarget]) return;
    const small = await shrinkImage(blob, 420, 0.8);
    const p = pending[coverTarget];
    if (p.url) URL.revokeObjectURL(p.url);
    p.thumb = small.blob;
    p.url = URL.createObjectURL(small.blob);
    p.coverFrom = from || 'custom';
    paintPending();
    closeCoverPick();
    toast('封面换好了');
  }

  function openLifeEditor(entry) {
    if (!lifeMask) return;
    editingLife = entry || null;
    pending.forEach(p => p.url && URL.revokeObjectURL(p.url));
    pending = [];
    paintPending();
    $('#lifeTitle').textContent = entry ? '改这一条' : '记一条';
    $('#lDate').value = entry ? (entry.date || '') : new Date().toISOString().slice(0, 10);
    $('#lTitleIn').value = entry ? (entry.title || '') : '';
    $('#lText').value = entry ? (entry.text || '') : '';
    lifeMask.classList.add('show');
    setTimeout(() => $('#lTitleIn').focus(), 60);
  }

  function closeLifeEditor() {
    closeCoverPick();
    if (lifeMask) lifeMask.classList.remove('show');
    pending.forEach(p => p.url && URL.revokeObjectURL(p.url));
    pending = [];
    paintPending();
  }

  async function saveLife() {
    const date = $('#lDate').value || new Date().toISOString().slice(0, 10);
    const title = ($('#lTitleIn').value || '').trim();
    const text = ($('#lText').value || '').trim();
    const old = editingLife ? (editingLife.media || []) : [];
    if (!title && !text && !pending.length && !old.length) { toast('写一句，或者加一张照片'); return; }

    try {
      if (!lifeDb) await openLifeDb();
      const id = editingLife ? editingLife.id : ('l' + Date.now());
      const media = old.slice();

      for (const p of pending) {
        const mid = 'm' + Date.now() + Math.floor(Math.random() * 9999);
        await reqP(idb('media', 'readwrite').put({ id: mid, blob: p.blob, thumb: p.thumb,
          kind: p.kind, name: p.name }));
        if (p.thumb) lifeUrlCache.set(mid + ':t', URL.createObjectURL(p.thumb));
        if (p.blob) lifeUrlCache.set(mid, URL.createObjectURL(p.blob));
        media.push({ id: mid, kind: p.kind, name: p.name, w: p.w, h: p.h, dur: p.dur || '',
          cover: p.coverFrom || '' });
      }

      const rec = { id, date, title, text, media, ts: editingLife ? (editingLife.ts || Date.now()) : Date.now() };
      await reqP(idb('logs', 'readwrite').put(rec));

      const i = lifeLogs.findIndex(x => String(x.id) === String(id));
      if (i >= 0) lifeLogs[i] = rec; else lifeLogs.unshift(rec);
      lifeLogs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
      lifeReady = true;
      closeLifeEditor();
      renderLife();
      if (window.__ystudio && window.__ystudio.updateCounts) window.__ystudio.updateCounts();
      toast(editingLife ? '改好了' : '记下了');
      refreshQuota();
    } catch (err) {
      console.warn(err);
      const q = err && (err.name === 'QuotaExceededError' ||
        (err.inner && err.inner.name === 'QuotaExceededError') ||
        /quota/i.test(String(err.message || '')));
      toast(q
        ? '存不下了：这个浏览器给的空间满了。先删几条旧日志，或者把视频换短一点。'
        : '存不进去：' + (err && (err.name || err.message) || '未知错误'));
      refreshQuota();
    }
  }

  if ($('#lifeAdd')) $('#lifeAdd').addEventListener('click', () => openLifeEditor(null));
  if ($('#lifeSave')) $('#lifeSave').addEventListener('click', saveLife);
  if ($('#lifeCancel')) $('#lifeCancel').addEventListener('click', closeLifeEditor);
  if (lifeMask) lifeMask.addEventListener('click', e => { if (e.target === lifeMask) closeLifeEditor(); });
  if ($('#pickPhoto') && $('#filePhoto')) {
    $('#pickPhoto').addEventListener('click', () => $('#filePhoto').click());
    $('#filePhoto').addEventListener('change', e => { addFiles(e.target.files, 'photo'); e.target.value = ''; });
  }
  if ($('#pickVideo') && $('#fileVideo')) {
    $('#pickVideo').addEventListener('click', () => $('#fileVideo').click());
    $('#fileVideo').addEventListener('change', e => { addFiles(e.target.files, 'video'); e.target.value = ''; });
  }
  if ($('#lifeExportAll')) $('#lifeExportAll').addEventListener('click', exportAllLife);
  if ($('#cvFirst')) $('#cvFirst').addEventListener('click', () => {
    const p = pending[coverTarget];
    if (!p || !p.firstThumb) { toast('这段视频没取到首帧'); return; }
    applyCover(p.firstThumb, 'first');
  });
  if ($('#cvBuiltin')) $('#cvBuiltin').addEventListener('click', () => applyCover(b64ToBlob(BUILTIN_COVER), 'builtin'));
  if ($('#cvUpload') && $('#coverFile')) {
    $('#cvUpload').addEventListener('click', () => $('#coverFile').click());
    $('#coverFile').addEventListener('change', e => {
      const f = (e.target.files || [])[0];
      e.target.value = '';
      if (f) applyCover(f, 'custom');
    });
  }
  if ($('#cvCancel')) $('#cvCancel').addEventListener('click', closeCoverPick);
  if ($('#lbClose')) $('#lbClose').addEventListener('click', closeLightbox);
  if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  if ($('#lbPrev')) $('#lbPrev').addEventListener('click', () => { if (lbIndex > 0) { lbIndex--; paintLightbox(); } });
  if ($('#lbNext')) $('#lbNext').addEventListener('click', () => {
    if (lbEntry && lbIndex < (lbEntry.media || []).length - 1) { lbIndex++; paintLightbox(); }
  });

  // 调试入口：直接灌数据渲染（跳过 IDB），仅用于截图与排错
  window.__ystudio = window.__ystudio || {};
  window.__ystudio.lifeSeed = list => {
    lifeLogs = (list || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
    lifeSeedLock = true;
    lifeReady = false;
    renderLife();
    if (window.__ystudio.updateCounts) window.__ystudio.updateCounts();
  };

  window.__ystudio.zipTest = async () => {
    const b = await makeZip([{ name: 'a.txt', blob: new Blob(['hello']) }, { name: 'bb.txt', blob: new Blob(['world!']) }]);
    const u = new Uint8Array(await b.arrayBuffer());
    return { size: u.length, head: [...u.slice(0, 4)].join(','), eocd: [...u.slice(-22, -18)].join(',') };
  };


  // 工具条的“更多”菜单
  (() => {
    const btn = $('#moreBtn'), menu = $('#moreMenu');
    if (!btn || !menu) return;
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    menu.addEventListener('click', () => close());
  })();

  loadLife();

  /* ── 5 · 资料库 ─────────────────────────────────────── */
  const listEl = $('#archiveList');
  const emptyEl = $('#archiveEmpty');
  const filterRow = $('#filterRow');
  const countText = $('#countText');
  let activeFilter = '';

  function renderItems() {
    if (!listEl) return;

    const tags = [...new Set(items.map(i => (i.tag || '').trim()).filter(Boolean))];
    if (activeFilter && !tags.includes(activeFilter)) activeFilter = '';

    if (filterRow) {
      filterRow.innerHTML =
        '<button class="chip' + (activeFilter === '' ? ' on' : '') + '" data-filter="">全部</button>' +
        tags.map(t => '<button class="chip' + (activeFilter === t ? ' on' : '') + '" data-filter="' +
          escapeHtml(t) + '">' + escapeHtml(t) + '</button>').join('');

      $$('.chip', filterRow).forEach(chip => {
        chip.addEventListener('click', () => {
          activeFilter = chip.dataset.filter || '';
          renderItems();
        });
      });
    }

    const shown = activeFilter ? items.filter(i => (i.tag || '').trim() === activeFilter) : items;

    if (countText) countText.textContent = '共 ' + shown.length + ' 条' + (activeFilter ? ' · ' + activeFilter : '');
    if (emptyEl) emptyEl.style.display = shown.length ? 'none' : 'block';

    listEl.innerHTML = shown.map((it, n) => {
      const real = items.indexOf(it);
      const title = it.url
        ? '<a href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(it.title) + '</a>'
        : escapeHtml(it.title);

      return '<div class="row" style="animation-delay:' + Math.min(n * 32, 260) + 'ms">' +
        '<span class="no">' + String(n + 1).padStart(2, '0') + '</span>' +
        '<div>' +
          '<div class="t">' + title + '</div>' +
          (it.note ? '<div class="n">' + escapeHtml(it.note) + '</div>' : '') +
        '</div>' +
        '<span class="tag">' + escapeHtml((it.tag || '').trim() || '未分类') + '</span>' +
        '<button class="del" data-del="' + real + '" aria-label="删除这条">✕</button>' +
      '</div>';
    }).join('');

    $$('[data-del]', listEl).forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.del);
        if (Number.isNaN(i)) return;
        const gone = items.splice(i, 1)[0];
        saveItems();
        renderItems();
        updateHeroCounts();
        toast('已删除' + (gone && gone.title ? '：' + gone.title : ''));
      });
    });

    updateHeroCounts();
  }

  /* ── 6 · 课程：五座桂林石山 ─────────────────────────── */
  const colsEl = $('#subjectCols');
  const courseCount = $('#courseCountText');
  const craneCv = $('#craneCanvas');
  const rangeEl = $('#courseRange');
  const peakRowEl = $('#peakRow');

  /* 山形与站位：高矮、宽窄、前后错落，但不乱到不成形 */
  const PEAK = {
    math: { h: 208, mb: 0, grow: 1.00, lean: -0.10, dx: 0.15, back: 0.52 },
    chem: { h: 168, mb: 10, grow: 0.93, lean: 0.07, dx: -0.13, back: 0.46 },
    eng: { h: 148, mb: 26, grow: 0.87, lean: -0.05, dx: 0.12, back: 0.40 },
    env: { h: 288, mb: 0, grow: 1.20, lean: 0.03, dx: -0.11, back: 0.58 },
    pol: { h: 132, mb: 15, grow: 0.88, lean: 0.11, dx: 0.14, back: 0.42 }
  };

  let rangeProgress = reduced ? 1 : 0;
  let peakEls = [];

  function renderCourses() {
    if (courseCount) courseCount.textContent = '共 ' + courses.length + ' 条';
    if (!colsEl) return;

    if (peakRowEl) {
      peakRowEl.innerHTML = SUBJECTS.map(s => {
        const cfg = PEAK[s.key] || { grow: 1, mb: 0 };
        return '<div class="pcell" style="flex-grow:' + cfg.grow + ';--mb:' + cfg.mb + 'px">' +
          '<canvas class="peakc" data-peak="' + s.key + '"></canvas></div>';
      }).join('');
    }

    colsEl.innerHTML = SUBJECTS.map(s => {
      const mine = courses.filter(c => c.subject === s.key);
      const cfg = PEAK[s.key] || { grow: 1 };

      const rows = mine.slice(0, 5).map(it => {
        const idx = courses.indexOf(it);
        const t = it.url
          ? '<a href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener noreferrer" title="' +
            escapeHtml(it.title) + '">' + escapeHtml(it.title) + '</a>'
          : '<a href="javascript:void 0" title="' + escapeHtml(it.title) + '">' + escapeHtml(it.title) + '</a>';
        return '<div class="subj-item">' + t +
          '<button class="kill" data-cdel="' + idx + '" aria-label="删除">✕</button></div>';
      }).join('');

      return '<article class="subj" data-sub="' + s.key + '" style="flex-grow:' + cfg.grow + '">' +
        '<div class="pname"><span class="pc" data-count="' + s.key + '">' +
          String(mine.length).padStart(2, '0') + '</span><b>' + s.name + '</b></div>' +
        '<div class="subj-items">' + (rows || '<span class="subj-none">暂无</span>') +
          (mine.length > 5 ? '<div class="subj-more">+' + (mine.length - 5) + ' 条</div>' : '') +
        '</div>' +
        '<button class="subj-add" data-add="' + s.key + '">＋ 加到' + s.name + '</button>' +
      '</article>';
    }).join('');

    $$('[data-add]', colsEl).forEach(b => b.addEventListener('click', () => openCourseModal(b.dataset.add)));
    $$('[data-cdel]', colsEl).forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const i = Number(b.dataset.cdel);
      courses.splice(i, 1);
      saveCourses();
      renderCourses();
      updateHeroCounts();
      toast('已删除');
    }));

    mountPeaks();
    updateHeroCounts();
  }

  function mountPeaks() {
    const root = peakRowEl || colsEl;
    if (!root) return;
    peakEls = $$('.peakc', root).map(cv => ({ cv: cv, key: cv.dataset.peak }));
    paintPeaks();
    bindPeakHover();
  }


  /* 五峰悬停：抬起 + 峰顶浮出「学科 · N 条」 */
  function bindPeakHover() {
    peakEls.forEach(function (p) {
      const cell = p.cv && p.cv.parentElement;
      if (!cell || cell.dataset.pkBound) return;
      cell.dataset.pkBound = '1';
      const s = (typeof SUBJECTS !== 'undefined' ? SUBJECTS : []).find(function (x) { return x.key === p.key; });
      const name = s ? s.name : p.key;
      const n = courses.filter(function (c) { return c.subject === p.key; }).length;
      let tag = cell.querySelector('.pk-tag');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'pk-tag';
        cell.appendChild(tag);
      }
      tag.textContent = n ? (name + ' · ' + n + ' 条') : (name + ' · 暂无');
      cell.addEventListener('pointerenter', function () { cell.classList.add('hot'); });
      cell.addEventListener('pointerleave', function () { cell.classList.remove('hot'); });
    });
  }

  function peakHeight(key) {
    const cfg = PEAK[key] || { h: 150 };
    const n = courses.filter(c => c.subject === key).length;
    return (cfg.h || 150) + Math.min(34, n * 4);
  }

  /* 一座石山：喀斯特折线轮廓，自下往上长，山脚化进纸里 */
  const PEAK_PTS = [
    [-1.000, 0.000], [-0.845, 0.075], [-0.735, 0.215], [-0.640, 0.395],
    [-0.545, 0.575], [-0.448, 0.716], [-0.330, 0.822], [-0.196, 0.912],
    [-0.070, 0.978], [0.020, 1.000], [0.130, 0.958], [0.258, 0.884],
    [0.372, 0.782], [0.482, 0.652], 
    [0.505, 0.650], [0.615, 0.475], [0.720, 0.290], [0.855, 0.110],
    [1.000, 0.000]
  ];

  function peakPath(g, cx, base, halfW, ph, pts, wob) {
    const P = pts.map(([fx, fy], k) => [
      cx + fx * halfW * (1 + wob * 0.012 * Math.sin(k * 2.1)),
      base - fy * ph
    ]);
    g.beginPath();
    g.moveTo(P[0][0], P[0][1]);
    for (let k = 0; k < P.length - 1; k++) {
      const p0 = P[k - 1] || P[k];
      const p1 = P[k];
      const p2 = P[k + 1];
      const p3 = P[k + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      g.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
    }
    g.closePath();
  }

  function drawPeak(cv, key) {
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = rect.width, H = rect.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);

    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const cfg = PEAK[key] || { h: 150, lean: 0, dx: 0.12, back: 0.45 };
    const base = H - 1;
    const full = Math.min(H - 8, peakHeight(key));
    const ph = Math.max(4, full * rangeProgress);
    const lean = cfg.lean || 0;
    const cx = W / 2 + W * lean * 0.10;
    const halfW = Math.min(W * 0.44, ph * 0.56);

    /* 后山：更淡一层，偏在一侧 */
    const bx = cx + W * (cfg.dx || 0.1) * 0.9;
    const bh = ph * (cfg.back || 0.45);
    const bw = halfW * 0.72;
    peakPath(g, bx, base, bw, bh, PEAK_PTS, 0.6);
    g.fillStyle = 'rgba(56,92,76,0.11)';
    g.fill();

    /* 主峰 */
    peakPath(g, cx, base, halfW, ph, PEAK_PTS, 1);

    const fill = g.createLinearGradient(0, base - ph, 0, base);
    fill.addColorStop(0.00, 'rgba(30,58,46,0.66)');
    fill.addColorStop(0.34, 'rgba(40,74,60,0.46)');
    fill.addColorStop(0.66, 'rgba(62,100,84,0.24)');
    fill.addColorStop(1.00, 'rgba(90,124,106,0.03)');
    g.fillStyle = fill;
    g.fill();

    g.save();
    g.clip();

    /* 背光侧压深：右侧一道墨 */
    const side = g.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    side.addColorStop(0, 'rgba(16,36,28,0)');
    side.addColorStop(0.55, 'rgba(16,36,28,0.05)');
    side.addColorStop(0.88, 'rgba(16,36,28,0.20)');
    side.addColorStop(1, 'rgba(16,36,28,0.28)');
    g.fillStyle = side;
    g.fillRect(cx - halfW, base - ph, halfW * 2, ph);

    /* 皴：短而斜的墨笔，聚在两侧 */
    let seed = 7;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    g.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      const t = rnd();
      const sideSign = t < 0.5 ? -1 : 1;
      const fy = 0.18 + rnd() * 0.72;
      const edge = 0.92 - Math.abs(fy - 0.55) * 0.55;
      const x0 = cx + sideSign * halfW * edge * (0.30 + rnd() * 0.52);
      const y0 = base - ph * fy;
      const len = ph * (0.05 + rnd() * 0.10);
      const dxs = sideSign * len * (0.42 + rnd() * 0.30);
      g.strokeStyle = 'rgba(14,34,26,' + (0.05 + rnd() * 0.09).toFixed(3) + ')';
      g.lineWidth = 0.8 + rnd() * 0.9;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + dxs * 0.55, y0 + len * 0.5, x0 + dxs, y0 + len);
      g.stroke();
    }

    /* 竖向石纹：石灰岩的细竖条 */
    for (let k = 0; k < 9; k++) {
      const fx = -0.72 + k * 0.17 + rnd() * 0.06;
      const x0 = cx + fx * halfW;
      const yTop = base - ph * (0.42 + rnd() * 0.42);
      const yBot = base - ph * (0.10 + rnd() * 0.16);
      g.strokeStyle = 'rgba(250,250,246,' + (0.07 + rnd() * 0.09).toFixed(3) + ')';
      g.lineWidth = 0.7 + rnd() * 0.6;
      g.beginPath();
      g.moveTo(x0, yTop);
      g.quadraticCurveTo(x0 + (rnd() - 0.5) * 4, (yTop + yBot) / 2, x0 + (rnd() - 0.5) * 6, yBot);
      g.stroke();
    }

    /* 左肩擦光 */
    const rim = g.createLinearGradient(cx - halfW, 0, cx - halfW * 0.52, 0);
    rim.addColorStop(0, 'rgba(250,250,244,0.16)');
    rim.addColorStop(1, 'rgba(250,250,244,0)');
    g.fillStyle = rim;
    g.fillRect(cx - halfW, base - ph, halfW * 0.52, ph);
    g.restore();

    /* 轮廓：一侧墨线、一侧留白 */
    peakPath(g, cx, base, halfW, ph, PEAK_PTS, 1);
    g.strokeStyle = 'rgba(18,38,28,0.42)';
    g.lineWidth = 1.25;
    g.stroke();

    /* 山脚化进纸里 */
    const mist = g.createLinearGradient(0, base - ph * 0.34, 0, base);
    mist.addColorStop(0, 'rgba(239,237,228,0)');
    mist.addColorStop(0.52, 'rgba(239,237,228,0.40)');
    mist.addColorStop(1, 'rgba(239,237,228,0.93)');
    g.fillStyle = mist;
    g.fillRect(0, Math.max(0, base - ph * 0.34), W, Math.min(H, ph * 0.34 + 1));
  }

  function paintPeaks() {
    peakEls.forEach(p => drawPeak(p.cv, p.key));
  }

  function growPeaks() {
    if (!peakEls.length) return;
    if (reduced) {
      rangeProgress = 1;
      paintPeaks();
      drawCranes();
      return;
    }
    const t0 = performance.now();
    (function step(now) {
      const k = clamp((now - t0) / 1250, 0, 1);
      rangeProgress = 1 - Math.pow(1 - k, 3);
      paintPeaks();
      if (k < 1) requestAnimationFrame(step);
      else { drawCranes(); startCranes(); }
    })(performance.now());
  }

  /* ── 7 · 仙鹤绕主峰 ─────────────────────────────────── */
  const CRANES = [
    { a: 0.0, sp: 0.30, rx: 0.52, ry: 0.30, s: 2.75, ph: 0.0 },
    { a: 2.2, sp: 0.24, rx: 0.66, ry: 0.20, s: 2.15, ph: 1.4 },
    { a: 4.1, sp: 0.36, rx: 0.40, ry: 0.40, s: 1.75, ph: 2.7 }
  ];
  let craneRAF = 0, craneLast = 0, craneT = 0, craneOn = false;
  let farRidge = null, farRidgeSize = '';

  /* 远山：一排圆钝的淡影，压在五峰脚下 */
  function buildFarRidge(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const base = h * 0.995;
    const hills = [
      [0.04, 0.150, 0.20], [0.17, 0.096, 0.13], [0.30, 0.128, 0.17],
      [0.44, 0.086, 0.12], [0.56, 0.170, 0.22], [0.70, 0.100, 0.14],
      [0.83, 0.140, 0.18], [0.95, 0.090, 0.12]
    ];
    hills.forEach(([cx, hh, hw], k) => {
      const x = cx * w, py = base - hh * h * 0.62, pw = hw * w;
      g.beginPath();
      g.moveTo(x - pw, base);
      g.bezierCurveTo(x - pw * 0.42, py, x - pw * 0.10, py * 0.995, x, py * 0.985);
      g.bezierCurveTo(x + pw * 0.16, py, x + pw * 0.44, py + 4, x + pw, base);
      g.closePath();
      g.fillStyle = 'rgba(58,94,78,' + (0.085 + (k % 3) * 0.018).toFixed(3) + ')';
      g.fill();
    });

    /* 山脚一层更淡的雾，把远山压进纸里 */
    const m = g.createLinearGradient(0, base - h * 0.10, 0, base);
    m.addColorStop(0, 'rgba(239,237,228,0)');
    m.addColorStop(1, 'rgba(239,237,228,0.85)');
    g.fillStyle = m;
    g.fillRect(0, base - h * 0.10, w, h * 0.10 + 1);

    return cv;
  }

  function crane(g, x, y, s, flap, alpha, flip) {
    g.save();
    g.translate(x, y);
    g.scale(flip ? -s : s, s);
    g.globalAlpha = clamp(alpha, 0, 1);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const up = 0.5 + 0.5 * flap;              /* 0 收翅 · 1 展翅 */
    const wing = (dx, dy, w0, w1, a) => {     /* 渐细的一笔翅 */
      g.beginPath();
      g.moveTo(0.4, 0.1);
      g.quadraticCurveTo(dx * 0.42, dy * 0.46, dx, dy);
      g.quadraticCurveTo(dx * 0.46 + 0.5, dy * 0.52 + w1, 0.1, 0.4);
      g.closePath();
      g.fillStyle = 'rgba(26,42,34,' + a + ')';
      g.fill();
    };
    /* 远翼 */
    wing(-6.2, -3.4 - up * 4.6, 0.9, 0.5, 0.40);
    /* 近翼 */
    wing(6.6, -2.6 - up * 5.6, 1.1, 0.6, 0.86);

    /* 身体 */
    g.beginPath();
    g.ellipse(-0.4, 0.5, 2.2, 0.95, -0.12, 0, 6.2832);
    g.fillStyle = 'rgba(26,42,34,0.90)';
    g.fill();

    /* 长颈 + 头 + 喙 */
    g.strokeStyle = 'rgba(26,42,34,0.90)';
    g.lineWidth = 0.85;
    g.beginPath();
    g.moveTo(1.2, 0.1);
    g.quadraticCurveTo(4.4, -1.6, 6.4, -2.7);
    g.stroke();
    g.beginPath();
    g.arc(6.75, -2.82, 0.58, 0, 6.2832);
    g.fillStyle = 'rgba(26,42,34,0.92)';
    g.fill();
    g.strokeStyle = 'rgba(26,42,34,0.7)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(7.25, -2.8);
    g.lineTo(8.9, -2.55);
    g.stroke();

    /* 拖在身后的双腿 */
    g.strokeStyle = 'rgba(26,42,34,0.44)';
    g.lineWidth = 0.5;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      g.moveTo(-1.9, 0.9 + k * 0.4);
      g.lineTo(-6.2 - k * 0.5, 1.7 + k * 0.8);
      g.stroke();
    }
    g.restore();
  }

  function drawCranes() {
    if (!craneCv || !rangeEl || !colsEl) return;
    const rr = rangeEl.getBoundingClientRect();
    if (rr.width < 10 || rr.height < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(rr.width * dpr), ch = Math.round(rr.height * dpr);
    if (craneCv.width !== cw || craneCv.height !== ch) {
      craneCv.width = cw;
      craneCv.height = ch;
    }
    const g = craneCv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, rr.width, rr.height);

    /* 远山只落在山行那一条带里 */
    const prowEl = peakRowEl || colsEl;
    const pr = prowEl.getBoundingClientRect();
    if (pr.height > 10) {
      const sizeKey = Math.round(pr.width) + 'x' + Math.round(pr.height);
      if (!farRidge || farRidgeSize !== sizeKey) {
        farRidge = buildFarRidge(pr.width, pr.height);
        farRidgeSize = sizeKey;
      }
      if (farRidge) {
        const py = pr.top - rr.top;
        g.save();
        g.beginPath();
        g.rect(0, py, rr.width, pr.height);
        g.clip();
        g.drawImage(farRidge, pr.left - rr.left, py, pr.width, pr.height);
        g.restore();
      }
    }

    const host = (peakRowEl || colsEl).querySelector('.peakc[data-peak="env"]');
    if (!host) return;
    const hr = host.getBoundingClientRect();
    if (!hr.width) return;
    const cx = hr.left - rr.left + hr.width / 2;
    const cy = hr.top - rr.top + hr.height * 0.24;

    CRANES.forEach(c => {
      const a = c.a + craneT * c.sp;
      const x = cx + Math.cos(a) * hr.width * c.rx;
      const y = cy - Math.sin(a) * hr.width * c.ry + Math.sin(a * 1.7) * 3;
      const depth = 0.5 + 0.5 * Math.sin(a + 1.1);       /* 转到前面亮一点 */
      const flap = Math.sin(craneT * 4.6 + c.ph);
      crane(g, x, y, c.s * (0.86 + 0.24 * depth), flap, 0.30 + 0.42 * depth, Math.cos(a) < 0);
    });
  }

  function craneLoop(now) {
    const dt = Math.min(0.05, (now - craneLast) / 1000);
    craneLast = now;
    craneT += dt;
    drawCranes();
    craneRAF = requestAnimationFrame(craneLoop);
  }
  function startCranes() {
    if (craneOn || reduced || !craneCv) return;
    craneOn = true;
    craneLast = performance.now();
    craneRAF = requestAnimationFrame(craneLoop);
  }
  function stopCranes() {
    craneOn = false;
    if (craneRAF) cancelAnimationFrame(craneRAF);
    craneRAF = 0;
  }

  if (rangeEl) {
    if ('IntersectionObserver' in window) {
      const seen = new IntersectionObserver(es => {
        es.forEach(en => {
          if (!en.isIntersecting) return;
          seen.disconnect();
          growPeaks();
          const vis = new IntersectionObserver(v => {
            v.forEach(x => { if (x.isIntersecting) startCranes(); else stopCranes(); });
          }, { threshold: 0.05 });
          vis.observe(rangeEl);
        });
      }, { threshold: 0.16 });
      seen.observe(rangeEl);
    } else {
      growPeaks();
    }

    let rzT = null;
    window.addEventListener('resize', () => {
      clearTimeout(rzT);
      rzT = setTimeout(() => { paintPeaks(); drawCranes(); }, 180);
    }, { passive: true });
  }

  /* ── 8 · 弹层 ───────────────────────────────────────── */
  let lastFocus = null;

  function openMask(mask, focusEl) {
    lastFocus = document.activeElement;
    mask.classList.add('show');
    document.body.style.overflow = 'hidden';
    if (focusEl) setTimeout(() => focusEl.focus(), 120);
  }
  function closeMask(mask) {
    mask.classList.remove('show');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  const modalMask = $('#modalMask');
  const courseMask = $('#courseModalMask');

  const f = id => document.getElementById(id);

  const addBtn = $('#addBtn');
  if (addBtn && modalMask) {
    addBtn.addEventListener('click', () => {
      ['fTitle', 'fUrl', 'fTag', 'fNote'].forEach(id => { const el = f(id); if (el) el.value = ''; });
      openMask(modalMask, f('fTitle'));
    });
  }

  if (modalMask) {
    const cancel = $('#cancelBtn');
    if (cancel) cancel.addEventListener('click', () => closeMask(modalMask));
    modalMask.addEventListener('click', e => { if (e.target === modalMask) closeMask(modalMask); });

    const saveBtn = $('#saveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const title = (f('fTitle').value || '').trim();
      if (!title) { toast('先写个标题'); f('fTitle').focus(); return; }
      items.unshift({
        title,
        url: (f('fUrl').value || '').trim(),
        note: (f('fNote').value || '').trim(),
        tag: (f('fTag').value || '').trim(),
        ts: Date.now()
      });
      saveItems();
      activeFilter = '';
      renderItems();
      closeMask(modalMask);
      toast('已收进资料库');
    });
  }

  function openCourseModal(preset) {
    if (!courseMask) return;
    const sel = f('cSubject');
    if (sel) sel.value = preset || 'math';
    ['cTitle', 'cUrl', 'cNote'].forEach(id => { const el = f(id); if (el) el.value = ''; });
    const ty = f('cType');
    if (ty) ty.value = 'ppt';
    openMask(courseMask, f('cTitle'));
  }

  if (courseMask) {
    const addC = $('#addCourseBtn');
    if (addC) addC.addEventListener('click', () => openCourseModal('math'));

    const cancelC = $('#courseCancelBtn');
    if (cancelC) cancelC.addEventListener('click', () => closeMask(courseMask));
    courseMask.addEventListener('click', e => { if (e.target === courseMask) closeMask(courseMask); });

    const saveC = $('#courseSaveBtn');
    if (saveC) saveC.addEventListener('click', () => {
      const title = (f('cTitle').value || '').trim();
      if (!title) { toast('先写个标题'); f('cTitle').focus(); return; }
      courses.unshift({
        subject: (f('cSubject').value || 'math'),
        title,
        type: (f('cType').value || 'ppt'),
        url: (f('cUrl').value || '').trim(),
        note: (f('cNote').value || '').trim(),
        ts: Date.now()
      });
      saveCourses();
      renderCourses();
      drawPeaks();
      closeMask(courseMask);
      toast('已存到这座山');
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modalMask && modalMask.classList.contains('show')) closeMask(modalMask);
    else if (courseMask && courseMask.classList.contains('show')) closeMask(courseMask);
  });

  /* ── 9 · 导航 / 进度 / 揭示 ─────────────────────────── */
  const navLinks = $('#navLinks');
  const navToggle = $('#navToggle');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    $$('a', navLinks).forEach(a => a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }));
  }

  const bar = $('#progressBar');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  const navA = $$('#navLinks a');
  if ('IntersectionObserver' in window) {
    const secIO = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const id = en.target.id;
        navA.forEach(a => a.classList.toggle('active', a.dataset.nav === id));
      });
    }, { rootMargin: '-45% 0px -48% 0px', threshold: 0 });
    $$('main section[id]').forEach(s => secIO.observe(s));
  }

  if ('IntersectionObserver' in window && !reduced) {
    const rIO = new IntersectionObserver(entries => {
      entries.forEach((en, i) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        setTimeout(() => el.classList.add('in'), i * 70);
        rIO.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('.reveal').forEach(el => rIO.observe(el));
  } else {
    $$('.reveal').forEach(el => el.classList.add('in'));
  }

  /* ── 09b · 漓江俯瞰：一条江从左上缓缓蜿蜒流到右边 ─────────── */
  const initRiver = (function () {
    const cv = document.getElementById('riverCanvas');
    if (!cv) return function () {};
    const ctx = cv.getContext('2d');
    if (!ctx) return function () {};

    // 河心线（归一化，俯瞰）：入画 → 两个大弯 → 出画
    const CTRL = [
      [-0.30, 0.16], [-0.18, 0.26], [-0.05, 0.38], [0.07, 0.52],
      [0.17, 0.64], [0.28, 0.68], [0.38, 0.55], [0.45, 0.38],
      [0.54, 0.31], [0.63, 0.38], [0.70, 0.55], [0.79, 0.66],
      [0.90, 0.60], [1.10, 0.42], [1.40, 0.26]
    ];
    const N = 300;

    let W = 0, H = 0, dpr = 1, terr = null;
    let pts = [], flow = [], static_ = false;
    let raf = 0, running = false, last = 0, clock = 0;

    const catmull = (a, b, c, d, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    };

    let seed = 7654321;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    function buildCurve() {
      pts = [];
      const n = CTRL.length - 3;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1) * n;
        const seg = Math.min(n - 1, Math.floor(u));
        const t = u - seg;
        const x = catmull(CTRL[seg][0], CTRL[seg + 1][0], CTRL[seg + 2][0], CTRL[seg + 3][0], t);
        const y = catmull(CTRL[seg][1], CTRL[seg + 1][1], CTRL[seg + 2][1], CTRL[seg + 3][1], t);
        const sN = i / (N - 1);
        // 河宽：中段阔，出画处收窄；带一点自然的起伏
        const w = 0.0148 + 0.0104 * Math.sin(Math.PI * Math.min(1, sN * 1.05)) + 0.0032 * Math.sin(sN * 11.3 + 1.2);
        pts.push({ x: x * W, y: y * H, w: w * W });
      }
      for (let i = 0; i < N; i++) {
        const a = pts[Math.max(0, i - 2)], b = pts[Math.min(N - 1, i + 2)];
        let nx = b.y - a.y, ny = -(b.x - a.x);
        const L = Math.hypot(nx, ny) || 1;
        pts[i].nx = nx / L; pts[i].ny = ny / L;
      }
    }

    function riverPath(g, off) {
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const p = pts[i], o = p.w * (off == null ? 1 : off);
        const x = p.x + p.nx * o, y = p.y + p.ny * o;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      for (let i = N - 1; i >= 0; i--) {
        const p = pts[i], o = p.w * (off == null ? -1 : -off);
        g.lineTo(p.x + p.nx * o, p.y + p.ny * o);
      }
      g.closePath();
    }

    function distToRiver(x, y) {
      let best = 1e9, wAt = 1;
      for (let i = 0; i < N; i += 3) {
        const p = pts[i];
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < best) { best = d; wAt = p.w; }
      }
      return { d: best, w: wAt };
    }

    // 一圈等高线：半径按角度起伏，像手绘的地形
    function ring(g, cx, cy, r, ph, alpha, lw) {
      g.beginPath();
      for (let k = 0; k <= 64; k++) {
        const th = k / 64 * Math.PI * 2;
        const rr = r * (1 + 0.13 * Math.sin(3 * th + ph) + 0.07 * Math.sin(5 * th + ph * 1.7));
        const x = cx + Math.cos(th) * rr * 1.12;
        const y = cy + Math.sin(th) * rr * 0.86;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.strokeStyle = 'rgba(46,84,70,' + alpha.toFixed(3) + ')';
      g.lineWidth = lw;
      g.stroke();
    }

    // 一团不规则的淡墨（山影、田垄都用它）
    function wash(g, cx, cy, rx, ry, angle, color) {
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      g.beginPath();
      const K = 9;
      for (let k = 0; k <= K; k++) {
        const th = k / K * Math.PI * 2;
        const wob = 1 + 0.16 * Math.sin(th * 2.3 + angle * 3) + 0.09 * Math.sin(th * 4.7);
        const x = Math.cos(th) * rx * wob;
        const y = Math.sin(th) * ry * wob;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.restore();
    }

    function paintTerrain() {
      terr = document.createElement('canvas');
      terr.width = Math.max(1, Math.round(W * dpr));
      terr.height = Math.max(1, Math.round(H * dpr));
      const g = terr.getContext('2d');
      g.scale(dpr, dpr);

      const bg = g.createLinearGradient(0, 0, W * 0.4, H);
      bg.addColorStop(0, '#EDEBE1');
      bg.addColorStop(0.5, '#EFEDE4');
      bg.addColorStop(1, '#F1EFE7');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      /* ── 田垄：几团不规则的淡绿 / 淡赭 ── */
      let patches = 0;
      for (let i = 0; i < 90 && patches < 6; i++) {
        const p = pts[Math.floor(rnd() * (N - 2)) + 1];
        const side = rnd() > 0.5 ? 1 : -1;
        const gap = p.w * (2.4 + rnd() * 1.8) * side;
        const cx = p.x + p.nx * gap, cy = p.y + p.ny * gap;
        if (cx < -60 || cx > W + 60 || cy < -40 || cy > H + 40) continue;
        patches++;
        const rx = Math.min(W, H) * (0.075 + rnd() * 0.085);
        const ry = rx * (0.30 + rnd() * 0.26);
        const tone = rnd();
        wash(g, cx, cy, rx, ry, (rnd() - 0.5) * 0.8,
             tone > 0.55 ? 'rgba(120,152,132,.042)'
             : tone > 0.25 ? 'rgba(168,148,108,.040)'
             : 'rgba(140,164,150,.038)');
        // 田埂：两道很浅的弧线
        g.strokeStyle = 'rgba(22,36,31,.045)';
        g.lineWidth = 0.8;
        for (let k = 0; k < 2; k++) {
          const yy = cy + (k ? 0.42 : -0.3) * ry;
          g.beginPath();
          g.moveTo(cx - rx * 0.86, yy + (rnd() - 0.5) * 6);
          g.quadraticCurveTo(cx + (rnd() - 0.5) * rx * 0.4, yy - ry * 0.5, cx + rx * 0.86, yy + (rnd() - 0.5) * 6);
          g.stroke();
        }
      }

      /* ── 山：轻等高线 + 一点墨晕 ── */
      const clusters = [];
      for (let c = 0; c < 5; c++) {
        clusters.push({ x: 30 + rnd() * (W - 60), y: 8 + rnd() * (H - 16), n: 1 + Math.floor(rnd() * 3) });
      }
      let hills = 0;
      clusters.forEach(cl => {
        const near0 = distToRiver(cl.x, cl.y);
        if (near0.d < near0.w * 2.8) return;
        for (let k = 0; k < cl.n && hills < 14; k++) {
          const x = cl.x + (rnd() - 0.5) * Math.min(W, H) * 0.22;
          const y = cl.y + (rnd() - 0.5) * Math.min(W, H) * 0.17;
          const near = distToRiver(x, y);
          if (near.d < near.w * 2.2) continue;
          hills++;
          const r = Math.min(W, H) * (0.014 + rnd() * 0.05);
          const ph = rnd() * 6.28;
          wash(g, x - r * 0.28, y + r * 0.12, r * 1.15, r * 0.85, ph * 0.4, 'rgba(30,56,46,.035)');
          ring(g, x, y, r, ph, 0.070, 0.8);
          ring(g, x, y, r * 0.58, ph + 0.5, 0.095, 0.8);
        }
      });

      /* ── 村：几粒屋脊 ── */
      let villages = 0;
      for (let i = 0; i < 60 && villages < 3; i++) {
        const p = pts[Math.floor(rnd() * (N - 2)) + 1];
        const side = rnd() > 0.5 ? 1 : -1;
        const cx = p.x + p.nx * p.w * (1.7 + rnd() * 1.0) * side;
        const cy = p.y + p.ny * p.w * (1.7 + rnd() * 1.0) * side;
        if (cx < 24 || cx > W - 24 || cy < 24 || cy > H - 24) continue;
        villages++;
        for (let k = 0; k < 5; k++) {
          g.fillStyle = 'rgba(166,71,46,.12)';
          g.fillRect(cx + (rnd() - 0.5) * 34, cy + (rnd() - 0.5) * 24, 5 + rnd() * 5, 3.4 + rnd() * 3);
        }
      }

      /* ── 江：先渗边，再落水，最后勾岸 ── */
      g.save();
      g.lineJoin = 'round';
      g.lineCap = 'round';

      // 渗开的边（多遍浅描，做出毛边）
      for (let k = 0; k < 7; k++) {
        g.save();
        g.translate((rnd() - 0.5) * 3.2, (rnd() - 0.5) * 3.2);
        riverPath(g, 1.0 + k * 0.045);
        g.strokeStyle = 'rgba(96,138,152,' + (0.052 - k * 0.006).toFixed(3) + ')';
        g.lineWidth = 7 - k * 0.7;
        g.stroke();
        g.restore();
      }

      // 水
      riverPath(g, 1.0);
      const water = g.createLinearGradient(0, 0, W * 0.2, H);
      water.addColorStop(0, '#93AFB5');
      water.addColorStop(0.45, '#74979F');
      water.addColorStop(1, '#63868F');
      g.fillStyle = water;
      g.fill();

      // 水面色斑
      g.save();
      riverPath(g, 1.0);
      g.clip();
      for (let k = 0; k < 70; k++) {
        const p = pts[Math.floor(rnd() * (N - 2)) + 1];
        const off = (rnd() * 2 - 1) * 0.9;
        const cx = p.x + p.nx * p.w * off, cy = p.y + p.ny * p.w * off;
        const rr = p.w * (0.3 + rnd() * 0.7);
        const light = rnd() > 0.5;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
        gr.addColorStop(0, light ? 'rgba(228,240,240,.085)' : 'rgba(34,66,80,.075)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(cx, cy, rr, rr * 0.55, rnd() * 3, 0, 6.2832);
        g.fill();
      }
      g.restore();

      // 岸：一道墨，不描白边
      riverPath(g, 1.0);
      g.strokeStyle = 'rgba(22,36,31,.14)';
      g.lineWidth = 0.9;
      g.stroke();

      // 浅滩：贴着岸的一圈淡水光，压掉"塑料管"感
      g.save();
      riverPath(g, 1.0);
      g.clip();
      g.strokeStyle = 'rgba(206,224,224,.17)';
      g.lineWidth = 3.4;
      riverPath(g, 0.86);
      g.stroke();
      g.restore();

      // 心滩：两片顺流的沙洲
      [[0.30, 0.20, 1.0], [0.63, -0.26, 0.72]].forEach(function (cfg) {
        const idx = Math.floor(cfg[0] * (N - 2)) + 1;
        const p = pts[idx];
        const pa = pts[Math.max(0, idx - 3)], pb = pts[Math.min(N - 1, idx + 3)];
        const cx = p.x + p.nx * p.w * cfg[1], cy = p.y + p.ny * p.w * cfg[1];
        const along = p.w * (0.62 + cfg[2] * 0.30), across = p.w * (0.16 + cfg[2] * 0.07);
        const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        g.save();
        g.translate(cx, cy);
        g.rotate(ang);
        g.beginPath();
        g.ellipse(0, 0, along, across, 0, 0, 6.2832);
        const sand = g.createLinearGradient(-along, 0, along, 0);
        sand.addColorStop(0, 'rgba(232,226,206,.30)');
        sand.addColorStop(0.4, 'rgba(238,232,214,.80)');
        sand.addColorStop(1, 'rgba(232,226,206,.34)');
        g.fillStyle = sand;
        g.fill();
        g.strokeStyle = 'rgba(22,36,31,.10)';
        g.lineWidth = 0.9;
        g.stroke();
        g.restore();
      });

      // 舟：贴着河心的两三点，点出俯瞰的尺度
      for (let k = 0; k < 4; k++) {
        const p = pts[Math.floor((0.12 + rnd() * 0.76) * (N - 2)) + 1];
        const off = (rnd() * 2 - 1) * 0.4;
        const bx = p.x + p.nx * p.w * off, by = p.y + p.ny * p.w * off;
        const len = Math.max(3.2, p.w * 0.16);
        g.strokeStyle = 'rgba(28,52,58,.34)';
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(bx - p.nx * len, by - p.ny * len);
        g.lineTo(bx + p.nx * len, by + p.ny * len);
        g.stroke();
        g.fillStyle = 'rgba(166,71,46,.22)';
        g.fillRect(bx - 1.6, by - 1.2, 3.2, 2.4);
      }

      // 岸上一条小路，从田里斜插到江边
      g.strokeStyle = 'rgba(176,141,87,.13)';
      g.lineWidth = 1.8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-20, H * 0.92);
      g.bezierCurveTo(W * 0.22, H * 0.74, W * 0.34, H * 0.80, W * 0.46, H * 0.62);
      g.stroke();
      g.beginPath();
      g.moveTo(W * 0.62, H * 0.10);
      g.bezierCurveTo(W * 0.70, H * 0.26, W * 0.80, H * 0.18, W + 20, H * 0.30);
      g.stroke();

      // 下游稍淡（远去）
      g.globalAlpha = 0.35;
      riverPath(g, 0.99);
      const far = g.createLinearGradient(W * 0.55, 0, W, 0);
      far.addColorStop(0, 'rgba(239,237,228,0)');
      far.addColorStop(1, 'rgba(239,237,228,.85)');
      g.fillStyle = far;
      g.fill();
      g.globalAlpha = 1;
      g.restore();

      // 纸纹
      g.globalAlpha = 0.05;
      for (let i = 0; i < W * H / 1100; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(22,36,31,1)' : 'rgba(255,255,255,1)';
        g.fillRect(rnd() * W, rnd() * H, 1, 1);
      }
      g.globalAlpha = 1;
    }

    function buildFlow() {
      flow = [];
      for (let i = 0; i < 130; i++) {
        flow.push({
          s: rnd() * (N - 1),
          off: (rnd() * 2 - 1) * 0.82,
          v: 0.55 + rnd() * 0.9,
          len: 6 + rnd() * 22,
          a: 0.04 + rnd() * 0.11,
          w: 0.6 + rnd() * 1.0
        });
      }
    }

    function resize() {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildCurve();
      paintTerrain();
      if (!flow.length) buildFlow();
      if (static_) frame(0, 0);
    }

    function at(s) {
      const i = clamp(s, 0, N - 1.001);
      const i0 = Math.floor(i), f = i - i0, p = pts[i0], q = pts[Math.min(N - 1, i0 + 1)];
      return {
        x: p.x + (q.x - p.x) * f,
        y: p.y + (q.y - p.y) * f,
        nx: p.nx + (q.nx - p.nx) * f,
        ny: p.ny + (q.ny - p.ny) * f,
        w: p.w + (q.w - p.w) * f,
        tx: q.x - p.x, ty: q.y - p.y
      };
    }

    function frame(dt, t) {
      if (!terr) return;
      const ox = Math.sin(t * 0.05) * 3.0, oy = Math.cos(t * 0.037) * 2.0;
      ctx.drawImage(terr, 0, 0, terr.width, terr.height, -5 + ox, -4 + oy, W + 10, H + 8);

      ctx.save();
      riverPath(ctx, 1.0);
      ctx.clip();
      ctx.lineCap = 'round';

      if (dt > 0) {
        for (let i = 0; i < flow.length; i++) {
          const f = flow[i];
          f.s += f.v * dt * (N / 4.2);
          if (f.s > N - 2) { f.s -= (N - 3); f.off = (Math.random() * 2 - 1) * 0.82; }
          const p = at(f.s);
          const x = p.x + p.nx * f.off * p.w;
          const y = p.y + p.ny * f.off * p.w;
          const tl = Math.hypot(p.tx, p.ty) || 1;
          const dx = p.tx / tl * f.len, dy = p.ty / tl * f.len;
          const gg = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
          gg.addColorStop(0, 'rgba(255,255,255,0)');
          gg.addColorStop(0.45, 'rgba(247,252,252,' + f.a.toFixed(3) + ')');
          gg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = gg;
          ctx.lineWidth = f.w;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      }

      // 贴岸的浅水亮线
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = 'rgba(238,246,246,.8)';
      ctx.lineWidth = 1.2;
      riverPath(ctx, 0.90);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      frame(dt, clock);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || static_) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    static_ = reduced;
    resize();

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(resize, 170);
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) start(); else stop(); });
      }, { rootMargin: '140px 0px' });
      io.observe(cv);
    } else {
      start();
    }

    return function redraw() { resize(); };
  })();

  /* ── 10 · 启动 ──────────────────────────────────────── */
  renderItems();
  renderCourses();
  updateHeroCounts();
  if (rangeProgress >= 1) { paintPeaks(); drawCranes(); }

  /* 供调试：在控制台看数据 */
  window.__ystudio = Object.assign(window.__ystudio || {}, { items, courses });
})();

/* ── 开场：居中标题 → 落到左上角成为站名 ───────────────────────── */
(function () {
  var intro = document.getElementById('intro');
  var word  = document.getElementById('introWord');
  var brand = document.querySelector('.brand');
  if (!intro || !word || !brand) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var html = document.documentElement;

  if (reduce) {
    if (intro.parentNode) intro.parentNode.removeChild(intro);
    return;
  }

  html.classList.add('intro-lock');

  /* 开场期间不要让首屏文字自己淡入——遮罩化开时它应该已经在那儿 */
  ['.hero .tagline', '.hero h1', '.hero .hero-sub', '.hero .hero-meta'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    el.style.animation = 'none';
    el.style.opacity = '1';
    el.style.transform = 'none';
  });

  var timers = [];
  var finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    html.classList.remove('intro-lock');
    html.classList.add('intro-done');
    brand.style.transition = 'none';
    brand.style.setProperty('opacity', '1', 'important');
    if (intro.parentNode) intro.parentNode.removeChild(intro);
    window.__introDone = true;
  }

  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  /* 1 · 标题从模糊里浮出来 */
  requestAnimationFrame(function () {
    word.style.transition =
      'opacity 1.15s cubic-bezier(.22,.61,.36,1),' +
      'filter 1.35s cubic-bezier(.22,.61,.36,1),' +
      'transform 1.45s cubic-bezier(.22,.61,.36,1)';
    word.style.opacity = '1';
    word.style.filter = 'blur(0px)';
    word.style.transform = 'translateY(0) scale(1)';
  });

  /* 2 · 遮罩化开由 CSS 动画 veilOut 负责（延迟 0.82s） */

  /* 3 · 标题飞回左上角，收成站名 */
  at(1780, function () {
    var wr = word.getBoundingClientRect();
    var br = brand.getBoundingClientRect();
    var k  = Math.max(0.10, (br.height * 1.02) / wr.height);
    var dx = br.left - wr.left;
    var dy = (br.top + br.height / 2) - (wr.top + wr.height / 2);

    word.style.transformOrigin = 'left center';
    word.style.transition =
      'transform 1.25s cubic-bezier(.52,.01,.24,1),' +
      'letter-spacing 1.25s cubic-bezier(.52,.01,.24,1),' +
      'opacity .42s ease 0.86s';
    word.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')';
    word.style.letterSpacing = '.12em';
    word.style.opacity = '0';
  });

  at(2560, function () {
    brand.style.transition = 'opacity .55s ease';
    brand.style.setProperty('opacity', '1', 'important');
  });
  at(3080, function () { finish(); });

  /* 点一下 / 按 Esc 可以跳过 */
  function skip() { finish(); }
  document.addEventListener('click', skip, { once: true });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') finish(); }, { once: true });
})();


/* ══ 翻新交互层 ═══════════════════════════════════════════ */
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* 1 · 右侧章节导航 */
  const chapNav = $('#chaptersA');
  const chapLinks = chapNav ? $$('a', chapNav) : [];
  const sections = chapLinks
    .map(a => document.getElementById(a.dataset.ch))
    .filter(Boolean);

  function setActive(id) {
    chapLinks.forEach(a => a.classList.toggle('on', a.dataset.ch === id));
  }
  if (chapNav && sections.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-42% 0px -52% 0px', threshold: 0 });
    sections.forEach(s => io.observe(s));
  }
  function onScrollNav() {
    if (!chapNav) return;
    const hero = $('#top');
    const past = hero ? (window.scrollY > hero.offsetHeight * 0.72) : window.scrollY > 300;
    chapNav.classList.toggle('on', past);
  }
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* 2 · Hero 鼠标视差 */
  const hero = $('#top'), heroInner = hero && $('.hero-inner', hero);
  if (hero && heroInner && !reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const loop = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      heroInner.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 14;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 10;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
  }

  /* 3 · 章节标题揭示 */
  const heads = $$('.sec-head');
  if ('IntersectionObserver' in window) {
    const io2 = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io2.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -18% 0px', threshold: 0.15 });
    heads.forEach(h => io2.observe(h));
  } else heads.forEach(h => h.classList.add('in'));

  /* 4 · 图版显影（事件委托，列表重绘也不失效） */
  const list = $('#postList');
  if (list) {
    let cur = null;
    list.addEventListener('pointermove', e => {
      const fig = e.target.closest('.post-plate');
      if (!fig) return;
      const pb = fig.querySelector('.pb');
      if (!pb) return;
      if (cur !== fig) { if (cur) cur.classList.remove('live'); cur = fig; fig.classList.add('live'); }
      const r = fig.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      pb.style.clipPath = 'circle(74px at ' + x.toFixed(1) + 'px ' + y.toFixed(1) + 'px)';
    });
    list.addEventListener('pointerleave', () => {
      if (cur) { cur.classList.remove('live'); cur = null; }
      $$('.post-plate .pb', list).forEach(pb => { pb.style.clipPath = 'circle(0px at 50% 50%)'; });
    });
  }

  /* 5 · 列表逐条进入 */
  const postIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    es.forEach((e, i) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      setTimeout(() => el.classList.add('in'), reduced ? 0 : 40 * (Number(el.dataset.rank) || 0));
      postIO.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;

  function dressPosts() {
    if (!list) return;
    $$('.post', list).forEach((el, i) => {
      el.dataset.rank = String(Math.min(i, 8));
      el.classList.add('js-in');
      if (reduced || !postIO) el.classList.add('in');
      else postIO.observe(el);
    });
  }
  dressPosts();
  const mo = new MutationObserver(() => dressPosts());
  if (list) mo.observe(list, { childList: true });

  /* 6 · 顶栏收缩 */
  const bar = $('.topbar');
  if (bar) {
    const onScrollBar = () => bar.classList.toggle('small', window.scrollY > 60);
    window.addEventListener('scroll', onScrollBar, { passive: true });
    onScrollBar();
  }

  /* 7 · 阅读器进度 */
  const sheet = $('.reader .reader-sheet');
  const prog = $('#rProgBar');
  const topBtn = $('#rTop');
  if (sheet && prog) {
    sheet.addEventListener('scroll', () => {
      const max = sheet.scrollHeight - sheet.clientHeight;
      const p = max > 0 ? Math.min(1, sheet.scrollTop / max) : 0;
      prog.style.width = (p * 100).toFixed(1) + '%';
      if (topBtn) topBtn.classList.toggle('on', sheet.scrollTop > 240);
    }, { passive: true });
  }
  if (topBtn && sheet) {
    topBtn.addEventListener('click', () => {
      sheet.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }
})();


/* ══ ricoui 交互：首屏逐字 + 跟随光标 ══ */
(function () {
  // 首屏大标题按字拆开，逐字模糊淡入
  var h1 = document.querySelector('.hero h1');
  if (h1 && !h1.dataset.split) {
    h1.dataset.split = '1';
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var li = 0;
    Array.prototype.slice.call(h1.querySelectorAll('.ln > span')).forEach(function (ln) {
      var text = ln.textContent;
      ln.textContent = '';
      Array.prototype.slice.call(text).forEach(function (ch) {
        if (ch === '\n' || ch === ' ') { ln.appendChild(document.createTextNode(ch)); return; }
        var s = document.createElement('span');
        s.className = 'w';
        s.textContent = ch;
        if (!reduce) s.style.transitionDelay = (0.28 + li * 0.045).toFixed(3) + 's';
        ln.appendChild(s);
        li++;
      });
    });
    setTimeout(function () {
      Array.prototype.forEach.call(h1.querySelectorAll('.w'), function (w) { w.classList.add('in'); });
    }, 120);
  }

  // 跟随光标：只在文章行上出现
  var list = document.getElementById('postList');
  var ind = document.getElementById('cursorInd');
  if (!list || !ind) return;
  var shown = false;
  list.addEventListener('pointermove', function (e) {
    var row = e.target.closest && e.target.closest('.post');
    if (!row) {
      if (shown) { ind.classList.remove('on'); shown = false; }
      return;
    }
    if (!shown) { ind.classList.add('on'); shown = true; }
    ind.style.left = e.clientX + 'px';
    ind.style.top = e.clientY + 'px';
  }, { passive: true });
  list.addEventListener('pointerleave', function () {
    ind.classList.remove('on'); shown = false;
  });
})();

/* ═══ 技能手册：点哪篇展开哪篇（手风琴，一次只开一篇） ═══════ */
(function () {
  const stack = document.querySelector('.kb-items');
  if (!stack || stack.dataset.accordion) return;
  stack.dataset.accordion = '1';
  const items = Array.prototype.slice.call(stack.querySelectorAll('.kb-item'));
  items.forEach(d => { d.open = false; });

  stack.addEventListener('click', e => {
    const s = e.target.closest('summary');
    if (!s) return;
    const d = s.parentElement;
    // <details> 自己会在 click 之后翻转，等一帧再收其他
    requestAnimationFrame(() => {
      if (!d.open) return;
      items.forEach(o => { if (o !== d && o.open) o.open = false; });
    });
  });

  // 键盘：方向键在条目间移动焦点
  stack.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const cur = document.activeElement;
    const i = items.findIndex(d => d.contains(cur));
    if (i < 0) return;
    const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    const s = next.querySelector('summary');
    if (s) s.focus();
  });

  window.__ystudio = window.__ystudio || {};
  window.__ystudio.kbOpenAt = i => { items.forEach((d, k) => { d.open = (k === i); }); };
  window.__ystudio.kbCloseAll = () => items.forEach(d => { d.open = false; });
})();
