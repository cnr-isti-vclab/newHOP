import * as THREE from 'three';
import { allowsEntityParticipation } from './EntityPolicy';

export type ClipAxis = 'x' | 'y' | 'z';

export type ClipPositionMode = 'relative' | 'absolute';

export interface ClipPlaneUpdate {
  mode?: ClipPositionMode;
  position?: number;
  enabled?: boolean;
  inverted?: boolean;
}

export interface ClipPlaneState {
  axis: ClipAxis;
  enabled: boolean;
  mode: ClipPositionMode;
  position: number;
  inverted: boolean;
}

interface ClipPlaneEntry {
  state: ClipPlaneState;
  plane: THREE.Plane;
}

type ClippableObject = THREE.Mesh | THREE.Line | THREE.Points;

const AXES: ClipAxis[] = ['x', 'y', 'z'];
const AXIS_NORMALS: Record<ClipAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

export class ClippingManager {
  private readonly root: THREE.Object3D;
  private readonly visualRoot?: THREE.Object3D;
  private readonly planeHelpers = new Map<ClipAxis, THREE.Group>();
  private readonly bounds = new THREE.Box3();
  private readonly activePlanes: THREE.Plane[] = [];
  private showPlanes = true;
  private readonly planes = new Map<ClipAxis, ClipPlaneEntry>(AXES.map((axis) => [
    axis,
    {
      state: { axis, enabled: false, mode: 'relative', position: 0.5, inverted: false },
      plane: new THREE.Plane()
    }
  ]));

  constructor(root: THREE.Object3D, visualRoot?: THREE.Object3D) {
    this.root = root;
    this.visualRoot = visualRoot;
  }

  setBounds(bounds: THREE.Box3): void {
    this.bounds.copy(bounds);
    this.resolvePlanes();
    this.updateActivePlanes();
    this.refreshMaterialAssignments();
    this.updatePlaneHelpers();
  }

  setPlane(axis: ClipAxis, update: ClipPlaneUpdate): void {
    const entry = this.getEntry(axis);
    const wasEnabled = entry.state.enabled;
    if (update.mode !== undefined) entry.state.mode = update.mode;
    if (update.position !== undefined) {
      entry.state.position = normalizePosition(entry.state.mode, update.position);
    } else if (update.mode === 'relative') {
      entry.state.position = normalizePosition('relative', entry.state.position);
    }
    if (update.enabled !== undefined) entry.state.enabled = update.enabled;
    if (update.inverted !== undefined) entry.state.inverted = update.inverted;
    this.resolvePlane(entry);
    this.updateActivePlanes();
    if (wasEnabled !== entry.state.enabled) this.refreshMaterialAssignments(true);
    this.updatePlaneHelpers();
  }

  getPlane(axis: ClipAxis): ClipPlaneState {
    return { ...this.getEntry(axis).state };
  }

  getPlanes(): ClipPlaneState[] {
    return AXES.map((axis) => this.getPlane(axis));
  }

  setEnabled(axis: ClipAxis, enabled: boolean): void {
    this.setPlane(axis, { enabled });
  }

  isEnabled(axis?: ClipAxis): boolean {
    if (axis) return this.getEntry(axis).state.enabled;
    return AXES.some((currentAxis) => this.getEntry(currentAxis).state.enabled);
  }

  toggle(axis: ClipAxis = 'x'): void {
    this.setEnabled(axis, !this.isEnabled(axis));
  }

  setAxis(axis: ClipAxis, offset: number): void {
    this.setPlane(axis, { mode: 'absolute', position: offset });
  }

  setPlanesVisible(visible: boolean): void {
    this.showPlanes = visible;
    this.updatePlaneHelpers();
  }

  arePlanesVisible(): boolean {
    return this.showPlanes;
  }

  isPointVisible(point: THREE.Vector3): boolean {
    return this.activePlanes.every((plane) => plane.distanceToPoint(point) >= -1e-7);
  }

  reset(): void {
    for (const entry of this.planes.values()) {
      entry.state.enabled = false;
      entry.state.mode = 'relative';
      entry.state.position = 0.5;
      entry.state.inverted = false;
      this.resolvePlane(entry);
    }
    this.updateActivePlanes();
    this.refreshMaterialAssignments(true);
    this.updatePlaneHelpers();
  }

