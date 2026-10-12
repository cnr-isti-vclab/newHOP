import * as THREE from 'three';

export interface PickResult {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  object: THREE.Object3D;
}

export interface PickMarkerOptions {
  visible?: boolean;
  size?: number;
  color?: THREE.ColorRepresentation;
  opacity?: number;
  depthTest?: boolean;
  depthOffset?: number;
}

export interface PickingOptions {
  marker?: PickMarkerOptions;
}

export type PickListener = (result: PickResult) => void;

export class PickingManager {
  private readonly root: THREE.Object3D;
  private readonly overlayRoot?: THREE.Object3D;
  private camera: THREE.Camera;
  private readonly element: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly marker: THREE.Points;
  private enabled = false;
  private markerVisible = true;
  private markerSize = 5;
  private markerDepthOffset = 0.5;
  private markerPositioned = false;
  private pendingPointer?: { id: number; x: number; y: number };
  private onPick?: (result: PickResult) => void;
  private readonly pickListeners = new Set<PickListener>();

  constructor(root: THREE.Object3D, camera: THREE.Camera, element: HTMLElement, overlayRoot?: THREE.Object3D) {
    this.root = root;
    this.overlayRoot = overlayRoot;
    this.camera = camera;
    this.element = element;
    this.marker = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
      new THREE.PointsMaterial({
        color: 0xff5533,
        size: this.markerSize,
        sizeAttenuation: false,
        depthTest: true,
        depthWrite: false
      })
    );
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 1000;
    this.marker.visible = false;
    this.overlayRoot?.add(this.marker);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setEnabled(enabled: boolean, options?: PickingOptions): void {
    if (options?.marker) {
      this.markerVisible = options.marker.visible ?? this.markerVisible;
      this.markerSize = Math.max(1, options.marker.size ?? this.markerSize);
      const material = this.marker.material as THREE.PointsMaterial;
      material.color.set(options.marker.color ?? material.color);
      material.size = this.markerSize;
      material.opacity = THREE.MathUtils.clamp(options.marker.opacity ?? material.opacity, 0, 1);
      material.transparent = material.opacity < 1;
      material.depthTest = options.marker.depthTest ?? material.depthTest;
      this.markerDepthOffset = Math.max(0, options.marker.depthOffset ?? this.markerDepthOffset);
      material.needsUpdate = true;
    }
    this.enabled = enabled;
    if (!enabled) this.clearMarker();
    this.marker.visible = enabled && this.markerVisible && this.markerPositioned;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setOnPick(callback?: (result: PickResult) => void): void {
    this.onPick = callback;
  }

  onPickResult(listener: PickListener): () => void {
    this.pickListeners.add(listener);
    return () => this.pickListeners.delete(listener);
  }

  activate(): void {
    this.setEnabled(true);
  }

  deactivate(): void {
    this.setEnabled(false);
  }

  handlePointerDown(event: PointerEvent): void {
    if (!this.enabled || event.button !== 0 || !event.isPrimary) return;
    this.pendingPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  handlePointerMove(event: PointerEvent): void {
    if (!this.pendingPointer || event.pointerId !== this.pendingPointer.id) return;
    const deltaX = event.clientX - this.pendingPointer.x;
    const deltaY = event.clientY - this.pendingPointer.y;
    if (deltaX * deltaX + deltaY * deltaY > 25) this.pendingPointer = undefined;
  }

  handlePointerUp(event: PointerEvent): void {
    if (!this.pendingPointer || event.pointerId !== this.pendingPointer.id) return;
    this.pendingPointer = undefined;
    const result = this.pickFromPointer(event.clientX, event.clientY);
    if (result) {
      this.showMarker(result.point);
      this.onPick?.(result);
      for (const listener of this.pickListeners) listener(result);
    }
  }

  handlePointerCancel(event: PointerEvent): void {
    if (this.pendingPointer?.id === event.pointerId) this.pendingPointer = undefined;
  }

  dispose(): void {
    this.overlayRoot?.remove(this.marker);
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.pickListeners.clear();
    this.onPick = undefined;
    this.pendingPointer = undefined;
  }

  pickFromPointer(clientX: number, clientY: number): PickResult | undefined {
    const rect = this.element.getBoundingClientRect();
    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);
    const hits = this.raycaster.intersectObjects(this.root.children, true);
    const hit = hits[0];
    if (!hit) return undefined;
    const point = hit.point.clone();
    const normal = hit.face?.normal ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point, normal, object: hit.object };
  }

  private showMarker(point: THREE.Vector3): void {
    const towardCamera = this.camera.position.clone().sub(point).normalize();
    const height = Math.max(this.element.clientHeight, 1);
    let worldUnitsPerPixel: number;
    if (this.camera instanceof THREE.OrthographicCamera) {
      worldUnitsPerPixel = (this.camera.top - this.camera.bottom) / this.camera.zoom / height;
    } else if (this.camera instanceof THREE.PerspectiveCamera) {
      const distance = point.distanceTo(this.camera.position);
      worldUnitsPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / height;
    } else {
      worldUnitsPerPixel = 0;
    }
    this.marker.position.copy(point).addScaledVector(towardCamera, worldUnitsPerPixel * this.markerDepthOffset);
    this.marker.updateMatrixWorld(true);
    this.markerPositioned = true;
    this.marker.visible = this.enabled && this.markerVisible;
  }

  private clearMarker(): void {
    this.markerPositioned = false;
    this.marker.visible = false;
  }
}
