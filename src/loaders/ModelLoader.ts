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
import type { ModelFormat } from '../types/SceneTypes';
export interface ModelLoadDefinition {
  format?: ModelFormat;
  pointCloud?: boolean;
  pointSize?: number;
  alpha?: number;
  doubleSided?: boolean;
  materialFile?: string;
  materialPath?: string;
  texture?: string;
  transparent?: boolean;
}

export interface ModelLoadDefaults {
  format: ModelFormat;
}

export const MODEL_LOAD_DEFAULTS = {
  format: 'auto'
} as const satisfies ModelLoadDefaults;

export const POINT_CLOUD_DEFAULTS = {
  pointSize: 0.01
} as const;

const nexusCache = (NexusModule as unknown as { Cache: { cortopath: string } }).Cache;

declare const __NEWHOP_LIBRARY_URL__: string | undefined;

const libraryUrl = __NEWHOP_LIBRARY_URL__;
const nexusWorkerDirectory = libraryUrl
  ? new URL('.', libraryUrl).href.replace(/\/$/, '')
  : new URL('/nexus3d', window.location.origin).href;

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
    nexusCache.cortopath = nexusWorkerDirectory;
  }

  load(file: string, definition: ModelLoadDefinition = {}): Promise<THREE.Object3D> {
    const url = this.resolveUrl(file);
    const format = resolveFormat(url, definition.format ?? MODEL_LOAD_DEFAULTS.format);
    if (format === 'nxz' || format === 'nxs') {
      return this.loadUncached(url, definition, format).then((object) => finalizeLoadedObject(object, format, definition));
    }
    const cacheKey = createCacheKey(url, format, definition);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.then((object) => finalizeLoadedObject(object, format, definition));
    const loading = this.loadUncached(url, definition, format);
    this.cache.set(cacheKey, loading);
    loading.catch(() => {
      if (this.cache.get(cacheKey) === loading) this.cache.delete(cacheKey);
    });
    return loading.then((object) => finalizeLoadedObject(object, format, definition));
  }

  clearCache(): void {
    this.cache.clear();
  }

  async loadSplat(file: string): Promise<THREE.Object3D> {
    const mesh = new SplatMesh({ url: this.resolveUrl(file) });
    await mesh.initialized;
    return mesh;
  }

  private async loadUncached(url: string, definition: ModelLoadDefinition, format = resolveFormat(url, definition.format ?? MODEL_LOAD_DEFAULTS.format)): Promise<THREE.Object3D> {
    if (format === 'nxz' || format === 'nxs') {
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
              normalizeNexusColorAttribute(loadedNexus);
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
    if (format === 'glb' || format === 'gltf') {
      const result = await new GLTFLoader().loadAsync(url);
      applyMaterialOverrides(result.scene, definition);
      result.scene.userData.newHOPAnimations = result.animations;
      return result.scene;
    }
    if (format === 'ply') {
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
    if (format === 'obj') {
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
      const objectUrl = new URL(url).search || new URL(url).hash ? url : objFile;
      const object = await loader.loadAsync(objectUrl);
      applyMaterialOverrides(object, definition, true);
      return object;
    }
    if (format === 'stl') {
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
    throw new Error(`Unsupported model format: .${format || 'unknown'}`);
  }

  private resolveUrl(file: string): string {
    return new URL(file, this.baseUrl ?? window.location.href).href;
  }
}

function cloneLoadedObject(object: THREE.Object3D, format: string): THREE.Object3D {
  const clone = format === 'glb' || format === 'gltf' ? cloneSkinned(object) : object.clone(true);
  clone.traverse((child) => {
    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) {
      child.geometry = child.geometry.clone();
    }
  });
  if (format === 'glb' || format === 'gltf') {
    clone.userData.newHOPAnimations = object.userData.newHOPAnimations;
  }
  return clone;
}

function finalizeLoadedObject(object: THREE.Object3D, format: string, definition: ModelLoadDefinition): THREE.Object3D {
  const clone = cloneLoadedObject(object, format);
  return definition.pointCloud ? convertToPointCloud(clone, definition.pointSize ?? POINT_CLOUD_DEFAULTS.pointSize) : clone;
}

function convertToPointCloud(object: THREE.Object3D, pointSize: number): THREE.Object3D {
  const size = Number.isFinite(pointSize) ? Math.max(pointSize, 0.000001) : POINT_CLOUD_DEFAULTS.pointSize;
  if (object instanceof THREE.Mesh) return createPoints(object, size);

  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    const parent = mesh.parent;
    if (!parent) continue;
    const points = createPoints(mesh, size);
    parent.add(points);
    parent.remove(mesh);
  }
  return object;
}

function createPoints(mesh: THREE.Mesh, pointSize: number): THREE.Points {
  mesh.geometry.setIndex(null);
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const sourceWithColor = source as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  const material = new THREE.PointsMaterial({
    color: sourceWithColor.color?.getHex() ?? 0xffffff,
    map: sourceWithColor.map ?? null,
    vertexColors: mesh.geometry.getAttribute('color') !== undefined,
    size: pointSize,
    transparent: source.transparent,
    opacity: source.opacity,
    depthTest: source.depthTest,
    depthWrite: source.depthWrite
  });
  const points = new THREE.Points(mesh.geometry, material);
  points.name = mesh.name;
  points.userData = mesh.userData;
  points.position.copy(mesh.position);
  points.quaternion.copy(mesh.quaternion);
  points.scale.copy(mesh.scale);
  points.matrix.copy(mesh.matrix);
  points.matrixAutoUpdate = mesh.matrixAutoUpdate;
  while (mesh.children.length > 0) points.add(mesh.children[0]);
  return points;
}

function createCacheKey(url: string, format: string, definition: ModelLoadDefinition): string {
  return JSON.stringify([
    url,
    format,
    definition.alpha,
    definition.doubleSided,
    definition.materialFile,
    definition.materialPath,
    definition.texture,
    definition.transparent
  ]);
}

function resolveFormat(url: string, format: ModelFormat | undefined): string {
  return format === undefined || format === 'auto' ? getExtension(url) : format;
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

function normalizeNexusColorAttribute(object: Nexus3D): void {
  const color = object.geometry?.getAttribute('color');
  if (!color || color.itemSize !== 4) return;
  object.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
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
