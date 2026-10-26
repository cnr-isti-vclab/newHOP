import type * as THREE from 'three';

export type EntityType = 'model' | 'pointcloud' | 'splat' | 'hotspot' | 'geometry';
export type ModelFormat = 'auto' | 'nxz' | 'nxs' | 'glb' | 'gltf' | 'ply' | 'obj' | 'stl';
export type EntityBehaviorProfile = 'scene' | 'helper' | 'overlay' | 'interactive-helper';
export type Vector3Tuple = [number, number, number];
/** Euler rotation in degrees for scene authoring. Three.js runtime rotations remain radians. */
export type EulerTuple = [number, number, number];
/** Column-major 4x4 transform matrix, matching THREE.Matrix4.toArray(). */
export type Matrix4Tuple = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export interface EntityVisuals {
  color?: number;
  alpha?: number;
  transparent?: boolean;
  doubleSided?: boolean;
  uniform?: boolean;
  shadeless?: boolean;
  visible?: boolean;
  tags?: string[];
  behavior?: EntityBehaviorProfile;
  participation?: EntityParticipation;
  clippable?: boolean;
  measurable?: boolean;
}

export interface EntityParticipation {
  bounds?: boolean;
  clipping?: boolean;
  picking?: boolean;
  measurement?: boolean;
}

export interface SpotVisuals {
  color?: number;
  alpha?: number;
  highlightColor?: number;
  highlightAlpha?: number;
  highlighted?: boolean;
  transparent?: boolean;
  doubleSided?: boolean;
  visible?: boolean;
  tags?: string[];
  behavior?: EntityBehaviorProfile;
  participation?: EntityParticipation;
  clippable?: boolean;
  measurable?: boolean;
}

export interface SpotAppearance {
  color: number;
  alpha: number;
  highlightColor?: number;
  highlightAlpha?: number;
  highlighted: boolean;
  transparent: boolean;
  doubleSided: boolean;
  visible: boolean;
}

export interface ObjectAppearance {
  color?: number;
  alpha?: number;
  transparent?: boolean;
  doubleSided?: boolean;
  uniform?: boolean;
  shadeless?: boolean;
  visible: boolean;
}

