import * as THREE from 'three';
import type { UpAxis } from '../types/SceneTypes';

export type SceneLightType = 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot';

export interface FlashlightConfig {
  enabled?: boolean;
  color?: number;
  intensity?: number;
  azimuth?: number;
  elevation?: number;
}

export interface FlashlightOrientation {
  azimuth: number;
  elevation: number;
}

export interface SceneLightDefinition {
  id?: string;
  type: SceneLightType;
  enabled?: boolean;
  color?: number;
  intensity?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  target?: [number, number, number];
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  groundColor?: number;
  castShadow?: boolean;
}

export interface SceneLightingDescription {
  lights?: Record<string, SceneLightDefinition>;
  flashlight?: FlashlightConfig;
}

export class LightingManager {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly getUpAxis: () => UpAxis;
  private readonly sceneLights = new Map<string, THREE.Light>();
  private readonly sceneLightDefinitions = new Map<string, SceneLightDefinition>();
  private flashlight: THREE.DirectionalLight;
  private flashlightConfig: Required<FlashlightConfig>;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, getUpAxis: () => UpAxis = () => 'y') {
    this.scene = scene;
    this.camera = camera;
    this.getUpAxis = getUpAxis;
    this.flashlight = new THREE.DirectionalLight(0xffffff, 0);
    this.flashlight.visible = false;
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    this.flashlightConfig = {
      enabled: false,
      color: 0xffffff,
      intensity: 1,
      azimuth: 0,
      elevation: 0
    };
    this.applySceneLights([
      ['default-hemisphere', { type: 'hemisphere', color: 0xffffff, groundColor: 0x444444, intensity: 1.2, position: [0, 1, 0] }],
      ['default-key', { type: 'directional', color: 0xffffff, intensity: 1.5, position: [2, 3, 4], target: [0, 0, 0] }]
    ]);
  }

  setSceneLights(sceneLights: Record<string, SceneLightDefinition> = {}): void {
    this.clearSceneLights();
    if (Object.keys(sceneLights).length === 0) {
      this.applySceneLights([
        ['default-hemisphere', { type: 'hemisphere', color: 0xffffff, groundColor: 0x444444, intensity: 1.2, position: [0, 1, 0] }],
        ['default-key', { type: 'directional', color: 0xffffff, intensity: 1.5, position: [2, 3, 4], target: [0, 0, 0] }]
      ]);
      return;
    }
    this.applySceneLights(Object.entries(sceneLights));
  }

  setFlashlight(config: FlashlightConfig = {}): void {
    this.flashlightConfig = {
      ...this.flashlightConfig,
      ...config,
      enabled: config.enabled ?? this.flashlightConfig.enabled
    };
    this.flashlightConfig.azimuth = THREE.MathUtils.clamp(this.flashlightConfig.azimuth, -90, 90);
    this.flashlightConfig.elevation = THREE.MathUtils.clamp(this.flashlightConfig.elevation, -90, 90);
    this.flashlight.color.setHex(this.flashlightConfig.color);
    this.flashlight.intensity = this.flashlightConfig.enabled ? this.flashlightConfig.intensity : 0;
    this.flashlight.visible = this.flashlightConfig.enabled;
    this.updateFlashlightDirection();
  }

  getFlashlight(): FlashlightConfig {
    return { ...this.flashlightConfig };
  }

  getFlashlightOrientation(): FlashlightOrientation {
    return {
      azimuth: this.flashlightConfig.azimuth,
      elevation: this.flashlightConfig.elevation
    };
  }

  setFlashlightOrientation(azimuth: number, elevation: number): void {
    this.setFlashlight({ azimuth, elevation });
  }

  adjustFlashlightOrientation(deltaAzimuth: number, deltaElevation: number): void {
    this.setFlashlightOrientation(
      this.flashlightConfig.azimuth + deltaAzimuth,
      this.flashlightConfig.elevation + deltaElevation
    );
  }

  toggleFlashlight(): void {
    this.setFlashlight({ enabled: !this.flashlightConfig.enabled });
  }

  setSceneLightEnabled(id: string, enabled: boolean): boolean {
    const light = this.sceneLights.get(id);
    if (!light) return false;
    light.visible = enabled;
    const definition = this.sceneLightDefinitions.get(id);
    if (definition) definition.enabled = enabled;
    return true;
  }

  isSceneLightEnabled(id: string): boolean | undefined {
    return this.sceneLights.get(id)?.visible;
  }

  getSceneLight(id: string): SceneLightDefinition | undefined {
    const definition = this.sceneLightDefinitions.get(id);
    return definition ? cloneSceneLightDefinition(definition) : undefined;
  }

  setSceneLight(id: string, definition: SceneLightDefinition): boolean {
    if (!this.sceneLights.has(id)) return false;

    const ambientLikeCount = [...this.sceneLightDefinitions.entries()]
      .filter(([existingId, existing]) => existingId !== id && (existing.type === 'ambient' || existing.type === 'hemisphere'))
      .length + (definition.type === 'ambient' || definition.type === 'hemisphere' ? 1 : 0);
    if (ambientLikeCount > 1) {
      throw new Error('Only one ambient-like scene light is allowed at a time. Use either an ambient or a hemisphere light, not both.');
    }

    this.detachSceneLight(id);
    this.attachSceneLight(id, definition);
    return true;
  }

  addSceneLight(id: string, definition: SceneLightDefinition): boolean {
    if (this.sceneLights.has(id)) return false;
    const ambientLikeCount = [...this.sceneLightDefinitions.values()]
      .filter((existing) => existing.type === 'ambient' || existing.type === 'hemisphere').length;
    if (ambientLikeCount > 0 && (definition.type === 'ambient' || definition.type === 'hemisphere')) {
      throw new Error('Only one ambient-like scene light is allowed at a time. Use either an ambient or a hemisphere light, not both.');
    }
    this.attachSceneLight(id, definition);
    return true;
  }

  removeSceneLight(id: string): boolean {
    if (!this.sceneLights.has(id)) return false;
    this.detachSceneLight(id);
    return true;
  }

  getSceneLightIds(): string[] {
    return [...this.sceneLights.keys()];
  }

  update(): void {
    this.updateFlashlightDirection();
  }

  clearSceneLights(): void {
    for (const id of this.sceneLights.keys()) this.detachSceneLight(id);
    this.sceneLights.clear();
    this.sceneLightDefinitions.clear();
  }

  private applySceneLights(sceneLights: Array<[string, SceneLightDefinition]>): void {
    const ambientLike = sceneLights.filter(([, light]) => light.type === 'ambient' || light.type === 'hemisphere');
    if (ambientLike.length > 1) {
      throw new Error('Only one ambient-like scene light is allowed at a time. Use either an ambient or a hemisphere light, not both.');
    }

    for (const [id, definition] of sceneLights) {
      this.attachSceneLight(id, definition);
    }
  }

  private attachSceneLight(id: string, definition: SceneLightDefinition): void {
    const light = createSceneLight(definition);
    this.sceneLights.set(id, light);
    this.sceneLightDefinitions.set(id, cloneSceneLightDefinition(definition));
    this.scene.add(light);
    if ((light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) && light.castShadow) {
      light.shadow.bias = -0.0001;
      light.shadow.normalBias = 0.02;
    }
    const directionalLike = light as THREE.DirectionalLight | THREE.SpotLight;
    if ('target' in directionalLike && directionalLike.target) {
      const target = definition.target ?? [0, 0, 0];
      directionalLike.target.position.set(target[0], target[1], target[2]);
      this.scene.add(directionalLike.target);
    }
  }

  private detachSceneLight(id: string): void {
    const light = this.sceneLights.get(id);
    if (!light) return;
    this.scene.remove(light);
    const directionalLike = light as THREE.DirectionalLight | THREE.SpotLight;
    if ('target' in directionalLike && directionalLike.target) {
      this.scene.remove(directionalLike.target);
    }
    light.dispose();
    this.sceneLights.delete(id);
    this.sceneLightDefinitions.delete(id);
  }

  private updateFlashlightDirection(): void {
    if (!this.flashlight.visible) return;

    const azimuth = THREE.MathUtils.degToRad(this.flashlightConfig.azimuth);
    const elevation = THREE.MathUtils.degToRad(this.flashlightConfig.elevation);
    const horizontal = Math.cos(elevation);

    const direction = new THREE.Vector3(
      Math.sin(azimuth) * horizontal,
      Math.sin(elevation),
      -Math.cos(azimuth) * horizontal
    );
    direction.normalize();

    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.copy(direction);
  }
}