  apply(): void {
    this.updateActivePlanes();
    this.refreshMaterialAssignments();
  }

  dispose(): void {
    for (const helper of this.planeHelpers.values()) {
      helper.removeFromParent();
      helper.traverse((object) => {
        if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
          object.geometry.dispose();
        }
        if ('material' in object) {
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else if (material instanceof THREE.Material) material.dispose();
        }
      });
    }
    this.planeHelpers.clear();
    this.activePlanes.length = 0;
  }

  private refreshMaterialAssignments(markNeedsUpdate = false): void {
    this.root.traverse((object) => {
      if (!isClippableObject(object)) return;
      if (isClippingExcluded(object)) return;
      if (!allowsEntityParticipation(object, 'clipping')) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const clipped = material as THREE.Material & { clippingPlanes?: THREE.Plane[] };
        clipped.clippingPlanes = this.activePlanes;
        if (markNeedsUpdate) material.needsUpdate = true;
      }
    });
  }

  private updateActivePlanes(): void {
    this.activePlanes.length = 0;
    for (const axis of AXES) {
      const entry = this.getEntry(axis);
      if (entry.state.enabled) this.activePlanes.push(entry.plane);
    }
  }

  private getEntry(axis: ClipAxis): ClipPlaneEntry {
    const entry = this.planes.get(axis);
    if (!entry) throw new Error(`Unknown clipping axis "${axis}".`);
    return entry;
  }

  private resolvePlanes(): void {
    for (const entry of this.planes.values()) this.resolvePlane(entry);
  }

  private resolvePlane(entry: ClipPlaneEntry): void {
    const coordinate = entry.state.mode === 'relative'
      ? getRelativeCoordinate(this.bounds, entry.state.axis, entry.state.position)
      : entry.state.position;
    const normal = AXIS_NORMALS[entry.state.axis].clone();
    if (entry.state.inverted) normal.negate();
    entry.plane.set(normal, entry.state.inverted ? coordinate : -coordinate);
  }

  private updatePlaneHelpers(): void {
    if (!this.visualRoot) return;
    const size = this.bounds.isEmpty() ? 1 : Math.max(this.bounds.getSize(new THREE.Vector3()).length(), 1);
    for (const axis of AXES) {
      const entry = this.getEntry(axis);
      let helper = this.planeHelpers.get(axis);
      if (!helper) {
        helper = createPlaneOutline(getAxisColor(axis));
        this.planeHelpers.set(axis, helper);
      }
      helper.visible = this.showPlanes && entry.state.enabled;
      helper.position.copy(entry.plane.normal).multiplyScalar(-entry.plane.constant);
      helper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), entry.plane.normal);
      helper.scale.setScalar(size / 2);
      if (!helper.parent) this.visualRoot.add(helper);
      helper.updateMatrixWorld(true);
    }
  }
}

function getRelativeCoordinate(bounds: THREE.Box3, axis: ClipAxis, position: number): number {
  if (bounds.isEmpty()) return 0;
  const minimum = bounds.min[axis];
  const maximum = bounds.max[axis];
  return minimum + (maximum - minimum) * position;
}

function normalizePosition(mode: ClipPositionMode, position: number): number {
  if (mode !== 'relative') return position;
  if (Number.isNaN(position)) throw new Error('Relative clipping position must be a number.');
  return THREE.MathUtils.clamp(position, 0, 1);
}

function getAxisColor(axis: ClipAxis): number {
  if (axis === 'x') return 0xff5555;
  if (axis === 'y') return 0x55dd77;
  return 0x5599ff;
}

function createPlaneOutline(color: number): THREE.Group {
  const helper = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, -1, 0, 1, -1, 0,
    1, -1, 0, 1, 1, 0,
    1, 1, 0, -1, 1, 0,
    -1, 1, 0, -1, -1, 0
  ], 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
  helper.add(new THREE.LineSegments(geometry, material));

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.FrontSide })
  );
  helper.add(surface);
  helper.userData.clippingExcluded = true;
  return helper;
}

function isClippableObject(object: THREE.Object3D): object is ClippableObject {
  return object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points;
}

function isClippingExcluded(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.clippingExcluded === true) return true;
    current = current.parent;
  }
  return false;
}
