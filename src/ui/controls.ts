// src/ui/controls.ts
// Simulation control panel
import type { SimulationConfig } from '../simulation/types.ts';
import type { AggregatedStats } from '../simulation/types.ts';
import { THEME } from './theme.ts';

export interface ControlsState {
  games: number;
  depth: number;
  speed: 'instant' | 'watch' | 'step';
  chessBackend: 'minimax' | 'stockfish';
  cardBackend: 'heuristic' | 'claude';
  running: boolean;
}

export class ControlsPanel {
  private container: HTMLElement;
  private progressEl: HTMLElement | null = null;
  private state: ControlsState = {
    games: 100,
    depth: 2,
    speed: 'instant',
    chessBackend: 'minimax',
    cardBackend: 'heuristic',
    running: false,
  };

  onRun?: (cfg: ControlsState) => void;
  onPause?: () => void;
  onStop?: () => void;
  onExportJSON?: () => void;
  onExportCSV?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  setRunning(running: boolean): void {
    this.state.running = running;
    this.progressEl = null;
    this.render();
  }

  setProgress(done: number, total: number): void {
    if (!this.progressEl) return;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this.progressEl.style.width = pct + '%';
    this.progressEl.title = `${done} / ${total} games`;
    // Update the text label next to it if present
    const label = this.progressEl.parentElement?.querySelector('span');
    if (label) label.textContent = `${done} / ${total}`;
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.style.cssText = `
      background: ${THEME.panel}; border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 10px;
    `;

    // Games input
    this.container.appendChild(this.field('Games', 'number', String(this.state.games), (v) => {
      this.state.games = parseInt(v, 10) || 100;
    }));

    // Depth
    this.container.appendChild(this.radioGroup('Depth', ['1', '2', '3'], String(this.state.depth), (v) => {
      this.state.depth = parseInt(v, 10);
    }));

    // Speed
    this.container.appendChild(this.radioGroup('Speed', ['instant', 'watch', 'step'], this.state.speed, (v) => {
      this.state.speed = v as ControlsState['speed'];
    }));

    // AI selectors
    this.container.appendChild(this.radioGroup('Chess AI', ['minimax', 'stockfish'], this.state.chessBackend, (v) => {
      this.state.chessBackend = v as 'minimax' | 'stockfish';
    }));
    this.container.appendChild(this.radioGroup('Card AI', ['heuristic', 'claude'], this.state.cardBackend, (v) => {
      this.state.cardBackend = v as 'heuristic' | 'claude';
    }));

    // Buttons
    const btns = document.createElement('div');
    btns.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

    if (!this.state.running) {
      btns.appendChild(this.btn('▶ Run', '#2a7a2a', () => this.onRun?.(this.state)));
    } else {
      btns.appendChild(this.btn('⏸ Pause', '#7a7a00', () => this.onPause?.()));
      btns.appendChild(this.btn('⏹ Stop', '#7a2a2a', () => this.onStop?.()));
    }

    btns.appendChild(this.btn('↓ JSON', '#333', () => this.onExportJSON?.()));
    btns.appendChild(this.btn('↓ CSV', '#333', () => this.onExportCSV?.()));

    this.container.appendChild(btns);

    // Progress bar (shown while running)
    if (this.state.running) {
      const progressWrap = document.createElement('div');
      progressWrap.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 11px; color: #aaa;';
      const track = document.createElement('div');
      track.style.cssText = `flex: 1; height: 6px; background: ${THEME.bg}; border-radius: 3px; overflow: hidden;`;
      const bar = document.createElement('div');
      bar.style.cssText = 'height: 100%; width: 0%; background: #4466aa; border-radius: 3px; transition: width 0.1s;';
      this.progressEl = bar;
      track.appendChild(bar);
      const lbl = document.createElement('span');
      lbl.textContent = '0 / ?';
      progressWrap.appendChild(track);
      progressWrap.appendChild(lbl);
      this.container.appendChild(progressWrap);
    }
  }

  private field(label: string, type: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('label');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 13px;';
    row.textContent = label + ': ';
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.style.cssText = `width: 70px; background: ${THEME.bg}; color: #eee; border: 1px solid ${THEME.border}; border-radius: 3px; padding: 2px 6px;`;
    input.addEventListener('change', () => onChange(input.value));
    row.appendChild(input);
    return row;
  }

  private radioGroup(label: string, options: string[], selected: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap;';
    const lbl = document.createElement('span');
    lbl.style.color = THEME.textSecondary;
    lbl.textContent = label + ':';
    row.appendChild(lbl);

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.style.cssText = `
        padding: 2px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;
        background: ${opt === selected ? '#4466aa' : THEME.bg};
        color: #eee; border: 1px solid ${THEME.border};
      `;
      btn.addEventListener('click', () => { onChange(opt); this.render(); });
      row.appendChild(btn);
    }

    return row;
  }

  private btn(text: string, bg: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `
      padding: 6px 14px; background: ${bg}; color: #eee; border: none;
      border-radius: 4px; cursor: pointer; font-size: 13px;
    `;
    b.addEventListener('click', onClick);
    return b;
  }
}
