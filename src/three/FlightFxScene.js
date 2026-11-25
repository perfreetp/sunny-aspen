import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FlightDirector } from '../fx/FlightDirector.js'
import { SmokeParticleSystem } from './SmokeParticleSystem.js'
import { SURFACE_PRESETS, clamp } from '../fx/schema.js'

const HARD_PARTICLE_CAP = 8000

export class FlightFxScene {
  constructor(container, params, onTelemetry) {
    this.container = container
    this.params = params
    this.onTelemetry = onTelemetry || (() => {})
    this.appliedSurfaceId = null
    this.disposed = false

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(container.clientWidth || 1200, container.clientHeight || 700)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#bfd3e4')
    this.scene.fog = new THREE.Fog('#bfd3e4', 220, 760)

    this.camera = new THREE.PerspectiveCamera(55, this._aspect(), 0.1, 1400)
    this.camera.position.set(-10, 10.5, -130)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.minDistance = 8
    this.controls.maxDistance = 220
    this.controls.target.set(0, 2.4, -96)

    this._buildLights()
    this._buildAirport()
    this._buildDustRings()
    this._buildAircraft()

    this.wakeSystem = new SmokeParticleSystem({
      name: 'engine-wake',
      color: '#e3edf5',
      seed: params.seed,
      maxParticles: HARD_PARTICLE_CAP
    })
    this.dustSystem = new SmokeParticleSystem({
      name: 'ground-dust',
      color: SURFACE_PRESETS[params.surfaceId]?.dustColor || '#c7c0b2',
      seed: (params.seed >>> 0) + 97,
      maxParticles: HARD_PARTICLE_CAP
    })
    this.wakeSystem.addTo(this.scene)
    this.dustSystem.addTo(this.scene)

    this.director = new FlightDirector()
    this.director.replay(params.actionProfile || 'takeoff')

    this.simAccumulator = 0
    this.wakeEmitAccumulator = 0
    this.dustEmitAccumulator = 0
    this.touchdownBurstRequested = 0
    this.lastFollowPosition = this.plane.position.clone()
    this.telemetryTimer = 0
    this.fps = 60
    this._lastFrameNow = performance.now()

    this._resizeObserver = new ResizeObserver(() => this.resize())
    this._resizeObserver.observe(container)
    this.resize()
    this.resetCamera()

    this._raf = requestAnimationFrame(this.frame)
  }

  _aspect() {
    const w = this.container.clientWidth || 1200
    const h = this.container.clientHeight || 700
    return w / Math.max(1, h)
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight('#e8f4ff', '#66705a', 1.65)
    this.scene.add(hemi)

    this.sun = new THREE.DirectionalLight('#fff2d8', 2.35)
    this.sun.position.set(38, 62, 28)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 190
    this.sun.shadow.camera.left = -85
    this.sun.shadow.camera.right = 85
    this.sun.shadow.camera.top = 85
    this.sun.shadow.camera.bottom = -85
    this.sun.shadow.bias = -0.00025
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
  }

  _buildAirport() {
    this.colliders = []
    this.colliderDebugGroup = new THREE.Group()
    this.colliderDebugGroup.visible = false
    this.scene.add(this.colliderDebugGroup)

    const groundMat = new THREE.MeshStandardMaterial({ color: '#526b43', roughness: 1 })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    this.shoulderMaterial = new THREE.MeshStandardMaterial({ color: '#62675f', roughness: 0.96 })
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(25, 326), this.shoulderMaterial)
    shoulder.rotation.x = -Math.PI / 2
    shoulder.position.y = 0.012
    shoulder.receiveShadow = true
    this.scene.add(shoulder)

