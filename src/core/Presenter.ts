import * as THREE from 'three';
import { SparkRenderer } from '@sparkjsdev/spark';
import type { AnimationClipInfo, CameraProjection, CameraType, EntityDefinition, EntityTransform, EntityTransformSnapshot, GeometryEntity, HelperDefinition, HotspotEntity, HotspotPrimitive, MaterialProperties, ModelEntity, ObjectAnimationOptions, ObjectAnimationState, ObjectAppearance, SceneDescription, SceneObjectDefinition, SceneTransform, SceneTransformSnapshot, SplatEntity, SpotAppearance, SpotDefinition, WorldBackground } from '../types/SceneTypes';
import { EntityManager } from '../managers/EntityManager';
import { ModelLoader } from '../loaders/ModelLoader';
import { Trackball, type TrackballChangeListener, type TrackballStatus, type ViewDirection, type Viewpoint } from '../controls/Trackball';
import { MeasurementManager } from '../managers/MeasurementManager';
import { PickingManager } from '../managers/PickingManager';
import { ClippingManager } from '../managers/ClippingManager';
import { LightingManager, type SceneLightingDescription } from '../managers/LightingManager';
import { VERSION } from '../version';

export interface PresenterConfig {
  mount: HTMLElement | string;
  antialias?: boolean;
  alpha?: boolean;
  shadows?: boolean;
}

export type SceneReadyListener = () => void;

export interface SpotClickEvent {
  id: string;
  point: THREE.Vector3;
  object: THREE.Object3D;
  originalEvent: PointerEvent;
}

export type SpotClickListener = (event: SpotClickEvent) => void;

export class Presenter {
  readonly scene: THREE.Scene;
  camera: THREE.Camera;
  readonly perspectiveCamera: THREE.PerspectiveCamera;
  readonly orthographicCamera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly trackball: Trackball;
  readonly measurement: MeasurementManager;
  readonly picking: PickingManager;
  readonly clipping: ClippingManager;
  readonly lighting: LightingManager;
  private sceneBounds = new THREE.Box3();
  private readonly mount: HTMLElement;
  private readonly root = new THREE.Group();
  private readonly helperRoot = new THREE.Group();
  private readonly extentHelpers = new Set<THREE.Box3Helper>();
  private readonly extentGrids = new Map<THREE.GridHelper, { minimumSize: number; initialSize: number }>();
  private backgroundTexture?: THREE.Texture;
  private readonly sceneReadyListeners = new Set<SceneReadyListener>();
  private readonly objectManager: EntityManager;
  private readonly spotManager: EntityManager;
  private animationFrame = 0;
  private running = false;
  private flashlightMode = false;
  private flashlightPointerId = -1;
  private flashlightLastX = 0;
  private flashlightLastY = 0;
  private spotClickPointerId = -1;
  private spotClickStartX = 0;
  private spotClickStartY = 0;
  private spotClickMoved = false;
  private readonly spotClickListeners = new Set<SpotClickListener>();
  private sparkRenderer?: SparkRenderer;
  private cameraType: CameraType = 'perspective';
  private cameraRangeMode: 'auto' | 'explicit' = 'auto';
  private cameraNear = 0.01;
  private cameraFar = 1000;

  onSpotClicked?: (id: string, event: SpotClickEvent) => void;

