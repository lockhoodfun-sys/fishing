import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WEATHER, useWeather } from "@/hooks/useWeather";
import { dayNightAt, clock, TINT_WEIGHT } from "@/hooks/useDayNight";
import { GRAPHICS, useGraphics } from "@/hooks/useGraphics";

export const waterHeight = (x: number, z: number, t: number) =>
  Math.sin(x * 0.14 + t * 1.1) * 0.35 +
  Math.sin(z * 0.19 - t * 0.85) * 0.28 +
  Math.sin((x + z) * 0.07 + t * 0.5) * 0.5;

const noiseGLSL = /* glsl */ `
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float gnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float a = 0.5;
    float v = 0.0;
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      v += a * gnoise(p);
      p = m * p * 2.02;
      a *= 0.5;
    }
    return v;
  }
`;

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  varying vec3 vNormalW;

  float wave(vec2 p, float t) {
    return sin(p.x * 0.14 + t * 1.1) * 0.35
         + sin(p.y * 0.19 - t * 0.85) * 0.28
         + sin((p.x + p.y) * 0.07 + t * 0.5) * 0.5;
  }

  void main() {
    // Displace in world space so the mesh can follow the camera without the
    // wave pattern "swimming" along with it — the ocean stays anchored.
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 p = world.xz;
    float h = wave(p, uTime);
    world.y += h;
    vWave = h;

    float e = 0.6;
    float hx = wave(p + vec2(e, 0.0), uTime);
    float hy = wave(p + vec2(0.0, e), uTime);
    vec3 n = normalize(vec3(-(hx - h) / e, 1.0, -(hy - h) / e));
    vNormalW = n;

    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uMid;
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform float uDetail;

  varying vec3 vWorld;
  varying float vWave;
  varying vec3 vNormalW;

  ${noiseGLSL}

  // Multi-octave ripple field used for micro-normals (the shimmer detail).
  // uDetail memangkas oktaf pada kualitas rendah/sedang.
  float ripples(vec2 p, float t) {
    float v = 0.0;
    v += fbm(p * 0.55 + vec2(t * 0.20, -t * 0.13)) * 1.05;
    if (uDetail > 0.5) v += fbm(p * 1.60 + vec2(-t * 0.42, t * 0.31)) * 0.55;
    if (uDetail > 1.5) v += fbm(p * 4.10 + vec2(t * 0.85, t * 0.61)) * 0.26;
    return v;
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;

    // --- micro normal from the ripple field ---
    // Gradient analitik dari SATU sampel via screen-space derivatives:
    // sebelumnya butuh 3 evaluasi noise (r0/rx/rz) per piksel.
    float r0 = ripples(p, t);
    vec2 dpx = dFdx(p);
    vec2 dpy = dFdy(p);
    float det = dpx.x * dpy.y - dpx.y * dpy.x;
    float d0x = dFdx(r0);
    float d0y = dFdy(r0);
    vec2 g = abs(det) > 1e-6
      ? vec2(d0x * dpy.y - d0y * dpx.y, d0y * dpx.x - d0x * dpy.x) / det
      : vec2(0.0);
    // Redam agar amplitudonya setara beda-hingga lama (e = 0.35) dan tidak
    // beraliasing saat dilihat menyudut.
    g = clamp(g * 0.45, vec2(-3.0), vec2(3.0));
    vec3 detail = normalize(vec3(-g.x, 1.0, -g.y));


    vec3 baseN = normalize(vNormalW);
    // Detail flattens with distance so the horizon stays calm instead of noisy.
    // Camera-relative, because the mesh follows the camera across the world.
    float camDist = length(vWorld.xz - cameraPosition.xz);
    float detailFade = 1.0 - smoothstep(35.0, 170.0, camDist);
    vec3 n = normalize(mix(baseN, normalize(baseN * 0.45 + detail * 1.15), detailFade));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 sunDir = normalize(uSun);

    // --- depth-graded body colour (shallow turquoise -> deep teal) ---
    // Radiates from the island at the world origin, independent of the camera.
    float depth = smoothstep(6.0, 120.0, length(p));
    vec3 body = mix(uShallow, uMid, smoothstep(0.0, 0.45, depth));
    body = mix(body, uDeep, smoothstep(0.45, 1.0, depth));

    // Subsurface glow: light scattering through the wave crests.
    float sss = smoothstep(-0.2, 0.9, vWave) * (0.35 + 0.65 * detailFade);
    body += sss * 0.10 * vec3(0.35, 1.0, 0.92);

    // --- caustic-like light bands under the surface ---
    // Dilewati di kualitas rendah: ini satu evaluasi ripples penuh per piksel.
    if (uDetail > 0.5) {
      float caustic = ripples(p * 1.25 + vec2(0.0, t * 0.35), t * 0.8);
      float bands = smoothstep(0.10, 0.30, caustic);
      body += bands * 0.13 * vec3(0.55, 1.0, 0.98) * detailFade;
    }


    // --- fresnel sky reflection ---
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    vec3 col = mix(body, uHorizon, clamp(fres * 0.85, 0.0, 0.75));

    // --- sun glitter: sharp specular on the micro normals ---
    vec3 hv = normalize(sunDir + viewDir);
    float ndh = max(dot(n, hv), 0.0);
    float glitterA = pow(ndh, 160.0);
    float glitterB = pow(ndh, 34.0);
    float sparkleMask = smoothstep(-0.05, 0.45, r0);
    col += glitterA * 4.5 * sparkleMask * detailFade * vec3(1.0, 1.0, 0.99);
    col += glitterB * 0.55 * detailFade * vec3(0.95, 1.0, 1.0);

    // View-independent surface glints: thin bright wavelet tops, like the
    // scattered white flecks on sunlit tropical water. Oktaf kedua hanya di
    // kualitas menengah ke atas.
    float hf = fbm(p * 2.4 + vec2(t * 0.55, -t * 0.33));
    if (uDetail > 0.5) hf += 0.55 * fbm(p * 5.6 - vec2(t * 0.9, t * 0.4));
    float glint = smoothstep(0.30, 0.52, hf) * (1.0 - smoothstep(0.62, 0.85, hf));
    col += glint * 0.85 * detailFade * vec3(1.0, 1.0, 1.0);


    // --- foam on the tallest crests ---
    float crest = smoothstep(0.62, 1.0, vWave + r0 * 0.35);
    col = mix(col, vec3(0.95, 0.995, 1.0), crest * 0.30 * detailFade);

    // --- atmospheric haze into the horizon ---
    // Fully hazed well before the mesh edge so the plane never silhouettes
    // against the sky — sea and sky melt into one continuous horizon.
    float haze = smoothstep(90.0, 460.0, camDist);
    col = mix(col, uHorizon, haze);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function Ocean() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const kind = useWeather((s) => s.kind);
  const tier = useGraphics((s) => s.tier);
  const detail = GRAPHICS[tier].oceanDetail;
  const { scene } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color("#7ff0e2") },
      uMid: { value: new THREE.Color("#3fd8d2") },
      uDeep: { value: new THREE.Color("#12a2b4") },
      uHorizon: { value: new THREE.Color("#b9dff3") },
      uSun: { value: new THREE.Vector3(30, 28, 18) },
      uDetail: { value: 2 },
    }),
    [],
  );

  // Tingkat detail hanya diupdate saat pilihan kualitas berubah, bukan per frame.
  useEffect(() => {
    const u = mat.current?.uniforms;
    if (u?.['uDetail']) u['uDetail'].value = detail;
  }, [detail]);



  // Target colours per weather kind, cached so the lerp can damp toward them.
  const targets = useMemo(() => {
    const cache: Partial<Record<string, { s: THREE.Color; m: THREE.Color; d: THREE.Color; h: THREE.Color }>> = {};
    return (k: string) => {
      let c = cache[k];
      if (!c) {
        const p = WEATHER[k as keyof typeof WEATHER];
        c = {
          s: new THREE.Color(p.waterShallow),
          m: new THREE.Color(p.waterMid),
          d: new THREE.Color(p.waterDeep),
          h: new THREE.Color(p.waterHorizon),
        };
        cache[k] = c;
      }
      return c;
    };
  }, []);

  // Reused scratch colours so the day/night blend below doesn't allocate a
  // new THREE.Color every frame.
  const scratch = useMemo(
    () => ({
      s: new THREE.Color(),
      m: new THREE.Color(),
      d: new THREE.Color(),
      h: new THREE.Color(),
      dayTint: new THREE.Color(),
    }),
    [],
  );

  useFrame((state, raw) => {
    const delta = Math.min(raw, 0.05);
    const u = mat.current?.uniforms;
    if (u) {
      const ut = u['uTime']!;
      ut.value += delta;

      const t = targets(kind);
      // Same day/night blend Weather.tsx applies to fog/sun/ambient — without
      // this, the sea stayed at full weather-only brightness all day while
      // the sky dimmed and warmed at dawn/dusk/night, causing a hard seam at
      // the horizon instead of a smooth match.
      const day = dayNightAt(clock.hour, scratch.dayTint);
      const b = day.brightness;
      scratch.s.copy(t.s).lerp(day.tint, TINT_WEIGHT).multiplyScalar(b);
      scratch.m.copy(t.m).lerp(day.tint, TINT_WEIGHT).multiplyScalar(b);
      scratch.d.copy(t.d).lerp(day.tint, TINT_WEIGHT).multiplyScalar(b);

      const k = 1 - Math.exp(-2.2 * delta);
      (u['uShallow']!.value as THREE.Color).lerp(scratch.s, k);
      (u['uMid']!.value as THREE.Color).lerp(scratch.m, k);
      (u['uDeep']!.value as THREE.Color).lerp(scratch.d, k);

      // Horizon: lock onto the scene's ACTUAL fog colour (already combines
      // weather + time-of-day in Weather.tsx) instead of a static per-weather
      // hex, so the sea always melts into whatever the sky is doing right
      // now rather than occasionally drifting out of sync with it.
      const fog = scene.fog as THREE.FogExp2 | null;
      const horizonTarget = fog
        ? fog.color
        : scratch.h.copy(t.h).lerp(day.tint, TINT_WEIGHT).multiplyScalar(b);
      (u['uHorizon']!.value as THREE.Color).lerp(horizonTarget, k);
    }
    // Keep the ocean centred under the camera so its edge is always ~600
    // units out — far past the point where the haze has fully taken over.
    // The waves are displaced in world space, so this never causes swimming.
    if (mesh.current) {
      mesh.current.position.x = state.camera.position.x;
      mesh.current.position.z = state.camera.position.z;
    }
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} receiveShadow={false} frustumCulled={false}>
      <planeGeometry args={[1200, 1200, 200, 200]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
      />
    </mesh>
  );
}