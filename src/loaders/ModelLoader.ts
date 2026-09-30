import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Nexus3D } from 'nexus3d';
import * as NexusModule from 'nexus3d';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SplatMesh } from '@sparkjsdev/spark';
export interface ModelLoadDefinition {
  alpha?: number;
  doubleSided?: boolean;
  materialFile?: string;
  materialPath?: string;
  texture?: string;
  transparent?: boolean;
}

const nexusCache = (NexusModule as unknown as { Cache: { cortopath: string } }).Cache;

export interface ModelLoaderConfig {
  renderer: THREE.WebGLRenderer;
  baseUrl?: string;
}

export class ModelLoader {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly baseUrl?: string;
  private readonly cache = new Map<string, Promise<THREE.Object3D>>();

  constructor(config: ModelLoaderConfig) {
    this.renderer = config.renderer;
    this.baseUrl = config.baseUrl;
    nexusCache.cortopath = new URL('/nexus3d', window.location.origin).href;
  }

  load(file: string, definition: ModelLoadDefinition = {}): Promise<THREE.Object3D> {
    const url = this.resolveUrl(file);
    const extension = getExtension(url);
    if (extension === 'nxz' || extension === 'nxs') {
      return this.loadUncached(url, definition);
    }
    const cached = this.cache.get(url);
    if (cached) return cached.then((object) => cloneLoadedObject(object, extension));
    const loading = this.loadUncached(url, definition);
    this.cache.set(url, loading);
    return loading.then((object) => cloneLoadedObject(object, extension));
  }

  clearCache(): void {
    this.cache.clear();
  }

  async loadSplat(file: string): Promise<THREE.Object3D> {
    const mesh = new SplatMesh({ url: this.resolveUrl(file) });
    await mesh.initialized;
    return mesh;
  }

