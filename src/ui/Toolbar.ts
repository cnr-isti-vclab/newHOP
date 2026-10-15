import * as THREE from 'three';
import type { Presenter } from '../core/Presenter';

export type ToolbarPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'left-center' | 'right-center';

export type ToolbarButtonId = 'home' | 'fit' | 'zoomIn' | 'zoomOut' | 'measure' | 'pickpoint' | 'section' | 'camera' | 'fullscreen';
export type ToolbarItemId = ToolbarButtonId | 'spacer' | 'hardrule';
export type ToolbarIcon = string | Node;

export interface ToolbarCustomButton {
  kind: 'custom';
  id: string;
  label: string;
  icon: ToolbarIcon;
  onClick?: (event: MouseEvent) => void;
  toggle?: boolean;
  isActive?: () => boolean;
}

export type ToolbarItem = ToolbarItemId | ToolbarCustomButton;

export interface ToolbarConfig {
  position?: ToolbarPosition;
  buttons?: ToolbarItem[];
  mount?: HTMLElement | string;
  onCustomButton?: (id: string, event: MouseEvent) => void;
}

const DEFAULT_BUTTONS: ToolbarItem[] = ['home', 'fit', 'zoomIn', 'zoomOut', 'fullscreen'];

interface ButtonSpec {
  kind: 'button';
  key: string;
  id: string;
  label: string;
  icon: ToolbarIcon;
  toggle: boolean;
  onClick: (event: MouseEvent) => void;
  isActive: () => boolean;
}

interface LayoutSpec {
  kind: 'spacer' | 'hardrule';
  key: string;
}

type ToolbarSpec = ButtonSpec | LayoutSpec;

const STYLE_ID = 'newhop-toolbar-styles';

/** Minimal built-in on-screen toolbar, wired to a Presenter's public API. Opt-in: not created automatically. */
export class Toolbar {
  private readonly element: HTMLDivElement;
  private readonly specs: ToolbarSpec[];
  private readonly buttonEls = new Map<string, HTMLButtonElement>();
  private readonly pickpointPanel?: HTMLDivElement;
  private readonly unsubscribePickpoint?: () => void;
  private readonly measurementPanel?: HTMLDivElement;
  private readonly unsubscribeMeasurement?: () => void;
  private readonly unsubscribeInteraction?: () => void;
  private measurementHasResult = false;

