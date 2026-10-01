import type { Presenter } from '../core/Presenter';

export type ToolbarPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'left-center' | 'right-center';

export type ToolbarButtonId = 'home' | 'fit' | 'zoomIn' | 'zoomOut' | 'measure' | 'section' | 'fullscreen';
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

  constructor(private readonly presenter: Presenter, config: ToolbarConfig = {}) {
    injectStyles();
    const mount = resolveMount(config.mount) ?? presenter.container;
    anchorContainer(mount);

    this.specs = this.createSpecs(config.buttons ?? DEFAULT_BUTTONS, config.onCustomButton);

    this.element = document.createElement('div');
    this.element.className = `newhop-toolbar newhop-toolbar--${config.position ?? 'bottom-center'}`;
    for (const spec of this.specs) {
      if (spec.kind !== 'button') {
        const layout = document.createElement('div');
        layout.className = `newhop-toolbar__${spec.kind}`;
        layout.setAttribute('aria-hidden', 'true');
        this.element.appendChild(layout);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'newhop-toolbar__button';
      button.title = spec.label;
      button.setAttribute('aria-label', spec.label);
      appendIcon(button, spec.icon);
      button.addEventListener('click', (event) => {
        spec.onClick(event);
        this.refresh();
      });
      this.buttonEls.set(spec.key, button);
      this.element.appendChild(button);
    }
    mount.appendChild(this.element);
    this.refresh();
  }

  setPosition(position: ToolbarPosition): void {
    this.element.className = `newhop-toolbar newhop-toolbar--${position}`;
  }

  refresh(): void {
    for (const spec of this.specs) {
      if (spec.kind !== 'button') continue;
      const button = this.buttonEls.get(spec.key);
      if (!button) continue;
      button.classList.toggle('newhop-toolbar__button--active', spec.toggle && spec.isActive());
    }
  }

  dispose(): void {
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
          onClick: () => presenter.setMeasurementMode(!presenter.measurement.isEnabled()),
          isActive: () => presenter.measurement.isEnabled()
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
  gap: 6px;
  padding: 6px;
  background: rgba(20, 22, 26, 0.75);
  border-radius: 8px;
  z-index: 10;
}
.newhop-toolbar--top-left { top: 16px; left: 16px; }
.newhop-toolbar--top-center { top: 16px; left: 50%; transform: translateX(-50%); }
.newhop-toolbar--top-right { top: 16px; right: 16px; }
.newhop-toolbar--bottom-left { bottom: 16px; left: 16px; }
.newhop-toolbar--bottom-center { bottom: 16px; left: 50%; transform: translateX(-50%); }
.newhop-toolbar--bottom-right { bottom: 16px; right: 16px; }
.newhop-toolbar--left-center { top: 50%; left: 16px; transform: translateY(-50%); flex-direction: column; }
.newhop-toolbar--right-center { top: 50%; right: 16px; transform: translateY(-50%); flex-direction: column; }
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
