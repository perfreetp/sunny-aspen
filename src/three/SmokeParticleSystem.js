import * as THREE from 'three'
import { createSeededRandom } from '../fx/rng.js'

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  varying float vAlpha;
  varying float vSeed;

  uniform float uPointScale;

  void main() {
    vAlpha = aAlpha;
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float size = aSize * uPointScale / max(0.1, -mvPosition.z);
    gl_PointSize = clamp(size, 1.0, 1024.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  varying float vAlpha;
  varying float vSeed;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float angle = vSeed * 6.2831853;
    float c = cos(angle);
    float s = sin(angle);
    uv = mat2(c, -s, s, c) * uv;

    float r = length(uv) * 2.0;
    float cloud = fbm(uv * 3.1 + vec2(vSeed * 17.0, vSeed * 9.0));
    float shape = smoothstep(1.02, 0.16, r + (cloud - 0.5) * 0.58);
    float grain = 0.62 + 0.38 * cloud;
    float alpha = shape * vAlpha * grain * (1.0 - r * 0.08);

    if (alpha < 0.008) discard;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`

export class SmokeParticleSystem {
  constructor({ name, color = '#dfe7ee', seed = 1, maxParticles = 8000 }) {
    this.name = name
    this.maxParticles = maxParticles
    this.activeLimit = 1000
    this.particles = []
    this.rng = createSeededRandom(name, seed)

    this.geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(maxParticles * 3)
    this.sizes = new Float32Array(maxParticles)
    this.alphas = new Float32Array(maxParticles)
    this.seeds = new Float32Array(maxParticles)

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setDrawRange(0, 0)

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPointScale: { value: 800 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending
    })

    this.points = new THREE.Points(this.geometry, this.material)
    this.points.name = name
    this.points.frustumCulled = false
    this.points.renderOrder = 20
  }

  addTo(scene) {
    scene.add(this.points)
  }

  setColor(color) {
    this.material.uniforms.uColor.value.set(color)
  }

  setPointScale(scale) {
    this.material.uniforms.uPointScale.value = scale
  }

  reset(seed) {
    this.rng = createSeededRandom(this.name, seed)
    this.particles.length = 0
    this.alphas.fill(0)
    this.geometry.setDrawRange(0, 0)
    this.geometry.attributes.aAlpha.needsUpdate = true
  }

  emit(options) {
    if (!options?.position) return false
    if (this.particles.length >= Math.min(this.activeLimit, this.maxParticles)) return false

    const p = {
      x: options.position.x,
      y: options.position.y,
      z: options.position.z,
      vx: options.velocity?.x ?? 0,
      vy: options.velocity?.y ?? 0,
      vz: options.velocity?.z ?? 0,
      age: 0,
      life: options.life ?? 2,
      size0: options.size0 ?? 0.5,
      size1: options.size1 ?? 3,
      radius: options.radius ?? 0.8,
      sizeJitter: 0.78 + this.rng() * 0.48,
      seed: this.rng() * 100,
      drag: options.drag ?? 1.15,
      buoyancy: options.buoyancy ?? 1
    }
    this.particles.push(p)
    return true
  }

  update(dt, cfg) {
    const limit = Math.max(0, Math.min(cfg.maxActive ?? this.activeLimit, this.maxParticles))
    this.activeLimit = limit
    if (this.particles.length > limit) this.particles.length = limit

    const colliders = cfg.colliders || []
    const diffusion = cfg.diffusion ?? 0.7
    const riseSpeed = cfg.riseSpeed ?? 0.8
    const coarseness = cfg.coarseness ?? 0.5
    const opacity = cfg.opacity ?? 0.5
    const concentration = cfg.concentration ?? 0.7
    const turbulence = cfg.turbulence ?? 0.35
    const dragBase = cfg.drag ?? 1.1
    const time = cfg.time ?? 0
    const floorY = cfg.floorY ?? 0.04

    const startSize = cfg.sizeStart[0] + (cfg.sizeStart[1] - cfg.sizeStart[0]) * coarseness
    const endSize = cfg.sizeEnd[0] + (cfg.sizeEnd[1] - cfg.sizeEnd[0]) * coarseness

    let write = 0
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.age += dt
      if (p.age >= p.life) {
        this.particles[i] = this.particles[this.particles.length - 1]
        this.particles.pop()
        continue
      }

      // 确定性布朗扩散 + 正弦湍流；所有随机数都来自种子 RNG。
      p.vx += (this.rng() - 0.5) * diffusion * 2.4 * dt
      p.vz += (this.rng() - 0.5) * diffusion * 2.4 * dt
      p.vy += (this.rng() - 0.42) * diffusion * 0.9 * dt

      p.vx += Math.sin(time * 1.7 + p.seed * 1.31) * turbulence * dt
      p.vz += Math.cos(time * 1.35 + p.seed * 1.73) * turbulence * dt

      p.vy += riseSpeed * p.buoyancy * 0.82 * dt
      const terminalRise = 0.25 + riseSpeed * 1.45
      if (p.vy > terminalRise) p.vy += (terminalRise - p.vy) * 0.08

      const damp = Math.exp(-dragBase * p.drag * dt)
      p.vx *= damp
      p.vz *= damp
      p.vy *= Math.exp(-0.55 * dt)

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      const lifeT = p.age / p.life
      const sizeT = lifeT * lifeT * (3 - 2 * lifeT)
      const size = (startSize + (endSize - startSize) * sizeT) * p.sizeJitter
      const radius = Math.max(0.28, size * 0.42)

      if (p.y < floorY + radius * 0.22) {
        p.y = floorY + radius * 0.22
        if (p.vy < 0) p.vy = Math.abs(p.vy) * 0.12
      }

      this.avoidColliders(p, dt, colliders, radius)
      this.resolveColliders(p, colliders, radius)

      // 交换删除后，当前有效粒子统一写到连续的渲染缓冲。
      const idx = write++
      this.positions[idx * 3] = p.x
      this.positions[idx * 3 + 1] = p.y
      this.positions[idx * 3 + 2] = p.z

      this.sizes[idx] = size
      const fadeIn = THREE.MathUtils.smoothstep(lifeT, 0, 0.12)
      const fadeOut = 1 - THREE.MathUtils.smoothstep(lifeT, 0.28, 1)
      this.alphas[idx] = Math.max(0, opacity * concentration * fadeIn * fadeOut)
      this.seeds[idx] = p.seed
    }

    // write 是从尾部压缩时计数；粒子顺序无关，直接使用前 write 个缓冲。
    this.geometry.setDrawRange(0, write)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
    this.geometry.attributes.aAlpha.needsUpdate = true
    this.geometry.attributes.aSeed.needsUpdate = true

    return write
  }

  refreshStyle(cfg) {
    const limit = Math.max(0, Math.min(cfg.maxActive ?? this.activeLimit, this.maxParticles))
    this.activeLimit = limit
    if (this.particles.length > limit) this.particles.length = limit

    const coarseness = cfg.coarseness ?? 0.5
    const opacity = cfg.opacity ?? 0.5
    const concentration = cfg.concentration ?? 0.7
    const startSize = cfg.sizeStart[0] + (cfg.sizeStart[1] - cfg.sizeStart[0]) * coarseness
    const endSize = cfg.sizeEnd[0] + (cfg.sizeEnd[1] - cfg.sizeEnd[0]) * coarseness

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      const lifeT = Math.min(1, p.age / p.life)
      const sizeT = lifeT * lifeT * (3 - 2 * lifeT)
      const size = (startSize + (endSize - startSize) * sizeT) * p.sizeJitter

      this.positions[i * 3] = p.x
      this.positions[i * 3 + 1] = p.y
      this.positions[i * 3 + 2] = p.z
      this.sizes[i] = size

      const fadeIn = THREE.MathUtils.smoothstep(lifeT, 0, 0.12)
      const fadeOut = 1 - THREE.MathUtils.smoothstep(lifeT, 0.28, 1)
      this.alphas[i] = Math.max(0, opacity * concentration * fadeIn * fadeOut)
      this.seeds[i] = p.seed
    }

    this.geometry.setDrawRange(0, this.particles.length)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
    this.geometry.attributes.aAlpha.needsUpdate = true
    this.geometry.attributes.aSeed.needsUpdate = true
  }

  avoidColliders(p, dt, colliders, radius) {
    for (const b of colliders) {
      const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x)
      const cy = THREE.MathUtils.clamp(p.y, b.min.y, b.max.y)
      const cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z)
      let dx = p.x - cx
      let dy = p.y - cy
      let dz = p.z - cz
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const influence = 3.2 + radius

      if (d < 1e-5) continue // 已在盒内时交给 resolveColliders

      if (d < influence) {
        dx /= d
        dy /= d
        dz /= d
        const force = (1 - d / influence) * 13
        p.vx += dx * force * dt
        p.vz += dz * force * dt
        // 楼顶附近向上抬，侧面给少量抬升，形成绕流而不是贴墙钻模。
        p.vy += (Math.max(0, dy) * 1.4 + 0.22) * force * dt

        // 正对墙面时按粒子种子选择确定的一侧分流，避免所有烟原地反喷。
        const centerX = (b.min.x + b.max.x) * 0.5
        const centerZ = (b.min.z + b.max.z) * 0.5
        if (Math.abs(dx) >= Math.abs(dz) && Math.abs(dx) > 0.25) {
          const side = Math.abs(p.z - centerZ) > 0.15 ? Math.sign(p.z - centerZ) : p.seed > 50 ? 1 : -1
          p.vz += side * force * 1.45 * dt
        } else if (Math.abs(dz) > 0.25) {
          const side = Math.abs(p.x - centerX) > 0.15 ? Math.sign(p.x - centerX) : p.seed > 50 ? 1 : -1
          p.vx += side * force * 1.45 * dt
        }
      }
    }
  }

  resolveColliders(p, colliders, radius) {
    for (const b of colliders) {
      const minX = b.min.x - radius
      const maxX = b.max.x + radius
      const minY = b.min.y - radius
      const maxY = b.max.y + radius
      const minZ = b.min.z - radius
      const maxZ = b.max.z + radius

      if (p.x <= minX || p.x >= maxX || p.y <= minY || p.y >= maxY || p.z <= minZ || p.z >= maxZ) continue

      const dl = p.x - minX
      const dr = maxX - p.x
      const db = p.y - minY
      const dtFace = maxY - p.y
      const dn = p.z - minZ
      const df = maxZ - p.z
      const m = Math.min(dl, dr, db, dtFace, dn, df)

      if (m === dl) {
        p.x = minX
        p.vx = -Math.abs(p.vx) * 0.28 - 0.7
        p.vz *= 0.82
      } else if (m === dr) {
        p.x = maxX
        p.vx = Math.abs(p.vx) * 0.28 + 0.7
        p.vz *= 0.82
      } else if (m === dtFace) {
        p.y = maxY
        p.vy = Math.max(0.75, Math.abs(p.vy) * 0.25)
        p.vx *= 0.86
        p.vz *= 0.86
      } else if (m === db) {
        p.y = minY
        p.vy = 0
      } else if (m === dn) {
        p.z = minZ
        p.vz = -Math.abs(p.vz) * 0.28 - 0.7
        p.vx *= 0.82
      } else {
        p.z = maxZ
        p.vz = Math.abs(p.vz) * 0.28 + 0.7
        p.vx *= 0.82
      }
    }
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
