/**
 * Procedural 3D Aedes aegypti Mosquito WebGL2 Renderer
 * Scroll-choreographed 3D flight, spline-lofted anatomy, procedural textures,
 * studio rim lighting, and gossamer veined wings. Zero external dependencies.
 */
(function (global) {
  'use strict';

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  function m4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function m4Mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }
  function m4Translate(x, y, z) {
    const m = m4Identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }
  function m4Scale(x, y, z) {
    const m = m4Identity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  }
  function m4RotX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  }
  function m4RotY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  function m4RotZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function m4Perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function catmull(pts, t) {
    const n = pts.length - 1;
    const f = Math.max(0, Math.min(n - 1e-6, t * n));
    const i = Math.floor(f);
    const u = f - i;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(n, i + 1)];
    const p3 = pts[Math.min(n, i + 2)];
    const u2 = u * u, u3 = u2 * u;
    return [0, 1, 2].map(k =>
      0.5 * (
        (2 * p1[k]) +
        (-p0[k] + p2[k]) * u +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3
      )
    );
  }

  function buildLoftedTube(pts, radiusFn, segsU, segsV, capEnds, squashFn) {
    const pos = [], nrm = [], uv = [], idx = [];
    let prevTan = norm(sub(pts[1], pts[0]));
    // Keep dorsal reference aligned cleanly with +Y world axis
    let normal = norm(cross([1, 0, 0], prevTan));
    if (Math.hypot(normal[0], normal[1], normal[2]) < 0.1) normal = [0, 1, 0];
    let binorm = norm(cross(prevTan, normal));

    for (let i = 0; i <= segsU; i++) {
      const u = i / segsU;
      const p = catmull(pts, u);
      const pNext = catmull(pts, Math.min(1, u + 0.004));
      const pPrev = catmull(pts, Math.max(0, u - 0.004));
      const tan = norm(sub(pNext, pPrev));

      const axis = cross(prevTan, tan);
      const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
      if (axisLen > 1e-5) {
        const k = norm(axis);
        const ang = Math.asin(Math.min(1, axisLen));
        const c = Math.cos(ang), s = Math.sin(ang);
        const rot = vec => add(add(mul(vec, c), mul(cross(k, vec), s)), mul(k, dot(k, vec) * (1 - c)));
        normal = norm(rot(normal));
        binorm = norm(cross(tan, normal));
      }
      prevTan = tan;

      const rBase = Math.max(0.0005, radiusFn(u));
      const sq = squashFn ? squashFn(u) : [1, 1];
      for (let j = 0; j <= segsV; j++) {
        const v = j / segsV;
        const th = v * Math.PI * 2;
        const ca = Math.cos(th) * sq[0];
        const sa = Math.sin(th) * sq[1];
        const dir = norm(add(mul(normal, ca), mul(binorm, sa)));
        const pt = add(p, add(mul(normal, ca * rBase), mul(binorm, sa * rBase)));
        pos.push(pt[0], pt[1], pt[2]);
        nrm.push(dir[0], dir[1], dir[2]);
        uv.push(u, v);
      }
    }

    const row = segsV + 1;
    for (let i = 0; i < segsU; i++) {
      for (let j = 0; j < segsV; j++) {
        const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    if (capEnds) {
      const startCenter = pos.length / 3;
      const p0 = catmull(pts, 0);
      const t0 = norm(sub(catmull(pts, 0.01), p0));
      pos.push(p0[0], p0[1], p0[2]);
      nrm.push(-t0[0], -t0[1], -t0[2]);
      uv.push(0, 0.5);
      for (let j = 0; j < segsV; j++) idx.push(startCenter, j + 1, j);

      const endCenter = pos.length / 3;
      const p1 = catmull(pts, 1);
      const t1 = norm(sub(p1, catmull(pts, 0.99)));
      pos.push(p1[0], p1[1], p1[2]);
      nrm.push(t1[0], t1[1], t1[2]);
      uv.push(1, 0.5);
      const base = segsU * row;
      for (let j = 0; j < segsV; j++) idx.push(endCenter, base + j, base + j + 1);
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }

  function buildEllipsoid(rx, ry, rz, segU, segV) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i <= segU; i++) {
      const v = i / segU;
      const phi = v * Math.PI;
      for (let j = 0; j <= segV; j++) {
        const u = j / segV;
        const th = u * Math.PI * 2;
        const x = Math.sin(phi) * Math.cos(th);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(th);
        pos.push(x * rx, y * ry, z * rz);
        const n = norm([x / rx, y / ry, z / rz]);
        nrm.push(n[0], n[1], n[2]);
        uv.push(u, v);
      }
    }
    const row = segV + 1;
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }

  /**
   * Builds a lanceolate rounded mosquito wing contour (no square tip!).
   */
  function buildWingMesh(side) {
    const segU = 26, segV = 12;
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i <= segU; i++) {
      const u = i / segU; // 0 = wing base, 1 = rounded tip
      const len = 1.38 * u;
      const leadingZ = -0.01 + Math.sin(u * Math.PI * 0.78) * 0.06;
      // Smooth aerodynamic elliptical taper reaching 0 cleanly at tip (u=1)
      const tipRound = Math.sqrt(Math.max(0.0001, 1 - Math.pow(Math.max(0, (u - 0.15) / 0.85), 2.2)));
      const width = (0.025 + Math.sin(Math.pow(u, 0.55) * Math.PI * 0.92) * 0.21) * tipRound;
      const camber = Math.sin(u * Math.PI) * 0.028;
      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        const x = side * len;
        const z = leadingZ - v * width;
        const y = camber * (1 - Math.pow(2 * v - 1, 2)) + 0.014 * Math.sin(u * Math.PI) * (1 - v);
        pos.push(x, y, z);
        nrm.push(0, 1, 0);
        uv.push(u, v);
      }
    }
    const row = segV + 1;
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
        if (side > 0) idx.push(a, d, b, b, d, c);
        else idx.push(a, b, d, b, c, d);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }

  function createCanvasTex(gl, w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  function createAbdomenTexture(gl) {
    return createCanvasTex(gl, 512, 512, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#100e14');
      grad.addColorStop(0.55, '#18131a');
      grad.addColorStop(0.84, '#2a1017');
      grad.addColorStop(1, '#0f0b0f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (let s = 0; s < 8; s++) {
        const x0 = (s / 8) * w;
        const segW = w / 8;
        ctx.fillStyle = '#070508';
        ctx.fillRect(x0, 0, 4, h);

        const bandGrad = ctx.createLinearGradient(x0 + 4, 0, x0 + segW * 0.30, 0);
        bandGrad.addColorStop(0, 'rgba(242, 234, 232, 0.94)');
        bandGrad.addColorStop(0.65, 'rgba(224, 214, 212, 0.82)');
        bandGrad.addColorStop(1, 'rgba(210, 200, 198, 0.0)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(x0 + 4, 0, segW * 0.30, h);

        for (const cy of [h * 0.24, h * 0.76]) {
          ctx.fillStyle = 'rgba(244, 238, 236, 0.92)';
          ctx.beginPath();
          ctx.ellipse(x0 + segW * 0.48, cy, segW * 0.13, h * 0.065, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 1.5);
      }
    });
  }

  /**
   * Dorsal lyre pattern aligned along dorsal ridge (v = 0.0 / 1.0 of lofted thorax tube).
   */
  function createThoraxTexture(gl) {
    return createCanvasTex(gl, 512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#110f14';
      ctx.fillRect(0, 0, w, h);

      const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, w * 0.58);
      bg.addColorStop(0, '#1f1b24');
      bg.addColorStop(1, '#0b090e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Dorsal side sits at v ~ 0.0 and v ~ 1.0 (wrapping top) and lateral spots around v ~ 0.25/0.75
      ctx.strokeStyle = 'rgba(242, 236, 234, 0.95)';
      ctx.lineCap = 'round';
      for (const baseY of [0, h]) {
        const dir = baseY === 0 ? 1 : -1;
        // Curved lyre outer arms
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(w * 0.16, baseY + dir * h * 0.05);
        ctx.bezierCurveTo(
          w * 0.36, baseY + dir * h * 0.17,
          w * 0.65, baseY + dir * h * 0.16,
          w * 0.85, baseY + dir * h * 0.06
        );
        ctx.stroke();

        // Median inner silver-white lines
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(w * 0.20, baseY + dir * h * 0.022);
        ctx.lineTo(w * 0.82, baseY + dir * h * 0.022);
        ctx.stroke();
      }

      // Pleural white scale spots along flanks
      for (let i = 0; i < 5; i++) {
        for (const fy of [h * 0.28, h * 0.72]) {
          ctx.fillStyle = 'rgba(240, 234, 232, 0.85)';
          ctx.beginPath();
          ctx.ellipse(w * (0.28 + i * 0.11), fy, 12, 7, 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (let i = 0; i < 2400; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2.5, 1.5);
      }
    });
  }

  function createSolidChitinTexture(gl) {
    return createCanvasTex(gl, 64, 64, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#100d12');
      g.addColorStop(0.75, '#19141b');
      g.addColorStop(1, '#09070a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function createLegTexture(gl) {
    return createCanvasTex(gl, 512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#100e13';
      ctx.fillRect(0, 0, w, h);
      const bands = [
        [0.08, 0.04], [0.24, 0.038], [0.43, 0.055],
        [0.59, 0.055], [0.74, 0.06], [0.89, 0.065]
      ];
      for (const [pos, wid] of bands) {
        const g = ctx.createLinearGradient(pos * w, 0, (pos + wid) * w, 0);
        g.addColorStop(0, 'rgba(244, 236, 234, 0.96)');
        g.addColorStop(0.75, 'rgba(232, 224, 222, 0.90)');
        g.addColorStop(1, 'rgba(232, 224, 222, 0.0)');
        ctx.fillStyle = g;
        ctx.fillRect(pos * w, 0, wid * w, h);
      }
    });
  }

  function createEyeTexture(gl) {
    return createCanvasTex(gl, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#15050a';
      ctx.fillRect(0, 0, w, h);
      const step = 9;
      for (let y = 0; y < h; y += step) {
        const off = (Math.floor(y / step) % 2) * (step * 0.5);
        for (let x = 0; x < w; x += step) {
          const g = ctx.createRadialGradient(x + off, y, 0.8, x + off, y, step * 0.46);
          g.addColorStop(0, '#4f1220');
          g.addColorStop(0.7, '#1c060c');
          g.addColorStop(1, '#070204');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + off, y, step * 0.44, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  function createWingTexture(gl) {
    return createCanvasTex(gl, 512, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      // Gossamer near-clear translucent wing membrane
      const mem = ctx.createLinearGradient(0, 0, w, h);
      mem.addColorStop(0, 'rgba(255, 244, 245, 0.14)');
      mem.addColorStop(0.55, 'rgba(245, 240, 248, 0.09)');
      mem.addColorStop(1, 'rgba(255, 235, 238, 0.12)');
      ctx.fillStyle = mem;
      ctx.fillRect(0, 0, w, h);

      // Dark costa leading vein
      ctx.strokeStyle = 'rgba(22, 12, 16, 0.86)';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.quadraticCurveTo(w * 0.55, 4, w * 0.96, h * 0.22);
      ctx.stroke();

      // Delicate dark longitudinal mosquito wing veins curving cleanly into rounded tip
      const veins = [
        [[0, 12], [w * 0.45, h * 0.16], [w * 0.95, h * 0.34]],
        [[w * 0.14, 14], [w * 0.54, h * 0.29], [w * 0.94, h * 0.49]],
        [[w * 0.36, h * 0.25], [w * 0.68, h * 0.42], [w * 0.91, h * 0.64]],
        [[0, 20], [w * 0.42, h * 0.46], [w * 0.84, h * 0.77]],
        [[w * 0.44, h * 0.48], [w * 0.65, h * 0.68], [w * 0.78, h * 0.88]],
        [[0, 26], [w * 0.30, h * 0.62], [w * 0.64, h * 0.90]]
      ];
      for (const pts of veins) {
        ctx.strokeStyle = 'rgba(26, 14, 18, 0.68)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
        ctx.stroke();
      }

      // Fine trailing scale fringe
      ctx.strokeStyle = 'rgba(255, 240, 242, 0.36)';
      ctx.lineWidth = 1.1;
      for (let x = 20; x < w * 0.92; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.91);
        ctx.lineTo(x + 3, h);
        ctx.stroke();
      }
    });
  }

  const VS_BODY = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPos;
    layout(location=1) in vec3 aNrm;
    layout(location=2) in vec2 aUv;
    uniform mat4 uMVP;
    uniform mat4 uModel;
    out vec3 vWorldPos;
    out vec3 vNormal;
    out vec2 vUv;
    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(mat3(uModel) * aNrm);
      vUv = aUv;
      gl_Position = uMVP * vec4(aPos, 1.0);
    }
  `;

  const FS_BODY = `#version 300 es
    precision highp float;
    in vec3 vWorldPos;
    in vec3 vNormal;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec3 uCamPos;
    uniform vec3 uTint;
    uniform float uShininess;
    uniform float uRimPower;
    uniform float uBloodGlow;
    out vec4 fragColor;
    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCamPos - vWorldPos);
      vec3 albedo = texture(uTex, vUv).rgb * uTint;

      vec3 L1 = normalize(vec3(-0.65, 0.85, 0.72));
      vec3 L2 = normalize(vec3(0.75, -0.55, 0.35));
      vec3 L3 = normalize(vec3(0.25, 0.70, -0.90));

      float diff1 = max(dot(N, L1), 0.0);
      float diff2 = max(dot(N, L2), 0.0);

      vec3 H1 = normalize(L1 + V);
      vec3 H3 = normalize(L3 + V);
      float spec1 = pow(max(dot(N, H1), 0.0), uShininess);
      float spec3 = pow(max(dot(N, H3), 0.0), uShininess * 0.6);
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), uRimPower);

      vec3 col = albedo * (0.30 + diff1 * 0.92)
               + albedo * vec3(0.85, 0.22, 0.30) * diff2 * 0.38
               + vec3(1.0, 0.94, 0.92) * spec1 * 0.80
               + vec3(0.98, 0.78, 0.78) * spec3 * 0.42
               + vec3(1.0, 0.86, 0.86) * fresnel * 0.68;

      if (uBloodGlow > 0.01) {
        float belly = smoothstep(0.32, 0.76, vUv.x) * (1.0 - smoothstep(0.0, 0.4, abs(N.y + 0.5)));
        col += vec3(0.68, 0.07, 0.15) * belly * uBloodGlow * (0.45 + 0.55 * fresnel);
      }

      fragColor = vec4(col, 1.0);
    }
  `;

  const VS_WING = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPos;
    layout(location=1) in vec3 aNrm;
    layout(location=2) in vec2 aUv;
    uniform mat4 uMVP;
    uniform mat4 uModel;
    out vec3 vWorldPos;
    out vec3 vNormal;
    out vec2 vUv;
    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(mat3(uModel) * aNrm);
      vUv = aUv;
      gl_Position = uMVP * vec4(aPos, 1.0);
    }
  `;

  const FS_WING = `#version 300 es
    precision highp float;
    in vec3 vWorldPos;
    in vec3 vNormal;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec3 uCamPos;
    uniform float uAlphaBoost;
    out vec4 fragColor;
    void main() {
      vec3 N = normalize(vNormal);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCamPos - vWorldPos);
      vec4 tex = texture(uTex, vUv);

      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.4);
      vec3 L1 = normalize(vec3(-0.5, 0.9, 0.7));
      vec3 H1 = normalize(L1 + V);
      float spec = pow(max(dot(N, H1), 0.0), 56.0);

      // Subtle silver-pearl & soft rose iridescence without obscuring veins
      float phase = dot(N, V) * 5.5 + vUv.x * 3.0;
      vec3 irid = 0.72 + 0.28 * cos(phase + vec3(0.0, 1.4, 2.8));
      vec3 col = mix(tex.rgb, irid * vec3(0.98, 0.92, 0.95), 0.22 + fresnel * 0.25)
               + vec3(1.0, 0.97, 0.98) * (spec * 0.75 + fresnel * 0.42);

      // Keep dark veins sharp while membrane remains gossamer-sheer
      float veinMask = smoothstep(0.35, 0.85, tex.a);
      float alpha = clamp((tex.a * 0.78 + fresnel * 0.16 + spec * 0.26 + veinMask * 0.18) * uAlphaBoost, 0.0, 0.86);
      fragColor = vec4(col, alpha);
    }
  `;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function uploadMesh(gl, mesh) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bindBuf = (loc, data, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bindBuf(0, mesh.pos, 3);
    bindBuf(1, mesh.nrm, 3);
    bindBuf(2, mesh.uv, 2);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: mesh.idx.length };
  }

  const KEYFRAMES = [
    // Hero (#top): hovers right below/over "Nyamuk" above the golden-amber petal
    { t: 0.00, x: -0.26, y: 0.03, z: 0.25, yaw: -0.68, pitch: 0.18, roll: 0.12, scale: 1.02, wingFreq: 16 },
    // Glide 0 -> 1
    { t: 0.15, x: -0.45, y: 0.08, z: 0.42, yaw: 0.12, pitch: -0.10, roll: -0.22, scale: 0.96, wingFreq: 34 },
    // Section 01 (#data): left column over "01", facing toward data chart on right
    { t: 0.29, x: -0.92, y: -0.02, z: 0.12, yaw: 0.72, pitch: 0.15, roll: -0.08, scale: 0.92, wingFreq: 14 },
    // Glide 1 -> 2
    { t: 0.44, x: 0.12, y: 0.10, z: 0.50, yaw: -0.22, pitch: -0.14, roll: 0.26, scale: 0.98, wingFreq: 38 },
    // Section 02 (#model): right column beside dewy leaf, facing left toward calibration chart
    { t: 0.59, x: 0.90, y: -0.02, z: 0.14, yaw: -0.85, pitch: 0.18, roll: 0.07, scale: 0.93, wingFreq: 12 },
    // Glide 2 -> 3
    { t: 0.74, x: -0.15, y: 0.08, z: 0.44, yaw: 0.28, pitch: -0.12, roll: -0.20, scale: 0.96, wingFreq: 36 },
    // Section 03 (#skenario): left column above bromeliad flower, facing right-down toward chart
    { t: 0.87, x: -0.88, y: -0.04, z: 0.18, yaw: 0.62, pitch: 0.22, roll: -0.07, scale: 0.93, wingFreq: 14 },
    // Footer: rises cleanly above footer text
    { t: 1.00, x: -0.78, y: 1.05, z: -0.10, yaw: 0.45, pitch: -0.22, roll: -0.15, scale: 0.74, wingFreq: 26 }
  ];

  function sampleKeyframes(p) {
    const clamped = Math.max(0, Math.min(1, p));
    let i = 0;
    while (i < KEYFRAMES.length - 2 && clamped > KEYFRAMES[i + 1].t) i++;
    const a = KEYFRAMES[i], b = KEYFRAMES[i + 1];
    const span = Math.max(1e-5, b.t - a.t);
    const u = Math.max(0, Math.min(1, (clamped - a.t) / span));
    const s = u * u * (3 - 2 * u);
    const lerp = k => a[k] + (b[k] - a[k]) * s;
    return {
      x: lerp('x'), y: lerp('y'), z: lerp('z'),
      yaw: lerp('yaw'), pitch: lerp('pitch'), roll: lerp('roll'),
      scale: lerp('scale'), wingFreq: lerp('wingFreq')
    };
  }

  function initMosquito3D(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) return null;

    const progBody = createProgram(gl, VS_BODY, FS_BODY);
    const progWing = createProgram(gl, VS_WING, FS_WING);

    const texAbdomen = createAbdomenTexture(gl);
    const texThorax = createThoraxTexture(gl);
    const texChitin = createSolidChitinTexture(gl);
    const texLeg = createLegTexture(gl);
    const texEye = createEyeTexture(gl);
    const texWing = createWingTexture(gl);

    // Sleek sculpted hunched teardrop Thorax along dorsal-aligned spline
    const thoraxMesh = uploadMesh(gl, buildLoftedTube(
      [[0, -0.03, 0.24], [0, 0.10, 0.10], [0, 0.11, -0.04], [0, 0.03, -0.21]],
      u => 0.07 + Math.sin(Math.pow(u, 0.75) * Math.PI) * 0.115,
      28, 22, true, u => [0.88, 1.10]
    ));
    const neckMesh = uploadMesh(gl, buildEllipsoid(0.06, 0.06, 0.08, 14, 14));

    const abdPts = [
      [0, 0.02, -0.18],
      [0, -0.02, -0.45],
      [0, -0.10, -0.78],
      [0, -0.22, -1.08],
      [0, -0.32, -1.28]
    ];
    const abdomenMesh = uploadMesh(gl, buildLoftedTube(
      abdPts,
      u => {
        const base = 0.052 + Math.sin(u * Math.PI * 0.92) * 0.082;
        const rib = 1 + 0.06 * Math.sin(u * Math.PI * 16);
        return base * rib * (1 - 0.56 * Math.pow(u, 3.2));
      },
      48, 22, true, () => [0.90, 1.05]
    ));

    const headMesh = uploadMesh(gl, buildEllipsoid(0.092, 0.088, 0.092, 18, 18));
    const eyeMesh = uploadMesh(gl, buildEllipsoid(0.064, 0.068, 0.066, 18, 18));

    // Prominent sleek solid-obsidian curved needle proboscis extending well past palps
    const probPts = [
      [0, -0.015, 0.07],
      [0, -0.065, 0.34],
      [0, -0.145, 0.65],
      [0, -0.235, 0.96]
    ];
    const proboscisMesh = uploadMesh(gl, buildLoftedTube(
      probPts, u => 0.016 * (1 - 0.72 * u), 24, 10, true
    ));

    const palps = [-1, 1].map(side => uploadMesh(gl, buildLoftedTube(
      [[side * 0.026, -0.01, 0.08], [side * 0.036, -0.035, 0.21], [side * 0.038, -0.055, 0.31]],
      u => 0.011 * (1 - 0.45 * u), 12, 8, true
    )));

    const antennae = [-1, 1].map(side => uploadMesh(gl, buildLoftedTube(
      [
        [side * 0.034, 0.04, 0.08],
        [side * 0.11, 0.14, 0.24],
        [side * 0.19, 0.22, 0.42],
        [side * 0.24, 0.25, 0.60]
      ],
      u => 0.009 * (1 - 0.68 * u) * (1 + 0.48 * Math.abs(Math.sin(u * Math.PI * 10))),
      28, 8, true
    )));

    function makeLeg(side, pairIdx) {
      let pts;
      if (pairIdx === 0) {
        pts = [
          [side * 0.08, -0.09, 0.15],
          [side * 0.29, 0.05, 0.35],
          [side * 0.43, -0.26, 0.55],
          [side * 0.49, -0.66, 0.71],
          [side * 0.54, -0.76, 0.83]
        ];
      } else if (pairIdx === 1) {
        pts = [
          [side * 0.11, -0.11, 0.01],
          [side * 0.45, 0.08, 0.04],
          [side * 0.67, -0.30, 0.01],
          [side * 0.75, -0.75, -0.07],
          [side * 0.82, -0.84, -0.17]
        ];
      } else {
        pts = [
          [side * 0.10, -0.10, -0.14],
          [side * 0.41, 0.13, -0.44],
          [side * 0.61, -0.17, -0.82],
          [side * 0.67, -0.49, -1.24],
          [side * 0.73, -0.32, -1.55]
        ];
      }
      return uploadMesh(gl, buildLoftedTube(
        pts,
        u => {
          const knee = Math.exp(-Math.pow((u - 0.35) / 0.06, 2)) * 0.007;
          return 0.0155 * (1 - 0.70 * u) + knee;
        },
        34, 10, true
      ));
    }

    const legs = [
      { side: -1, idx: 0, mesh: makeLeg(-1, 0), phase: 0.0 },
      { side:  1, idx: 0, mesh: makeLeg( 1, 0), phase: 0.8 },
      { side: -1, idx: 1, mesh: makeLeg(-1, 1), phase: 1.5 },
      { side:  1, idx: 1, mesh: makeLeg( 1, 1), phase: 2.2 },
      { side: -1, idx: 2, mesh: makeLeg(-1, 2), phase: 3.1 },
      { side:  1, idx: 2, mesh: makeLeg( 1, 2), phase: 3.9 }
    ];

    const wingR = uploadMesh(gl, buildWingMesh(1));
    const wingL = uploadMesh(gl, buildWingMesh(-1));
    const haltereMesh = uploadMesh(gl, buildLoftedTube(
      [[0, 0, 0], [0.08, 0.02, -0.05]], u => 0.005 + (u > 0.7 ? 0.011 : 0), 8, 6, true
    ));

    let scrollTarget = 0;
    let scrollSmooth = 0;
    let mouseX = 0, mouseY = 0, mSmoothX = 0, mSmoothY = 0;
    const prefersReduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function updateScroll() {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - global.innerHeight);
      scrollTarget = Math.max(0, Math.min(1, global.scrollY / maxScroll));
    }

    global.addEventListener('scroll', updateScroll, { passive: true });
    global.addEventListener('resize', () => { resize(); updateScroll(); }, { passive: true });
    global.addEventListener('pointermove', (e) => {
      mouseX = (e.clientX / Math.max(1, global.innerWidth) - 0.5) * 2;
      mouseY = (e.clientY / Math.max(1, global.innerHeight) - 0.5) * 2;
    }, { passive: true });

    let width = 1, height = 1, dpr = 1;
    function resize() {
      dpr = Math.min(2, global.devicePixelRatio || 1);
      width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    }
    resize();
    updateScroll();

    function drawMesh(prog, mesh, modelMat, vpMat, tex, tint, shininess, rimPower, bloodGlow) {
      gl.useProgram(prog);
      const mvp = m4Mul(vpMat, modelMat);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uMVP'), false, mvp);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uModel'), false, modelMat);
      gl.uniform3f(gl.getUniformLocation(prog, 'uCamPos'), 0, 0.15, 3.6);
      if (tint) {
        gl.uniform3f(gl.getUniformLocation(prog, 'uTint'), tint[0], tint[1], tint[2]);
        gl.uniform1f(gl.getUniformLocation(prog, 'uShininess'), shininess);
        gl.uniform1f(gl.getUniformLocation(prog, 'uRimPower'), rimPower);
        gl.uniform1f(gl.getUniformLocation(prog, 'uBloodGlow'), bloodGlow || 0.0);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    let tPrev = performance.now();
    let wingPhase = 0;

    function frame(now) {
      const dt = Math.min(0.05, (now - tPrev) / 1000);
      tPrev = now;
      const tSec = now * 0.001;

      if (prefersReduced) {
        scrollSmooth = scrollTarget;
      } else {
        scrollSmooth += (scrollTarget - scrollSmooth) * Math.min(1, dt * 8.5);
        mSmoothX += (mouseX - mSmoothX) * Math.min(1, dt * 5.0);
        mSmoothY += (mouseY - mSmoothY) * Math.min(1, dt * 5.0);
      }

      const kf = sampleKeyframes(scrollSmooth);
      const isNarrow = global.innerWidth < 860;
      const xPos = isNarrow ? kf.x * 0.22 : kf.x;
      const yPos = isNarrow ? kf.y + 0.16 : kf.y;
      const sc = isNarrow ? kf.scale * 0.62 : kf.scale;

      const hoverY = prefersReduced ? 0 : Math.sin(tSec * 2.4) * 0.022;
      const hoverPitch = prefersReduced ? 0 : Math.sin(tSec * 1.8) * 0.025;
      const scrollVel = Math.abs(scrollTarget - scrollSmooth);
      const wingFreq = kf.wingFreq + Math.min(35, scrollVel * 140);
      wingPhase += dt * wingFreq * Math.PI * 2;

      const aspect = width / Math.max(1, height);
      const proj = m4Perspective(0.68, aspect, 0.1, 20.0);
      const view = m4Translate(0, -0.15, -3.6);
      const vp = m4Mul(proj, view);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      let root = m4Translate(xPos + mSmoothX * 0.035, yPos + hoverY - mSmoothY * 0.025, kf.z);
      root = m4Mul(root, m4RotY(kf.yaw + mSmoothX * 0.12));
      root = m4Mul(root, m4RotX(kf.pitch + hoverPitch + mSmoothY * 0.09));
      root = m4Mul(root, m4RotZ(kf.roll));
      root = m4Mul(root, m4Scale(sc, sc, sc));

      drawMesh(progBody, thoraxMesh, root, vp, texThorax, [1.08, 1.06, 1.08], 54, 2.5, 0);

      const abdBreath = prefersReduced ? 0 : Math.sin(tSec * 3.1) * 0.022;
      drawMesh(progBody, abdomenMesh, m4Mul(root, m4RotX(abdBreath)), vp, texAbdomen, [1.06, 1.04, 1.04], 64, 2.2, 0.85);

      const headGroup = m4Mul(root, m4Mul(m4Translate(0, 0.01, 0.28), m4RotX(0.10)));
      drawMesh(progBody, neckMesh, m4Mul(root, m4Translate(0, 0.02, 0.21)), vp, texChitin, [1.0, 1.0, 1.0], 40, 2.6, 0);
      drawMesh(progBody, headMesh, headGroup, vp, texChitin, [1.0, 1.0, 1.0], 54, 2.4, 0);
      for (const s of [-1, 1]) {
        const eyeM = m4Mul(headGroup, m4Translate(s * 0.058, 0.014, 0.032));
        drawMesh(progBody, eyeMesh, eyeM, vp, texEye, [1.25, 1.0, 1.05], 96, 1.8, 0);
        drawMesh(progBody, palps[s > 0 ? 1 : 0], headGroup, vp, texLeg, [1.08, 1.08, 1.08], 48, 2.6, 0);
        const antSway = prefersReduced ? 0 : Math.sin(tSec * 4.2 + s) * 0.028;
        drawMesh(progBody, antennae[s > 0 ? 1 : 0], m4Mul(headGroup, m4RotX(antSway)), vp, texLeg, [1.0, 0.98, 0.98], 38, 2.2, 0);
      }
      // Solid glossy obsidian needle proboscis
      drawMesh(progBody, proboscisMesh, headGroup, vp, texChitin, [1.1, 1.06, 1.06], 82, 2.0, 0);

      for (const leg of legs) {
        const sway = prefersReduced ? 0 : Math.sin(tSec * 2.8 + leg.phase) * (leg.idx === 2 ? 0.048 : 0.024);
        const legM = m4Mul(root, m4Mul(m4RotX(sway), m4RotZ(sway * 0.45 * leg.side)));
        drawMesh(progBody, leg.mesh, legM, vp, texLeg, [1.10, 1.08, 1.08], 58, 2.2, 0);
      }

      for (const s of [-1, 1]) {
        const hM = m4Mul(root, m4Mul(m4Translate(s * 0.13, 0.07, -0.14), m4Scale(s, 1, 1)));
        drawMesh(progBody, haltereMesh, hM, vp, texChitin, [1.2, 1.0, 1.0], 40, 2.0, 0);
      }

      // Gossamer swept-back wings with controlled micro-flutter (never standing vertically)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(progWing);
      gl.uniform3f(gl.getUniformLocation(progWing, 'uCamPos'), 0, 0.15, 3.6);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texWing);
      gl.uniform1i(gl.getUniformLocation(progWing, 'uTex'), 0);

      const flapAmp = prefersReduced ? 0.03 : (0.10 + Math.min(0.18, scrollVel * 1.1));
      const flap = Math.sin(wingPhase) * flapAmp;
      const sweep = Math.cos(wingPhase) * 0.06;

      for (const wingObj of [
        { side: 1, mesh: wingR, baseYaw: -1.04, baseRoll: 0.24 },
        { side: -1, mesh: wingL, baseYaw: 1.04, baseRoll: -0.24 }
      ]) {
        let wM = m4Mul(root, m4Translate(wingObj.side * 0.08, 0.16, 0.02));
        wM = m4Mul(wM, m4RotY(wingObj.baseYaw + wingObj.side * sweep));
        wM = m4Mul(wM, m4RotZ(wingObj.baseRoll + wingObj.side * flap));
        wM = m4Mul(wM, m4RotX(-0.10));

        gl.uniform1f(gl.getUniformLocation(progWing, 'uAlphaBoost'), 0.85);
        gl.uniformMatrix4fv(gl.getUniformLocation(progWing, 'uMVP'), false, m4Mul(vp, wM));
        gl.uniformMatrix4fv(gl.getUniformLocation(progWing, 'uModel'), false, wM);
        gl.bindVertexArray(wingObj.mesh.vao);
        gl.drawElements(gl.TRIANGLES, wingObj.mesh.count, gl.UNSIGNED_SHORT, 0);

        if (!prefersReduced) {
          let wGhost = m4Mul(root, m4Translate(wingObj.side * 0.08, 0.16, 0.02));
          wGhost = m4Mul(wGhost, m4RotY(wingObj.baseYaw - wingObj.side * sweep * 0.75));
          wGhost = m4Mul(wGhost, m4RotZ(wingObj.baseRoll - wingObj.side * flap * 0.70));
          wGhost = m4Mul(wGhost, m4RotX(-0.10));
          gl.uniform1f(gl.getUniformLocation(progWing, 'uAlphaBoost'), 0.28);
          gl.uniformMatrix4fv(gl.getUniformLocation(progWing, 'uMVP'), false, m4Mul(vp, wGhost));
          gl.uniformMatrix4fv(gl.getUniformLocation(progWing, 'uModel'), false, wGhost);
          gl.drawElements(gl.TRIANGLES, wingObj.mesh.count, gl.UNSIGNED_SHORT, 0);
        }
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
    return { resize };
  }

  global.initMosquito3D = initMosquito3D;
})(window);
