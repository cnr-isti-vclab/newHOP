declare module 'nexus3d' {
  import type * as THREE from 'three';

  export class Nexus3D extends THREE.Mesh {
    constructor(url: string, renderer: THREE.WebGLRenderer, options?: Record<string, unknown>);
    update(camera: THREE.Camera): void;
    dispose(): void;
  }
}
