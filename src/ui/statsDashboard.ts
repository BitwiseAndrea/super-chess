// src/ui/statsDashboard.ts
// D3-powered stats dashboard
import type { AggregatedStats } from '../simulation/types.ts';
import { THEME } from './theme.ts';

export class StatsDashboard {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(stats: AggregatedStats): void {
    this.container.innerHTML = '';

    if (stats.totalGames === 0) {
      this.container.textContent = 'No simulation data yet.';
      return;
    }

    this.renderSummary(stats);
    this.renderWinRateBar(stats);
    this.renderCardTable(stats);
  }

  private renderSummary(stats: AggregatedStats): void {
    const div = document.createElement('div');
    div.style.cssText = `display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px;`;

    const items = [
      ['Games', String(stats.totalGames)],
      ['Avg length', stats.avgGameLength.toFixed(1) + ' moves'],
      ['Avg cards/game', stats.avgCardsPlayedPerGame.toFixed(1)],
      ['Utilization', (stats.cardUtilizationRate * 100).toFixed(0) + '%'],
    ];

    for (const [label, value] of items) {
      const box = document.createElement('div');
      box.style.cssText = `background: ${THEME.panel}; border-radius: 6px; padding: 8px 14px; min-width: 100px;`;
      box.innerHTML = `<div style="font-size:10px;color:${THEME.textSecondary}">${label}</div><div style="font-size:18px;font-weight:bold">${value}</div>`;
      div.appendChild(box);
    }

    this.container.appendChild(div);
  }

  private renderWinRateBar(stats: AggregatedStats): void {
    const wr = stats.winRates;
    const bar = document.createElement('div');
    bar.style.cssText = `display: flex; height: 28px; border-radius: 4px; overflow: hidden; margin-bottom: 12px; font-size: 12px;`;

    const segments = [
      { pct: wr.white, color: '#eee', label: `White ${(wr.white * 100).toFixed(1)}%` },
      { pct: wr.draw, color: '#888', label: `Draw ${(wr.draw * 100).toFixed(1)}%` },
      { pct: wr.black, color: '#333', label: `Black ${(wr.black * 100).toFixed(1)}%` },
    ];

    for (const seg of segments) {
      if (seg.pct === 0) continue;
      const s = document.createElement('div');
      s.style.cssText = `
        width: ${(seg.pct * 100).toFixed(1)}%; background: ${seg.color};
        display: flex; align-items: center; justify-content: center;
        color: ${seg.color === '#eee' ? '#111' : '#eee'}; font-weight: bold; font-size: 11px;
      `;
      s.title = seg.label;
      if (seg.pct > 0.1) s.textContent = seg.label;
      bar.appendChild(s);
    }

    this.container.appendChild(bar);
  }

  private renderCardTable(stats: AggregatedStats): void {
    const cards = [...stats.perCard.values()].sort((a, b) => b.timesPlayed - a.timesPlayed);
    if (cards.length === 0) return;

    const title = document.createElement('div');
    title.style.cssText = `font-size: 13px; font-weight: bold; margin-bottom: 6px;`;
    title.textContent = 'Card Performance';
    this.container.appendChild(title);

    const table = document.createElement('table');
    table.style.cssText = `width: 100%; border-collapse: collapse; font-size: 11px;`;
    table.innerHTML = `
      <thead>
        <tr style="color:${THEME.textSecondary};text-align:left;border-bottom:1px solid ${THEME.border}">
          <th>Card</th><th>Played</th><th>Util%</th><th>Win ρ</th><th>Mat±</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    for (const s of cards) {
      const tr = document.createElement('tr');
      const corr = s.winCorrelation;
      const corrColor = corr > 0.2 ? '#f08040' : corr < -0.2 ? '#4080f0' : '#ccc';
      tr.innerHTML = `
        <td style="padding:3px 4px">${s.cardName}</td>
        <td>${s.timesPlayed}</td>
        <td>${(s.utilizationRate * 100).toFixed(0)}%</td>
        <td style="color:${corrColor}">${corr.toFixed(2)}</td>
        <td>${s.avgMaterialSwingOnPlay > 0 ? '+' : ''}${s.avgMaterialSwingOnPlay.toFixed(1)}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this.container.appendChild(table);
  }
}
