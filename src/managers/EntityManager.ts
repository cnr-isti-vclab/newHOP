import * as THREE from 'three';
import type { AnimationClipInfo, AnimationLoopMode, EntityBehaviorProfile, EntityDefinition, EntityParticipation, EntityTransform, EntityTransformSnapshot, MaterialProperties, Matrix4Tuple, ObjectAnimationOptions, ObjectAnimationState, ObjectAppearance, SpotAppearance, Vector3Tuple } from '../types/SceneTypes';
import { ModelLoader, type ModelLoadDefinition } from '../loaders/ModelLoader';

type NormalizedEntityParticipation = Required<EntityParticipation>;

const ENTITY_BEHAVIOR_DEFAULTS: Record<EntityBehaviorProfile, NormalizedEntityParticipation> = {
  scene: {
    bounds: true,
    clipping: true,
    picking: true,
    measurement: true
  },
  helper: {
    bounds: false,
    clipping: true,
    picking: true,
    measurement: false
  },
  overlay: {
    bounds: false,
    clipping: false,
    picking: false,
    measurement: false
  },
  'interactive-helper': {
    bounds: false,
    clipping: false,
    picking: true,
    measurement: false
  }
};

interface MaterialState {
  mesh: THREE.Mesh;
  original: THREE.Material[];
  normal: THREE.Material[];
  uniform?: THREE.Material[];
  shadeless?: THREE.Material[];
  uniformShadeless?: THREE.Material[];
}

interface AnimationState {
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  action?: THREE.AnimationAction;
  clip?: THREE.AnimationClip;
  mode: AnimationLoopMode;
}

export type ObjectAnimationListener = (state: ObjectAnimationState) => void;

type MaterialEntityDefinition = EntityDefinition & { material?: THREE.Material | MaterialProperties };

export class EntityManager {
  private readonly root: THREE.Group;
  private readonly objects = new Map<string, THREE.Object3D>();
  private readonly definitions = new Map<string, EntityDefinition>();
  private readonly participation = new Map<string, NormalizedEntityParticipation>();
  private readonly materialStates = new Map<string, MaterialState[]>();
  private readonly animationStates = new Map<string, AnimationState>();
  private readonly animationListeners = new Map<string, Set<ObjectAnimationListener>>();

  constructor(root: THREE.Group, private readonly modelLoader: ModelLoader) {
    this.root = root;
  }

