import * as THREE from 'three';
import type { NavigationHomeView, NavigationLimits, NavigationSpeed, UpAxis } from '../types/SceneTypes';

const DEFAULT_ELEVATION_LIMITS: [number, number] = [
  -Math.PI / 2,
  Math.PI / 2
];

export type TrackballMode = 'turntable' | 'sphere';

export interface TurntableViewpoint {
  mode?: 'turntable';
  target: [number, number, number];
  azimuth: number;
  elevation: number;
  distance: number;
}

export interface SphereViewpoint {
  mode?: 'sphere';
  target: [number, number, number];
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface ViewDirection {
  azimuth: number;
  elevation: number;
}

export interface FitOptions {
  updateStart?: boolean;
  direction?: ViewDirection;
  recenter?: boolean;
  duration?: number;
}

/** Camera-space compatibility snapshot for integrations that need raw camera vectors. */
export interface CameraViewpoint {
  target: [number, number, number];
  position: [number, number, number];
  up: [number, number, number];
}

export type Matrix3Tuple = [
  number, number, number,
  number, number, number,
  number, number, number
];

export interface TurntableOrbitView {
  target: [number, number, number];
  azimuth: number;
  elevation: number;
  distance: number;
}

export interface SphereOrbitView extends TurntableOrbitView {
  roll?: number;
}

export interface MatrixViewpoint {
  target: [number, number, number];
  position: [number, number, number];
  rotation: Matrix3Tuple;
}

export type Viewpoint = TurntableViewpoint | SphereViewpoint;

export interface TrackballStatus {
  mode: TrackballMode;
  upAxis: UpAxis;
  navigationEnabled: boolean;
  target: [number, number, number];
  position: [number, number, number];
  up: [number, number, number];
  azimuth: number;
  elevation: number;
  distance: number;
  speed: {
    rotate: number;
    pan: number;
    zoom: number;
  };
  limits: {
    azimuth: [number | null, number | null];
    elevation: [number, number];
    distance: [number, number];
    pan: {
      x: [number | null, number | null];
      y: [number | null, number | null];
      z: [number | null, number | null];
    };
  };
}

export type TrackballChangeListener = (status: TrackballStatus) => void;

export interface TrackballConfig {
  mode?: TrackballMode;
  upAxis?: UpAxis;
  minDistance?: number;
  maxDistance?: number;
  minAzimuth?: number;
  maxAzimuth?: number;
  minElevation?: number;
  maxElevation?: number;
  rotateSpeed?: number;
  panSpeed?: number;
  zoomSpeed?: number;
}

export class Trackball {
  private camera: THREE.Camera;
  private readonly element: HTMLElement;
  private readonly target = new THREE.Vector3();
  private readonly position = new THREE.Vector3(0, 0, 3);
  private start: Viewpoint = { target: [0, 0, 0], azimuth: 0, elevation: 0, distance: 3 };
  private readonly viewpoints = new Map<string, Viewpoint>();
  private readonly changeListeners = new Set<TrackballChangeListener>();
  private minDistance: number;
  private maxDistance: number;
  private mode: TrackballMode;
  private upAxis: UpAxis;
  private navigationEnabled = true;
  private dragging = false;
  private panning = false;
  private rightButtonActive = false;
  private rightButtonDragged = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;
  private readonly touchPoints = new Map<number, { x: number; y: number }>();
  private touchCentroid = { x: 0, y: 0 };
  private touchDistance = 0;
  private minAzimuth = -Infinity;
  private maxAzimuth = Infinity;
  private minElevation = DEFAULT_ELEVATION_LIMITS[0];
  private maxElevation = DEFAULT_ELEVATION_LIMITS[1];
  private minPan = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  private maxPan = new THREE.Vector3(Infinity, Infinity, Infinity);
  private rotateSpeed = 0.008;
  private panSpeed = 0.0015;
  private zoomSpeed = 0.001;
  private perspectiveFov = 45;
  private azimuth = 0;
  private elevation = 0;
  private distance = 3;
  private spherePosition = new THREE.Vector3(0, 0, 3);
  private sphereQuaternion = new THREE.Quaternion();
  private orthographicZoom = 1;
  private animation: {
    from: Viewpoint;
    to: Viewpoint;
    elapsed: number;
    duration: number;
    fromOrthographicZoom: number;
    toOrthographicZoom: number;
  } | undefined;

