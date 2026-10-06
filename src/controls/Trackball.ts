import * as THREE from 'three';
import type { NavigationHomeView, NavigationLimits, NavigationSpeed, UpAxis } from '../types/SceneTypes';

const POLE_EPSILON = THREE.MathUtils.degToRad(0.57);
const DEFAULT_ELEVATION_LIMITS: [number, number] = [
  THREE.MathUtils.degToRad(-70),
  THREE.MathUtils.degToRad(70)
];

export type TrackballMode = 'turntable' | 'sphere';

export interface TurntableViewpoint {
  target: [number, number, number];
  azimuth: number;
  elevation: number;
  distance: number;
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

export type Viewpoint = TurntableViewpoint;

export interface TrackballStatus {
  mode: TrackballMode;
  upAxis: UpAxis;
  navigationEnabled: boolean;
  verticalAxisLocked: boolean;
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
  verticalAxisLocked?: boolean;
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
  private verticalAxisLocked: boolean;
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
  private orthographicZoom = 1;
  private animation: { from: Viewpoint; to: Viewpoint; elapsed: number; duration: number } | undefined;

  constructor(camera: THREE.Camera, element: HTMLElement, config: TrackballConfig = {}) {
    this.camera = camera;
    this.element = element;
    this.mode = config.mode ?? 'turntable';
    this.upAxis = config.upAxis ?? 'y';
    this.verticalAxisLocked = config.verticalAxisLocked ?? false;
    this.minDistance = config.minDistance ?? 0.01;
    this.maxDistance = config.maxDistance ?? 10000;
    this.minAzimuth = config.minAzimuth ?? -Infinity;
    this.maxAzimuth = config.maxAzimuth ?? Infinity;
    this.minElevation = config.minElevation ?? DEFAULT_ELEVATION_LIMITS[0];
    this.maxElevation = config.maxElevation ?? DEFAULT_ELEVATION_LIMITS[1];
    this.rotateSpeed = config.rotateSpeed ?? 0.008;
    this.panSpeed = config.panSpeed ?? 0.0015;
    this.zoomSpeed = config.zoomSpeed ?? 0.001;
    if (camera instanceof THREE.PerspectiveCamera) this.perspectiveFov = camera.fov;
    this.camera.up.set(0, this.upAxis === 'y' ? 1 : 0, this.upAxis === 'z' ? 1 : 0);
    this.element.style.touchAction = 'none';
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenu);
    this.applyOrbit();
  }

  setMode(mode: TrackballMode): void {
    this.mode = mode;
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
    return {
      mode: this.mode,
      upAxis: this.upAxis,
      navigationEnabled: this.navigationEnabled,
      verticalAxisLocked: this.verticalAxisLocked,
      target: this.getViewpoint().target,
      position: this.camera.position.toArray() as [number, number, number],
      up: this.camera.up.toArray() as [number, number, number],
      azimuth: THREE.MathUtils.radToDeg(this.azimuth),
      elevation: THREE.MathUtils.radToDeg(this.elevation),
      distance: this.distance,
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

  setVerticalAxisLocked(locked: boolean): void {
    this.verticalAxisLocked = locked;
    this.emitChange();
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
      this.minElevation = THREE.MathUtils.clamp(min, -Math.PI / 2 + POLE_EPSILON, Math.PI / 2 - POLE_EPSILON);
      this.maxElevation = THREE.MathUtils.clamp(max, this.minElevation, Math.PI / 2 - POLE_EPSILON);
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

  isVerticalAxisLocked(): boolean {
    return this.verticalAxisLocked;
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
    this.distance = THREE.MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
    this.applyOrbit();
  }

  recenterOn(point: THREE.Vector3, zoomFactor = 0.85): void {
    this.animation = undefined;
    this.target.copy(point);
    this.clampTarget();
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.orthographicZoom = THREE.MathUtils.clamp(this.orthographicZoom / zoomFactor, 0.001, 1000000);
      this.applyOrbit();
      return;
    }
    this.distance = THREE.MathUtils.clamp(this.distance * zoomFactor, this.minDistance, this.maxDistance);
    this.applyOrbit();
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
    const viewpoint: Viewpoint = {
      target: target.toArray() as [number, number, number],
      azimuth: THREE.MathUtils.radToDeg(azimuth),
      elevation: THREE.MathUtils.radToDeg(elevation),
      distance
    };
    this.applyFitViewpoint(viewpoint, updateStart, duration);
  }

  getViewpoint(): Viewpoint {
    return {
      target: this.target.toArray() as [number, number, number],
      azimuth: THREE.MathUtils.radToDeg(this.azimuth),
      elevation: THREE.MathUtils.radToDeg(this.elevation),
      distance: this.distance
    };
  }

  setViewpoint(viewpoint: Viewpoint): void {
    this.target.fromArray(viewpoint.target);
    this.azimuth = this.normalizeAzimuth(THREE.MathUtils.degToRad(viewpoint.azimuth));
    this.elevation = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(viewpoint.elevation), this.minElevation, this.maxElevation);
    this.distance = THREE.MathUtils.clamp(viewpoint.distance, this.minDistance, this.maxDistance);
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
      up: this.camera.up.toArray() as [number, number, number]
    };
  }

  setCameraViewpoint(viewpoint: CameraViewpoint): void {
    const offset = new THREE.Vector3().fromArray(viewpoint.position).sub(new THREE.Vector3().fromArray(viewpoint.target));
    const distance = Math.max(offset.length(), this.minDistance);
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
    this.animation = { from: this.getViewpoint(), to: viewpoint, elapsed: 0, duration };
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
    this.setViewpoint(interpolateViewpoint(this.animation.from, this.animation.to, amount));
    if (this.animation.elapsed >= this.animation.duration) this.animation = undefined;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
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
    this.azimuth -= dx * this.rotateSpeed;
    if (!this.verticalAxisLocked) this.elevation += dy * this.rotateSpeed;
    this.azimuth = this.normalizeAzimuth(this.azimuth);
    this.elevation = THREE.MathUtils.clamp(this.elevation, this.minElevation, this.maxElevation);
    this.applyOrbit();
  }

  private pan(dx: number, dy: number): void {
    const scale = this.distance * this.panSpeed;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(-dx * scale);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).multiplyScalar(dy * scale);
    this.target.add(right).add(up);
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
    this.camera.lookAt(this.target);
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

}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function interpolateViewpoint(from: Viewpoint, to: Viewpoint, amount: number): Viewpoint {
  return {
    target: interpolateTuple(from.target, to.target, amount),
    azimuth: from.azimuth + shortestAngleDelta(from.azimuth, to.azimuth) * amount,
    elevation: THREE.MathUtils.lerp(from.elevation, to.elevation, amount),
    distance: THREE.MathUtils.lerp(from.distance, to.distance, amount)
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
        Math.sin(azimuth) * Math.sin(elevation),
        Math.cos(elevation),
        Math.cos(azimuth) * Math.sin(elevation)
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
