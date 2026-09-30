import * as THREE from 'three';

export interface MeasurementHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  object: THREE.Object3D;
}

export interface MeasurementResult {
  start: MeasurementHit;
  end: MeasurementHit;
  distance: number;
  midpoint: THREE.Vector3;
  line: THREE.Line;
}

export class MeasurementManager {
  private readonly root: THREE.Object3D;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly points: MeasurementHit[] = [];
  private readonly visualGroup = new THREE.Group();
  private enabled = false;
  private onComplete?: (result: MeasurementResult) => void;

  constructor(root: THREE.Object3D, camera: THREE.PerspectiveCamera, element: HTMLElement) {
    this.root = root;
    this.camera = camera;
    this.element = element;
    this.root.add(this.visualGroup);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setOnComplete(callback?: (result: MeasurementResult) => void): void {
    this.onComplete = callback;
  }

  activate(): void {
    this.enabled = true;
    this.reset();
  }

  deactivate(): void {
    this.enabled = false;
    this.reset();
  }

  reset(): void {
    this.visualGroup.clear();
    this.points.length = 0;
  }

  handlePointerDown(event: PointerEvent): void {
    if (!this.enabled) return;
    const hit = this.pickFromPointer(event.clientX, event.clientY);
    if (!hit) return;
    this.points.push(hit);
    this.createMarker(hit.point, this.points.length === 1 ? 0xffcc00 : 0x00aaff);
    if (this.points.length >= 2) {
      const start = this.points[0];
      const end = this.points[1];
      const distance = start.point.distanceTo(end.point);
      const midpoint = start.point.clone().add(end.point).multiplyScalar(0.5);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start.point, end.point]),
        new THREE.LineBasicMaterial({ color: 0xffcc00 })
      );
      this.visualGroup.add(line);
      const result: MeasurementResult = { start, end, distance, midpoint, line };
      this.onComplete?.(result);
      this.enabled = false;
      this.points.length = 0;
    }
  }

  pickFromPointer(clientX: number, clientY: number): MeasurementHit | undefined {
    const rect = this.element.getBoundingClientRect();
    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);
    const hits = this.raycaster.intersectObjects(this.root.children, true);
    const hit = hits.find((entry) => entry.object !== this.visualGroup);
    if (!hit) return undefined;
    const point = hit.point.clone();
    const normal = hit.face?.normal ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point, normal, object: hit.object };
  }

  private createMarker(position: THREE.Vector3, color: number): void {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    marker.position.copy(position);
    this.visualGroup.add(marker);
  }
}