function cloneSceneLightDefinition(definition: SceneLightDefinition): SceneLightDefinition {
  return {
    ...definition,
    position: definition.position ? [...definition.position] as [number, number, number] : undefined,
    rotation: definition.rotation ? [...definition.rotation] as [number, number, number] : undefined,
    target: definition.target ? [...definition.target] as [number, number, number] : undefined
  };
}

function createSceneLight(definition: SceneLightDefinition): THREE.Light {
  const color = definition.color ?? 0xffffff;
  const intensity = definition.intensity ?? 1;
  const position: [number, number, number] = definition.position ?? (definition.type === 'hemisphere' ? [0, 1, 0] : [0, 0, 0]);
  const rotation = definition.rotation ?? [0, 0, 0];
  const castShadow = definition.castShadow ?? false;
  const light = (() => {
    switch (definition.type) {
      case 'ambient':
        return new THREE.AmbientLight(color, intensity);
      case 'hemisphere':
        return new THREE.HemisphereLight(color, definition.groundColor ?? 0x444444, intensity);
      case 'directional':
        return new THREE.DirectionalLight(color, intensity);
      case 'point':
        return new THREE.PointLight(color, intensity, definition.distance ?? 10, definition.decay ?? 2);
      case 'spot':
        return new THREE.SpotLight(
          color,
          intensity,
          definition.distance ?? 10,
          THREE.MathUtils.degToRad(definition.angle ?? 30),
          definition.penumbra ?? 0.5,
          definition.decay ?? 2
        );
      default:
        throw new Error(`Unsupported scene light type: ${(definition as { type: string }).type}`);
    }
  })();

  light.position.set(position[0], position[1], position[2]);
  if ('rotation' in light && light instanceof THREE.Object3D) {
    light.rotation.set(
      THREE.MathUtils.degToRad(rotation[0]),
      THREE.MathUtils.degToRad(rotation[1]),
      THREE.MathUtils.degToRad(rotation[2])
    );
  }
  if ('castShadow' in light) light.castShadow = castShadow;
  light.visible = definition.enabled ?? true;
  return light;
}
