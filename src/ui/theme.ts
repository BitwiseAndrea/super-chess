/* src/ui/theme.ts — CSS variables and color constants */

export const THEME = {
  light: '#f0d9b5',
  dark: '#b58863',
  highlight: '#cdd26a',
  lastMoveFrom: 'rgba(205,210,106,0.5)',
  lastMoveTo: 'rgba(205,210,106,0.7)',
  frozen: 'rgba(100,180,255,0.5)',
  shielded: 'rgba(80,200,80,0.45)',
  foul: 'rgba(220,50,50,0.4)',
  cardCommon: '#888',
  cardUncommon: '#2a9d2a',
  cardRare: '#b060e0',
  textPrimary: '#e8e8f0',
  textSecondary: '#9090b0',
  bg: '#1e1e2e',
  panel: '#2a2a3e',
  border: '#404060',
};

export function injectTheme(): void {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --light: ${THEME.light};
      --dark: ${THEME.dark};
      --highlight: ${THEME.highlight};
      --frozen: ${THEME.frozen};
      --shielded: ${THEME.shielded};
      --foul: ${THEME.foul};
      --bg: ${THEME.bg};
      --panel: ${THEME.panel};
      --border: ${THEME.border};
      --text: ${THEME.textPrimary};
      --text-secondary: ${THEME.textSecondary};
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    body { margin: 0; background: var(--bg); color: var(--text); }
    * { box-sizing: border-box; }
  `;
  document.head.appendChild(style);
}