    this.runwayMaterial = new THREE.MeshStandardMaterial({ color: '#777b78', roughness: 0.92 })
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(14, 310), this.runwayMaterial)
    runway.rotation.x = -Math.PI / 2
    runway.position.y = 0.024
    runway.receiveShadow = true
    this.scene.add(runway)

    const markingMat = new THREE.MeshBasicMaterial({ color: '#f4f6f0', transparent: true, opacity: 0.86 })
    const addMark = (w, d, x, z, y = 0.04) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), markingMat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, y, z)
      this.scene.add(mesh)
      return mesh
    }

    for (let z = -142; z <= 142; z += 12) addMark(0.42, 5.2, 0, z)
    addMark(0.28, 292, -6.55, 0)
    addMark(0.28, 292, 6.55, 0)

    for (const endZ of [-137, 137]) {
      for (let i = -3; i <= 3; i++) addMark(1.05, 7.5, i * 1.7, endZ)
    }

    const buildings = [
      { x: -20, z: -48, w: 11, d: 15, h: 8.5, color: '#8793a0' },
      { x: 16.5, z: -12, w: 8.5, d: 13, h: 12.5, color: '#9a8f82' },
      { x: -22, z: 28, w: 13, d: 18, h: 6.5, color: '#7f8c7a' },
      { x: 17, z: 48, w: 7, d: 7, h: 20, color: '#a7b0b8' },
      { x: 25, z: 78, w: 18, d: 15, h: 9.5, color: '#8d7668' },
      { x: -17, z: 88, w: 9, d: 20, h: 7.5, color: '#7c8791' }
    ]
    buildings.forEach((b) => this._addBuilding(b))

    // 跑道边灯，帮助判断速度与距离。
    const lightMat = new THREE.MeshStandardMaterial({
      color: '#ffd37a',
      emissive: '#ffb347',
      emissiveIntensity: 0.8
    })
    const lightGeo = new THREE.SphereGeometry(0.16, 10, 8)
    for (let z = -145; z <= 145; z += 20) {
      for (const x of [-7.6, 7.6]) {
        const lamp = new THREE.Mesh(lightGeo, lightMat)
        lamp.position.set(x, 0.28, z)
        this.scene.add(lamp)
      }
    }
  }

  _addBuilding(spec) {
    const { x, z, w, d, h, color } = spec
    const group = new THREE.Group()
    group.position.set(x, 0, z)

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.06 })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.y = h / 2
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: '#17212b', transparent: true, opacity: 0.32 })
    )
    edges.position.y = h / 2
    group.add(edges)

    // 程序化窗带，固定网格，不参与随机种子。
    const windowMat = new THREE.MeshStandardMaterial({
      color: '#b9d8ea',
      emissive: '#24445c',
      emissiveIntensity: 0.25,
      roughness: 0.25
    })
    const rows = Math.max(2, Math.floor(h / 2.4))
    const cols = Math.max(2, Math.floor(w / 2.2))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r * 7 + c * 3 + Math.floor(x + z)) % 5 === 0) continue
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 0.06), windowMat)
        win.position.set(-w / 2 + 1.1 + c * ((w - 2.2) / Math.max(1, cols - 1)), 1.5 + r * 2.1, d / 2 + 0.035)
        group.add(win)
      }
    }

    this.scene.add(group)

    const collider = {
      min: new THREE.Vector3(x - w / 2, 0, z - d / 2),
      max: new THREE.Vector3(x + w / 2, h, z + d / 2)
    }
    this.colliders.push(collider)

    const helper = new THREE.Box3Helper(new THREE.Box3(collider.min, collider.max), 0x00e5ff)
    this.colliderDebugGroup.add(helper)
  }

  _buildDustRings() {
    this.dustRingPool = []
    const ringGeometry = new THREE.RingGeometry(0.68, 1, 128)
    const color = SURFACE_PRESETS[this.params.surfaceId]?.dustColor || '#c7c0b2'

    for (let i = 0; i < 8; i++) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
      const ring = new THREE.Mesh(ringGeometry, material)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.075
      ring.visible = false
      ring.renderOrder = 8
      ring.userData.active = false
      ring.userData.age = 0
      ring.userData.life = 1.25
      ring.userData.intensity = 1
      this.scene.add(ring)
      this.dustRingPool.push(ring)
    }
  }

  _buildAircraft() {
    this.plane = new THREE.Group()
    this.scene.add(this.plane)

    const bodyMat = new THREE.MeshStandardMaterial({ color: '#d8e0e8', roughness: 0.42, metalness: 0.18 })
    const accentMat = new THREE.MeshStandardMaterial({ color: '#2f6fed', roughness: 0.45, metalness: 0.12 })
    const darkMat = new THREE.MeshStandardMaterial({ color: '#202833', roughness: 0.55, metalness: 0.25 })
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#18324a',
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.82
    })

    const fuselageGeo = new THREE.CapsuleGeometry(0.58, 4.5, 8, 18)
    fuselageGeo.rotateX(Math.PI / 2)
    const fuselage = new THREE.Mesh(fuselageGeo, bodyMat)
    fuselage.position.y = 1.62
    fuselage.castShadow = true
    this.plane.add(fuselage)

    const noseGeo = new THREE.ConeGeometry(0.58, 1.45, 18)
    noseGeo.rotateX(Math.PI / 2)
    const nose = new THREE.Mesh(noseGeo, accentMat)
    nose.position.set(0, 1.62, 3.25)
    nose.castShadow = true
    this.plane.add(nose)

    const tailGeo = new THREE.ConeGeometry(0.46, 1.25, 16)
    tailGeo.rotateX(-Math.PI / 2)
    const tail = new THREE.Mesh(tailGeo, bodyMat)
    tail.position.set(0, 1.62, -3.15)
    tail.castShadow = true
    this.plane.add(tail)

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), glassMat)
    canopy.scale.set(0.78, 0.42, 1.25)
    canopy.position.set(0, 2.08, 1.35)
    canopy.castShadow = true
    this.plane.add(canopy)

    const wing = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.14, 1.75), bodyMat)
    wing.position.set(0, 1.48, -0.35)
    wing.castShadow = true
    this.plane.add(wing)

    const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.04, 0.28), accentMat)
    wingStripe.position.set(0, 1.57, 0.25)
    this.plane.add(wingStripe)

    const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 1.45), accentMat)
    vTail.position.set(0, 2.45, -2.75)
    vTail.rotation.x = -0.28
    vTail.castShadow = true
    this.plane.add(vTail)

    const hTail = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 1.05), bodyMat)
    hTail.position.set(0, 2.02, -3.05)
    hTail.castShadow = true
    this.plane.add(hTail)

    this.exhaustAnchors = []
    for (const side of [-1, 1]) {
      const engineGeo = new THREE.CylinderGeometry(0.38, 0.44, 1.75, 20)
      engineGeo.rotateX(Math.PI / 2)
      const engine = new THREE.Mesh(engineGeo, bodyMat)
      engine.position.set(side * 1.18, 1.28, -0.72)
      engine.castShadow = true
      this.plane.add(engine)

      const nozzleGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.22, 18)
      nozzleGeo.rotateX(Math.PI / 2)
      const nozzle = new THREE.Mesh(nozzleGeo, darkMat)
      nozzle.position.set(side * 1.18, 1.28, -1.66)
      this.plane.add(nozzle)

      const anchor = new THREE.Object3D()
      anchor.position.set(side * 1.18, 1.28, -1.82)
      this.plane.add(anchor)
      this.exhaustAnchors.push(anchor)
    }

    this.gearGroup = new THREE.Group()
    this.plane.add(this.gearGroup)
    this.wheelPivots = []
    this.contactAnchors = []

    this._addGear(0, 2.25, 0.34)
    this._addGear(-1.22, -0.72, 0.4)
    this._addGear(1.22, -0.72, 0.4)

    this.plane.position.set(0, 0, -105)
  }

  _addGear(x, z, wheelRadius) {
    const strutMat = new THREE.MeshStandardMaterial({ color: '#9aa7b2', metalness: 0.55, roughness: 0.32 })
    const tireMat = new THREE.MeshStandardMaterial({ color: '#111418', roughness: 0.82 })
    const hubMat = new THREE.MeshStandardMaterial({ color: '#c3ccd4', metalness: 0.5, roughness: 0.35 })

    const strutHeight = 1.18 - wheelRadius
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, strutHeight, 10), strutMat)
    strut.position.set(x, wheelRadius + strutHeight / 2, z)
    strut.castShadow = true
    this.gearGroup.add(strut)

    const pivot = new THREE.Group()
    pivot.position.set(x, wheelRadius, z)
    this.gearGroup.add(pivot)

    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.28, 22)
    tireGeo.rotateZ(Math.PI / 2)
    const tire = new THREE.Mesh(tireGeo, tireMat)
    tire.castShadow = true
    pivot.add(tire)

    const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.42, wheelRadius * 0.42, 0.3, 16)
    hubGeo.rotateZ(Math.PI / 2)
    const hub = new THREE.Mesh(hubGeo, hubMat)
    pivot.add(hub)
    this.wheelPivots.push(pivot)

    const contact = new THREE.Object3D()
    contact.position.set(x, 0.06, z)
    this.plane.add(contact)
    this.contactAnchors.push(contact)
  }

  replay(profile = this.params.actionProfile) {
    this.params.actionProfile = profile
    this.director.replay(profile)
    this.simAccumulator = 0
    this.wakeEmitAccumulator = 0
    this.dustEmitAccumulator = 0
    this.touchdownBurstRequested = 0
    this.wakeSystem.reset(this.params.seed >>> 0)
    this.dustSystem.reset((this.params.seed >>> 0) + 97)
    for (const ring of this.dustRingPool || []) {
      ring.visible = false
      ring.userData.active = false
      ring.material.opacity = 0
    }
    this._syncPlaneTransform(1 / 60)
    this.plane.updateMatrixWorld(true)
    this.resetCamera()
    this._emitTelemetry(true)
  }

  applySeed() {
    this.replay(this.params.actionProfile)
  }

  requestTouchdownBurst() {
    this.touchdownBurstRequested = clamp(this.touchdownBurstRequested + 1, 0, 3)
  }

  resetCamera() {
    const p = this.plane.position
    this.camera.position.set(this.plane.position.x - 10, this.plane.position.y + 10, this.plane.position.z - 24)
    this.controls.target.set(p.x, p.y + 2.4, p.z + 10)
    this.lastFollowPosition.copy(p)
    this.controls.update()
  }

  resize() {
    const w = this.container.clientWidth || 1200
    const h = this.container.clientHeight || 700
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()

    const bufferHeight = this.renderer.domElement.height
    const scale = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)))
    this.wakeSystem?.setPointScale(scale)
    this.dustSystem?.setPointScale(scale)
  }

  frame = (now) => {
    if (this.disposed) return
    this._raf = requestAnimationFrame(this.frame)

    const realDt = Math.min(0.1, Math.max(0, (now - this._lastFrameNow) / 1000))
    this._lastFrameNow = now
    if (realDt > 0) this.fps = this.fps * 0.94 + (1 / realDt) * 0.06

    this._syncSurfaceAndHelpers()

    const fixedStep = clamp(this.params.simulation.fixedStep || 1 / 60, 1 / 120, 1 / 30)
    if (this.params.playing) {
      this.simAccumulator += realDt * (this.params.timeScale || 1)
      let steps = 0
      while (this.simAccumulator + 1e-7 >= fixedStep && steps < 5) {
        this.fixedStep(fixedStep)
        this.simAccumulator -= fixedStep
        steps++
      }
      if (steps >= 5) this.simAccumulator = 0
    } else {
      this._refreshAppearance()
    }

    this._updateFollowCamera()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)

    this.telemetryTimer += realDt
    if (this.telemetryTimer > 0.12) {
      this.telemetryTimer = 0
      this._emitTelemetry(false)
    }
  }

  fixedStep(dt) {
    const params = this.params
    const events = this.director.step(dt, params)
    const state = this.director.state

    this._syncPlaneTransform(dt)
    this.plane.updateMatrixWorld(true)

    this.wakeSystem.activeLimit = params.wake.enabled ? params.wake.particleCount : 0
    this.dustSystem.activeLimit = params.dust.enabled ? params.dust.particleCount : 0

    for (const event of events) {
      if (event.type === 'touchdown' && state.gearDown) {
        this._spawnTouchdownBurst(event.intensity || 1)
      }
    }
    if (this.touchdownBurstRequested > 0) {
      this.touchdownBurstRequested--
      this._spawnTouchdownBurst(1)
    }

    this._emitWake(dt, state)
    this._emitGroundDust(dt, state)

    const activeColliders = params.simulation.collision ? this.colliders : []
    const surface = SURFACE_PRESETS[params.surfaceId] || SURFACE_PRESETS.concrete

    this.wakeActive = this.wakeSystem.update(dt, {
      maxActive: params.wake.particleCount,
      concentration: params.wake.concentration,
      diffusion: params.wake.diffusion,
      riseSpeed: params.wake.riseSpeed,
      coarseness: params.wake.coarseness,
      opacity: params.wake.opacity,
      turbulence: params.wake.turbulence,
      time: this.director.time,
      colliders: activeColliders,
      sizeStart: [0.32, 1.25],
      sizeEnd: [2.6, 8.4],
      drag: 1.05
    })

    this.dustActive = this.dustSystem.update(dt, {
      maxActive: params.dust.particleCount,
      concentration: params.dust.concentration,
      diffusion: params.dust.diffusion,
      riseSpeed: params.dust.riseSpeed,
      coarseness: params.dust.coarseness,
      opacity: params.dust.opacity,
      turbulence: 0.72,
      time: this.director.time + 11.37,
      colliders: activeColliders,
      sizeStart: [0.45, 1.9],
      sizeEnd: [2.4, 9.5],
      drag: 1.35,
      floorY: 0.03
    })
    this._updateDustRings(dt)

    this.targetWakeLength = this._targetWakeLength(state.throttle)
    this.lastSurfaceLabel = surface.label
  }

  _refreshAppearance() {
    const p = this.params
    this.wakeSystem.refreshStyle({
      concentration: p.wake.concentration,
      coarseness: p.wake.coarseness,
      opacity: p.wake.opacity,
      maxActive: p.wake.particleCount,
      sizeStart: [0.32, 1.25],
      sizeEnd: [2.6, 8.4]
    })
    this.dustSystem.refreshStyle({
      concentration: p.dust.concentration,
      coarseness: p.dust.coarseness,
      opacity: p.dust.opacity,
      maxActive: p.dust.particleCount,
      sizeStart: [0.45, 1.9],
      sizeEnd: [2.4, 9.5]
    })
  }

  _syncPlaneTransform(dt) {
    const s = this.director.state
    this.plane.position.set(s.x, s.y, s.z)
    this.plane.rotation.set(-s.pitch, THREE.MathUtils.degToRad(s.heading || 0), s.roll || 0)
    this.gearGroup.visible = !!s.gearDown

    if (dt > 0) {
      for (const wheel of this.wheelPivots) {
        wheel.rotation.x -= (s.airspeed * dt) / 0.38
      }
    }

    this.sun.position.set(s.x + 38, s.y + 62, s.z + 28)
    this.sun.target.position.set(s.x, s.y, s.z)
  }

  _syncSurfaceAndHelpers() {
    if (this.appliedSurfaceId !== this.params.surfaceId) {
      const preset = SURFACE_PRESETS[this.params.surfaceId] || SURFACE_PRESETS.concrete
      this.runwayMaterial.color.set(preset.runwayColor)
      this.shoulderMaterial.color.set(preset.shoulderColor)
      this.dustSystem.setColor(preset.dustColor)
      this.dustRingPool?.forEach((ring) => ring.material.color.set(preset.dustColor))
      this.appliedSurfaceId = this.params.surfaceId
    }
    this.colliderDebugGroup.visible = !!this.params.simulation.showColliders
  }

  _forwardVector(out = new THREE.Vector3()) {
    const pitch = this.director.state.pitch || 0
    const heading = THREE.MathUtils.degToRad(this.director.state.heading || 0)
    out.set(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), Math.cos(heading) * Math.cos(pitch))
    return out.normalize()
  }

  _power01(throttle) {
    return 0.18 + 0.82 * clamp(throttle, 0, 1)
  }

  _targetWakeLength(throttle) {
    const power = this._power01(throttle)
    return this.params.wake.length * (0.22 + 0.78 * power)
  }

  _emitWake(dt, state) {
    const cfg = this.params.wake
    if (!cfg.enabled) return

    const power = this._power01(state.throttle)
    const targetLength = this._targetWakeLength(state.throttle)
    const life = clamp((targetLength / 11.5) * (cfg.lifetimeScale || 1), 0.75, 5.2)
    const fillRate = (cfg.particleCount / life) * cfg.concentration * (0.24 + 0.76 * power) * 0.52
    this.wakeEmitAccumulator += fillRate * dt

    const forward = this._forwardVector(new THREE.Vector3())
    const exhaustBack = forward.clone().multiplyScalar(-1)
    const planeVelocity = forward.clone().multiplyScalar(state.airspeed)
    const tmpWorld = new THREE.Vector3()

    let guard = 0
    while (this.wakeEmitAccumulator >= 1 && guard < 240) {
      this.wakeEmitAccumulator -= 1
      guard++

      const anchor = this.exhaustAnchors[guard % this.exhaustAnchors.length]
      anchor.getWorldPosition(tmpWorld)
      const jitterX = (this.wakeSystem.rng() - 0.5) * 0.16
      const jitterY = (this.wakeSystem.rng() - 0.5) * 0.12

      const velocity = planeVelocity
        .clone()
        .addScaledVector(exhaustBack, 10 + 20 * power + cfg.length * 0.12)
      velocity.x += (this.wakeSystem.rng() - 0.5) * 1.6
      velocity.y += (this.wakeSystem.rng() - 0.42) * 1.1
      velocity.z += (this.wakeSystem.rng() - 0.5) * 1.6

      this.wakeSystem.emit({
        position: { x: tmpWorld.x + jitterX, y: tmpWorld.y + jitterY, z: tmpWorld.z },
        velocity,
        life: life * (0.76 + this.wakeSystem.rng() * 0.48),
        drag: 0.92 + this.wakeSystem.rng() * 0.32,
        buoyancy: 0.55 + cfg.riseSpeed * 0.35
      })
    }
  }

  _emitGroundDust(dt, state) {
    const cfg = this.params.dust
    if (!cfg.enabled || !state.gearDown || !state.weightOnWheels || state.airspeed < 0.6) return

    const speedFactor = clamp(state.airspeed / 34, 0, 1.25)
    const rate = (cfg.particleCount / Math.max(1, cfg.lifetime)) * cfg.concentration * speedFactor * 0.82
    this.dustEmitAccumulator += rate * dt

    const forward = this._forwardVector(new THREE.Vector3())
    const back = forward.clone().multiplyScalar(-1)
    const tmpWorld = new THREE.Vector3()
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize()

    let guard = 0
    while (this.dustEmitAccumulator >= 1 && guard < 220) {
      this.dustEmitAccumulator -= 1
      guard++

      // 0 鼻轮，1/2 主轮；高速扬尘主要来自两个主轮。
      const anchorIndex = guard % 7 === 0 ? 0 : guard % 2 === 0 ? 1 : 2
      const anchor = this.contactAnchors[anchorIndex]
      anchor.getWorldPosition(tmpWorld)
      const side = anchorIndex === 1 ? -1 : anchorIndex === 2 ? 1 : this.dustSystem.rng() > 0.5 ? -1 : 1

      const velocity = back.clone().multiplyScalar(1.5 + this.dustSystem.rng() * 4.2)
      velocity.addScaledVector(right, side * (1.2 + this.dustSystem.rng() * cfg.outwardSpeed * 0.72))
      velocity.y = 0.7 + this.dustSystem.rng() * (1.6 + cfg.riseSpeed * 1.1)

      this.dustSystem.emit({
        position: {
          x: tmpWorld.x + (this.dustSystem.rng() - 0.5) * 0.35,
          y: 0.12,
          z: tmpWorld.z + (this.dustSystem.rng() - 0.5) * 0.35
        },
        velocity,
        life: cfg.lifetime * (0.65 + this.dustSystem.rng() * 0.65),
        drag: 1.15 + this.dustSystem.rng() * 0.45,
        buoyancy: 0.8 + cfg.riseSpeed * 0.25
      })
    }
  }

  _spawnTouchdownBurst(intensity = 1) {
    const cfg = this.params.dust
    if (!cfg.enabled) return

    const center = new THREE.Vector3()
    this.contactAnchors[1].getWorldPosition(center)
    center.y = 0.16
    this._spawnDustRing(center, intensity)

    const count = Math.floor(
      clamp(cfg.particleCount * 0.24 * cfg.concentration * intensity, 90, Math.min(1500, cfg.particleCount * 0.7))
    )
    const forward = this._forwardVector(new THREE.Vector3())

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (this.dustSystem.rng() - 0.5) * 0.12
      const radialX = Math.cos(angle)
      const radialZ = Math.sin(angle)
      const speed = cfg.outwardSpeed * (cfg.ringRadius / 6.4) * (0.58 + this.dustSystem.rng() * 0.72) * intensity

      const velocity = new THREE.Vector3(radialX * speed, 1.1 + this.dustSystem.rng() * 2.4 + cfg.riseSpeed * 0.45, radialZ * speed)
      // 叠加一点机轮向后抛尘和滑跑方向分量。
      velocity.addScaledVector(forward, 1.2 * intensity)

      const startRadius = 0.25 + cfg.ringRadius * 0.075 * this.dustSystem.rng()
      this.dustSystem.emit({
        position: {
          x: center.x + radialX * startRadius,
          y: 0.14 + this.dustSystem.rng() * 0.16,
          z: center.z + radialZ * startRadius
        },
        velocity,
        life: cfg.lifetime * (0.72 + this.dustSystem.rng() * 0.58),
        drag: 1.05 + this.dustSystem.rng() * 0.5,
        buoyancy: 0.9 + cfg.riseSpeed * 0.35
      })
    }
  }

  _spawnDustRing(center, intensity = 1) {
    const ring = this.dustRingPool.find((item) => !item.userData.active) || this.dustRingPool[0]
    ring.position.set(center.x, 0.075, center.z)
    ring.scale.setScalar(Math.max(0.1, this.params.dust.ringRadius * 0.28))
    ring.visible = true
    ring.userData.active = true
    ring.userData.age = 0
    ring.userData.life = 1.15 + this.params.dust.lifetime * 0.12
    ring.userData.intensity = intensity
    ring.material.opacity = 0.32 * this.params.dust.concentration
  }

  _updateDustRings(dt) {
    const cfg = this.params.dust
    for (const ring of this.dustRingPool || []) {
      if (!ring.userData.active) continue
      ring.userData.age += dt
      const t = ring.userData.age / ring.userData.life
      if (t >= 1) {
        ring.userData.active = false
        ring.visible = false
        ring.material.opacity = 0
        continue
      }

      const eased = 1 - Math.pow(1 - t, 3)
      const radius = cfg.ringRadius * (0.28 + 1.42 * eased) * ring.userData.intensity
      ring.scale.setScalar(Math.max(0.1, radius))
      ring.material.opacity = cfg.concentration * 0.3 * Math.pow(1 - t, 1.7)
    }
  }

  _updateFollowCamera() {
    const p = this.plane.position
    if (this.params.simulation.followCamera) {
      const delta = new THREE.Vector3(p.x - this.lastFollowPosition.x, p.y - this.lastFollowPosition.y, p.z - this.lastFollowPosition.z)
      this.camera.position.add(delta)
      this.controls.target.add(delta)
    }
    this.lastFollowPosition.copy(p)
  }

  _emitTelemetry(force) {
    if (!force && !this.onTelemetry) return
    const s = this.director.state
    this.onTelemetry({
      phase: s.phase,
      time: s.time,
      throttle: s.throttle,
      airspeed: s.airspeed,
      altitude: s.altitude,
      gearDown: s.gearDown,
      weightOnWheels: s.weightOnWheels,
      targetWakeLength: this.targetWakeLength || 0,
      wakeActive: this.wakeActive || 0,
      dustActive: this.dustActive || 0,
      fps: Math.round(this.fps),
      surfaceLabel: this.lastSurfaceLabel || ''
    })
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this._raf)
    this._resizeObserver?.disconnect()
    this.controls?.dispose()
    this.wakeSystem?.dispose()
    this.dustSystem?.dispose()

    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.()
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((m) => {
          if (m.map) m.map.dispose?.()
          m.dispose?.()
        })
      }
    })

    this.renderer?.dispose()
    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
