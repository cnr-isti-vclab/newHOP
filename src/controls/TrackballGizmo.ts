import * as THREE from 'three';
import type { NavigationTrackballConfig } from '../types/SceneTypes';

const DEFAULT_SIZE = 140;
const DEFAULT_OPACITY = 0.8;
const RING_SEGMENTS = 96;
const DEFAULT_AXIS_COLORS = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 };

export class TrackballGizmo {
  private readonly root = new THREE.Group();
  private readonly axes: Record<'x' | 'y' | 'z', THREE.Line>;
  private readonly rings: Record<'x' | 'y' | 'z', THREE.Line>;
  private readonly materials: Record<'x' | 'y' | 'z', THREE.LineBasicMaterial>;
  private visible = false;
  private size = DEFAULT_SIZE;

  constructor(private readonly camera: THREE.Camera) {
    this.materials = {
      x: this.createMaterial(DEFAULT_AXIS_COLORS.x),
      y: this.createMaterial(DEFAULT_AXIS_COLORS.y),
      z: this.createMaterial(DEFAULT_AXIS_COLORS.z)
    };
    this.axes = {
      x: this.createAxis('x', this.materials.x),
      y: this.createAxis('y', this.materials.y),
      z: this.createAxis('z', this.materials.z)
    };
    this.rings = {
      x: this.createRing('x', this.materials.x),
      y: this.createRing('y', this.materials.y),
      z: this.createRing('z', this.materials.z)
    };
    this.root.add(...Object.values(this.axes), ...Object.values(this.rings));
    this.root.renderOrder = 1000;
    this.root.visible = false;
  }

  getObject(): THREE.Object3D {
    return this.root;
  }

  setConfig(config?: NavigationTrackballConfig): void {
    this.visible = config?.visible ?? false;
    this.size = Math.max(config?.size ?? DEFAULT_SIZE, 1);
    const colors = config?.color === undefined
      ? { ...DEFAULT_AXIS_COLORS, ...config?.axisColors }
      : { x: config.color, y: config.color, z: config.color };
    for (const axis of ['x', 'y', 'z'] as const) {
      this.materials[axis].color.set(colors[axis]);
      this.materials[axis].opacity = THREE.MathUtils.clamp(config?.opacity ?? DEFAULT_OPACITY, 0, 1);
      this.axes[axis].visible = config?.axes ?? true;
      this.rings[axis].visible = config?.rings ?? true;
    }
    this.root.visible = this.visible;
  }

  update(target: [number, number, number], width: number, height: number): void {
    if (!this.visible) return;
    this.root.position.fromArray(target);
    const viewportHeight = Math.max(height, 1);
    let worldHeight: number;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const distance = Math.max(this.camera.position.distanceTo(this.root.position), Number.EPSILON);
      worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      worldHeight = (this.camera.top - this.camera.bottom) / Math.max(this.camera.zoom, Number.EPSILON);
    } else {
      worldHeight = 2;
    }
    const scale = worldHeight * (this.size / viewportHeight);
    this.root.scale.setScalar(scale);
  }

  dispose(): void {
    for (const axis of ['x', 'y', 'z'] as const) {
      this.axes[axis].geometry.dispose();
      this.rings[axis].geometry.dispose();
      this.materials[axis].dispose();
    }
  }

  private createMaterial(color: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: DEFAULT_OPACITY,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
  }

  private createAxis(axis: 'x' | 'y' | 'z', material: THREE.LineBasicMaterial): THREE.Line {
    const geometry = new THREE.BufferGeometry();
    const values = axis === 'x'
      ? [-1, 0, 0, 1, 0, 0]
      : axis === 'y'
        ? [0, -1, 0, 0, 1, 0]
        : [0, 0, -1, 0, 0, 1];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    return new THREE.LineSegments(geometry, material);
  }

  private createRing(axis: 'x' | 'y' | 'z', material: THREE.LineBasicMaterial): THREE.Line {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < RING_SEGMENTS; index += 1) {
      const angle = (index / RING_SEGMENTS) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      if (axis === 'x') points.push(new THREE.Vector3(0, cosine, sine));
      else if (axis === 'y') points.push(new THREE.Vector3(cosine, 0, sine));
      else points.push(new THREE.Vector3(cosine, sine, 0));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineLoop(geometry, material);
  }
}
