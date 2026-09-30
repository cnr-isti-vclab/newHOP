import * as THREE from 'three';

export interface PickResult {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  object: THREE.Object3D;
}

export class PickingManager {
  private readonly root: THREE.Object3D;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private enabled = false;
  private onPick?: (result: PickResult) => void;

  constructor(root: THREE.Object3D, camera: THREE.PerspectiveCamera, element: HTMLElement) {
    this.root = root;
    this.camera = camera;
    this.element = element;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setOnPick(callback?: (result: PickResult) => void): void {
    this.onPick = callback;
  }

  activate(): void {
    this.enabled = true;
  }

  deactivate(): void {
    this.enabled = false;
  }

  handlePointerDown(event: PointerEvent): void {
    if (!this.enabled) return;
    const result = this.pickFromPointer(event.clientX, event.clientY);
    if (result) this.onPick?.(result);
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
}
