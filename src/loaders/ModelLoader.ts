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
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import { convertE57ToXyz } from './E57Decoder';
import type { MaterialProperties, ModelFormat } from '../types/SceneTypes';
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
  material?: MaterialProperties;
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

const nexusCache = (NexusModule as unknown as {
  Cache: {
    cortopath: string;
  };
}).Cache;

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
    patchNexusTextureUnitBinding(this.renderer);
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
            material: createNexusMaterial(definition),
            onLoad: (loadedNexus: Nexus3D) => {
              normalizeNexusTexture(loadedNexus);
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
    if (format === 'las' || format === 'laz') {
      const data = await load(url, LASLoader, {
        las: {
          shape: 'mesh',
          fp64: false,
          skip: 1,
          colorDepth: 8
        }
      });
      const geometry = new THREE.BufferGeometry();
      const positions = data.attributes.POSITION;
      if (!positions) throw new Error('LAS/LAZ data did not contain positions.');
      geometry.setAttribute('position', new THREE.BufferAttribute(positions.value, positions.size));
      const colors = data.attributes.COLOR_0;
      if (colors) {
        geometry.setAttribute('color', new THREE.BufferAttribute(colors.value, colors.size, colors.normalized ?? false));
      }
      return createPointCloudMesh(geometry, colors !== undefined);
    }
    if (format === 'e57') {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load E57 point cloud: ${response.status} ${response.statusText}`);
      const converted = await convertE57ToXyz(new Uint8Array(await response.arrayBuffer()));
      return createPointCloudMesh(parseE57Geometry(converted));
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

function createNexusMaterial(definition: ModelLoadDefinition): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  const options = {
    side: toMaterialSide(definition.doubleSided, true),
    transparent: definition.transparent ?? isTranslucent(definition),
    opacity: definition.alpha ?? 1,
    depthWrite: true
  };
  if (definition.material?.specularIntensity === 0) return new THREE.MeshLambertMaterial(options);
  return new THREE.MeshStandardMaterial({
    ...options,
    roughness: 1,
    metalness: 0
  });
}

function patchNexusTextureUnitBinding(renderer: THREE.WebGLRenderer): void {
  const context = renderer.getContext() as WebGLRenderingContext & {
    __newHOPNexusTextureUnitPatched?: boolean;
  };
  if (context.__newHOPNexusTextureUnitPatched) return;

  const activeTexture = context.activeTexture.bind(context);
  context.activeTexture = (textureUnit: GLenum): void => {
    activeTexture(Number.isFinite(textureUnit) ? textureUnit : context.TEXTURE0);
  };
  context.__newHOPNexusTextureUnitPatched = true;
}

function cloneLoadedObject(object: THREE.Object3D, format: string): THREE.Object3D {
  if (format === 'nxz' || format === 'nxs') return object;
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
  return (definition.pointCloud || isPointCloudFormat(format))
    ? convertToPointCloud(clone, definition.pointSize ?? POINT_CLOUD_DEFAULTS.pointSize)
    : clone;
}

function isPointCloudFormat(format: string): boolean {
  return format === 'las' || format === 'laz' || format === 'e57';
}

function createPointCloudMesh(geometry: THREE.BufferGeometry, hasColors = false): THREE.Mesh {
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: hasColors,
    roughness: 0.55,
    metalness: 0
  }));
}

function parseE57Geometry(source: string): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const values = trimmed.split(/\s+/).map(Number);
    if (values.length !== 3 && values.length !== 6) continue;
    if (values.some((value) => !Number.isFinite(value))) continue;
    positions.push(values[0], values[1], values[2]);
    if (values.length === 6) {
      color.setRGB(values[3] / 255, values[4] / 255, values[5] / 255).convertSRGBToLinear();
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors.length === positions.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
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

function normalizeNexusTexture(object: Nexus3D): void {
  const nexus = object as Nexus3D & {
    material_texture?: THREE.DataTexture;
    updateMaterials?: () => void;
  };
  if (!nexus.material_texture || nexus.material_texture.format !== THREE.RGBFormat) return;
  nexus.material_texture.dispose();
  nexus.material_texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  nexus.material_texture.needsUpdate = true;
  nexus.updateMaterials?.();
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