  private async loadUncached(url: string, definition: ModelLoadDefinition): Promise<THREE.Object3D> {
    const extension = getExtension(url);
    if (extension === 'nxz' || extension === 'nxs') {
      return new Promise<THREE.Object3D>((resolve, reject) => {
        let nexus: Nexus3D;
        try {
          nexus = new Nexus3D(url, this.renderer, {
            material: new THREE.MeshStandardMaterial({
              roughness: 0.55,
              metalness: 0,
              side: toMaterialSide(definition.doubleSided, true),
              transparent: definition.transparent ?? isTranslucent(definition),
              opacity: definition.alpha ?? 1,
              depthWrite: true
            }),
            onLoad: (loadedNexus: Nexus3D) => {
              loadedNexus.userData.newHOPNexus = loadedNexus;
              resolve(loadedNexus);
            }
          });
          nexus.userData.newHOPNexus = nexus;
        } catch (error) {
          reject(error);
        }
      });
    }
    if (extension === 'glb' || extension === 'gltf') {
      const result = await new GLTFLoader().loadAsync(url);
      applyMaterialOverrides(result.scene, definition);
      result.scene.userData.newHOPAnimations = result.animations;
      return result.scene;
    }
    if (extension === 'ply') {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load PLY model: ${response.status} ${response.statusText}`);
      const data = await response.arrayBuffer();
      const geometry = new PLYLoader().parse(data);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const textureFile = definition.texture ?? readPlyTextureFile(data);
      const texture = textureFile
        ? await new THREE.TextureLoader().loadAsync(new URL(textureFile, url).href)
        : undefined;
      if (texture) texture.colorSpace = THREE.SRGBColorSpace;
      const hasVertexColors = geometry.getAttribute('color') !== undefined;
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0,
        map: texture,
        vertexColors: hasVertexColors,
        side: toMaterialSide(definition.doubleSided, true),
        transparent: definition.transparent ?? isTranslucent(definition),
        opacity: definition.alpha ?? 1
      }));
    }
    if (extension === 'obj') {
      const loader = new OBJLoader();
      const objDirectory = getDirectoryUrl(url);
      const objFile = getFileName(url);
      const materialPath = definition.materialPath
        ? this.resolveUrl(definition.materialPath)
        : objDirectory;
      const materialFile = definition.materialFile
        ? new URL(definition.materialFile, materialPath).href
        : await findObjMaterialFile(url);
      if (materialFile) {
        const materials = new MTLLoader();
        const loadedMaterials = await materials.loadAsync(materialFile);
        loadedMaterials.preload();
        loader.setMaterials(loadedMaterials);
      }
      loader.setPath(objDirectory);
      const object = await loader.loadAsync(objFile);
      applyMaterialOverrides(object, definition, true);
      return object;
    }
    if (extension === 'stl') {
      const geometry = await new STLLoader().loadAsync(url);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0,
        transparent: definition.transparent ?? isTranslucent(definition),
        opacity: definition.alpha ?? 1
      }));
    }
    throw new Error(`Unsupported model format: .${extension || 'unknown'}`);
  }

  private resolveUrl(file: string): string {
    return new URL(file, this.baseUrl ?? window.location.href).href;
  }
}

function cloneLoadedObject(object: THREE.Object3D, extension: string): THREE.Object3D {
  const clone = extension === 'glb' || extension === 'gltf' ? cloneSkinned(object) : object.clone(true);
  if (extension === 'glb' || extension === 'gltf') {
    clone.userData.newHOPAnimations = object.userData.newHOPAnimations;
  }
  return clone;
}

function getExtension(url: string): string {
  return new URL(url, window.location.href).pathname.split('.').pop()?.toLowerCase() ?? '';
}

function toMaterialSide(doubleSided: boolean | undefined, defaultDoubleSided: boolean): THREE.Side {
  return (doubleSided ?? defaultDoubleSided) ? THREE.DoubleSide : THREE.FrontSide;
}

function applyMaterialOverrides(object: THREE.Object3D, definition: ModelLoadDefinition, defaultDoubleSided = false): void {
  const side = definition.doubleSided === undefined
    ? (defaultDoubleSided ? THREE.DoubleSide : undefined)
    : toMaterialSide(definition.doubleSided, false);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (side !== undefined) material.side = side;
      const transparent = definition.transparent ?? isTranslucent(definition);
      material.transparent = transparent;
      material.depthWrite = !transparent;
      if (definition.alpha !== undefined) material.opacity = definition.alpha;
    }
  });
}

function isTranslucent(definition: Pick<ModelLoadDefinition, 'alpha'>): boolean {
  return definition.alpha !== undefined && definition.alpha < 1;
}

function getFileName(url: string): string {
  const pathname = new URL(url, window.location.href).pathname;
  return decodeURIComponent(pathname.substring(pathname.lastIndexOf('/') + 1));
}

function getDirectoryUrl(url: string): string {
  return new URL('./', url).href;
}

async function findObjMaterialFile(url: string): Promise<string | undefined> {
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const source = await response.text();
  const declaration = source.match(/^\s*mtllib\s+(.+)\s*$/im)?.[1]?.trim();
  const candidates = declaration
    ? [declaration]
    : [`${getFileName(url).replace(/\.obj$/i, '')}.mtl`];

  for (const candidate of candidates) {
    const materialUrl = new URL(candidate, getDirectoryUrl(url)).href;
    try {
      const materialResponse = await fetch(materialUrl, { method: 'HEAD' });
      if (materialResponse.ok) return materialUrl;
    } catch {
      // OBJ remains usable when an optional MTL sidecar cannot be checked.
    }
  }
  return undefined;
}

function readPlyTextureFile(data: ArrayBuffer): string | undefined {
  const bytes = new Uint8Array(data);
  const headerEnd = findHeaderEnd(bytes);
  if (headerEnd < 0) return undefined;

  const header = new TextDecoder().decode(bytes.subarray(0, headerEnd));
  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^comment\s+(?:texture(?:file)?|texture_file)\s*:?\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function findHeaderEnd(bytes: Uint8Array): number {
  const marker = new TextEncoder().encode('end_header');
  for (let index = 0; index <= bytes.length - marker.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < marker.length; offset += 1) {
      if (bytes[index + offset] !== marker[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      let end = index + marker.length;
      while (end < bytes.length && (bytes[end] === 10 || bytes[end] === 13)) end += 1;
      return end;
    }
  }
  return -1;
}