  async add(definition: EntityDefinition): Promise<THREE.Object3D> {
    if (this.objects.has(definition.id)) {
      throw new Error(`An entity with id "${definition.id}" already exists.`);
    }
    assertTransformMode(definition);
    const object = await (definition.type === 'model'
      ? await this.modelLoader.load(definition.file, definition)
      : definition.type === 'splat'
        ? this.modelLoader.loadSplat(definition.file)
      : definition.type === 'hotspot' && definition.file
        ? await this.modelLoader.load(definition.file, definition satisfies ModelLoadDefinition)
        : createEntityObject(definition));
    if (definition.type === 'hotspot' && definition.file) convertToShadeless(object);
    const materialStates = definition.type === 'splat' ? [] : isolateMaterials(object, definition.type !== 'hotspot');
    object.position.fromArray(definition.position ?? [0, 0, 0]);
    if (definition.rotation) {
      object.rotation.set(...definition.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    }
    applyScale(object, definition.scale);
    if (definition.matrix) {
      object.matrix.fromArray(definition.matrix);
      object.matrixAutoUpdate = false;
    }
    object.visible = definition.visible ?? true;
    applyShadowFlags(object);
    const entityParticipation = normalizeParticipation(definition);
    object.userData.entity = definition;
    object.userData.entityParticipation = entityParticipation;
    this.root.add(object);
    this.objects.set(definition.id, object);
    this.definitions.set(definition.id, definition);
    this.participation.set(definition.id, entityParticipation);
    this.materialStates.set(definition.id, materialStates);
    this.applyAppearance(definition.id);
    const animationState = createAnimationState(object);
    if (animationState) this.animationStates.set(definition.id, animationState);
    if (definition.type === 'model' && definition.animation?.autoplay) {
      this.playAnimation(definition.id, definition.animation.clip, definition.animation);
    }
    return object;
  }

  remove(id: string): boolean {
    const object = this.objects.get(id);
    if (!object) return false;
    this.root.remove(object);
    disposeObject(object);
    const animationState = this.animationStates.get(id);
    if (animationState) {
      animationState.mixer.stopAllAction();
      animationState.mixer.uncacheRoot(object);
    }
    for (const state of this.materialStates.get(id) ?? []) {
      for (const materials of [state.normal, state.uniform, state.shadeless, state.uniformShadeless]) {
        if (!materials) continue;
        for (const material of materials) material.dispose();
      }
    }
    this.objects.delete(id);
    this.definitions.delete(id);
    this.participation.delete(id);
    this.materialStates.delete(id);
    this.animationStates.delete(id);
    this.animationListeners.delete(id);
    return true;
  }

  clear(): void {
    for (const id of this.objects.keys()) this.remove(id);
  }

  getObject(id: string): THREE.Object3D | undefined {
    return this.objects.get(id);
  }

  getDefinition(id: string): EntityDefinition | undefined {
    return this.definitions.get(id);
  }

  getParticipation(id: string): NormalizedEntityParticipation | undefined {
    return this.participation.get(id);
  }

  getIds(): string[] {
    return [...this.objects.keys()];
  }

  getAnimations(id: string): AnimationClipInfo[] {
    return this.requireAnimationState(id).clips.map((clip, index) => ({
      name: getClipName(clip, index),
      duration: clip.duration
    }));
  }

  getAnimationTime(id: string): number {
    const state = this.requireAnimationState(id);
    return getActionTime(state);
  }

  onAnimationUpdate(id: string, listener: ObjectAnimationListener): () => void {
    const listeners = this.animationListeners.get(id) ?? new Set<ObjectAnimationListener>();
    listeners.add(listener);
    this.animationListeners.set(id, listeners);
    listener(this.getAnimationState(id));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.animationListeners.delete(id);
    };
  }

  private getAnimationState(id: string): ObjectAnimationState {
    const state = this.requireAnimationState(id);
    return {
      clip: state.clip ? getClipName(state.clip, state.clips.indexOf(state.clip)) : undefined,
      time: getActionTime(state),
      duration: state.clip?.duration ?? 0,
      playing: Boolean(state.action && state.action.isRunning() && !state.action.paused),
      mode: state.mode
    };
  }

  playAnimation(id: string, name: string | undefined, options: ObjectAnimationOptions = {}): void {
    const state = this.requireAnimationState(id);
    const clip = findClip(state.clips, name);
    state.mixer.stopAllAction();
    const action = state.mixer.clipAction(clip);
    const mode = options.mode ?? 'loop';
    const repetitions = options.repetitions ?? (mode === 'once' ? 1 : Infinity);
    action.reset();
    action.setLoop(toThreeLoopMode(mode), repetitions);
    action.clampWhenFinished = mode === 'once';
    action.paused = false;
    action.timeScale = options.timeScale ?? 1;
    action.play();
    state.action = action;
    state.clip = clip;
    state.mode = mode;
    this.notifyAnimationListeners(id);
  }

  pauseAnimation(id: string): void {
    const state = this.requireAnimationState(id);
    if (state.action) state.action.paused = true;
    this.notifyAnimationListeners(id);
  }

  resumeAnimation(id: string): void {
    const state = this.requireAnimationState(id);
    if (state.action) {
      state.action.paused = false;
      state.action.play();
    }
    this.notifyAnimationListeners(id);
  }

  stopAnimation(id: string): void {
    const state = this.requireAnimationState(id);
    state.mixer.stopAllAction();
    state.action = undefined;
    state.clip = undefined;
    this.notifyAnimationListeners(id);
  }

