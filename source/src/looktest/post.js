// Guards bloom against NaN/Inf pixels (one bad pixel would smear over the frame).
export const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      bvec3 bad = isnan(c.rgb); if (bad.x || bad.y || bad.z || any(isinf(c.rgb))) c.rgb = vec3(0.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 40.0), 1.0); }`,
};

// Look A grade: gentle warm lift + vignette, applied in linear HDR before tone mapping.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, aspect: { value: 16 / 9 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float aspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = clamp(c.rgb, 0.0, 64.0);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      float vig = smoothstep(1.15, 0.35, length(d));
      c.rgb *= mix(0.55, 1.0, vig);
      // lift the blacks toward studio violet so shadows never go dead grey
      c.rgb += vec3(0.010, 0.006, 0.020) * (1.0 - vig * 0.5);
      gl_FragColor = c;
    }`,
};

// Look B: subtle 1980s broadcast / VHS. Runs after tone mapping (display space).
export const VhsShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    amount: { value: 1 },
    resolution: { value: { x: 1280, y: 720, set(x, y) { this.x = x; this.y = y; } } },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float amount; uniform vec2 resolution; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 toYIQ(vec3 c){ return mat3(0.299,0.596,0.211, 0.587,-0.274,-0.523, 0.114,-0.322,0.312) * c; }
    vec3 toRGB(vec3 c){ return mat3(1.0,1.0,1.0, 0.956,-0.272,-1.106, 0.621,-0.647,1.703) * c; }
    void main(){
      vec2 px = 1.0 / resolution;
      vec2 uv = vUv;
      // luma stays sharp; chroma is smeared horizontally (VHS colour bleed)
      vec3 base = texture2D(tDiffuse, uv).rgb;
      float Y = toYIQ(base).x;
      vec2 iq = vec2(0.0);
      float wsum = 0.0;
      for (int i = -4; i <= 4; i++) {
        float w = exp(-float(i*i) / 8.0);
        vec3 s = toYIQ(texture2D(tDiffuse, uv + vec2(float(i) * 1.6 * amount - 1.2 * amount, 0.0) * px).rgb);
        iq += s.yz * w; wsum += w;
      }
      iq /= wsum;
      vec3 col = mix(base, toRGB(vec3(Y, iq * 1.08)), amount);
      // tiny red/blue convergence offset
      col.r = mix(col.r, texture2D(tDiffuse, uv + vec2(1.2, 0.0) * px).r, 0.35 * amount);
      // scanlines: gentle, tied to output pixel rows
      float line = 0.5 + 0.5 * cos(uv.y * resolution.y * 3.14159);
      col *= 1.0 - 0.07 * amount * line;
      // grain
      float n = hash(uv * resolution + fract(time) * 91.7) - 0.5;
      col += n * 0.035 * amount;
      // soft vignette + slightly lifted blacks, warm highlights
      vec2 d = uv - 0.5;
      col *= 1.0 - dot(d, d) * 0.55 * amount;
      col = mix(col, col * 0.96 + vec3(0.018, 0.012, 0.03), amount);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