  constructor(camera: THREE.Camera, element: HTMLElement, config: TrackballConfig = {}) {
    this.camera = camera;
    this.element = element;
    this.mode = config.mode ?? 'turntable';
    this.upAxis = config.upAxis ?? 'y';
    this.minDistance = config.minDistance ?? 0.01;
    this.maxDistance = config.maxDistance ?? 10000;
    this.minAzimuth = config.minAzimuth ?? -Infinity;
    this.maxAzimuth = config.maxAzimuth ?? Infinity;
    const configuredMinElevation = config.minElevation ?? DEFAULT_ELEVATION_LIMITS[0];
    this.minElevation = THREE.MathUtils.clamp(configuredMinElevation, -Math.PI / 2, Math.PI / 2);
    this.maxElevation = THREE.MathUtils.clamp(
      config.maxElevation ?? DEFAULT_ELEVATION_LIMITS[1],
      this.minElevation,
      Math.PI / 2
    );
    this.rotateSpeed = config.rotateSpeed ?? 0.008;
    this.panSpeed = config.panSpeed ?? 0.0015;
    this.zoomSpeed = config.zoomSpeed ?? 0.001;
    if (camera instanceof THREE.PerspectiveCamera) this.perspectiveFov = camera.fov;
    this.camera.up.set(0, this.upAxis === 'y' ? 1 : 0, this.upAxis === 'z' ? 1 : 0);
    this.element.style.touchAction = 'none';
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerCancel);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenu);
    if (this.mode === 'sphere') {
      this.spherePosition.set(0, this.upAxis === 'z' ? -3 : 0, this.upAxis === 'y' ? 3 : 0);
      this.sphereQuaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(this.spherePosition, this.target, upAxisVector(this.upAxis))
      );
      this.start = this.getViewpoint();
    }
    this.applyOrbit();
  }

  setMode(mode: TrackballMode): void {
    this.changeMode(mode, true);
  }

  private changeMode(mode: TrackballMode, cancelAnimation: boolean): void {
    if (mode === this.mode) return;
    if (mode === 'sphere') {
      this.spherePosition.copy(this.camera.position);
      this.sphereQuaternion.copy(this.camera.quaternion);
    } else {
      const offset = this.spherePosition.clone().sub(this.target);
      this.distance = THREE.MathUtils.clamp(offset.length(), this.minDistance, this.maxDistance);
      if (offset.lengthSq() > Number.EPSILON) {
        if (this.upAxis === 'y') {
          this.azimuth = Math.atan2(offset.x, offset.z);
          this.elevation = Math.asin(THREE.MathUtils.clamp(offset.y / this.distance, -1, 1));
        } else {
          this.azimuth = Math.atan2(offset.x, -offset.y);
          this.elevation = Math.asin(THREE.MathUtils.clamp(offset.z / this.distance, -1, 1));
        }
        this.azimuth = this.normalizeAzimuth(this.azimuth);
        this.elevation = THREE.MathUtils.clamp(this.elevation, this.minElevation, this.maxElevation);
      }
    }
    this.mode = mode;
    if (cancelAnimation) this.animation = undefined;
    this.applyOrbit();
    this.emitChange();
  }

  getMode(): TrackballMode {
    return this.mode;
  }

  setCamera(camera: THREE.Camera): void {
    if (camera instanceof THREE.OrthographicCamera && !(this.camera instanceof THREE.OrthographicCamera)) {
      this.orthographicZoom = 1 / Math.max(
        this.distance * Math.tan(THREE.MathUtils.degToRad(this.perspectiveFov / 2)),
        Number.EPSILON
      );
    }
    this.camera = camera;
    this.applyOrbit();
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  setPerspectiveFov(fov: number): void {
    this.perspectiveFov = fov;
    if (this.camera instanceof THREE.OrthographicCamera) this.applyOrbit();
  }

  setUpAxis(upAxis: UpAxis): void {
    this.upAxis = upAxis;
    this.camera.up.set(0, upAxis === 'y' ? 1 : 0, upAxis === 'z' ? 1 : 0);
    this.applyOrbit();
  }

  getUpAxis(): UpAxis {
    return this.upAxis;
  }

  setNavigationEnabled(enabled: boolean): void {
    this.navigationEnabled = enabled;
    if (!enabled) {
      this.dragging = false;
      this.panning = false;
    }
    this.emitChange();
  }

  isNavigationEnabled(): boolean {
    return this.navigationEnabled;
  }

  onChange(listener: TrackballChangeListener): () => void {
    this.changeListeners.add(listener);
    listener(this.getStatus());
    return () => this.changeListeners.delete(listener);
  }

  getStatus(): TrackballStatus {
    const statusOffset = this.spherePosition.clone().sub(this.target);
    const statusDistance = this.mode === 'sphere' ? statusOffset.length() : this.distance;
    const statusAzimuth = this.mode === 'sphere'
      ? (this.upAxis === 'y' ? Math.atan2(statusOffset.x, statusOffset.z) : Math.atan2(statusOffset.x, -statusOffset.y))
      : this.azimuth;
    const statusElevation = this.mode === 'sphere'
      ? Math.asin(THREE.MathUtils.clamp((this.upAxis === 'y' ? statusOffset.y : statusOffset.z) / Math.max(statusDistance, Number.EPSILON), -1, 1))
      : this.elevation;
    return {
      mode: this.mode,
      upAxis: this.upAxis,
      navigationEnabled: this.navigationEnabled,
      target: this.getViewpoint().target,
      position: this.camera.position.toArray() as [number, number, number],
      up: this.camera.up.toArray() as [number, number, number],
      azimuth: THREE.MathUtils.radToDeg(statusAzimuth),
      elevation: THREE.MathUtils.radToDeg(statusElevation),
      distance: statusDistance,
      speed: {
        rotate: this.rotateSpeed,
        pan: this.panSpeed,
        zoom: this.zoomSpeed
      },
      limits: {
        azimuth: [finiteOrNull(this.minAzimuth === -Infinity ? undefined : THREE.MathUtils.radToDeg(this.minAzimuth)), finiteOrNull(this.maxAzimuth === Infinity ? undefined : THREE.MathUtils.radToDeg(this.maxAzimuth))],
        elevation: [THREE.MathUtils.radToDeg(this.minElevation), THREE.MathUtils.radToDeg(this.maxElevation)],
        distance: [this.minDistance, this.maxDistance],
        pan: {
          x: [finiteOrNull(this.minPan.x), finiteOrNull(this.maxPan.x)],
          y: [finiteOrNull(this.minPan.y), finiteOrNull(this.maxPan.y)],
          z: [finiteOrNull(this.minPan.z), finiteOrNull(this.maxPan.z)]
        }
      }
    };
  }

  setSpeed(speed: NavigationSpeed): void {
    if (speed.rotate !== undefined) this.rotateSpeed = Math.max(0, speed.rotate);
    if (speed.pan !== undefined) this.panSpeed = Math.max(0, speed.pan);
    if (speed.zoom !== undefined) this.zoomSpeed = Math.max(0, speed.zoom);
    this.emitChange();
  }

  setLimits(limits: NavigationLimits): void {
    if (limits.azimuth === 'free' || isLegacyFreeAzimuth(limits.azimuth)) {
      this.minAzimuth = -Infinity;
      this.maxAzimuth = Infinity;
    } else if (limits.azimuth) {
      const [min, max] = normalizeRange(limits.azimuth).map((value) => THREE.MathUtils.degToRad(value));
      this.minAzimuth = min;
      this.maxAzimuth = max;
    }
    if (limits.elevation) {
      const [min, max] = normalizeRange(limits.elevation).map((value) => THREE.MathUtils.degToRad(value));
      this.minElevation = THREE.MathUtils.clamp(min, -Math.PI / 2, Math.PI / 2);
      this.maxElevation = THREE.MathUtils.clamp(max, this.minElevation, Math.PI / 2);
    }
    if (limits.distance) [this.minDistance, this.maxDistance] = normalizeRange(limits.distance);
    if (limits.pan) {
      this.setPanLimit(this.minPan, this.maxPan, 'x', limits.pan.x);
      this.setPanLimit(this.minPan, this.maxPan, 'y', limits.pan.y);
      this.setPanLimit(this.minPan, this.maxPan, 'z', limits.pan.z);
    }
    this.azimuth = THREE.MathUtils.clamp(this.azimuth, this.minAzimuth, this.maxAzimuth);
    this.elevation = THREE.MathUtils.clamp(this.elevation, this.minElevation, this.maxElevation);
    this.distance = THREE.MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);
    this.clampTarget();
    this.applyOrbit();
  }

  setHomeView(homeView: NavigationHomeView): void {
    if (homeView.mode === 'sphere' || (homeView.position && homeView.quaternion)) {
      if (this.mode !== 'sphere') this.setMode('sphere');
      if (homeView.target) this.target.fromArray(homeView.target);
      if (homeView.position) this.spherePosition.fromArray(homeView.position);
      if (homeView.quaternion) this.sphereQuaternion.fromArray(homeView.quaternion).normalize();
      this.clampTarget();
      this.distance = THREE.MathUtils.clamp(this.spherePosition.distanceTo(this.target), this.minDistance, this.maxDistance);
      this.applyOrbit();
      this.start = this.getViewpoint();
      return;
    }
    if (homeView.target) this.target.fromArray(homeView.target);
    this.clampTarget();
    this.azimuth = this.normalizeAzimuth(THREE.MathUtils.degToRad(homeView.azimuth ?? 0));
    this.elevation = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(homeView.elevation ?? 0),
      this.minElevation,
      this.maxElevation
    );
    if (homeView.distance !== undefined) {
      this.distance = THREE.MathUtils.clamp(homeView.distance, this.minDistance, this.maxDistance);
    }
    this.applyOrbit();
    this.start = this.getViewpoint();
  }

  reset(): void {
    this.animation = undefined;
    this.setViewpoint(this.start);
  }

  dolly(factor: number): void {
    this.animation = undefined;
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.orthographicZoom = THREE.MathUtils.clamp(this.orthographicZoom / factor, 0.001, 1000000);
      this.applyOrbit();
      return;
    }
    if (this.mode === 'sphere') {
      const offset = this.spherePosition.clone().sub(this.target);
      const nextDistance = THREE.MathUtils.clamp(offset.length() * factor, this.minDistance, this.maxDistance);
      this.spherePosition.copy(this.target).add(offset.normalize().multiplyScalar(nextDistance));
      this.distance = nextDistance;
    } else {
      this.distance = THREE.MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
    }
    this.applyOrbit();
  }

  recenterOn(point: THREE.Vector3, zoomFactor = 0.85, duration = 0): void {
    this.animation = undefined;
    const from = this.getViewpoint();
    const fromOrthographicZoom = this.orthographicZoom;
    const targetDelta = point.clone().sub(this.target);
    this.target.copy(point);
    this.clampTarget();
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.orthographicZoom = THREE.MathUtils.clamp(this.orthographicZoom / zoomFactor, 0.001, 1000000);
      if (this.mode === 'sphere') {
        this.spherePosition.add(targetDelta);
        this.orientSphereTowardsTarget();
      }
    } else if (this.mode === 'sphere') {
      this.spherePosition.add(targetDelta);
      const offset = this.spherePosition.clone().sub(this.target);
      const nextDistance = THREE.MathUtils.clamp(offset.length() * zoomFactor, this.minDistance, this.maxDistance);
      this.spherePosition.copy(this.target).add(offset.normalize().multiplyScalar(nextDistance));
      this.distance = nextDistance;
      this.orientSphereTowardsTarget();
    } else {
      this.distance = THREE.MathUtils.clamp(this.distance * zoomFactor, this.minDistance, this.maxDistance);
    }
    this.applyOrbit();
    if (duration <= 0) return;
    const to = this.getViewpoint();
    const toOrthographicZoom = this.orthographicZoom;
    this.setViewpoint(from);
    this.orthographicZoom = fromOrthographicZoom;
    this.applyOrbit();
    this.animateToViewpoint(to, duration, toOrthographicZoom);
  }

  fitToBounds(bounds: THREE.Box3, options: FitOptions = {}): void {
    const updateStart = options.updateStart ?? false;
    const duration = Math.max(options.duration ?? 0, 0);
    const azimuth = options.direction
      ? this.normalizeAzimuth(THREE.MathUtils.degToRad(options.direction.azimuth))
      : this.azimuth;
    const elevation = options.direction
      ? THREE.MathUtils.clamp(THREE.MathUtils.degToRad(options.direction.elevation), this.minElevation, this.maxElevation)
      : this.elevation;
    if (bounds.isEmpty()) {
      if (this.mode === 'sphere') {
        const target = new THREE.Vector3();
        const direction = this.spherePosition.clone().sub(this.target).normalize();
        const position = target.clone().add(direction.multiplyScalar(3));
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(position, target, getViewUp(position, target, this.upAxis))
        );
        this.applyFitViewpoint({
          mode: 'sphere',
          target: [0, 0, 0],
          position: position.toArray() as [number, number, number],
          quaternion: quaternion.toArray() as [number, number, number, number]
        }, updateStart, duration);
        return;
      }
      const viewpoint: Viewpoint = {
        target: [0, 0, 0],
        azimuth: THREE.MathUtils.radToDeg(azimuth),
        elevation: THREE.MathUtils.radToDeg(elevation),
        distance: 3
      };
      this.applyFitViewpoint(viewpoint, updateStart, duration);
      return;
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const target = options.recenter ? center : this.target.clone();
    target.x = THREE.MathUtils.clamp(target.x, this.minPan.x, this.maxPan.x);
    target.y = THREE.MathUtils.clamp(target.y, this.minPan.y, this.maxPan.y);
    target.z = THREE.MathUtils.clamp(target.z, this.minPan.z, this.maxPan.z);
    const distance = THREE.MathUtils.clamp(
      calculateFitDistance(bounds, target, azimuth, elevation, this.upAxis, this.camera, this.perspectiveFov),
      this.minDistance,
      this.maxDistance
    );
    if (this.mode === 'sphere') {
      const direction = this.spherePosition.clone().sub(this.target).normalize();
      const position = target.clone().add(direction.multiplyScalar(distance));
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(position, target, getViewUp(position, target, this.upAxis))
      );
      this.applyFitViewpoint({
        mode: 'sphere',
        target: target.toArray() as [number, number, number],
        position: position.toArray() as [number, number, number],
        quaternion: quaternion.toArray() as [number, number, number, number]
      }, updateStart, duration);
      return;
    }
    const viewpoint: Viewpoint = {
      target: target.toArray() as [number, number, number],
      azimuth: THREE.MathUtils.radToDeg(azimuth),
      elevation: THREE.MathUtils.radToDeg(elevation),
      distance
    };
    this.applyFitViewpoint(viewpoint, updateStart, duration);
  }

  getViewpoint(): Viewpoint {
    if (this.mode === 'sphere') {
      return {
        mode: 'sphere',
        target: this.target.toArray() as [number, number, number],
        position: this.spherePosition.toArray() as [number, number, number],
        quaternion: this.sphereQuaternion.toArray() as [number, number, number, number]
      };
    }
    return {
      mode: 'turntable',
      target: this.target.toArray() as [number, number, number],
      azimuth: THREE.MathUtils.radToDeg(this.azimuth),
      elevation: THREE.MathUtils.radToDeg(this.elevation),
      distance: this.distance
    };
  }

  setViewpoint(viewpoint: Viewpoint): void {
    const resolvedViewpoint = this.resolveViewpoint(viewpoint);
    if (isSphereViewpoint(resolvedViewpoint)) {
      if (this.mode !== 'sphere') this.changeMode('sphere', false);
      this.target.fromArray(resolvedViewpoint.target);
      this.spherePosition.fromArray(resolvedViewpoint.position);
      this.sphereQuaternion.fromArray(resolvedViewpoint.quaternion);
      this.distance = THREE.MathUtils.clamp(this.spherePosition.distanceTo(this.target), this.minDistance, this.maxDistance);
      this.applyOrbit();
      return;
    }
    if (this.mode !== 'turntable') this.changeMode('turntable', false);
    this.target.fromArray(resolvedViewpoint.target);
    this.azimuth = this.normalizeAzimuth(THREE.MathUtils.degToRad(resolvedViewpoint.azimuth));
    this.elevation = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(resolvedViewpoint.elevation), this.minElevation, this.maxElevation);
    this.distance = THREE.MathUtils.clamp(resolvedViewpoint.distance, this.minDistance, this.maxDistance);
    this.clampTarget();
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.orthographicZoom = 1 / Math.max(
        this.distance * Math.tan(THREE.MathUtils.degToRad(this.perspectiveFov / 2)),
        Number.EPSILON
      );
    }
    this.applyOrbit();
  }

  getCameraViewpoint(): CameraViewpoint {
    return {
      target: this.target.toArray() as [number, number, number],
      position: this.camera.position.toArray() as [number, number, number],
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).toArray() as [number, number, number]
    };
  }

  setCameraViewpoint(viewpoint: CameraViewpoint): void {
    const offset = new THREE.Vector3().fromArray(viewpoint.position).sub(new THREE.Vector3().fromArray(viewpoint.target));
    const distance = Math.max(offset.length(), this.minDistance);
    if (this.mode === 'sphere') {
      const position = new THREE.Vector3().fromArray(viewpoint.position);
      const target = new THREE.Vector3().fromArray(viewpoint.target);
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(position, target, new THREE.Vector3().fromArray(viewpoint.up))
      );
      this.setViewpoint({
        mode: 'sphere',
        target: viewpoint.target,
        position: viewpoint.position,
        quaternion: quaternion.toArray() as [number, number, number, number]
      });
      return;
    }
    const azimuth = this.upAxis === 'y'
      ? Math.atan2(offset.x, offset.z)
      : Math.atan2(offset.x, -offset.y);
    const verticalOffset = this.upAxis === 'y' ? offset.y : offset.z;
    this.setViewpoint({
      target: viewpoint.target,
      azimuth: THREE.MathUtils.radToDeg(azimuth),
      elevation: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(verticalOffset / distance, -1, 1))),
      distance
    });
  }

  jumpTo(viewpoint: Viewpoint): void {
    this.animation = undefined;
    this.setViewpoint(viewpoint);
  }

  saveViewpoint(name: string): void {
    this.viewpoints.set(name, this.getViewpoint());
  }

  restoreViewpoint(name: string, duration = 0): void {
    const viewpoint = this.viewpoints.get(name);
    if (!viewpoint) throw new Error(`Viewpoint "${name}" was not found.`);
    if (duration <= 0) this.jumpTo(viewpoint);
    else this.animateTo(viewpoint, duration);
  }

  animateTo(viewpoint: Viewpoint, duration = 1500): void {
    this.animateToViewpoint(viewpoint, duration, this.orthographicZoom);
  }

  private animateToViewpoint(viewpoint: Viewpoint, duration: number, toOrthographicZoom: number): void {
    this.animation = {
      from: this.getViewpoint(),
      to: this.resolveViewpoint(viewpoint),
      elapsed: 0,
      duration,
      fromOrthographicZoom: this.orthographicZoom,
      toOrthographicZoom
    };
  }

  private resolveViewpoint(viewpoint: Viewpoint): Viewpoint {
    if (viewpoint.mode !== undefined) return viewpoint;
    return this.mode === 'sphere'
      ? { ...viewpoint, mode: 'sphere' } as SphereViewpoint
      : { ...viewpoint, mode: 'turntable' } as TurntableViewpoint;
  }

  private applyFitViewpoint(viewpoint: Viewpoint, updateStart: boolean, duration: number): void {
    if (updateStart) this.start = viewpoint;
    if (duration > 0) this.animateTo(viewpoint, duration);
    else this.jumpTo(viewpoint);
  }

  private getVisibleHalfHeight(): number {
    if (this.camera instanceof THREE.OrthographicCamera) {
      return 1 / Math.max(this.camera.zoom, Number.EPSILON);
    }
    return this.distance * Math.tan(THREE.MathUtils.degToRad(this.perspectiveFov / 2));
  }

  update(deltaTime: number): void {
    if (!this.animation) return;
    this.animation.elapsed = Math.min(this.animation.elapsed + deltaTime, this.animation.duration);
    const amount = smoothstep(this.animation.elapsed / this.animation.duration);
    this.setViewpoint(interpolateViewpoint(this.animation.from, this.animation.to, amount, this.upAxis));
    this.orthographicZoom = THREE.MathUtils.lerp(
      this.animation.fromOrthographicZoom,
      this.animation.toOrthographicZoom,
      amount
    );
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = this.orthographicZoom;
      this.camera.updateProjectionMatrix();
    }
    if (this.animation.elapsed >= this.animation.duration) this.animation = undefined;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerCancel);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.changeListeners.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.navigationEnabled) return;
    this.animation = undefined;
    if (event.pointerType === 'touch') {
      this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touchPoints.size === 1) {
        this.dragging = true;
        this.pointerId = event.pointerId;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
      } else if (this.touchPoints.size === 2) {
        this.dragging = true;
        this.pointerId = -1;
        this.updateTouchGestureState();
      }
      this.element.setPointerCapture(event.pointerId);
      return;
    }
    this.dragging = true;
    this.panning = event.button === 1 || event.button === 2 || event.shiftKey;
    this.rightButtonActive = event.button === 2;
    if (this.rightButtonActive) this.rightButtonDragged = false;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.element.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.navigationEnabled || !this.dragging) return;
    if (event.pointerType !== 'touch' && event.pointerId !== this.pointerId) return;
    if (event.pointerType === 'touch') {
      if (!this.touchPoints.has(event.pointerId)) return;
      if (this.touchPoints.size >= 2) {
        const previousCentroid = this.touchCentroid;
        const previousDistance = this.touchDistance;
        this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.updateTouchGestureState();
        this.pan(this.touchCentroid.x - previousCentroid.x, this.touchCentroid.y - previousCentroid.y);
        if (previousDistance > Number.EPSILON && this.touchDistance > Number.EPSILON) {
          this.dolly(previousDistance / this.touchDistance);
        }
        return;
      }
    }
    if (event.pointerType === 'touch') {
      this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (this.rightButtonActive && !this.rightButtonDragged && (dx !== 0 || dy !== 0)) {
      this.rightButtonDragged = true;
    }
    if (this.panning) this.pan(dx, dy);
    else this.rotate(dx, dy);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.touchPoints.delete(event.pointerId);
      if (this.touchPoints.size === 0) {
        this.dragging = false;
        this.pointerId = -1;
      } else if (this.touchPoints.size === 1) {
        const [remainingId, remainingPoint] = this.touchPoints.entries().next().value as [number, { x: number; y: number }];
        this.pointerId = remainingId;
        this.lastX = remainingPoint.x;
        this.lastY = remainingPoint.y;
        this.updateTouchGestureState();
      } else {
        this.updateTouchGestureState();
      }
      return;
    }
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.rightButtonActive = false;
    this.pointerId = -1;
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.onPointerUp(event);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.navigationEnabled) return;
    event.preventDefault();
    this.dolly(Math.exp(event.deltaY * this.zoomSpeed));
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (!this.rightButtonDragged) return;
    event.preventDefault();
    this.rightButtonDragged = false;
  };

  private updateTouchGestureState(): void {
    const points = [...this.touchPoints.values()];
    if (points.length < 2) {
      this.touchCentroid = points.length === 1 ? { ...points[0] } : { x: 0, y: 0 };
      this.touchDistance = 0;
      return;
    }
    const [first, second] = points;
    this.touchCentroid = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    this.touchDistance = Math.hypot(second.x - first.x, second.y - first.y);
  }

  private rotate(dx: number, dy: number): void {
    if (this.mode === 'sphere') {
      this.rotateSphere(dx, dy);
      return;
    }
    this.azimuth -= dx * this.rotateSpeed;
    this.elevation += dy * this.rotateSpeed;
    this.azimuth = this.normalizeAzimuth(this.azimuth);
    this.elevation = THREE.MathUtils.clamp(this.elevation, this.minElevation, this.maxElevation);
    this.applyOrbit();
  }

  private pan(dx: number, dy: number): void {
    const scale = this.distance * this.panSpeed;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(-dx * scale);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).multiplyScalar(dy * scale);
    const delta = right.add(up);
    this.target.add(delta);
    if (this.mode === 'sphere') this.spherePosition.add(delta);
    this.clampTarget();
    this.applyOrbit();
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.minPan.x, this.maxPan.x);
    this.target.y = THREE.MathUtils.clamp(this.target.y, this.minPan.y, this.maxPan.y);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.minPan.z, this.maxPan.z);
  }

  private normalizeAzimuth(value: number): number {
    if (Number.isFinite(this.minAzimuth) || Number.isFinite(this.maxAzimuth)) {
      return THREE.MathUtils.clamp(value, this.minAzimuth, this.maxAzimuth);
    }
    return THREE.MathUtils.euclideanModulo(value + Math.PI, Math.PI * 2) - Math.PI;
  }

  private setPanLimit(
    minimum: THREE.Vector3,
    maximum: THREE.Vector3,
    axis: 'x' | 'y' | 'z',
    range?: [number, number]
  ): void {
    if (!range) return;
    const [min, max] = normalizeRange(range);
    minimum[axis] = min;
    maximum[axis] = max;
  }

  private applyOrbit(): void {
    if (this.mode === 'sphere') {
      this.camera.position.copy(this.spherePosition);
      this.camera.quaternion.copy(this.sphereQuaternion);
      if (this.camera instanceof THREE.OrthographicCamera) {
        this.camera.zoom = this.orthographicZoom;
        this.camera.updateProjectionMatrix();
      }
      this.emitChange();
      return;
    }
    const horizontal = Math.cos(this.elevation) * this.distance;
    if (this.upAxis === 'y') {
      this.position.set(
        this.target.x + Math.sin(this.azimuth) * horizontal,
        this.target.y + Math.sin(this.elevation) * this.distance,
        this.target.z + Math.cos(this.azimuth) * horizontal
      );
    } else {
      this.position.set(
        this.target.x + Math.sin(this.azimuth) * horizontal,
        this.target.y - Math.cos(this.azimuth) * horizontal,
        this.target.z + Math.sin(this.elevation) * this.distance
      );
    }
    this.camera.position.copy(this.position);
    const up = getOrbitBasis(this.azimuth, this.elevation, this.upAxis).up;
    this.camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(this.position, this.target, up)
    );
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = this.orthographicZoom;
      this.camera.updateProjectionMatrix();
    }
    this.emitChange();
  }

  private emitChange(): void {
    if (this.changeListeners.size === 0) return;
    const status = this.getStatus();
    for (const listener of this.changeListeners) listener(status);
  }

  private rotateSphere(dx: number, dy: number): void {
    const rect = this.element.getBoundingClientRect();
    const previous = this.arcballPoint(this.lastX - dx, this.lastY - dy, rect);
    const current = this.arcballPoint(this.lastX, this.lastY, rect);
    const localRotation = new THREE.Quaternion().setFromUnitVectors(current, previous);
    const worldRotation = this.sphereQuaternion.clone()
      .multiply(localRotation)
      .multiply(this.sphereQuaternion.clone().invert());
    this.spherePosition.sub(this.target).applyQuaternion(worldRotation).add(this.target);
    this.sphereQuaternion.premultiply(worldRotation).normalize();
    this.applyOrbit();
  }

  private orientSphereTowardsTarget(): void {
    const viewDirection = this.target.clone().sub(this.spherePosition).normalize();
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.sphereQuaternion);
    const rollUp = currentUp.sub(viewDirection.clone().multiplyScalar(currentUp.dot(viewDirection)));
    if (rollUp.lengthSq() <= Number.EPSILON) {
      rollUp.set(0, this.upAxis === 'y' ? 1 : 0, this.upAxis === 'z' ? 1 : 0);
      rollUp.sub(viewDirection.clone().multiplyScalar(rollUp.dot(viewDirection)));
    }
    this.sphereQuaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(this.spherePosition, this.target, rollUp.normalize())
    );
  }

  private arcballPoint(clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 {
    const x = THREE.MathUtils.clamp(((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -1, 1);
    const y = THREE.MathUtils.clamp(-((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1, -1, 1);
    const lengthSq = x * x + y * y;
    return lengthSq <= 1
      ? new THREE.Vector3(x, y, Math.sqrt(1 - lengthSq))
      : new THREE.Vector3(x, y, 0).normalize();
  }

}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

export function sphereViewpointFromOrbit(view: SphereOrbitView, upAxis: UpAxis = 'y'): SphereViewpoint {
  const target = new THREE.Vector3().fromArray(view.target);
  const azimuth = THREE.MathUtils.degToRad(view.azimuth);
  const elevation = THREE.MathUtils.degToRad(view.elevation);
  const horizontal = Math.cos(elevation) * view.distance;
  const position = target.clone();
  if (upAxis === 'y') {
    position.add(new THREE.Vector3(
      Math.sin(azimuth) * horizontal,
      Math.sin(elevation) * view.distance,
      Math.cos(azimuth) * horizontal
    ));
  } else {
    position.add(new THREE.Vector3(
      Math.sin(azimuth) * horizontal,
      -Math.cos(azimuth) * horizontal,
      Math.sin(elevation) * view.distance
    ));
  }
  const quaternion = lookAtQuaternion(position, target, getOrbitBasis(azimuth, elevation, upAxis).up);
  if (view.roll) {
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(view.roll)));
  }
  return {
    mode: 'sphere',
    target: target.toArray() as [number, number, number],
    position: position.toArray() as [number, number, number],
    quaternion: quaternion.toArray() as [number, number, number, number]
  };
}

export function sphereViewpointToOrbit(view: SphereViewpoint, upAxis: UpAxis = 'y'): SphereOrbitView {
  const target = new THREE.Vector3().fromArray(view.target);
  const position = new THREE.Vector3().fromArray(view.position);
  const offset = position.clone().sub(target);
  const distance = offset.length();
  const horizontal = upAxis === 'y'
    ? Math.hypot(offset.x, offset.z)
    : Math.hypot(offset.x, offset.y);
  const azimuth = horizontal <= Number.EPSILON
    ? 0
    : upAxis === 'y' ? Math.atan2(offset.x, offset.z) : Math.atan2(offset.x, -offset.y);
  const vertical = upAxis === 'y' ? offset.y : offset.z;
  const referenceQuaternion = lookAtQuaternion(position, target, getViewUp(position, target, upAxis));
  const actualQuaternion = new THREE.Quaternion().fromArray(view.quaternion);
  const referenceUp = new THREE.Vector3(0, 1, 0).applyQuaternion(referenceQuaternion);
  const actualUp = new THREE.Vector3(0, 1, 0).applyQuaternion(actualQuaternion);
  const forward = target.clone().sub(position).normalize();
  const roll = Math.atan2(forward.dot(referenceUp.clone().cross(actualUp)), referenceUp.dot(actualUp));
  return {
    target: target.toArray() as [number, number, number],
    azimuth: THREE.MathUtils.radToDeg(azimuth),
    elevation: THREE.MathUtils.radToDeg(Math.atan2(vertical, Math.max(horizontal, Number.EPSILON))),
    distance,
    roll: THREE.MathUtils.radToDeg(roll)
  };
}

export function sphereViewpointFromCamera(view: CameraViewpoint): SphereViewpoint {
  const position = new THREE.Vector3().fromArray(view.position);
  const target = new THREE.Vector3().fromArray(view.target);
  const quaternion = lookAtQuaternion(position, target, new THREE.Vector3().fromArray(view.up));
  return {
    mode: 'sphere',
    target: view.target,
    position: view.position,
    quaternion: quaternion.toArray() as [number, number, number, number]
  };
}

export function sphereViewpointToCamera(view: SphereViewpoint): CameraViewpoint {
  const quaternion = new THREE.Quaternion().fromArray(view.quaternion);
  return {
    target: view.target,
    position: view.position,
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).toArray() as [number, number, number]
  };
}

export function turntableViewpointFromCamera(view: CameraViewpoint, upAxis: UpAxis = 'y'): TurntableViewpoint {
  const offset = new THREE.Vector3().fromArray(view.position).sub(new THREE.Vector3().fromArray(view.target));
  const distance = offset.length();
  const azimuth = upAxis === 'y' ? Math.atan2(offset.x, offset.z) : Math.atan2(offset.x, -offset.y);
  const vertical = upAxis === 'y' ? offset.y : offset.z;
  return {
    mode: 'turntable',
    target: view.target,
    azimuth: THREE.MathUtils.radToDeg(azimuth),
    elevation: THREE.MathUtils.radToDeg(Math.atan2(vertical, Math.max(Math.hypot(offset.x, upAxis === 'y' ? offset.z : offset.y), Number.EPSILON))),
    distance
  };
}

export function turntableViewpointToCamera(view: TurntableViewpoint, upAxis: UpAxis = 'y'): CameraViewpoint {
  return sphereViewpointToCamera(sphereViewpointFromOrbit(view, upAxis));
}

export function viewpointToMatrix(view: Viewpoint, upAxis: UpAxis = 'y'): MatrixViewpoint {
  const sphere = isSphereViewpoint(view) ? view : sphereViewpointFromOrbit(view, upAxis);
  const quaternion = new THREE.Quaternion().fromArray(sphere.quaternion);
  const elements = new THREE.Matrix4().makeRotationFromQuaternion(quaternion).elements;
  return {
    target: sphere.target,
    position: sphere.position,
    rotation: [elements[0], elements[1], elements[2], elements[4], elements[5], elements[6], elements[8], elements[9], elements[10]]
  };
}

export function viewpointFromMatrix(view: MatrixViewpoint, mode: TrackballMode, upAxis: UpAxis = 'y'): Viewpoint {
  const rotation = view.rotation;
  const matrix = new THREE.Matrix4().set(
    rotation[0], rotation[3], rotation[6], 0,
    rotation[1], rotation[4], rotation[7], 0,
    rotation[2], rotation[5], rotation[8], 0,
    0, 0, 0, 1
  );
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  const sphere: SphereViewpoint = {
    mode: 'sphere',
    target: view.target,
    position: view.position,
    quaternion: quaternion.toArray() as [number, number, number, number]
  };
  return mode === 'sphere' ? sphere : turntableViewpointFromCamera(sphereViewpointToCamera(sphere), upAxis);
}

function upAxisVector(upAxis: UpAxis): THREE.Vector3 {
  return new THREE.Vector3(0, upAxis === 'y' ? 1 : 0, upAxis === 'z' ? 1 : 0);
}

function getViewUp(position: THREE.Vector3, target: THREE.Vector3, upAxis: UpAxis): THREE.Vector3 {
  const offset = position.clone().sub(target);
  const distance = Math.max(offset.length(), Number.EPSILON);
  const azimuth = upAxis === 'y'
    ? Math.atan2(offset.x, offset.z)
    : Math.atan2(offset.x, -offset.y);
  const elevation = upAxis === 'y'
    ? Math.asin(THREE.MathUtils.clamp(offset.y / distance, -1, 1))
    : Math.asin(THREE.MathUtils.clamp(offset.z / distance, -1, 1));
  const up = upAxisVector(upAxis);
  return Math.abs(offset.normalize().dot(up)) > 1 - Number.EPSILON
    ? getOrbitBasis(azimuth, elevation, upAxis).up
    : up;
}

function lookAtQuaternion(position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const viewDirection = target.clone().sub(position).normalize();
  const safeUp = up.clone();
  if (Math.abs(viewDirection.dot(safeUp.normalize())) > 1 - Number.EPSILON) {
    safeUp.set(Math.abs(viewDirection.y) < 0.9 ? 0 : 1, Math.abs(viewDirection.y) < 0.9 ? 1 : 0, 0);
    safeUp.sub(viewDirection.clone().multiplyScalar(safeUp.dot(viewDirection))).normalize();
  }
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, safeUp));
}