  setAnimationTime(id: string, name: string, time: number): void {
    const state = this.requireAnimationState(id);
    const clip = findClip(state.clips, name);
    if (state.clip !== clip) {
      state.mixer.stopAllAction();
      state.action = state.mixer.clipAction(clip).play();
      state.clip = clip;
    }
    state.action!.paused = true;
    const clampedTime = THREE.MathUtils.clamp(time, 0, clip.duration);
    state.action!.time = isPingPongReverse(state) ? clip.duration - clampedTime : clampedTime;
    state.mixer.update(0);
    this.notifyAnimationListeners(id);
  }

  updateAnimations(deltaSeconds: number): void {
    for (const [id, state] of this.animationStates) {
      state.mixer.update(deltaSeconds);
      this.notifyAnimationListeners(id);
    }
  }

  private notifyAnimationListeners(id: string): void {
    for (const listener of this.animationListeners.get(id) ?? []) listener(this.getAnimationState(id));
  }

  getTransform(id: string): EntityTransformSnapshot {
    const object = this.requireObject(id);
    if (object.matrixAutoUpdate) {
      object.updateMatrix();
      return {
        mode: 'components',
        position: object.position.toArray() as Vector3Tuple,
        rotation: [
          THREE.MathUtils.radToDeg(object.rotation.x),
          THREE.MathUtils.radToDeg(object.rotation.y),
          THREE.MathUtils.radToDeg(object.rotation.z)
        ],
        scale: object.scale.toArray() as Vector3Tuple,
        matrix: object.matrix.toArray() as Matrix4Tuple
      };
    }
    return {
      mode: 'matrix',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      matrix: object.matrix.toArray() as Matrix4Tuple
    };
  }

