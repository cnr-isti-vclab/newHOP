import * as THREE from 'three';

export interface MeasurementHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  object: THREE.Object3D;
}

export interface MeasurementResult {
  start: MeasurementHit;
  end: MeasurementHit;
  distance: number;
  midpoint: THREE.Vector3;
  line: THREE.Line;
}

export type MeasurementListener = (result: MeasurementResult) => void;

export interface MeasurementMarkerOptions {
  visible?: boolean;
  color?: THREE.ColorRepresentation;
  size?: number;
  opacity?: number;
  depthTest?: boolean;
  depthOffset?: number;
}

export interface MeasurementLineOptions {
  visible?: boolean;
  color?: THREE.ColorRepresentation;
  opacity?: number;
  depthTest?: boolean;
}

export interface MeasurementOptions {
  marker?: MeasurementMarkerOptions;
  line?: MeasurementLineOptions;
}

export interface MeasurementDefaults {
  marker: Required<MeasurementMarkerOptions>;
  line: Required<MeasurementLineOptions>;
}

export const MEASUREMENT_DEFAULTS = {
  marker: {
    visible: true,
    color: 0x00ff00,
    size: 9,
    opacity: 1,
    depthTest: true,
    depthOffset: 0.5
  },
  line: {
    visible: true,
    color: 0x00ff00,
    opacity: 1,
    depthTest: true
  }
} as const satisfies MeasurementDefaults;

const MEASUREMENT_CLICK_THRESHOLD = 5;
const MEASUREMENT_MARKER_SIZE_ATTENUATION = false;
const MEASUREMENT_MARKER_DEPTH_WRITE = false;
const MEASUREMENT_MARKER_RENDER_ORDER = 1000;
const MEASUREMENT_LINE_DEPTH_WRITE = true;
const MEASUREMENT_LINE_RENDER_ORDER = 0;
const MEASUREMENT_HIDDEN_LINE_OPACITY = 0.35;
const MEASUREMENT_HIDDEN_LINE_DEPTH_FUNC = THREE.GreaterDepth;
const MEASUREMENT_HIDDEN_LINE_DEPTH_WRITE = false;
const MEASUREMENT_HIDDEN_LINE_RENDER_ORDER = 1;

export class MeasurementManager {
  private readonly root: THREE.Object3D;
  private camera: THREE.Camera;
  private readonly element: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly points: MeasurementHit[] = [];
  private readonly visualGroup = new THREE.Group();
  private enabled = false;
  private markerVisible: boolean = MEASUREMENT_DEFAULTS.marker.visible;
  private markerColor: THREE.ColorRepresentation = MEASUREMENT_DEFAULTS.marker.color;
  private markerSize: number = MEASUREMENT_DEFAULTS.marker.size;
  private markerOpacity: number = MEASUREMENT_DEFAULTS.marker.opacity;
  private markerDepthTest: boolean = MEASUREMENT_DEFAULTS.marker.depthTest;
  private markerDepthOffset: number = MEASUREMENT_DEFAULTS.marker.depthOffset;
  private lineVisible: boolean = MEASUREMENT_DEFAULTS.line.visible;
  private lineColor: THREE.ColorRepresentation = MEASUREMENT_DEFAULTS.line.color;
  private lineOpacity: number = MEASUREMENT_DEFAULTS.line.opacity;
  private lineDepthTest: boolean = MEASUREMENT_DEFAULTS.line.depthTest;
  private hasCompletedMeasurement = false;
  private pendingPointer?: { id: number; x: number; y: number };
  private onComplete?: (result: MeasurementResult) => void;
  private readonly listeners = new Set<MeasurementListener>();