function interpolateViewpoint(from: Viewpoint, to: Viewpoint, amount: number, upAxis: UpAxis): Viewpoint {
  if (isSphereViewpoint(from) || isSphereViewpoint(to)) {
    const sphereFrom = isSphereViewpoint(from) ? from : turntableToSphere(from, upAxis);
    const sphereTo = isSphereViewpoint(to) ? to : turntableToSphere(to, upAxis);
    const quaternion = new THREE.Quaternion().slerpQuaternions(
      new THREE.Quaternion().fromArray(sphereFrom.quaternion),
      new THREE.Quaternion().fromArray(sphereTo.quaternion),
      amount
    );
    return {
      mode: 'sphere',
      target: interpolateTuple(sphereFrom.target, sphereTo.target, amount),
      position: interpolateTuple(sphereFrom.position, sphereTo.position, amount),
      quaternion: quaternion.toArray() as [number, number, number, number]
    };
  }
  return {
    mode: 'turntable',
    target: interpolateTuple(from.target, to.target, amount),
    azimuth: from.azimuth + shortestAngleDelta(from.azimuth, to.azimuth) * amount,
    elevation: THREE.MathUtils.lerp(from.elevation, to.elevation, amount),
    distance: THREE.MathUtils.lerp(from.distance, to.distance, amount)
  };
}

