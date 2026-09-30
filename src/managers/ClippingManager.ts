import * as THREE from 'three';

export type ClipAxis = 'x' | 'y' | 'z';

export class ClippingManager {
  private readonly root: THREE.Object3D;
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private enabled = false;

  constructor(root: THREE.Object3D) {
    this.root = root;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.apply();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.apply();
  }

  setPlane(normal: THREE.Vector3, constant: number): void {
    this.plane.normal.copy(normal).normalize();
    this.plane.constant = constant;
    this.apply();
  }

  setAxis(axis: ClipAxis, offset: number): void {
    const normal = new THREE.Vector3();
    if (axis === 'x') normal.set(1, 0, 0);
    else if (axis === 'y') normal.set(0, 1, 0);
    else normal.set(0, 0, 1);
    this.setPlane(normal, offset);
  }

  apply(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const clipped = material as THREE.Material & { clippingPlanes?: THREE.Plane[] };
        clipped.clippingPlanes = this.enabled ? [this.plane] : [];
      }
    });
  }
}
