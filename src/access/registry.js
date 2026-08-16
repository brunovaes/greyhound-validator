// ============================================================================
// Catalogo central de "pontos de acesso" do app (telas, secoes, botoes, links).
// E a fonte da verdade do que pode ser liberado/bloqueado por perfil.
// Para tornar um novo elemento controlavel: adicione o item aqui e use
// can(user, 'chave') no ponto correspondente (server-side ou na UI).
// NAO tem relacao com o motor de analise — e so controle de acesso/exibicao.
// ============================================================================

const ACCESS_CATEGORIES = [
  { key: 'telas', label: 'Telas principais (menu)', items: [
    { key: 'screen.analisar',   label: 'Analisar corridas' },
    { key: 'screen.banca',      label: 'Banca' },
    { key: 'screen.live',       label: 'Live (corridas ao vivo)' },
    { key: 'screen.historicos', label: 'Historicos' },
    { key: 'screen.config',     label: 'Configuracoes' },
    { key: 'screen.robot',      label: 'Painel Admin' },
    { key: 'screen.usuarios',   label: 'Usuarios' },
    { key: 'screen.acessos',    label: 'Acessos' },
  ]},
  { key: 'analisar', label: 'Tela Analisar', items: [
    { key: 'analisar.carregar_pdf',      label: 'Botao Carregar PDFs' },
    { key: 'analisar.historicos_link',   label: 'Link Historicos' },
    { key: 'analisar.ver_confronto',     label: 'Ver confronto / historico' },
    { key: 'analisar.relatorio',         label: 'Relatorio de analise (icone)' },
    { key: 'analisar.corrida_completa',  label: 'Corrida completa 6 galgos (icone)' },
    { key: 'analisar.exportar_csv',      label: 'Exportar CSV' },
    { key: 'analisar.carga_vip',         label: 'Carga VIP (entradas fortes do dia)' },
    { key: 'analisar.acertos',           label: 'Painel Acertos (dia/mes)' },
    { key: 'analisar.sessoes_recentes',  label: 'Sessoes recentes' },
  ]},
  { key: 'banca', label: 'Tela Banca', items: [
    { key: 'banca.config', label: 'Configuracoes da Banca' },
  ]},
  { key: 'config', label: 'Configuracoes (secoes)', items: [
    { key: 'config.pesos',         label: 'Pesos dos Criterios' },
    { key: 'config.categoria',     label: 'Categoria' },
    { key: 'config.filtros',       label: 'Filtros' },
    { key: 'config.thresholds',    label: 'Thresholds' },
    { key: 'config.motor',         label: 'Motor de Pontuacao' },
    { key: 'config.alarme',        label: 'Alarme para filtro' },
    { key: 'config.desempenho_hr', label: 'Desempenho HR' },
    { key: 'config.dashboard',     label: 'Dashboard' },
  ]},
  { key: 'painel_admin', label: 'Painel Admin (abas)', items: [
    { key: 'robot.coletor',           label: 'Coletor de PDFs' },
    { key: 'robot.resultados',        label: 'Resultados' },
    { key: 'robot.monitoramento',     label: 'Monitoramento' },
    { key: 'robot.auditoria',         label: 'Auditoria' },
    { key: 'robot.automacao',         label: 'Automacao' },
    { key: 'robot.exportar_derrotas', label: 'Exportar Derrotas' },
    { key: 'robot.diagnosticos',      label: 'Diagnosticos (Traps/Remarks)' },
  ]},
  { key: 'live', label: 'Tela Live', items: [
    { key: 'live.acompanhamento', label: 'Acompanhamento simultaneo' },
  ]},
];

function allItems() {
  const out = [];
  ACCESS_CATEGORIES.forEach(function (c) {
    c.items.forEach(function (it) { out.push({ key: it.key, label: it.label, category: c.key }); });
  });
  return out;
}
function isValidKey(k) { return allItems().some(function (it) { return it.key === k; }); }

module.exports = { ACCESS_CATEGORIES, allItems, isValidKey };