function isSphereViewpoint(viewpoint: Viewpoint): viewpoint is SphereViewpoint {
  return 'position' in viewpoint && 'quaternion' in viewpoint;
}

function turntableToSphere(viewpoint: TurntableViewpoint, upAxis: UpAxis): SphereViewpoint {
  const target = new THREE.Vector3().fromArray(viewpoint.target);
  const elevation = THREE.MathUtils.degToRad(viewpoint.elevation);
  const azimuth = THREE.MathUtils.degToRad(viewpoint.azimuth);
  const horizontal = Math.cos(elevation) * viewpoint.distance;
  const offset = upAxis === 'y'
    ? new THREE.Vector3(
        Math.sin(azimuth) * horizontal,
        Math.sin(elevation) * viewpoint.distance,
        Math.cos(azimuth) * horizontal
      )
    : new THREE.Vector3(
        Math.sin(azimuth) * horizontal,
        -Math.cos(azimuth) * horizontal,
        Math.sin(elevation) * viewpoint.distance
      );
  const position = target.clone().add(offset);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, target, getOrbitBasis(azimuth, elevation, upAxis).up)
  );
  return {
    mode: 'sphere',
    target: target.toArray() as [number, number, number],
    position: position.toArray() as [number, number, number],
    quaternion: quaternion.toArray() as [number, number, number, number]
  };
}

