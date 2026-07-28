// Nomes de exibicao dos planos. As CHAVES internas continuam free/pro/premium
// (no banco), mas o que aparece na tela usa estes rotulos. Assim nao precisa
// migrar dados e o nome fica consistente em todo lugar.
//   free    -> Standard  (Semanal)
//   pro     -> Pró       (Mensal)
//   premium -> Premium   (Trimestral)
const PLAN_LABELS  = { free: 'Standard', pro: 'Pró', premium: 'Premium' };
const PLAN_DURACAO = { free: 'Semanal', pro: 'Mensal', premium: 'Trimestral' };

function planLabel(k)   { return PLAN_LABELS[k] || k || ''; }
function planDuracao(k) { return PLAN_DURACAO[k] || ''; }

module.exports = { PLAN_LABELS, PLAN_DURACAO, planLabel, planDuracao };