  getAppearance(id: string): ObjectAppearance {
    const object = this.requireObject(id);
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
      if (!isMesh(child)) return;
      materials.push(...(Array.isArray(child.material) ? child.material : [child.material]));
    });
    const definition = this.getDefinition(id);
    const objectAppearance = definition && hasObjectAppearance(definition) ? definition : undefined;
    return {
      color: definition?.color ?? 0xffffff,
      alpha: definition?.alpha ?? 0.5,
      transparent: getSharedMaterialValue(materials, (material) => material.transparent),
      doubleSided: getSharedMaterialValue(materials, (material) => material.side === THREE.DoubleSide),
      uniform: objectAppearance?.uniform ?? false,
      shadeless: objectAppearance?.shadeless ?? false,
      visible: object.visible
    };
  }

  getSpotAppearance(id: string): SpotAppearance {
    const object = this.requireObject(id);
    const definition = this.definitions.get(id);
    if (!definition || definition.type !== 'hotspot') throw new Error(`Entity "${id}" is not a spot.`);
    return {
      color: definition.color ?? 0xffcc00,
      alpha: definition.alpha ?? 0.7,
      highlightColor: definition.highlightColor,
      highlightAlpha: definition.highlightAlpha,
      highlighted: definition.highlighted ?? false,
      transparent: definition.transparent ?? true,
      doubleSided: definition.doubleSided ?? true,
      visible: object.visible
    };
  }

  getMaterial(id: string): MaterialProperties {
    const object = this.requireObject(id);
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
      if (!isMesh(child)) return;
      materials.push(...(Array.isArray(child.material) ? child.material : [child.material]));
    });
    const definition = this.definitions.get(id);
    const materialDefinition = definition as MaterialEntityDefinition | undefined;
    const configured = materialDefinition && isMaterialProperties(materialDefinition.material) ? materialDefinition.material : undefined;
    return {
      color: configured?.color ?? getSharedMaterialValue(materials, (material) => getColorValue(material, 'color')),
      roughness: configured?.roughness ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'roughness')),
      metalness: configured?.metalness ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'metalness')),
      specularColor: configured?.specularColor ?? getSharedMaterialValue(materials, (material) => getColorValue(material, 'specularColor') ?? getColorValue(material, 'specular')),
      specularIntensity: configured?.specularIntensity ?? getNumberValueFromMaterials(materials, 'specularIntensity'),
      shininess: configured?.shininess ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'shininess')),
      emissive: configured?.emissive ?? getSharedMaterialValue(materials, (material) => getColorValue(material, 'emissive')),
      emissiveIntensity: configured?.emissiveIntensity ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'emissiveIntensity')),
      envMapIntensity: configured?.envMapIntensity ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'envMapIntensity')),
      clearcoat: configured?.clearcoat ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'clearcoat')),
      clearcoatRoughness: configured?.clearcoatRoughness ?? getSharedMaterialValue(materials, (material) => getNumberValue(material, 'clearcoatRoughness'))
    };
  }

  setMaterial(id: string, material: Partial<MaterialProperties>): void {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Entity definition for "${id}" was not found.`);
    const materialDefinition = definition as MaterialEntityDefinition;
    const current = isMaterialProperties(materialDefinition.material) ? materialDefinition.material : {};
    materialDefinition.material = { ...current, ...material };
    this.applyAppearance(id);
  }

  setAppearance(id: string, appearance: Partial<ObjectAppearance> & Partial<SpotAppearance>): void {
    const object = this.requireObject(id);
    if (appearance.visible !== undefined) this.setVisibility(id, appearance.visible);
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Entity definition for "${id}" was not found.`);
    Object.assign(definition, appearance);
    this.applyAppearance(id);
    object.userData.entity = this.definitions.get(id);
  }

  setTransform(id: string, transform: EntityTransform): void {
    const object = this.requireObject(id);
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Entity definition for "${id}" was not found.`);
    const hasComponents = transform.position !== undefined || transform.rotation !== undefined || transform.scale !== undefined;
    if (transform.matrix === undefined && !hasComponents) return;
    if (transform.matrix && hasComponents) {
      throw new Error('An entity transform update must use either "matrix" or component fields, not both.');
    }

    if (transform.matrix) {
      object.matrix.fromArray(transform.matrix);
      object.matrixAutoUpdate = false;
      definition.matrix = [...transform.matrix] as Matrix4Tuple;
      delete definition.position;
      delete definition.rotation;
      delete definition.scale;
      return;
    }

    const wasMatrixMode = !object.matrixAutoUpdate;
    object.matrixAutoUpdate = true;
    if (wasMatrixMode) {
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.set(1, 1, 1);
    }
    if (transform.position) object.position.fromArray(transform.position);
    if (transform.rotation) {
      object.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    }
    if (transform.scale !== undefined) applyScale(object, transform.scale);
    object.updateMatrix();
    delete definition.matrix;
    if (transform.position) definition.position = [...transform.position];
    if (transform.rotation) definition.rotation = [...transform.rotation];
    if (transform.scale !== undefined) {
      definition.scale = typeof transform.scale === 'number' ? transform.scale : [...transform.scale];
    }
  }

  getBounds(): THREE.Box3 {
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    for (const [id, object] of this.objects) {
      if (!this.participation.get(id)?.bounds) continue;
      bounds.union(new THREE.Box3().setFromObject(object));
      const splat = object as THREE.Object3D & { getBoundingBox?: () => THREE.Box3 };
      const splatBounds = splat.getBoundingBox?.();
      if (splatBounds && !splatBounds.isEmpty()) {
        bounds.union(splatBounds.clone().applyMatrix4(object.matrixWorld));
      }
      const nexus = object.userData.newHOPNexus as { boundingSphere?: THREE.Sphere } | undefined;
      if (!nexus?.boundingSphere) continue;
      const sphere = nexus.boundingSphere.clone().applyMatrix4(object.matrixWorld);
      bounds.union(sphere.getBoundingBox(new THREE.Box3()));
    }
    return bounds;
  }

  setVisibility(id: string, visible: boolean): void {
    const object = this.requireObject(id);
    object.visible = visible;
    const definition = this.definitions.get(id);
    if (definition) definition.visible = visible;
  }

  setColor(id: string, color: number): void {
    const definition = this.definitions.get(id);
    if (definition) definition.color = color;
    this.applyAppearance(id);
  }

  setAlpha(id: string, alpha: number): void {
    const definition = this.definitions.get(id);
    if (definition) definition.alpha = alpha;
    this.applyAppearance(id);
  }

  setDoubleSided(id: string, doubleSided: boolean): void {
    const definition = this.definitions.get(id);
    if (definition) definition.doubleSided = doubleSided;
    this.applyAppearance(id);
  }

  setVisibilityByTag(tag: string, visible: boolean): void {
    for (const [id, definition] of this.definitions) {
      if (definition.tags?.includes(tag)) this.setVisibility(id, visible);
    }
  }

  private requireObject(id: string): THREE.Object3D {
    const object = this.objects.get(id);
    if (!object) throw new Error(`Entity "${id}" was not found.`);
    return object;
  }

  private requireAnimationState(id: string): AnimationState {
    const object = this.requireObject(id);
    const state = this.animationStates.get(id);
    if (!state) throw new Error(`Object "${id}" has no animations.`);
    if (!object) throw new Error(`Object "${id}" was not found.`);
    return state;
  }

  private applyAppearance(id: string): void {
    const definition = this.definitions.get(id);
    if (!definition) return;
    for (const state of this.materialStates.get(id) ?? []) {
      const materials = !hasObjectAppearance(definition)
        ? state.normal
        : definition.shadeless
          ? (definition.uniform ? state.uniformShadeless! : state.shadeless!)
          : (definition.uniform ? state.uniform! : state.normal);
      for (let index = 0; index < materials.length; index += 1) {
        applyMaterialAppearance(state.original[index], materials[index], definition);
      }
      if (state.mesh.userData.newHOPNexus) {
        for (const material of materials) {
          material.depthWrite = true;
        }
      }
      state.mesh.material = materials.length === 1 ? materials[0] : materials;
    }
  }
}

function normalizeParticipation(definition: EntityDefinition): NormalizedEntityParticipation {
  const profile = definition.behavior ?? 'scene';
  const participation = {
    ...ENTITY_BEHAVIOR_DEFAULTS[profile],
    ...definition.participation
  };
  if (definition.clippable !== undefined) participation.clipping = definition.clippable;
  if (definition.measurable !== undefined) participation.measurement = definition.measurable;
  return participation;
}

function assertTransformMode(transform: EntityTransform): void {
  const hasComponents = transform.position !== undefined || transform.rotation !== undefined || transform.scale !== undefined;
  if (transform.matrix && hasComponents) {
    throw new Error('An entity declaration must use either "matrix" or component fields, not both.');
  }
}

function createEntityObject(entity: EntityDefinition): THREE.Object3D {
  if (entity.type === 'geometry') {
    const material = isThreeMaterial(entity.material)
      ? entity.material
      : new THREE.MeshStandardMaterial({ color: entity.color ?? 0xffffff, roughness: 0.55, metalness: 0 });
    return new THREE.Mesh(entity.geometry, material);
  }
  if (entity.type !== 'hotspot') throw new Error('Model entities are loaded by ModelLoader.');
  const material = new THREE.MeshBasicMaterial({
    color: entity.color ?? 0xffcc00,
    transparent: entity.transparent ?? true,
    opacity: entity.alpha ?? 0.7,
    side: entity.doubleSided === false ? THREE.FrontSide : THREE.DoubleSide
  });
  const size = entity.size ?? 0.06;
  if (entity.geometry) return new THREE.Mesh(entity.geometry, material);
  const geometry = entity.primitive === 'cube'
    ? new THREE.BoxGeometry(size, size, size)
    : new THREE.SphereGeometry(size, 16, 12);
  return new THREE.Mesh(geometry, material);
}

function convertToShadeless(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!isMesh(child)) return;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((source) => {
      const withColor = source as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; wireframe?: boolean };
      return new THREE.MeshBasicMaterial({
        color: withColor.color?.getHex() ?? 0xffffff,
        map: withColor.map ?? null,
        vertexColors: source.vertexColors === true,
        transparent: source.transparent,
        opacity: source.opacity,
        side: source.side,
        alphaTest: source.alphaTest,
        depthTest: source.depthTest,
        depthWrite: source.depthWrite,
        wireframe: withColor.wireframe ?? false
      });
    });
    child.material = materials.length === 1 ? materials[0] : materials;
  });
}

function applyScale(object: THREE.Object3D, scale: EntityDefinition['scale']): void {
  if (scale === undefined) return;
  if (typeof scale === 'number') object.scale.setScalar(scale);
  else object.scale.fromArray(scale);
}

function isolateMaterials(object: THREE.Object3D, includeObjectVariants: boolean): MaterialState[] {
  const clones = new Map<THREE.Material, THREE.Material>();
  const states: MaterialState[] = [];
  const hasNexusVertexColors = object.userData.newHOPNexus?.mesh?.vertex?.color !== undefined;
  object.traverse((child) => {
    if (!isMesh(child)) return;
    const sourceMaterials = (Array.isArray(child.material) ? child.material : [child.material])
      .filter((material): material is THREE.Material => material !== undefined);
    const original = sourceMaterials.map((material) => {
      let clone = clones.get(material);
      if (!clone) {
        clone = material.clone();
        clones.set(material, clone);
      }
      return clone;
    });
    if (hasNexusVertexColors) {
      original.forEach((material) => { material.vertexColors = true; });
    }
    child.material = original.length === 1 ? original[0] : original;
    const state: MaterialState = {
      mesh: child,
      original,
      normal: includeObjectVariants ? original.map((material) => material.clone()) : original
    };
    if (includeObjectVariants) {
      state.uniform = original.map((material) => material.clone());
      state.shadeless = original.map(createShadelessMaterial);
      state.uniformShadeless = original.map(createShadelessMaterial);
    }
    states.push(state);
  });
  return states;
}

function createShadelessMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
  const withColor = source as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; wireframe?: boolean };
  const material = new THREE.MeshBasicMaterial({
    color: withColor.color?.getHex() ?? 0xffffff,
    map: withColor.map ?? null,
    vertexColors: source.vertexColors === true,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    alphaTest: source.alphaTest,
    depthTest: source.depthTest,
    depthWrite: source.depthWrite,
    wireframe: withColor.wireframe ?? false
  });
  return material;
}

function applyMaterialAppearance(source: THREE.Material, material: THREE.Material, definition: EntityDefinition): void {
  if (definition.type === 'hotspot') {
    const withColor = material as THREE.Material & { color?: THREE.Color };
    const color = definition.highlighted
      ? (definition.highlightColor ?? definition.color ?? 0xffcc00)
      : (definition.color ?? 0xffcc00);
    if (withColor.color) withColor.color.setHex(color);
    material.transparent = definition.transparent ?? true;
    material.opacity = definition.highlighted
      ? (definition.highlightAlpha ?? definition.alpha ?? 0.7)
      : (definition.alpha ?? 0.7);
    material.side = definition.doubleSided === false ? THREE.FrontSide : THREE.DoubleSide;
    material.needsUpdate = true;
    return;
  }
  const sourceWithColor = source as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  const withColor = material as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  if (withColor.color && sourceWithColor.color) withColor.color.copy(sourceWithColor.color);
  if ('map' in withColor) withColor.map = sourceWithColor.map ?? null;
  material.vertexColors = source.vertexColors === true;
  material.transparent = source.transparent;
  material.opacity = source.opacity;
  material.side = source.side;
  const materialDefinition = definition as MaterialEntityDefinition;
  if (isMaterialProperties(materialDefinition.material)) applyMaterialProperties(material, materialDefinition.material);
  if (hasObjectAppearance(definition) && definition.uniform) {
    if (withColor.color) withColor.color.setHex(definition.color ?? 0xffffff);
    if ('map' in withColor) withColor.map = null;
    material.vertexColors = false;
  }
  const transparent = definition.transparent ?? false;
  material.transparent = transparent;
  material.depthWrite = transparent ? false : source.depthWrite;
  if (transparent) material.opacity = definition.alpha ?? 0.5;
  if (definition.doubleSided !== undefined) material.side = definition.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  material.needsUpdate = true;
}

function hasObjectAppearance(definition: EntityDefinition): definition is EntityDefinition & { uniform?: boolean; shadeless?: boolean } {
  return definition.type === 'model' || definition.type === 'geometry';
}

function applyMaterialProperties(material: THREE.Material, properties: MaterialProperties): void {
  const target = material as THREE.Material & Record<string, unknown>;
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || !(key in target)) continue;
    if (key.endsWith('Color') || key === 'color' || key === 'emissive') {
      const color = target[key] as THREE.Color | undefined;
      if (color?.isColor) color.setHex(value as number);
    } else {
      target[key] = value;
    }
  }
  material.needsUpdate = true;
}

function isMaterialProperties(value: unknown): value is MaterialProperties {
  return value !== undefined && typeof value === 'object' && !(value as { isMaterial?: boolean }).isMaterial;
}

function isThreeMaterial(value: unknown): value is THREE.Material {
  return (value as THREE.Material | undefined)?.isMaterial === true;
}

function getColorValue(material: THREE.Material, key: string): number | undefined {
  const color = (material as THREE.Material & Record<string, unknown>)[key] as THREE.Color | undefined;
  return color?.isColor ? color.getHex() : undefined;
}

function getNumberValue(material: THREE.Material, key: string): number | undefined {
  const value = (material as THREE.Material & Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

function getNumberValueFromMaterials(materials: THREE.Material[], key: string): number | undefined {
  return getSharedMaterialValue(materials, (material) => getNumberValue(material, key));
}

function getSharedMaterialValue<T>(materials: THREE.Material[], read: (material: THREE.Material) => T | undefined): T | undefined {
  let value: T | undefined;
  for (const material of materials) {
    const next = read(material);
    if (next === undefined) continue;
    if (value === undefined) value = next;
    else if (value !== next) return undefined;
  }
  return value;
}

function applyShadowFlags(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!isMesh(child)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (isMesh(child)) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
  if (typeof object.userData.newHOPNexus?.dispose === 'function') object.userData.newHOPNexus.dispose();
  if (typeof (object as THREE.Object3D & { dispose?: () => void }).dispose === 'function') {
    (object as THREE.Object3D & { dispose: () => void }).dispose();
  }
}

function createAnimationState(object: THREE.Object3D): AnimationState | undefined {
  const clips = object.userData.newHOPAnimations as THREE.AnimationClip[] | undefined;
  if (!clips?.length) return undefined;
  return { mixer: new THREE.AnimationMixer(object), clips, mode: 'loop' };
}

function isPingPongReverse(state: AnimationState): boolean {
  const action = state.action as (THREE.AnimationAction & { _loopCount?: number }) | undefined;
  const loopCount = action?._loopCount ?? -1;
  return action?.loop === THREE.LoopPingPong && loopCount >= 1 && (loopCount & 1) === 1;
}

function getActionTime(state: AnimationState): number {
  if (!state.action) return 0;
  return isPingPongReverse(state)
    ? state.clip!.duration - state.action.time
    : state.action.time;
}

function getClipName(clip: THREE.AnimationClip, index: number): string {
  return clip.name || `Animation ${index + 1}`;
}

function findClip(clips: THREE.AnimationClip[], name: string | undefined): THREE.AnimationClip {
  if (name === undefined) return clips[0];
  const index = clips.findIndex((clip, clipIndex) => getClipName(clip, clipIndex) === name);
  if (index < 0) throw new Error(`Animation "${name}" was not found.`);
  return clips[index];
}

function toThreeLoopMode(mode: AnimationLoopMode): THREE.AnimationActionLoopStyles {
  if (mode === 'once') return THREE.LoopOnce;
  if (mode === 'pingpong') return THREE.LoopPingPong;
  return THREE.LoopRepeat;
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
}