function shortestAngleDelta(from: number, to: number): number {
  return THREE.MathUtils.euclideanModulo(to - from + 180, 360) - 180;
}

function interpolateTuple(from: [number, number, number], to: [number, number, number], amount: number): [number, number, number] {
  return [
    THREE.MathUtils.lerp(from[0], to[0], amount),
    THREE.MathUtils.lerp(from[1], to[1], amount),
    THREE.MathUtils.lerp(from[2], to[2], amount)
  ];
}

function normalizeRange(range: [number, number]): [number, number] {
  return range[0] <= range[1] ? range : [range[1], range[0]];
}

function isLegacyFreeAzimuth(range: [number, number] | 'free' | undefined): boolean {
  return Array.isArray(range) && range[0] === -180 && range[1] === 180;
}

function finiteOrNull(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function calculateFitDistance(
  bounds: THREE.Box3,
  target: THREE.Vector3,
  azimuth: number,
  elevation: number,
  upAxis: UpAxis,
  camera: THREE.Camera,
  perspectiveFov: number
): number {
  const basis = getOrbitBasis(azimuth, elevation, upAxis);
  const aspect = camera instanceof THREE.OrthographicCamera
    ? (camera.right - camera.left) / (camera.top - camera.bottom)
    : (camera as THREE.PerspectiveCamera).aspect;
  const verticalHalfAngle = THREE.MathUtils.degToRad(perspectiveFov / 2);
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect);
  let distance = 0;
  let orthographicHalfHeight = 0;
  for (const corner of getBoxCorners(bounds)) {
    const relative = corner.sub(target);
    const depth = relative.dot(basis.forward);
    const horizontal = Math.abs(relative.dot(basis.right));
    const vertical = Math.abs(relative.dot(basis.up));
    orthographicHalfHeight = Math.max(orthographicHalfHeight, vertical, horizontal / aspect);
    distance = Math.max(
      distance,
      horizontal / Math.tan(horizontalHalfAngle) - depth,
      vertical / Math.tan(verticalHalfAngle) - depth
    );
  }
  return camera instanceof THREE.OrthographicCamera
    ? orthographicHalfHeight / Math.tan(verticalHalfAngle)
    : distance;
}

function getOrbitBasis(azimuth: number, elevation: number, upAxis: UpAxis): {
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
} {
  const horizontal = Math.cos(elevation);
  const offset = upAxis === 'y'
    ? new THREE.Vector3(
        Math.sin(azimuth) * horizontal,
        Math.sin(elevation),
        Math.cos(azimuth) * horizontal
      )
    : new THREE.Vector3(
        Math.sin(azimuth) * horizontal,
        -Math.cos(azimuth) * horizontal,
        Math.sin(elevation)
      );
  const right = upAxis === 'y'
    ? new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth))
    : new THREE.Vector3(Math.cos(azimuth), Math.sin(azimuth), 0);
  const up = upAxis === 'y'
    ? new THREE.Vector3(
        -Math.sin(azimuth) * Math.sin(elevation),
        Math.cos(elevation),
        -Math.cos(azimuth) * Math.sin(elevation)
      )
    : new THREE.Vector3(
        -Math.sin(azimuth) * Math.sin(elevation),
        Math.cos(azimuth) * Math.sin(elevation),
        Math.cos(elevation)
      );
  return { forward: offset.negate(), right, up };
}

function getBoxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
}
