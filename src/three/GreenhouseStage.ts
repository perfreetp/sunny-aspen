import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ID, ProjectState, TrackNode } from '../types';
import { sampleTrack } from '../lib/timing';
import {
  GREENHOUSE,
  ArchTrackCurve,
  createFrameCurve,
  createTrackCurve,
  nearestArcU,
  roofY,
} from '../lib/trackGeometry';

interface StageCallbacks {
  onSelectTrack: (id: ID | null) => void;
  onEndpointChange: (id: ID, endpoint: 'A' | 'B', u: number) => void;
}

interface TrackView {
  node: TrackNode;
  curve: ArchTrackCurve;
  group: THREE.Group;
  tube: THREE.Mesh;
  fabric: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  leadBar: THREE.Mesh;
  stack: THREE.Mesh;
  handleA: THREE.Mesh;
  handleB: THREE.Mesh;
  label: THREE.Sprite;
  geometryKey: string;
}

const FABRIC_SEGMENTS = 112;

function makeFabricTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e7f5ef';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(15, 70, 55, 0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 1;
  for (let i = 6; i <= 128; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 1);
  texture.anisotropy = 4;
  return texture;
}

function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(7, 17, 31, .82)';
  ctx.roundRect(8, 10, 240, 52, 14);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.roundRect(8, 10, 240, 52, 14);
  ctx.stroke();
  ctx.font = '700 28px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#eaf6ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 37);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.35, 0.38, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export class GreenhouseStage {
  private container: HTMLElement;
  private callbacks: StageCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private resizeObserver: ResizeObserver;
  private animationLoop: () => void;
  private roofGroup = new THREE.Group();
  private trackLayer = new THREE.Group();
  private trackViews = new Map<ID, TrackView>();
  private fabricTexture = makeFabricTexture();
  private project: ProjectState | null = null;
  private time = 0;
  private selectedId: ID | null = null;
  private roofVisible = true;
  private drag: { trackId: ID; endpoint: 'A' | 'B'; pointerId: number } | null = null;
  private downPoint = { x: 0, y: 0 };
  private disposed = false;

  constructor(container: HTMLElement, callbacks: StageCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 120);
    this.camera.position.set(11.5, 7.4, 14.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2.55, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 42;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();

    this.setupLights();
    this.buildGreenhouse();
    this.scene.add(this.trackLayer);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown, true);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);

    this.animationLoop = () => {
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.renderer.setAnimationLoop(this.animationLoop);
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xdff6ff, 0x334155, 1.65));
    const sun = new THREE.DirectionalLight(0xffffff, 2.35);
    sun.position.set(-8, 13, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 42;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.65);
    fill.position.set(8, 6, -10);
    this.scene.add(fill);
  }

  private buildGreenhouse() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 52),
      new THREE.MeshStandardMaterial({ color: 0x101a2d, roughness: 0.96, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, 0x3b82f6, 0x243247);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.34;
    grid.position.y = 0.012;
    this.scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, GREENHOUSE.length + 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1b2740, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.018;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const metal = new THREE.MeshStandardMaterial({ color: 0xa8b5c7, metalness: 0.72, roughness: 0.28 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.75, roughness: 0.34 });

    // 纵向主梁
    for (const x of [-GREENHOUSE.halfWidth, -2.8, -1.4, 0, 1.4, 2.8, GREENHOUSE.halfWidth]) {
      const y = roofY(x) - 0.03;
      const purlin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, GREENHOUSE.length, 10), metal);
      purlin.rotation.x = Math.PI / 2;
      purlin.position.set(x, y, 0);
      purlin.castShadow = true;
      this.scene.add(purlin);
    }

    // 两侧立柱与底梁
    for (let z = GREENHOUSE.zMin; z <= GREENHOUSE.zMax + 0.01; z += 2) {
      for (const x of [-GREENHOUSE.halfWidth, GREENHOUSE.halfWidth]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, GREENHOUSE.eaveY, 12), darkMetal);
        col.position.set(x, GREENHOUSE.eaveY / 2, z);
        col.castShadow = true;
        this.scene.add(col);
      }
      const archCurve = createFrameCurve(z);
      const arch = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 72, 0.065, 10, false), metal);
      arch.castShadow = true;
      this.scene.add(arch);
    }

    for (const x of [-GREENHOUSE.halfWidth, GREENHOUSE.halfWidth]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, GREENHOUSE.length + 0.4), darkMetal);
      base.position.set(x, 0.11, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      this.scene.add(base);
    }

    // 半透明棚顶，用来直观检查帘布是否穿出
    const xSeg = 56;
    const zSeg = 24;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let iz = 0; iz <= zSeg; iz += 1) {
      const z = GREENHOUSE.zMin + (GREENHOUSE.length * iz) / zSeg;
      for (let ix = 0; ix <= xSeg; ix += 1) {
        const x = -GREENHOUSE.halfWidth + (2 * GREENHOUSE.halfWidth * ix) / xSeg;
        positions.push(x, roofY(x) + 0.015, z);
      }
    }
    for (let iz = 0; iz < zSeg; iz += 1) {
      for (let ix = 0; ix < xSeg; ix += 1) {
        const a = iz * (xSeg + 1) + ix;
        const b = a + 1;
        const c = a + xSeg + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roofGeometry.setIndex(indices);
    roofGeometry.computeVertexNormals();
    const roof = new THREE.Mesh(
      roofGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x9be7ff,
        transparent: true,
        opacity: 0.15,
        roughness: 0.08,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    roof.renderOrder = 2;
    this.roofGroup.add(roof);

    // 前后端面的轻质桁架轮廓
    for (const z of [GREENHOUSE.zMin, GREENHOUSE.zMax]) {
      const endArch = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(createFrameCurve(z).getPoints(80)),
        new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.55 }),
      );
      this.roofGroup.add(endArch);
    }
    this.scene.add(this.roofGroup);
  }

  private createTrackView(track: TrackNode): TrackView {
    const curve = createTrackCurve(track.z);
    const group = new THREE.Group();
    group.name = track.name;

    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: track.color,
      emissive: new THREE.Color(track.color),
      emissiveIntensity: 0.28,
      metalness: 0.55,
      roughness: 0.25,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.04, 10, false), tubeMaterial);
    tube.castShadow = true;
    tube.userData.trackId = track.id;
    group.add(tube);

    const geometry = this.createFabricGeometry(track, curve);
    const fabricMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(track.color).multiplyScalar(0.86),
      map: this.fabricTexture,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    });
    const fabric = new THREE.Mesh(geometry, fabricMaterial);
    fabric.castShadow = true;
    fabric.receiveShadow = true;
    fabric.userData.trackId = track.id;
    group.add(fabric);

    const leadBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, track.fabricWidth + 0.18, 14),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.22 }),
    );
    leadBar.rotation.x = Math.PI / 2;
    leadBar.castShadow = true;
    group.add(leadBar);

    const stack = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.24, track.fabricWidth + 0.05),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(track.color).multiplyScalar(0.42), roughness: 0.95 }),
    );
    stack.castShadow = true;
    group.add(stack);

    const handleGeometry = new THREE.SphereGeometry(0.17, 20, 14);
    const handleA = new THREE.Mesh(
      handleGeometry,
      new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x065f46, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    handleA.userData = { trackId: track.id, endpoint: 'A', handle: true };
    const handleB = new THREE.Mesh(
      handleGeometry.clone(),
      new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0x7c2d12, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    handleB.userData = { trackId: track.id, endpoint: 'B', handle: true };
    group.add(handleA, handleB);

    const label = makeLabelSprite(track.code, track.color);
    const mid = curve.getPointAt(0.5);
    label.position.set(mid.x, mid.y + 0.52, track.z);
    group.add(label);

    this.trackLayer.add(group);
    const view: TrackView = {
      node: track,
      curve,
      group,
      tube,
      fabric,
      leadBar,
      stack,
      handleA,
      handleB,
      label,
      geometryKey: '',
    };
    this.updateFabricGeometry(view, true);
    return view;
  }

  private createFabricGeometry(track: TrackNode, curve: ArchTrackCurve): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertexCount = (FABRIC_SEGMENTS + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices: number[] = [];
    for (let i = 0; i < FABRIC_SEGMENTS; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    this.writeFabricPositions(geometry, track, curve);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private writeFabricPositions(geometry: THREE.BufferGeometry, track: TrackNode, curve: ArchTrackCurve) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    for (let i = 0; i <= FABRIC_SEGMENTS; i += 1) {
      const q = i / FABRIC_SEGMENTS;
      const u = track.endpointA + (track.endpointB - track.endpointA) * q;
      curve.getPointAt(u, point);
      curve.getTangentAt(u, tangent);
      const nx = -tangent.y;
      const ny = tangent.x;
      const corrugation = Math.sin(q * Math.PI * 22) * 0.018 - 0.04;
      const cx = point.x + nx * corrugation;
      const cy = point.y + ny * corrugation;
      const left = i * 2;
      const right = left + 1;
      position.setXYZ(left, cx, cy, track.z - track.fabricWidth / 2);
      position.setXYZ(right, cx, cy, track.z + track.fabricWidth / 2);
      uv.setXY(left, q * 10, 0);
      uv.setXY(right, q * 10, 1);
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  private updateFabricGeometry(view: TrackView, force = false) {
    const key = `${view.node.endpointA.toFixed(4)}:${view.node.endpointB.toFixed(4)}:${view.node.fabricWidth}`;
    if (!force && view.geometryKey === key) return;
    this.writeFabricPositions(view.fabric.geometry, view.node, view.curve);
    view.geometryKey = key;
  }

  setState(project: ProjectState, time: number, selectedId: ID | null, roofVisible: boolean) {
    this.project = project;
    this.time = time;
    this.selectedId = selectedId;
    if (this.roofVisible !== roofVisible) {
      this.roofVisible = roofVisible;
      this.roofGroup.visible = roofVisible;
    }
    this.syncTracks();
    this.updateTracks();
  }

  private syncTracks() {
    if (!this.project) return;
    const tracks = Object.values(this.project.nodes).filter((n): n is TrackNode => n.kind === 'track');
    const alive = new Set<ID>();

    for (const track of tracks) {
      alive.add(track.id);
      let view = this.trackViews.get(track.id);
      if (!view) {
        view = this.createTrackView(track);
        this.trackViews.set(track.id, view);
      }
      view.node = track;
      view.group.visible = track.visible;
      (view.tube.material as THREE.MeshStandardMaterial).color.set(track.color);
      (view.tube.material as THREE.MeshStandardMaterial).emissive.set(track.color);
      view.fabric.material.color.set(track.color).multiplyScalar(0.86);
      this.updateFabricGeometry(view);
      this.updateHandlePositions(view);
      const selected = this.selectedId === track.id;
      const tubeMat = view.tube.material as THREE.MeshStandardMaterial;
      tubeMat.emissiveIntensity = selected ? 0.75 : 0.25;
      view.handleA.scale.setScalar(selected ? 1.25 : 1);
      view.handleB.scale.setScalar(selected ? 1.25 : 1);
    }

    for (const [id, view] of this.trackViews) {
      if (!alive.has(id)) {
        this.trackLayer.remove(view.group);
        view.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => m.dispose());
          }
        });
        this.trackViews.delete(id);
      }
    }
  }

  private updateHandlePositions(view: TrackView) {
    const a = view.curve.getPointAt(view.node.endpointA);
    const b = view.curve.getPointAt(view.node.endpointB);
    view.handleA.position.copy(a);
    view.handleB.position.copy(b);
  }

  private updateTracks() {
    if (!this.project) return;
    for (const view of this.trackViews.values()) {
      const track = view.node;
      if (!track.visible) continue;
      const sample = sampleTrack(track, this.time);
      const leadU = track.endpointA + (track.endpointB - track.endpointA) * sample.progress;
      const lead = view.curve.getPointAt(leadU);
      const tangent = view.curve.getTangentAt(leadU);

      const visibleSections = sample.progress <= 0.001 ? 0 : Math.max(1, Math.floor(sample.progress * FABRIC_SEGMENTS));
      view.fabric.geometry.setDrawRange(0, Math.min(FABRIC_SEGMENTS, visibleSections) * 6);
      view.leadBar.visible = sample.progress > 0.01 && sample.phase !== 'done';
      view.leadBar.position.copy(lead).add(new THREE.Vector3(0, -0.035, 0));
      view.leadBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));

      const start = view.curve.getPointAt(track.endpointA);
      view.stack.position.copy(start).addScaledVector(tangent, -0.08);
      view.stack.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
      const stackScale = Math.max(0.12, 1 - sample.progress * 0.9);
      view.stack.visible = sample.progress < 0.985;
      view.stack.scale.set(stackScale, 0.75 + (1 - sample.progress) * 0.55, 1);

      const active = sample.phase === 'pause';
      const stackMaterial = view.stack.material as THREE.MeshStandardMaterial;
      stackMaterial.emissive.set(active ? 0xf59e0b : 0x000000);
      stackMaterial.emissiveIntensity = active ? 0.45 : 0;
    }
  }

  private setPointerFromEvent(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.downPoint = { x: event.clientX, y: event.clientY };
    this.setPointerFromEvent(event);
    const handles = [...this.trackViews.values()].flatMap((v) => [v.handleA, v.handleB]);
    const hits = this.raycaster.intersectObjects(handles, false);
    const hit = hits[0]?.object;
    if (hit?.userData.handle) {
      event.stopPropagation();
      event.preventDefault();
      this.drag = {
        trackId: hit.userData.trackId as ID,
        endpoint: hit.userData.endpoint as 'A' | 'B',
        pointerId: event.pointerId,
      };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      this.callbacks.onSelectTrack(hit.userData.trackId as ID);
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.setPointerFromEvent(event);
    if (this.drag) {
      const view = this.trackViews.get(this.drag.trackId);
      if (!view) return;
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -view.node.z);
      const hitPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hitPoint)) {
        const u = nearestArcU(view.curve, hitPoint);
        this.callbacks.onEndpointChange(this.drag.trackId, this.drag.endpoint, u);
      }
      return;
    }
    const handles = [...this.trackViews.values()].flatMap((v) => [v.handleA, v.handleB]);
    const hit = this.raycaster.intersectObjects(handles, false)[0];
    this.renderer.domElement.style.cursor = hit ? 'grab' : 'default';
  };

  private handlePointerUp = (event: PointerEvent) => {
    const moved = Math.hypot(event.clientX - this.downPoint.x, event.clientY - this.downPoint.y);
    if (this.drag) {
      try {
        this.renderer.domElement.releasePointerCapture(this.drag.pointerId);
      } catch {
        // pointer capture may already be released
      }
      this.drag = null;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = 'default';
      return;
    }

    if (moved < 6) {
      this.setPointerFromEvent(event);
      const pickables: THREE.Object3D[] = [];
      for (const view of this.trackViews.values()) pickables.push(view.tube, view.fabric, view.handleA, view.handleB);
      const hit = this.raycaster.intersectObjects(pickables, false)[0]?.object;
      const trackId = hit?.userData.trackId as ID | undefined;
      this.callbacks.onSelectTrack(trackId ?? null);
    }
  };

  private handlePointerCancel = () => {
    this.drag = null;
    this.controls.enabled = true;
  };

  resetCamera() {
    this.camera.position.set(11.5, 7.4, 14.5);
    this.controls.target.set(0, 2.55, 0);
    this.controls.update();
  }

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown, true);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((m) => {
          const mat = m as THREE.Material & { map?: THREE.Texture };
          mat.map?.dispose();
          mat.dispose();
        });
      }
    });
    this.fabricTexture.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
