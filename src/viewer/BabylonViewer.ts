import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import earcut from 'earcut';
import type { DesignModel } from '../lib/design';
import { buildGearContour, buildRackContour } from '../lib/gearGeometry';

export interface RenderOptions {
  fit?: boolean;
}

export class BabylonViewer {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private root: TransformNode | null = null;
  private ground: Mesh;
  private resizeObserver: ResizeObserver;
  private gearMeshes = new Map<string, Mesh>();
  private selectedGearId: string | null = null;
  private autoRotateEnabled = false;
  private onSelectGear: (gearId: string | null) => void;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, onSelectGear: (gearId: string | null) => void) {
    this.canvas = canvas;
    this.onSelectGear = onSelectGear;

    this.engine = new Engine(canvas, true, {
      antialias: true,
      powerPreference: 'high-performance',
      stencil: true,
      preserveDrawingBuffer: false,
    });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.035, 0.052, 0.078, 1);
    this.scene.ambientColor = new Color3(0.35, 0.42, 0.55);

    this.camera = new ArcRotateCamera(
      'inspection-camera',
      -Math.PI / 2.35,
      Math.PI / 2.7,
      520,
      new Vector3(0, 55, 0),
      this.scene,
    );
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 45;
    this.camera.upperRadiusLimit = 2600;
    this.camera.wheelPrecision = 1.4;
    this.camera.pinchPrecision = 1.2;
    this.camera.panningSensibility = 120;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 6000;

    const hemi = new HemisphericLight('hemisphere', new Vector3(0.2, 1, 0.1), this.scene);
    hemi.intensity = 0.92;
    hemi.groundColor = new Color3(0.12, 0.16, 0.22);

    const sun = new DirectionalLight('key-light', new Vector3(-0.45, -0.85, -0.35), this.scene);
    sun.position = new Vector3(260, 420, 260);
    sun.intensity = 1.35;

    const rim = new DirectionalLight('rim-light', new Vector3(0.5, -0.35, 0.8), this.scene);
    rim.position = new Vector3(-260, 180, -260);
    rim.intensity = 0.55;

    const groundMaterial = new StandardMaterial('ground-material', this.scene);
    groundMaterial.diffuseColor = Color3.FromHexString('#0b1220');
    groundMaterial.specularColor = new Color3(0.02, 0.03, 0.05);
    groundMaterial.alpha = 0.92;

    this.ground = MeshBuilder.CreateGround(
      'workshop-ground',
      { width: 2600, height: 1600, subdivisions: 1 },
      this.scene,
    );
    this.ground.position.y = -42;
    this.ground.material = groundMaterial;
    this.ground.isPickable = false;

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERTAP) return;
      const pick = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        (mesh: AbstractMesh) => mesh.metadata?.gearId != null,
      );
      if (pick?.hit && pick.pickedMesh?.metadata?.gearId) {
        this.onSelectGear(String(pick.pickedMesh.metadata.gearId));
      }
    });

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.disposed) this.engine.resize();
    });
    this.resizeObserver.observe(canvas.parentElement ?? canvas);

    this.engine.runRenderLoop(() => {
      if (!this.disposed) {
        if (this.autoRotateEnabled) {
          this.camera.alpha += 0.00022 * this.engine.getDeltaTime();
        }
        this.scene.render();
      }
    });
  }

  public renderDesign(model: DesignModel, options: RenderOptions = {}): void {
    if (this.disposed) return;

    if (this.root) {
      this.root.dispose(false, true);
    }
    this.root = new TransformNode(`design-${model.fingerprint}`, this.scene);
    this.gearMeshes.clear();

    this.ground.position.y = Math.min(model.bounds.minY - 10, -30);

    for (const gear of model.gears) {
      const contour = buildGearContour({
        teeth: gear.teeth,
        module: gear.module,
        pressureAngleDeg: gear.pressureAngle,
        profile: gear.profile,
      });

      let mesh: Mesh;
      let fallback = false;
      try {
        mesh = MeshBuilder.ExtrudePolygon(
          gear.id,
          {
            // Babylon polygon contours are read from x/z; map our 2D Y into Z, then rotate.
            shape: contour.map((p) => new Vector3(p.x, 0, p.y)),
            holes: gear.holeLoops.map((loop) =>
              loop.points.map((p) => new Vector3(p.x, 0, p.y)),
            ),
            depth: gear.thickness,
          },
          this.scene,
          earcut,
        ) as Mesh;
      } catch (error) {
        // A malformed polygon must never freeze the workbench; fall back to a cylinder blank.
        console.warn('ExtrudePolygon failed, using cylinder fallback', gear.id, error);
        fallback = true;
        mesh = MeshBuilder.CreateCylinder(
          gear.id,
          {
            diameter: gear.outerRadius * 2,
            height: gear.thickness,
            tessellation: Math.max(24, gear.teeth * 2),
          },
          this.scene,
        );
        mesh.rotation.x = Math.PI / 2;
      }

      const pivot = new TransformNode(`pivot-${gear.id}`, this.scene);
      pivot.parent = this.root;
      pivot.position = new Vector3(gear.position.x, gear.position.y, 0);
      pivot.rotation.z = gear.rotationZ;

      mesh.parent = pivot;
      if (!fallback) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.z = gear.thickness / 2;
      }
      mesh.metadata = { gearId: gear.id, kind: 'gear', manual: gear.manual };
      mesh.isPickable = true;

      const material = new StandardMaterial(`mat-${gear.id}-${model.fingerprint}`, this.scene);
      material.backFaceCulling = false;
      if (gear.manual) {
        material.diffuseColor = Color3.FromHexString('#f59e0b');
        material.emissiveColor = Color3.FromHexString('#3a2200');
        material.specularColor = new Color3(0.55, 0.38, 0.12);
      } else {
        material.diffuseColor = Color3.FromHexString('#38bdf8');
        material.emissiveColor = Color3.FromHexString('#06283a');
        material.specularColor = new Color3(0.35, 0.55, 0.7);
      }
      material.specularPower = 72;
      mesh.material = material;
      this.gearMeshes.set(gear.id, mesh);
    }

    const rackShape = buildRackContour(model.rack.length, model.params.module);
    const rack = MeshBuilder.ExtrudePolygon(
      'RACK',
      {
        shape: rackShape.map((p) => new Vector3(p.x, 0, p.y)),
        holes: model.rack.mountingHoleLoops.map((loop) =>
          loop.points.map((p) => new Vector3(p.x, 0, p.y)),
        ),
        depth: model.rack.thickness,
      },
      this.scene,
      earcut,
    ) as Mesh;
    rack.parent = this.root;
    rack.rotation.x = -Math.PI / 2;
    rack.position = new Vector3(0, 0, model.rack.thickness / 2);
    const rackMaterial = new StandardMaterial('rack-material', this.scene);
    rackMaterial.backFaceCulling = false;
    rackMaterial.diffuseColor = Color3.FromHexString('#94a3b8');
    rackMaterial.emissiveColor = new Color3(0.06, 0.08, 0.1);
    rackMaterial.specularColor = new Color3(0.55, 0.58, 0.62);
    rack.material = rackMaterial;
    rack.isPickable = false;

    this.buildGrid(model);

    if (options.fit) {
      this.frameModel(model);
    }

    this.setSelectedGear(this.selectedGearId);
  }

  private buildGrid(model: DesignModel): void {
    if (!this.root) return;
    const { grid, params } = model;

    const barMaterial = new StandardMaterial('grid-bar-material', this.scene);
    barMaterial.diffuseColor = Color3.FromHexString('#facc15');
    barMaterial.emissiveColor = new Color3(0.16, 0.12, 0.01);
    barMaterial.specularColor = new Color3(0.55, 0.46, 0.08);
    barMaterial.alpha = 0.34;
    barMaterial.disableDepthWrite = true;

    const frameMaterial = new StandardMaterial('grid-frame-material', this.scene);
    frameMaterial.diffuseColor = Color3.FromHexString('#f97316');
    frameMaterial.emissiveColor = new Color3(0.18, 0.07, 0.01);
    frameMaterial.specularColor = new Color3(0.55, 0.3, 0.1);
    frameMaterial.alpha = 0.92;

    for (const z of [grid.zFront, grid.zRear]) {
      const side = z > 0 ? 'front' : 'rear';

      grid.vertical.forEach((bar, index) => {
        const mesh = MeshBuilder.CreateBox(
          `grid-v-${side}-${index}`,
          { width: params.gridThickness, height: bar.length, depth: params.gridThickness * 0.72 },
          this.scene,
        );
        mesh.parent = this.root;
        mesh.position = new Vector3(bar.x, grid.centerY, z);
        mesh.material = barMaterial;
        mesh.isPickable = false;
      });

      grid.horizontal.forEach((bar, index) => {
        const mesh = MeshBuilder.CreateBox(
          `grid-h-${side}-${index}`,
          { width: bar.length, height: params.gridThickness, depth: params.gridThickness * 0.72 },
          this.scene,
        );
        mesh.parent = this.root;
        mesh.position = new Vector3(0, bar.y, z);
        mesh.material = barMaterial;
        mesh.isPickable = false;
      });

      const frameT = grid.frameWidth;
      const frameParts = [
        {
          name: 'top',
          width: grid.width,
          height: frameT,
          x: 0,
          y: grid.centerY + grid.height / 2 - frameT / 2,
        },
        {
          name: 'bottom',
          width: grid.width,
          height: frameT,
          x: 0,
          y: grid.centerY - grid.height / 2 + frameT / 2,
        },
        {
          name: 'left',
          width: frameT,
          height: grid.height,
          x: -grid.width / 2 + frameT / 2,
          y: grid.centerY,
        },
        {
          name: 'right',
          width: frameT,
          height: grid.height,
          x: grid.width / 2 - frameT / 2,
          y: grid.centerY,
        },
      ] as const;

      for (const part of frameParts) {
        const mesh = MeshBuilder.CreateBox(
          `frame-${side}-${part.name}`,
          { width: part.width, height: part.height, depth: frameT * 0.72 },
          this.scene,
        );
        mesh.parent = this.root;
        mesh.position = new Vector3(part.x, part.y, z);
        mesh.material = frameMaterial;
        mesh.isPickable = false;
      }
    }
  }

  public setSelectedGear(gearId: string | null): void {
    this.selectedGearId = gearId;
    this.gearMeshes.forEach((mesh, id) => {
      const material = mesh.material as StandardMaterial | null;
      if (!material) return;
      if (id === gearId) {
        material.emissiveColor = Color3.FromHexString('#7c2d12');
        material.alpha = 1;
      } else {
        const gear = mesh.metadata;
        material.emissiveColor = gear ? Color3.FromHexString(gear.manual ? '#3a2200' : '#06283a') : Color3.Black();
      }
    });
  }

  public frameModel(model: DesignModel): void {
    const aspect = this.engine.getAspectRatio(this.camera);
    const verticalFov = this.camera.fov;
    const fitHeight = model.bounds.height + 100;
    const fitWidth = model.bounds.width + 160;
    const radiusByHeight = fitHeight / (2 * Math.tan(verticalFov / 2));
    const radiusByWidth = fitWidth / (2 * Math.tan(verticalFov / 2) * Math.max(0.45, aspect));
    const radius = Math.max(180, radiusByHeight, radiusByWidth) * 1.18;

    this.camera.target = new Vector3(0, model.grid.centerY * 0.72, 0);
    this.camera.radius = radius;
  }

  public resize(): void {
    this.engine.resize();
  }

  public toggleAutoRotate(): boolean {
    this.autoRotateEnabled = !this.autoRotateEnabled;
    return this.autoRotateEnabled;
  }

  public dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.camera.detachControl();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
