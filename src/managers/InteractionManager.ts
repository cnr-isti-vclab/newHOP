import type { MeasurementListener, MeasurementManager, MeasurementOptions } from './MeasurementManager';
import type { PickListener, PickingManager, PickingOptions } from './PickingManager';

export type InteractionMode = 'none' | 'pickpoint' | 'distance';

export interface PickpointInteractionOptions extends PickingOptions {
  handlers?: {
    onPick?: PickListener;
  };
}

export interface DistanceInteractionOptions extends MeasurementOptions {
  handlers?: {
    onComplete?: MeasurementListener;
  };
}

export type InteractionOptions = PickpointInteractionOptions | DistanceInteractionOptions;
export type InteractionModeListener = (mode: InteractionMode) => void;

export class InteractionManager {
  private mode: InteractionMode = 'none';
  private readonly listeners = new Set<InteractionModeListener>();

  constructor(
    private readonly picking: PickingManager,
    private readonly measurement: MeasurementManager
  ) {}

  getMode(): InteractionMode {
    return this.mode;
  }

  onModeChange(listener: InteractionModeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMode(mode: 'none'): void;
  setMode(mode: 'pickpoint', options?: PickpointInteractionOptions): void;
  setMode(mode: 'distance', options?: DistanceInteractionOptions): void;
  setMode(mode: InteractionMode, options?: InteractionOptions): void {
    this.close(false);
    if (mode === 'none') {
      this.emitModeChange();
      return;
    }

    if (mode === 'pickpoint') {
      const pickpointOptions = options as PickpointInteractionOptions | undefined;
      this.picking.setOnPick(pickpointOptions?.handlers?.onPick);
      this.picking.setEnabled(true, pickpointOptions);
    } else {
      const distanceOptions = options as DistanceInteractionOptions | undefined;
      this.measurement.setOnComplete(distanceOptions?.handlers?.onComplete);
      this.measurement.setEnabled(true, distanceOptions);
    }
    this.mode = mode;
    this.emitModeChange();
  }

  handlePointerDown(event: PointerEvent): void {
    if (this.mode === 'pickpoint') this.picking.handlePointerDown(event);
    if (this.mode === 'distance') this.measurement.handlePointerDown(event);
  }

  handlePointerMove(event: PointerEvent): void {
    if (this.mode === 'pickpoint') this.picking.handlePointerMove(event);
    if (this.mode === 'distance') this.measurement.handlePointerMove(event);
  }

  handlePointerUp(event: PointerEvent): void {
    if (this.mode === 'pickpoint') this.picking.handlePointerUp(event);
    if (this.mode === 'distance') this.measurement.handlePointerUp(event);
  }

  handlePointerCancel(event: PointerEvent): void {
    if (this.mode === 'pickpoint') this.picking.handlePointerCancel(event);
    if (this.mode === 'distance') this.measurement.handlePointerCancel(event);
  }

  dispose(): void {
    this.close();
    this.listeners.clear();
  }

  private close(notify = true): void {
    this.picking.setOnPick(undefined);
    this.measurement.setOnComplete(undefined);
    this.picking.setEnabled(false);
    this.measurement.setEnabled(false);
    this.mode = 'none';
    if (notify) this.emitModeChange();
  }

  private emitModeChange(): void {
    for (const listener of this.listeners) listener(this.mode);
  }
}
