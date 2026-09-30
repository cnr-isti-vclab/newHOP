import type { Presenter } from '../core/Presenter';

export type ToolbarPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'left-center' | 'right-center';

export type ToolbarButtonId = 'home' | 'fit' | 'zoomIn' | 'zoomOut' | 'measure' | 'section' | 'fullscreen';

export interface ToolbarConfig {
  position?: ToolbarPosition;
  buttons?: ToolbarButtonId[];
  mount?: HTMLElement | string;
}

const DEFAULT_BUTTONS: ToolbarButtonId[] = ['home', 'fit', 'zoomIn', 'zoomOut', 'measure', 'section', 'fullscreen'];

interface ButtonSpec {
  id: ToolbarButtonId;
  label: string;
  icon: string;
  toggle: boolean;
  onClick: () => void;
  isActive: () => boolean;
}

const STYLE_ID = 'newhop-toolbar-styles';

/** Minimal built-in on-screen toolbar, wired to a Presenter's public API. Opt-in: not created automatically. */
export class Toolbar {
  private readonly element: HTMLDivElement;
  private readonly specs: ButtonSpec[];
  private readonly buttonEls = new Map<ToolbarButtonId, HTMLButtonElement>();

  constructor(private readonly presenter: Presenter, config: ToolbarConfig = {}) {
    injectStyles();
    const mount = resolveMount(config.mount) ?? presenter.container;
    anchorContainer(mount);

    this.specs = (config.buttons ?? DEFAULT_BUTTONS).map((id) => this.createButtonSpec(id));

    this.element = document.createElement('div');
    this.element.className = `newhop-toolbar newhop-toolbar--${config.position ?? 'bottom-center'}`;
    for (const spec of this.specs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'newhop-toolbar__button';
      button.title = spec.label;
      button.setAttribute('aria-label', spec.label);
      button.innerHTML = spec.icon;
      button.addEventListener('click', () => {
        spec.onClick();
        this.refresh();
      });
      this.buttonEls.set(spec.id, button);
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
      const button = this.buttonEls.get(spec.id);
      if (!button) continue;
      button.classList.toggle('newhop-toolbar__button--active', spec.toggle && spec.isActive());
    }
  }

  dispose(): void {
    this.element.remove();
  }

  private createButtonSpec(id: ToolbarButtonId): ButtonSpec {
    const presenter = this.presenter;
    switch (id) {
      case 'home':
        return { id, label: 'Reset view', icon: '⌂', toggle: false, onClick: () => presenter.trackball.reset(), isActive: () => false };
      case 'fit':
        return { id, label: 'Fit to scene', icon: '⤢', toggle: false, onClick: () => presenter.fitToScene(), isActive: () => false };
      case 'zoomIn':
        return { id, label: 'Zoom in', icon: '+', toggle: false, onClick: () => presenter.trackball.dolly(0.8), isActive: () => false };
      case 'zoomOut':
        return { id, label: 'Zoom out', icon: '–', toggle: false, onClick: () => presenter.trackball.dolly(1.25), isActive: () => false };
      case 'measure':
        return {
          id,
          label: 'Measure distance',
          icon: '📏',
          toggle: true,
          onClick: () => presenter.setMeasurementMode(!presenter.measurement.isEnabled()),
          isActive: () => presenter.measurement.isEnabled()
        };
      case 'section':
        return {
          id,
          label: 'Section plane',
          icon: '◐',
          toggle: true,
          onClick: () => presenter.clipping.toggle(),
          isActive: () => presenter.clipping.isEnabled()
        };
      case 'fullscreen':
        return {
          id,
          label: 'Fullscreen',
          icon: '⛶',
          toggle: true,
          onClick: () => toggleFullscreen(presenter.container),
          isActive: () => document.fullscreenElement === presenter.container
        };
    }
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
`;
  document.head.appendChild(style);
}
