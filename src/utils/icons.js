'use strict';
// src/utils/icons.js
// Conjunto de icones SVG inline, estilo linha fina (stroke), pra substituir
// os emojis nos elementos fixos da interface (menus, titulos, botoes,
// banners). Emojis dentro de mensagens de log (texto passageiro) nao foram
// trocados de proposito — baixo ganho visual pro esforco.
//
// Uso: icon('download', {size:18, color:'currentColor'})

const PATHS = {
  // Robô — Coletor de PDFs
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  // Robô — Resultados
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>',
  // Robô — Monitoramento
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  // Robô — Auditoria
  scroll: '<path d="M8 21h8a2 2 0 0 0 2-2V9.5L14.5 4H8a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M14 4v5.5h5.5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  // Config — engrenagem (Motor de Pontuacao / Executar)
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  // Config — sliders (Pesos dos Criterios)
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  // Config — camadas (Categoria)
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  // Config — filtro (Filtros de Corrida)
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z"/>',
  // Config — escudo (Thresholds de Confianca)
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  // Config — balao de fala (Remarks)
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"/>',
  // Config — relogio (Automacao)
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  // Estatisticas / status
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  // Alerta / atencao
  alertTriangle: '<path d="m10.29 3.86-8.18 14.18A1.5 1.5 0 0 0 3.42 20.5h17.16a1.5 1.5 0 0 0 1.31-2.46L13.71 3.86a1.5 1.5 0 0 0-2.62 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  // Sucesso
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 5-5"/>',
  // Erro
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>',
  // Sino (eventos importantes)
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  // Lista (alteracoes)
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  // Play / executar
  play: '<path d="M6 3v18l16-9L6 3Z"/>',
  // Stop
  stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  // Refresh
  refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  // Trofeu (top3)
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h2.5a1 1 0 0 1 1 1.2A4 4 0 0 1 17 9"/><path d="M7 5H4.5a1 1 0 0 0-1 1.2A4 4 0 0 0 7 9"/>',
  // Calendario
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
};

/**
 * Retorna um <svg> inline pra um icone conhecido.
 * @param {string} name - chave em PATHS
 * @param {object} opts - {size, color, strokeWidth, style}
 */
function icon(name, opts) {
  opts = opts || {};
  const size = opts.size || 16;
  const color = opts.color || 'currentColor';
  const strokeWidth = opts.strokeWidth || 2;
  const style = opts.style || '';
  const p = PATHS[name];
  if (!p) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;${style}">${p}</svg>`;
}

module.exports = { icon };