  constructor(root: THREE.Object3D, camera: THREE.Camera, element: HTMLElement) {
    this.root = root;
    this.camera = camera;
    this.element = element;
    this.root.add(this.visualGroup);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setEnabled(enabled: boolean, options?: MeasurementOptions): void {
    if (options?.marker) {
      this.markerVisible = options.marker.visible ?? this.markerVisible;
      this.markerColor = options.marker.color ?? this.markerColor;
      this.markerSize = Math.max(1, options.marker.size ?? this.markerSize);
      this.markerOpacity = THREE.MathUtils.clamp(options.marker.opacity ?? this.markerOpacity, 0, 1);
      this.markerDepthTest = options.marker.depthTest ?? this.markerDepthTest;
      this.markerDepthOffset = Math.max(0, options.marker.depthOffset ?? this.markerDepthOffset);
    }
    if (options?.line) {
      this.lineVisible = options.line.visible ?? this.lineVisible;
      this.lineColor = options.line.color ?? this.lineColor;
      this.lineOpacity = THREE.MathUtils.clamp(options.line.opacity ?? this.lineOpacity, 0, 1);
      this.lineDepthTest = options.line.depthTest ?? this.lineDepthTest;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setOnComplete(callback?: (result: MeasurementResult) => void): void {
    this.onComplete = callback;
  }

  onCompleteResult(listener: MeasurementListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  activate(): void {
    this.enabled = true;
    this.reset();
  }

  deactivate(): void {
    this.enabled = false;
    this.reset();
  }

  reset(): void {
    this.visualGroup.clear();
    this.points.length = 0;
    this.hasCompletedMeasurement = false;
    this.pendingPointer = undefined;
  }

  handlePointerDown(event: PointerEvent): void {
    if (!this.enabled || event.button !== 0 || !event.isPrimary) return;
    this.pendingPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  handlePointerMove(event: PointerEvent): void {
    if (!this.pendingPointer || event.pointerId !== this.pendingPointer.id) return;
    const deltaX = event.clientX - this.pendingPointer.x;
    const deltaY = event.clientY - this.pendingPointer.y;
    if (deltaX * deltaX + deltaY * deltaY > MEASUREMENT_CLICK_THRESHOLD ** 2) this.pendingPointer = undefined;
  }

  handlePointerUp(event: PointerEvent): void {
    if (!this.pendingPointer || event.pointerId !== this.pendingPointer.id) return;
    this.pendingPointer = undefined;
    const hit = this.pickFromPointer(event.clientX, event.clientY);
    if (!hit) return;
    if (this.hasCompletedMeasurement) this.reset();
    this.points.push(hit);
    this.createMarker(hit.point);
    if (this.points.length >= 2) {
      const start = this.points[0];
      const end = this.points[1];
      const distance = start.point.distanceTo(end.point);
      const midpoint = start.point.clone().add(end.point).multiplyScalar(0.5);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start.point, end.point]),
        new THREE.LineBasicMaterial({
          color: this.lineColor,
          opacity: this.lineOpacity,
          transparent: this.lineOpacity < 1,
          depthTest: this.lineDepthTest,
          depthWrite: MEASUREMENT_LINE_DEPTH_WRITE
        })
      );
      line.visible = this.lineVisible;
      line.renderOrder = MEASUREMENT_LINE_RENDER_ORDER;
      this.visualGroup.add(line);
      const hiddenLine = new THREE.Line(
        line.geometry,
        new THREE.LineBasicMaterial({
          color: this.lineColor,
          transparent: true,
          opacity: MEASUREMENT_HIDDEN_LINE_OPACITY,
          depthTest: this.lineDepthTest,
          depthFunc: MEASUREMENT_HIDDEN_LINE_DEPTH_FUNC,
          depthWrite: MEASUREMENT_HIDDEN_LINE_DEPTH_WRITE
        })
      );
      hiddenLine.visible = this.lineVisible;
      hiddenLine.renderOrder = MEASUREMENT_HIDDEN_LINE_RENDER_ORDER;
      this.visualGroup.add(hiddenLine);
      const result: MeasurementResult = { start, end, distance, midpoint, line };
      this.onComplete?.(result);
      for (const listener of this.listeners) listener(result);
      this.points.length = 0;
      this.hasCompletedMeasurement = true;
    }
  }

  handlePointerCancel(event: PointerEvent): void {
    if (this.pendingPointer?.id === event.pointerId) this.pendingPointer = undefined;
  }

  pickFromPointer(clientX: number, clientY: number): MeasurementHit | undefined {
    const rect = this.element.getBoundingClientRect();
    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), this.camera);
    const hits = this.raycaster.intersectObjects(this.root.children, true);
    const hit = hits.find((entry) => !this.isVisualObject(entry.object));
    if (!hit) return undefined;
    const point = hit.point.clone();
    const normal = hit.face?.normal ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point, normal, object: hit.object };
  }

  private createMarker(position: THREE.Vector3): void {
    const markerPosition = position.clone();
    const towardCamera = this.camera.position.clone().sub(position).normalize();
    const height = Math.max(this.element.clientHeight, 1);
    let worldUnitsPerPixel: number;
    if (this.camera instanceof THREE.OrthographicCamera) {
      worldUnitsPerPixel = (this.camera.top - this.camera.bottom) / this.camera.zoom / height;
    } else if (this.camera instanceof THREE.PerspectiveCamera) {
      const distance = position.distanceTo(this.camera.position);
      worldUnitsPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / height;
    } else {
      worldUnitsPerPixel = 0;
    }
    markerPosition.addScaledVector(towardCamera, worldUnitsPerPixel * this.markerDepthOffset);
    const marker = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([markerPosition]),
      new THREE.PointsMaterial({
        color: this.markerColor,
        size: this.markerSize,
        opacity: this.markerOpacity,
        transparent: this.markerOpacity < 1,
        sizeAttenuation: MEASUREMENT_MARKER_SIZE_ATTENUATION,
        depthTest: this.markerDepthTest,
        depthWrite: MEASUREMENT_MARKER_DEPTH_WRITE
      })
    );
    marker.frustumCulled = false;
    marker.renderOrder = MEASUREMENT_MARKER_RENDER_ORDER;
    marker.visible = this.enabled && this.markerVisible;
    this.visualGroup.add(marker);
  }

  private isVisualObject(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === this.visualGroup) return true;
      current = current.parent;
    }
    return false;
  }

  dispose(): void {
    this.reset();
    this.listeners.clear();
    this.onComplete = undefined;
    this.root.remove(this.visualGroup);
  }
}