  constructor(private readonly presenter: Presenter, config: ToolbarConfig = {}) {
    injectStyles();
    const mount = resolveMount(config.mount) ?? presenter.container;
    anchorContainer(mount);

    this.specs = this.createSpecs(config.buttons ?? DEFAULT_BUTTONS, config.onCustomButton);
    this.unsubscribeInteraction = this.presenter.interaction.onModeChange(() => this.refresh());

    this.element = document.createElement('div');
    this.element.className = `newhop-toolbar newhop-toolbar--${config.position ?? 'bottom-center'}`;
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'newhop-toolbar__buttons';
    this.element.appendChild(buttonGroup);
    for (const spec of this.specs) {
      if (spec.kind !== 'button') {
        const layout = document.createElement('div');
        layout.className = `newhop-toolbar__${spec.kind}`;
        layout.setAttribute('aria-hidden', 'true');
        buttonGroup.appendChild(layout);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'newhop-toolbar__button';
      button.title = spec.label;
      button.setAttribute('aria-label', spec.label);
      appendIcon(button, spec.icon);
      button.addEventListener('click', (event) => {
        if (spec.id === 'measure' && this.presenter.getInteractionMode() !== 'distance') this.measurementHasResult = false;
        spec.onClick(event);
        this.refresh();
      });
      this.buttonEls.set(spec.key, button);
      buttonGroup.appendChild(button);
      if (spec.id === 'pickpoint') {
        const panel = createPickpointPanel();
        this.pickpointPanel = panel;
        this.element.appendChild(panel);
        this.unsubscribePickpoint = this.presenter.picking.onPickResult((result) => {
          if (!this.presenter.picking.isEnabled()) return;
          updatePickpointPanel(panel, result);
        });
      }
      if (spec.id === 'measure') {
        const panel = createMeasurementPanel();
        this.measurementPanel = panel;
        this.element.appendChild(panel);
        this.unsubscribeMeasurement = this.presenter.measurement.onCompleteResult((result) => {
          this.measurementHasResult = true;
          updateMeasurementPanel(panel, result.distance);
          this.refresh();
        });
      }
    }
    mount.appendChild(this.element);
    this.refresh();
  }

  setPosition(position: ToolbarPosition): void {
    this.element.className = `newhop-toolbar newhop-toolbar--${position}`;
    this.refresh();
  }

  refresh(): void {
    for (const spec of this.specs) {
      if (spec.kind !== 'button') continue;
      const button = this.buttonEls.get(spec.key);
      if (!button) continue;
      button.classList.toggle('newhop-toolbar__button--active', spec.toggle && spec.isActive());
    }
    if (this.pickpointPanel) {
      const active = this.presenter.getInteractionMode() === 'pickpoint';
      this.pickpointPanel.hidden = !active;
      this.element.classList.toggle('newhop-toolbar--pickpoint-active', active);
    }
    if (this.measurementPanel) {
      const active = this.presenter.getInteractionMode() === 'distance';
      this.measurementPanel.hidden = !active;
      if (active && !this.measurementHasResult) updateMeasurementPanel(this.measurementPanel, undefined);
      this.element.classList.toggle('newhop-toolbar--measurement-active', active);
    }
  }

  dispose(): void {
    this.unsubscribePickpoint?.();
    this.unsubscribeMeasurement?.();
    this.unsubscribeInteraction?.();
    this.element.remove();
  }

  private createSpecs(items: ToolbarItem[], onCustomButton: ToolbarConfig['onCustomButton']): ToolbarSpec[] {
    const seen = new Set<string>();
    const specs: ToolbarSpec[] = [];
    for (const item of items) {
      if (item === 'spacer' || item === 'hardrule') {
        specs.push({ kind: item, key: item });
        continue;
      }
      const key = typeof item === 'string' ? item : `custom:${item.id}`;
      if (seen.has(key)) {
        console.warn(`Toolbar item "${key}" is duplicated; keeping the first occurrence.`);
        continue;
      }
      seen.add(key);
      specs.push(typeof item === 'string'
        ? this.createButtonSpec(item)
        : this.createCustomButtonSpec(item, onCustomButton));
    }
    return specs;
  }

  private createButtonSpec(id: ToolbarButtonId): ButtonSpec {
    const presenter = this.presenter;
    switch (id) {
      case 'home':
        return { kind: 'button', key: id, id, label: 'Reset view', icon: '⌂', toggle: false, onClick: () => presenter.trackball.reset(), isActive: () => false };
      case 'fit':
        return { kind: 'button', key: id, id, label: 'Fit to scene', icon: '⤢', toggle: false, onClick: () => presenter.fitToScene(), isActive: () => false };
      case 'zoomIn':
        return { kind: 'button', key: id, id, label: 'Zoom in', icon: '+', toggle: false, onClick: () => presenter.trackball.dolly(0.8), isActive: () => false };
      case 'zoomOut':
        return { kind: 'button', key: id, id, label: 'Zoom out', icon: '–', toggle: false, onClick: () => presenter.trackball.dolly(1.25), isActive: () => false };
      case 'measure':
        return {
          kind: 'button',
          key: id,
          id,
          label: 'Measure distance',
          icon: '📏',
          toggle: true,
          onClick: () => {
            if (presenter.getInteractionMode() === 'distance') presenter.setInteractionMode('none');
            else presenter.setInteractionMode('distance');
          },
          isActive: () => presenter.getInteractionMode() === 'distance'
        };
      case 'pickpoint':
        return {
          kind: 'button',
          key: id,
          id,
          label: 'Pick point',
          icon: '⌖',
          toggle: true,
          onClick: () => {
            if (presenter.getInteractionMode() === 'pickpoint') presenter.setInteractionMode('none');
            else presenter.setInteractionMode('pickpoint');
          },
          isActive: () => presenter.getInteractionMode() === 'pickpoint'
        };
      case 'section':
        return {
          kind: 'button',
          key: id,
          id,
          label: 'Section plane',
          icon: '◐',
          toggle: true,
          onClick: () => presenter.clipping.toggle(),
          isActive: () => presenter.clipping.isEnabled()
        };
      case 'camera':
        return {
          kind: 'button',
          key: id,
          id,
          label: 'Toggle camera projection',
          icon: '◉',
          toggle: true,
          onClick: () => presenter.setCameraType(presenter.getCameraType() === 'perspective' ? 'orthographic' : 'perspective'),
          isActive: () => presenter.getCameraType() === 'orthographic'
        };
      case 'fullscreen':
        return {
          kind: 'button',
          key: id,
          id,
          label: 'Fullscreen',
          icon: '⛶',
          toggle: true,
          onClick: () => toggleFullscreen(presenter.container),
          isActive: () => document.fullscreenElement === presenter.container
        };
    }
  }

  private createCustomButtonSpec(item: ToolbarCustomButton, onCustomButton: ToolbarConfig['onCustomButton']): ButtonSpec {
    return {
      kind: 'button',
      key: `custom:${item.id}`,
      id: item.id,
      label: item.label,
      icon: item.icon,
      toggle: item.toggle ?? false,
      onClick: item.onClick ?? ((event) => onCustomButton?.(item.id, event)),
      isActive: item.isActive ?? (() => false)
    };
  }
}

function appendIcon(button: HTMLButtonElement, icon: ToolbarIcon): void {
  if (typeof icon === 'string') {
    button.textContent = icon;
  } else {
    button.appendChild(icon.cloneNode(true));
  }
}

function toggleFullscreen(element: HTMLElement): void {
  if (document.fullscreenElement === element) {
    void document.exitFullscreen();
  } else {
    void element.requestFullscreen();
  }
}

function resolveMount(mount: HTMLElement | string | undefined): HTMLElement | undefined {
  if (mount === undefined) return undefined;
  if (typeof mount !== 'string') return mount;
  const element = document.getElementById(mount);
  if (!element) throw new Error(`Toolbar mount element "${mount}" was not found.`);
  return element;
}

function anchorContainer(container: HTMLElement): void {
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.newhop-toolbar {
  position: absolute;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px;
  background: rgba(20, 22, 26, 0.75);
  border-radius: 8px;
  z-index: 10;
}
.newhop-toolbar__buttons { display: flex; gap: 6px; }
.newhop-toolbar__pickpoint-panel {
  min-width: 176px;
  padding: 7px 9px;
  border: 1px solid rgba(125, 211, 252, 0.35);
  border-radius: 6px;
  background: rgba(8, 13, 24, 0.92);
  color: #dbeafe;
  font: 12px/1.35 Consolas, "Courier New", monospace;
  white-space: nowrap;
}
.newhop-toolbar__pickpoint-label { color: #aab4c3; }
.newhop-toolbar__pickpoint-value { margin-top: 2px; }
.newhop-toolbar--top-left,
.newhop-toolbar--top-center,
.newhop-toolbar--top-right { flex-direction: column; }
.newhop-toolbar--bottom-left,
.newhop-toolbar--bottom-center,
.newhop-toolbar--bottom-right { flex-direction: column-reverse; }
.newhop-toolbar--left-center { flex-direction: row; }
.newhop-toolbar--right-center { flex-direction: row-reverse; }
.newhop-toolbar--left-center .newhop-toolbar__buttons,
.newhop-toolbar--right-center .newhop-toolbar__buttons { flex-direction: column; }
.newhop-toolbar--top-left { top: 16px; left: 16px; }
.newhop-toolbar--top-center { top: 16px; left: 50%; transform: translateX(-50%); }
.newhop-toolbar--top-right { top: 16px; right: 16px; }
.newhop-toolbar--bottom-left { bottom: 16px; left: 16px; }
.newhop-toolbar--bottom-center { bottom: 16px; left: 50%; transform: translateX(-50%); }
.newhop-toolbar--bottom-right { bottom: 16px; right: 16px; }
.newhop-toolbar--left-center { top: 50%; left: 16px; transform: translateY(-50%); flex-direction: row; }
.newhop-toolbar--right-center { top: 50%; right: 16px; transform: translateY(-50%); flex-direction: row-reverse; }
.newhop-toolbar__button {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #e8eaed;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.newhop-toolbar__button:hover { background: rgba(255, 255, 255, 0.18); }
.newhop-toolbar__button--active { background: #3a7bd5; color: #fff; }
.newhop-toolbar__spacer { flex: 0 0 12px; width: 12px; height: 12px; }
.newhop-toolbar__hardrule { flex: 0 0 auto; width: 1px; height: 22px; background: rgba(255, 255, 255, 0.28); }
.newhop-toolbar--left-center .newhop-toolbar__spacer,
.newhop-toolbar--right-center .newhop-toolbar__spacer { width: 12px; height: 12px; }
.newhop-toolbar--left-center .newhop-toolbar__hardrule,
.newhop-toolbar--right-center .newhop-toolbar__hardrule { width: 22px; height: 1px; }
`;
  document.head.appendChild(style);
}

function createPickpointPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'newhop-toolbar__pickpoint-panel';
  panel.hidden = true;
  panel.innerHTML = '<div class="newhop-toolbar__pickpoint-label">Object</div><div class="newhop-toolbar__pickpoint-value" data-pickpoint-object>Click an object</div><div class="newhop-toolbar__pickpoint-label">Point</div><div class="newhop-toolbar__pickpoint-value" data-pickpoint-point>[-, -, -]</div>';
  return panel;
}

function createMeasurementPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'newhop-toolbar__pickpoint-panel';
  panel.hidden = true;
  panel.innerHTML = '<div class="newhop-toolbar__pickpoint-label">Distance</div><div class="newhop-toolbar__pickpoint-value" data-measurement-distance>Click two points</div>';
  return panel;
}

function updateMeasurementPanel(panel: HTMLDivElement, distance: number | undefined): void {
  const distanceLabel = panel.querySelector<HTMLElement>('[data-measurement-distance]');
  if (distanceLabel) distanceLabel.textContent = distance === undefined ? 'Click two points' : `${formatCoordinate(distance)} units`;
}

function updatePickpointPanel(panel: HTMLDivElement, result: { point: { x: number; y: number; z: number }; object: THREE.Object3D }): void {
  let entityObject: THREE.Object3D | null = result.object;
  while (entityObject && !entityObject.userData.entity) entityObject = entityObject.parent;
  const entity = entityObject?.userData.entity as { id?: string; type?: string } | undefined;
  if (!entity || (entity.type !== 'model' && entity.type !== 'geometry' && entity.type !== 'splat')) return;
  const objectLabel = panel.querySelector<HTMLElement>('[data-pickpoint-object]');
  const pointLabel = panel.querySelector<HTMLElement>('[data-pickpoint-point]');
  if (objectLabel) objectLabel.textContent = entity?.id ?? 'Unknown object';
  if (pointLabel) pointLabel.textContent = `[${formatCoordinate(result.point.x)}, ${formatCoordinate(result.point.y)}, ${formatCoordinate(result.point.z)}]`;
}

function formatCoordinate(value: number): string {
  return value.toFixed(3);
}