export interface MaterialProperties {
  color?: number;
  roughness?: number;
  metalness?: number;
  specularColor?: number;
  specularIntensity?: number;
  shininess?: number;
  emissive?: number;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

export interface EntityTransform {
  position?: Vector3Tuple;
  rotation?: EulerTuple;
  scale?: Vector3Tuple | number;
  matrix?: Matrix4Tuple;
}

export interface EntityTransformSnapshot {
  readonly mode: 'components' | 'matrix';
  position: Vector3Tuple;
  rotation: EulerTuple;
  scale: Vector3Tuple;
  matrix: Matrix4Tuple;
}

export type AnimationLoopMode = 'once' | 'loop' | 'pingpong';

export interface ObjectAnimationDefinition {
  /** Clip name to play; omitted to play the first clip in the file. */
  clip?: string;
  autoplay?: boolean;
  mode?: AnimationLoopMode;
  repetitions?: number;
  timeScale?: number;
}

export interface ObjectAnimationOptions {
  mode?: AnimationLoopMode;
  repetitions?: number;
  timeScale?: number;
}

export interface AnimationClipInfo {
  name: string;
  duration: number;
}

export interface ObjectAnimationState {
  clip?: string;
  time: number;
  duration: number;
  playing: boolean;
  mode: AnimationLoopMode;
}

export type SceneTransform = EntityTransform;
export type SceneTransformSnapshot = EntityTransformSnapshot;

export type HotspotPrimitive = 'sphere' | 'cube';

/** Authoring shape for an entry of the "objects" block (keyed by id). Either `file` or `geometry` must be set. */
export interface SceneObjectDefinition extends EntityVisuals, EntityTransform {
  type?: 'model' | 'pointcloud' | 'splat';
  format?: ModelFormat;
  file?: string;
  pointSize?: number;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | MaterialProperties;
  materialFile?: string;
  materialPath?: string;
  texture?: string;
  animation?: ObjectAnimationDefinition;
}

/** Authoring shape for an entry of the "spots" block (keyed by id). */
export interface SpotDefinition extends SpotVisuals, EntityTransform {
  primitive?: HotspotPrimitive;
  format?: ModelFormat;
  file?: string;
  geometry?: THREE.BufferGeometry;
  size?: number;
}

/** 3D environment properties: background, camera, and similar world-level settings. */
export interface WorldBackgroundColor {
  color: number;
}

export interface WorldBackgroundImage {
  file: string;
  azimuth?: number;
}

export type WorldBackground = WorldBackgroundColor | WorldBackgroundImage;

export interface WorldConfig {
  background?: number | WorldBackground;
  sceneTransform?: SceneTransform;
  camera?: {
    type?: CameraType;
    fov?: number;
    near?: number;
    far?: number;
  };
}

export type CameraType = 'perspective' | 'orthographic';
export interface CameraProjection {
  fov: number;
  near: number;
  far: number;
}
export type NavigationType = 'turntable' | 'sphere';
export type UpAxis = 'y' | 'z';

export interface NavigationSpeed {
  rotate?: number;
  pan?: number;
  zoom?: number;
}

export interface NavigationHomeView {
  mode?: NavigationType;
  target?: Vector3Tuple;
  azimuth?: number;
  elevation?: number;
  distance?: number;
  position?: Vector3Tuple;
  quaternion?: [number, number, number, number];
}

export interface NavigationTrackballConfig {
  visible?: boolean;
  size?: number;
  color?: number;
  axisColors?: {
    x?: number;
    y?: number;
    z?: number;
  };
  opacity?: number;
  axes?: boolean;
  rings?: boolean;
}

export interface NavigationLimits {
  azimuth?: [number, number] | 'free';
  elevation?: [number, number];
  distance?: [number, number];
  pan?: {
    x?: [number, number];
    y?: [number, number];
    z?: [number, number];
  };
}

export interface NavigationConfig {
  type?: NavigationType;
  upAxis?: UpAxis;
  speed?: NavigationSpeed;
  limits?: NavigationLimits;
  homeView?: NavigationHomeView;
  trackball?: NavigationTrackballConfig;
}

export type HelperType = 'axes' | 'grid' | 'box' | 'sceneextent' | 'scenebox';

export interface HelperDefinition {
  enabled?: boolean;
  type: HelperType;
  size?: number;
  spacing?: number;
  color?: number;
  opacity?: number;
  position?: Vector3Tuple;
  rotation?: EulerTuple;
  visible?: boolean;
}

export interface SceneDescription {
  world?: WorldConfig;
  navigation?: NavigationConfig;
  lighting?: SceneLightingDescription;
  helpers?: Record<string, HelperDefinition>;
  objects?: Record<string, SceneObjectDefinition>;
  spots?: Record<string, SpotDefinition>;
}

export interface SceneLightingDescription {
  lights?: Record<string, SceneLightDefinition>;
  flashlight?: FlashlightConfig;
}

export interface FlashlightConfig {
  enabled?: boolean;
  color?: number;
  intensity?: number;
  /** Direction angles in degrees. */
  azimuth?: number;
  elevation?: number;
}

export interface SceneLightDefinition {
  type: 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot';
  enabled?: boolean;
  color?: number;
  intensity?: number;
  position?: [number, number, number];
  /** Euler rotation in degrees. */
  rotation?: [number, number, number];
  target?: [number, number, number];
  distance?: number;
  decay?: number;
  /** Spot cone angle in degrees. */
  angle?: number;
  penumbra?: number;
  groundColor?: number;
  castShadow?: boolean;
}

// Internal, id-resolved representation consumed by EntityManager once a block entry
// has been merged with its key (id) and disambiguated into a concrete entity type.
export interface ModelEntity extends EntityVisuals, EntityTransform {
  id: string;
  type: 'model';
  format?: ModelFormat;
  file: string;
  material?: MaterialProperties;
  materialFile?: string;
  materialPath?: string;
  texture?: string;
  animation?: ObjectAnimationDefinition;
}

export interface PointCloudEntity extends EntityVisuals, EntityTransform {
  id: string;
  type: 'pointcloud';
  format?: ModelFormat;
  file: string;
  pointSize?: number;
  material?: MaterialProperties;
  materialFile?: string;
  materialPath?: string;
  texture?: string;
}

export interface SplatEntity extends EntityTransform {
  id: string;
  type: 'splat';
  file: string;
  visible?: boolean;
  tags?: string[];
}

export interface HotspotEntity extends SpotVisuals, EntityTransform {
  id: string;
  type: 'hotspot';
  primitive: HotspotPrimitive;
  format?: ModelFormat;
  file?: string;
  geometry?: THREE.BufferGeometry;
  size?: number;
}

export interface GeometryEntity extends EntityVisuals, EntityTransform {
  id: string;
  type: 'geometry';
  geometry: THREE.BufferGeometry;
  material?: THREE.Material | MaterialProperties;
}

export type EntityDefinition = (ModelEntity | PointCloudEntity | SplatEntity | HotspotEntity | GeometryEntity) & Partial<EntityVisuals>;