  constructor(config: PresenterConfig) {
    console.info(`newHOP v${VERSION}`);
    this.mount = resolveMount(config.mount);
    this.scene = new THREE.Scene();
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, 1, this.cameraNear, this.cameraFar);
    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, this.cameraNear, this.cameraFar);
    this.camera = this.perspectiveCamera;
    this.perspectiveCamera.position.set(0, 0, 3);
    this.orthographicCamera.position.set(0, 0, 3);
    this.renderer = new THREE.WebGLRenderer({
      antialias: config.antialias ?? true,
      alpha: config.alpha ?? false
    });
    this.renderer.shadowMap.enabled = config.shadows ?? true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.mount.appendChild(this.renderer.domElement);
    this.scene.add(this.perspectiveCamera);
    this.trackball = new Trackball(this.camera, this.renderer.domElement);
    this.measurement = new MeasurementManager(this.root, this.camera, this.renderer.domElement);
    this.picking = new PickingManager(this.root, this.camera, this.renderer.domElement);
    this.clipping = new ClippingManager(this.root);
    this.lighting = new LightingManager(this.scene, this.camera, () => this.trackball.getUpAxis());
    this.scene.add(this.root);
    this.scene.add(this.helperRoot);
    const modelLoader = new ModelLoader({ renderer: this.renderer });
    const objectRoot = new THREE.Group();
    const spotRoot = new THREE.Group();
    this.root.add(objectRoot, spotRoot);
    this.objectManager = new EntityManager(objectRoot, modelLoader);
    this.spotManager = new EntityManager(spotRoot, modelLoader);
    this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('resize', this.resize);
    this.start();
  }

  async setScene(sceneDescription: SceneDescription): Promise<void> {
    const objects = sceneDescription.objects ?? {};
    const spots = sceneDescription.spots ?? {};
    const helpers = sceneDescription.helpers ?? {};
    validateBlocks(objects, spots);
    const lighting = sceneDescription.lighting ?? {};
    this.clearScene();
    this.clearBackground();
    this.setSceneTransform(sceneDescription.world?.sceneTransform ?? {});
    if (lighting) {
      this.lighting.setSceneLights(lighting.lights ?? {});
      this.lighting.setFlashlight(lighting.flashlight ?? { enabled: false });
    }
    const world = sceneDescription.world;
    this.cameraRangeMode = 'auto';
    this.setCameraType(world?.camera?.type ?? 'perspective');
    if (world?.camera?.fov !== undefined) this.perspectiveCamera.fov = world.camera.fov;
    this.trackball.setPerspectiveFov(this.perspectiveCamera.fov);
    if (world?.camera?.near !== undefined || world?.camera?.far !== undefined) {
      const near = world.camera.near ?? this.cameraNear;
      const far = world.camera.far ?? this.cameraFar;
      validateCameraClipping(near, far);
      this.cameraNear = near;
      this.cameraFar = far;
      this.cameraRangeMode = 'explicit';
    }
    this.applyCameraProjection();
    const navigation = sceneDescription.navigation;
    this.trackball.setUpAxis(navigation?.upAxis ?? 'y');
    if (world?.background !== undefined) await this.setBackground(world.background);
    if (navigation?.type) this.trackball.setMode(navigation.type);
    if (navigation?.speed) this.trackball.setSpeed(navigation.speed);
    if (navigation?.limits) this.trackball.setLimits(navigation.limits);
    if (navigation?.verticalAxisLocked !== undefined) {
      this.trackball.setVerticalAxisLocked(navigation.verticalAxisLocked);
    }
    this.lighting.update();
    if (navigation?.homeView) {
      this.trackball.setHomeView(navigation.homeView);
    }
    const entityLoads = [
      ...Object.entries(objects).map(([id, object]) => this.addObject(id, object)),
      ...Object.entries(spots).map(([id, spot]) => this.addSpot(id, spot))
    ];
    for (const [id, helper] of Object.entries(helpers)) {
      this.addHelper(id, helper);
    }
    await Promise.all(entityLoads);
    this.refreshSceneBounds();
    this.trackball.fitToBounds(this.sceneBounds, {
      updateStart: true,
      direction: { azimuth: 0, elevation: 0 },
      recenter: true
    });
    if (navigation?.homeView) {
      this.trackball.setHomeView(navigation.homeView);
    }
    for (const listener of this.sceneReadyListeners) listener();
  }

  async addObject(id: string, definition: SceneObjectDefinition): Promise<THREE.Object3D> {
    if (definition.type === 'splat') this.ensureSparkRenderer();
    const added = await this.objectManager.add(toObjectEntity(id, definition));
    this.refreshSceneBounds();
    return added;
  }

  removeObject(id: string): boolean {
    const removed = this.objectManager.remove(id);
    if (removed) this.refreshSceneBounds();
    return removed;
  }

  getObjectIds(): string[] {
    return this.objectManager.getIds();
  }

  getObjectAnimations(id: string): AnimationClipInfo[] {
    return this.objectManager.getAnimations(id);
  }

  getObjectAnimationTime(id: string): number {
    return this.objectManager.getAnimationTime(id);
  }

  onObjectAnimationUpdate(id: string, listener: (state: ObjectAnimationState) => void): () => void {
    return this.objectManager.onAnimationUpdate(id, listener);
  }

  playObjectAnimation(id: string, name: string | undefined, options: ObjectAnimationOptions = {}): void {
    this.objectManager.playAnimation(id, name, options);
  }

  pauseObjectAnimation(id: string): void {
    this.objectManager.pauseAnimation(id);
  }

  resumeObjectAnimation(id: string): void {
    this.objectManager.resumeAnimation(id);
  }

  stopObjectAnimation(id: string): void {
    this.objectManager.stopAnimation(id);
  }

  setObjectAnimationTime(id: string, name: string, time: number): void {
    this.objectManager.setAnimationTime(id, name, time);
  }

  async addSpot(id: string, definition: SpotDefinition): Promise<THREE.Object3D> {
    const added = await this.spotManager.add(toSpotEntity(id, definition));
    this.refreshSceneBounds();
    return added;
  }

  removeSpot(id: string): boolean {
    const removed = this.spotManager.remove(id);
    if (removed) this.refreshSceneBounds();
    return removed;
  }

  getSpotIds(): string[] {
    return this.spotManager.getIds();
  }

  on(type: 'spotclick', listener: SpotClickListener): void {
    if (type === 'spotclick') this.spotClickListeners.add(listener);
  }

  off(type: 'spotclick', listener: SpotClickListener): void {
    if (type === 'spotclick') this.spotClickListeners.delete(listener);
  }

  getSpotAppearance(id: string): SpotAppearance {
    return this.spotManager.getSpotAppearance(id);
  }

  setSpotAppearance(id: string, appearance: Partial<SpotAppearance>): void {
    this.spotManager.setAppearance(id, appearance);
  }

  setSpotHighlighted(id: string, highlighted: boolean): void {
    this.setSpotAppearance(id, { highlighted });
  }

  getHelperIds(): string[] {
    return this.helperRoot.children.map((helper) => helper.name).filter(Boolean);
  }

  getSceneLightIds(): string[] {
    return this.lighting.getSceneLightIds();
  }

  clearScene(): void {
    this.objectManager.clear();
    this.spotManager.clear();
    this.helperRoot.clear();
    this.extentHelpers.clear();
    this.extentGrids.clear();
    resetTransform(this.root);
    this.sceneBounds.makeEmpty();
  }

  fitToScene(direction?: ViewDirection, recenter = false, duration = 0): void {
    this.refreshSceneBounds();
    this.trackball.fitToBounds(this.sceneBounds, {
      direction,
      recenter,
      duration
    });
  }

  getSceneBounds(): THREE.Box3 {
    return this.sceneBounds.clone();
  }

  getEntityTransform(id: string): EntityTransformSnapshot {
    return this.getUnambiguousEntityManager(id).getTransform(id);
  }

  getObjectAppearance(id: string): ObjectAppearance {
    return this.objectManager.getAppearance(id);
  }

  setObjectAppearance(id: string, appearance: Partial<ObjectAppearance>): void {
    this.objectManager.setAppearance(id, appearance);
  }

  getObjectMaterial(id: string): MaterialProperties {
    return this.objectManager.getMaterial(id);
  }

  setObjectMaterial(id: string, material: Partial<MaterialProperties>): void {
    this.objectManager.setMaterial(id, material);
  }

  setEntityTransform(id: string, transform: EntityTransform): void {
    this.getUnambiguousEntityManager(id).setTransform(id, transform);
    this.refreshSceneBounds();
  }

  getSceneTransform(): SceneTransformSnapshot {
    return getTransformSnapshot(this.root);
  }

  setSceneTransform(transform: SceneTransform): void {
    applyTransform(this.root, transform);
    this.refreshSceneBounds();
  }

  getCameraType(): CameraType {
    return this.cameraType;
  }

  setCameraType(type: CameraType): void {
    if (type === this.cameraType) return;
    const previous = this.camera;
    const next = type === 'perspective' ? this.perspectiveCamera : this.orthographicCamera;
    this.trackball.setCamera(next);
    this.camera = next;
    this.cameraType = type;
    this.scene.remove(previous);
    this.scene.add(next);
    this.measurement.setCamera(next);
    this.picking.setCamera(next);
    this.lighting.setCamera(next);
    this.applyCameraProjection();
  }

  getCameraProjection(): CameraProjection {
    return { fov: this.perspectiveCamera.fov, near: this.cameraNear, far: this.cameraFar };
  }

  setCameraProjection(update: Partial<CameraProjection>): void {
    const next = { ...this.getCameraProjection(), ...update };
    validateCameraProjection(next);
    this.perspectiveCamera.fov = next.fov;
    this.cameraNear = next.near;
    this.cameraFar = next.far;
    this.cameraRangeMode = 'explicit';
    this.trackball.setPerspectiveFov(next.fov);
    this.applyCameraProjection();
  }

  getNavigationStatus(): TrackballStatus {
    return this.trackball.getStatus();
  }

  setNavigationEnabled(enabled: boolean): void {
    this.trackball.setNavigationEnabled(enabled);
  }

  isNavigationEnabled(): boolean {
    return this.trackball.isNavigationEnabled();
  }

  onNavigationChange(listener: TrackballChangeListener): () => void {
    return this.trackball.onChange(listener);
  }

  onSceneReady(listener: SceneReadyListener): () => void {
    this.sceneReadyListeners.add(listener);
    return () => this.sceneReadyListeners.delete(listener);
  }

  jumpToViewpoint(viewpoint: Viewpoint): void {
    this.trackball.jumpTo(viewpoint);
  }

  animateToViewpoint(viewpoint: Viewpoint, duration = 1500): void {
    this.trackball.animateTo(viewpoint, duration);
  }

  recenterOnEntityPoint(point: THREE.Vector3, zoomFactor = 0.85): void {
    this.trackball.recenterOn(point, zoomFactor);
  }

  get container(): HTMLElement {
    return this.mount;
  }

  private updateCameraRange(): void {
    if (this.cameraRangeMode === 'auto') {
      const radius = this.sceneBounds.isEmpty() ? 1 : this.sceneBounds.getSize(new THREE.Vector3()).length() / 2;
      this.cameraNear = Math.max(radius / 10000, 0.000001);
      this.cameraFar = Math.max(radius * 100, this.cameraNear + 1);
    }
    this.applyCameraProjection();
  }

  private applyCameraProjection(): void {
    const width = this.mount.clientWidth || 1;
    const height = this.mount.clientHeight || 1;
    const aspect = width / height;
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.near = this.cameraNear;
    this.perspectiveCamera.far = this.cameraFar;
    this.perspectiveCamera.updateProjectionMatrix();
    this.orthographicCamera.left = -aspect;
    this.orthographicCamera.right = aspect;
    this.orthographicCamera.top = 1;
    this.orthographicCamera.bottom = -1;
    this.orthographicCamera.near = this.cameraNear;
    this.orthographicCamera.far = this.cameraFar;
    this.orthographicCamera.updateProjectionMatrix();
  }

  private addHelper(id: string, definition: HelperDefinition): void {
    if (definition.enabled === false) return;

    const size = definition.size ?? 1;
    const spacing = definition.spacing ?? 1;
    const color = definition.color ?? 0x888888;
    const opacity = definition.opacity ?? 0.7;
    const normalizedType = definition.type === 'sceneextent' || definition.type === 'scenebox' ? 'box' : definition.type;

    let helper: THREE.Object3D;
    switch (normalizedType) {
      case 'axes': {
        const axes = new THREE.AxesHelper(size);
        axes.name = id;
        helper = axes;
        break;
      }
      case 'grid': {
        const sceneExtent = this.sceneBounds.isEmpty()
          ? size
          : Math.max(this.sceneBounds.getSize(new THREE.Vector3()).length() * 1.5, size);
        const gridSize = Math.max(sceneExtent, 0.01);
        const step = Math.max(spacing, 0.01);
        const divisions = Math.max(2, Math.ceil(gridSize / step));
        const grid = new THREE.GridHelper(gridSize, divisions, color, color);
        const material = grid.material as THREE.Material & { transparent?: boolean; opacity?: number };
        material.transparent = true;
        material.opacity = opacity;
        if (!this.sceneBounds.isEmpty()) {
          if (this.trackball.getUpAxis() === 'y') grid.position.y = this.sceneBounds.min.y;
          else grid.position.z = this.sceneBounds.min.z;
        }
        grid.name = id;
        this.extentGrids.set(grid, { minimumSize: size, initialSize: gridSize });
        helper = grid;
        break;
      }
      case 'box': {
        const bounds = this.sceneBounds.isEmpty()
          ? new THREE.Box3(
              new THREE.Vector3(-size / 2, -size / 2, -size / 2),
              new THREE.Vector3(size / 2, size / 2, size / 2)
            )
          : this.sceneBounds.clone();
        const box = new THREE.Box3Helper(bounds, color);
        const material = box.material as THREE.Material & { transparent?: boolean; opacity?: number };
        material.transparent = true;
        material.opacity = opacity;
        box.name = id;
        this.extentHelpers.add(box);
        helper = box;
        break;
      }
      default: {
        return;
      }
    }

    helper.visible = definition.visible ?? true;
    if (definition.position) helper.position.set(...definition.position);
    if (definition.rotation) {
      helper.rotation.set(...definition.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    }
    if (normalizedType === 'grid' && this.trackball.getUpAxis() === 'z') {
      helper.rotateX(Math.PI / 2);
    }
    this.helperRoot.add(helper);
  }

  private refreshSceneBounds(): void {
    this.sceneBounds = this.objectManager.getBounds();
    this.updateCameraRange();
    if (this.sceneBounds.isEmpty()) return;
    for (const helper of this.extentHelpers) helper.box.copy(this.sceneBounds);
    for (const [grid, config] of this.extentGrids) {
      const sceneExtent = Math.max(this.sceneBounds.getSize(new THREE.Vector3()).length() * 1.5, config.minimumSize);
      const gridSize = Math.max(sceneExtent, 0.01);
      const scale = gridSize / config.initialSize;
      grid.scale.x = scale;
      grid.scale.z = scale;
      if (this.trackball.getUpAxis() === 'y') {
        grid.position.y = this.sceneBounds.min.y;
      } else {
        grid.position.z = this.sceneBounds.min.z;
      }
    }
  }

  private getUnambiguousEntityManager(id: string): EntityManager {
    const inObjects = this.objectManager.getObject(id) !== undefined;
    const inSpots = this.spotManager.getObject(id) !== undefined;
    if (inObjects && inSpots) {
      throw new Error(`Entity id "${id}" is ambiguous; use the object- or spot-specific API.`);
    }
    if (inObjects) return this.objectManager;
    if (inSpots) return this.spotManager;
    return this.objectManager;
  }

  setEntityVisibility(id: string, visible: boolean): void {
    this.getUnambiguousEntityManager(id).setVisibility(id, visible);
  }

  setEntityColor(id: string, color: number): void {
    this.getUnambiguousEntityManager(id).setColor(id, color);
  }

  setEntityAlpha(id: string, alpha: number): void {
    this.getUnambiguousEntityManager(id).setAlpha(id, alpha);
  }

  setEntityDoubleSided(id: string, doubleSided: boolean): void {
    this.getUnambiguousEntityManager(id).setDoubleSided(id, doubleSided);
  }

  setEntitiesVisibilityByTag(tag: string, visible: boolean): void {
    this.objectManager.setVisibilityByTag(tag, visible);
    this.spotManager.setVisibilityByTag(tag, visible);
  }

  getEntityObject(id: string): THREE.Object3D | undefined {
    return this.getUnambiguousEntityManager(id).getObject(id);
  }

  setMeasurementMode(enabled: boolean): void {
    this.measurement.setEnabled(enabled);
  }

  setPickingMode(enabled: boolean): void {
    this.picking.setEnabled(enabled);
  }

  setFlashlightMode(enabled: boolean): void {
    this.flashlightMode = enabled;
    this.flashlightPointerId = -1;
    this.trackball.setNavigationEnabled(!enabled);
  }

  isFlashlightMode(): boolean {
    return this.flashlightMode;
  }

  setClipPlane(axis: 'x' | 'y' | 'z', offset: number, enabled = true): void {
    this.clipping.setAxis(axis, offset);
    this.clipping.setEnabled(enabled);
  }

  dispose(): void {
    this.stop();
    this.trackball.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('resize', this.resize);
    this.clearScene();
    this.clearBackground();
    this.sceneReadyListeners.clear();
    this.spotClickListeners.clear();
    this.onSpotClicked = undefined;
    this.renderer.dispose();
    if (this.sparkRenderer) {
      this.scene.remove(this.sparkRenderer);
      this.sparkRenderer.geometry.dispose();
      this.sparkRenderer.material.dispose();
      this.sparkRenderer = undefined;
    }
    this.renderer.domElement.remove();
  }

  private ensureSparkRenderer(): void {
    if (this.sparkRenderer) return;
    this.sparkRenderer = new SparkRenderer({
      renderer: this.renderer,
      maxStdDev: Math.sqrt(4)
    });
    this.scene.add(this.sparkRenderer);
  }

  private readonly resize = (): void => {
    const width = this.mount.clientWidth || 1;
    const height = this.mount.clientHeight || 1;
    this.applyCameraProjection();
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.flashlightMode) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.flashlightPointerId = event.pointerId;
      this.flashlightLastX = event.clientX;
      this.flashlightLastY = event.clientY;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }
    this.measurement.handlePointerDown(event);
    this.picking.handlePointerDown(event);
    if (event.button === 0 && event.isPrimary) {
      this.spotClickPointerId = event.pointerId;
      this.spotClickStartX = event.clientX;
      this.spotClickStartY = event.clientY;
      this.spotClickMoved = false;
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.spotClickPointerId) {
      const dx = event.clientX - this.spotClickStartX;
      const dy = event.clientY - this.spotClickStartY;
      if (dx * dx + dy * dy > 25) this.spotClickMoved = true;
    }
    if (!this.flashlightMode || event.pointerId !== this.flashlightPointerId) return;
    event.preventDefault();
    const dx = event.clientX - this.flashlightLastX;
    const dy = event.clientY - this.flashlightLastY;
    this.flashlightLastX = event.clientX;
    this.flashlightLastY = event.clientY;
    const element = this.renderer.domElement;
    this.lighting.adjustFlashlightOrientation(
      -(dx / Math.max(element.clientWidth, 1)) * 180,
      (dy / Math.max(element.clientHeight, 1)) * 180
    );
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.flashlightPointerId) this.flashlightPointerId = -1;
    if (event.pointerId !== this.spotClickPointerId) return;
    const shouldClick = !this.spotClickMoved;
    this.resetSpotClick();
    if (shouldClick) this.dispatchSpotClick(event);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.flashlightPointerId) this.flashlightPointerId = -1;
    if (event.pointerId === this.spotClickPointerId) this.resetSpotClick();
  };

  private resetSpotClick(): void {
    this.spotClickPointerId = -1;
    this.spotClickMoved = false;
  }

  private dispatchSpotClick(event: PointerEvent): void {
    const result = this.picking.pickFromPointer(event.clientX, event.clientY);
    if (!result) return;
    let entityObject: THREE.Object3D | null = result.object;
    while (entityObject && !entityObject.userData.entity) entityObject = entityObject.parent;
    const entity = entityObject?.userData.entity as EntityDefinition | undefined;
    if (!entity || entity.type !== 'hotspot' || !entityObject) return;
    const spotEvent: SpotClickEvent = {
      id: entity.id,
      point: result.point,
      object: entityObject,
      originalEvent: event
    };
    this.onSpotClicked?.(spotEvent.id, spotEvent);
    for (const listener of this.spotClickListeners) listener(spotEvent);
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!this.trackball.isNavigationEnabled()) return;
    const result = this.picking.pickFromPointer(event.clientX, event.clientY);
    if (!result) return;
    let entityObject: THREE.Object3D | null = result.object;
    while (entityObject && !entityObject.userData.entity) entityObject = entityObject.parent;
    const entity = entityObject?.userData.entity as EntityDefinition | undefined;
    if (!entity || entity.type === 'hotspot') return;
    this.trackball.recenterOn(result.point);
  };

  private start(): void {
    if (this.running) return;
    this.running = true;
    let previousTime = performance.now();
    const render = (time: number): void => {
      if (!this.running) return;
      this.animationFrame = requestAnimationFrame(render);
      const deltaSeconds = Math.min(Math.max((time - previousTime) / 1000, 0), 0.1);
      previousTime = time;
      this.trackball.update(deltaSeconds * 1000);
      this.objectManager.updateAnimations(deltaSeconds);
      this.spotManager.updateAnimations(deltaSeconds);
      this.lighting.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.animationFrame = requestAnimationFrame(render);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
  }

  private async setBackground(background: number | WorldBackground): Promise<void> {
    if (typeof background === 'number') {
      this.scene.background = new THREE.Color(background);
      return;
    }
    if ('color' in background) {
      this.scene.background = new THREE.Color(background.color);
      return;
    }

    const texture = await new THREE.TextureLoader().loadAsync(new URL(background.file, window.location.href).href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const azimuth = THREE.MathUtils.degToRad(background.azimuth ?? 0);
    const upAxis = this.trackball.getUpAxis();
    this.scene.backgroundRotation.set(
      upAxis === 'z' ? Math.PI / 2 : 0,
      upAxis === 'y' ? azimuth : 0,
      upAxis === 'z' ? azimuth : 0
    );
    this.backgroundTexture = texture;
    this.scene.background = texture;
  }

  private clearBackground(): void {
    this.scene.background = null;
    this.scene.backgroundRotation.set(0, 0, 0);
    this.backgroundTexture?.dispose();
    this.backgroundTexture = undefined;
  }
}

function resolveMount(mount: HTMLElement | string): HTMLElement {
  if (typeof mount !== 'string') return mount;
  const element = document.getElementById(mount);
  if (!element) throw new Error(`Mount element "${mount}" was not found.`);
  return element;
}

function validateCameraClipping(near: number, far: number): void {
  if (!Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near) {
    throw new Error(`Invalid camera clipping range: near must be positive and far must be greater than near.`);
  }
}

function validateCameraProjection(projection: CameraProjection): void {
  if (!Number.isFinite(projection.fov) || projection.fov <= 0 || projection.fov >= 180) {
    throw new Error(`Invalid camera FOV: expected a value between 0 and 180 degrees.`);
  }
  validateCameraClipping(projection.near, projection.far);
}

function toObjectEntity(id: string, definition: SceneObjectDefinition): ModelEntity | SplatEntity | GeometryEntity {
  assertTransformMode(definition);
  const { file, geometry, material, type, ...rest } = definition;
  if (file && geometry) throw new Error(`Object "${id}" specifies both "file" and "geometry"; only one is allowed.`);
  if (geometry) return { id, type: 'geometry', geometry, material, ...rest };
  if (!file) throw new Error(`Object "${id}" must specify either "file" or "geometry".`);
  if (type === 'splat') return { id, type, file, ...rest };
  return { id, type: 'model', file, material: isMaterialProperties(material) ? material : undefined, ...rest };
}

function isMaterialProperties(value: unknown): value is MaterialProperties {
  return value !== undefined && typeof value === 'object' && !(value as { isMaterial?: boolean }).isMaterial;
}

const HOTSPOT_PRIMITIVES: HotspotPrimitive[] = ['sphere', 'cube'];

function toSpotEntity(id: string, definition: SpotDefinition): HotspotEntity {
  assertTransformMode(definition);
  if (definition.file && definition.geometry) {
    throw new Error(`Spot "${id}" specifies both "file" and "geometry"; only one is allowed.`);
  }
  if (!definition.file && !definition.geometry && definition.primitive === undefined) {
    throw new Error(`Spot "${id}" must specify a primitive, file, or geometry.`);
  }
  if (definition.primitive !== undefined && !HOTSPOT_PRIMITIVES.includes(definition.primitive)) {
    throw new Error(`Spot "${id}" has unknown primitive "${definition.primitive}"; expected one of ${HOTSPOT_PRIMITIVES.join(', ')}.`);
  }
  return { id, type: 'hotspot', primitive: definition.primitive ?? 'sphere', ...definition };
}

function assertTransformMode(definition: EntityTransform): void {
  const hasComponents = definition.position !== undefined || definition.rotation !== undefined || definition.scale !== undefined;
  if (definition.matrix && hasComponents) {
    throw new Error('An entity declaration must use either "matrix" or component fields, not both.');
  }
}

function getTransformSnapshot(object: THREE.Object3D): SceneTransformSnapshot {
  if (object.matrixAutoUpdate) {
    object.updateMatrix();
    return {
      mode: 'components',
      position: object.position.toArray() as [number, number, number],
      rotation: [
        THREE.MathUtils.radToDeg(object.rotation.x),
        THREE.MathUtils.radToDeg(object.rotation.y),
        THREE.MathUtils.radToDeg(object.rotation.z)
      ],
      scale: object.scale.toArray() as [number, number, number],
      matrix: object.matrix.toArray() as SceneTransformSnapshot['matrix']
    };
  }
  return {
    mode: 'matrix',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    matrix: object.matrix.toArray() as SceneTransformSnapshot['matrix']
  };
}

function applyTransform(object: THREE.Object3D, transform: SceneTransform): void {
  const hasComponents = transform.position !== undefined || transform.rotation !== undefined || transform.scale !== undefined;
  if (transform.matrix === undefined && !hasComponents) return;
  if (transform.matrix && hasComponents) {
    throw new Error('A scene transform update must use either "matrix" or component fields, not both.');
  }
  if (transform.matrix) {
    object.matrix.fromArray(transform.matrix);
    object.matrixAutoUpdate = false;
    return;
  }
  const wasMatrixMode = !object.matrixAutoUpdate;
  object.matrixAutoUpdate = true;
  if (wasMatrixMode) resetTransform(object);
  if (transform.position) object.position.fromArray(transform.position);
  if (transform.rotation) {
    object.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
  }
  if (transform.scale !== undefined) applyScale(object, transform.scale);
  object.updateMatrix();
}

function resetTransform(object: THREE.Object3D): void {
  object.matrixAutoUpdate = true;
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrix();
}

function applyScale(object: THREE.Object3D, scale: EntityTransform['scale']): void {
  if (scale === undefined) return;
  if (typeof scale === 'number') object.scale.setScalar(scale);
  else object.scale.fromArray(scale);
}

function validateBlocks(objects: Record<string, SceneObjectDefinition>, spots: Record<string, SpotDefinition>): void {
  const objectIds = Object.keys(objects);
  const spotIds = Object.keys(spots);
  for (const id of [...objectIds, ...spotIds]) {
    if (!id.trim()) throw new Error('Entity ids must be non-empty strings.');
  }
}
