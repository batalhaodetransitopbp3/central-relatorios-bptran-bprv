'use strict';
/**
 * Procedimento controlado — NÃO EXECUTAR sem autorização explícita.
 *
 * Duas criações simultâneas de RCO no Apps Script, somente em projeto isolado.
 * Este arquivo não chama a Central, não faz clasp e não publica.
 * Se for iniciado sem autorização, encerra antes de qualquer rede.
 */
const PRODUCTION_EXEC = 'https://script.google.com/macros/s/AKfycbyxmDMgk-h2lTuf_6BvUngMLu-yMDvfenHNshQ3aa0V3lDPzh5kosUfiqm90IugmepPpw/exec';

const PROCEDURE = {
  name: 'rco-concurrent-create-isolated',
  status: 'PREPARED_NOT_RUN',
  environment: 'Apps Script isolado, cópia do backend 10.8.42. Proibido usar o /exec de produção.',
  guards: [
    'Recusar se a URL for a de produção.',
    'Recusar se RCO_CONCURRENT_PROCEDURE_AUTHORIZED não for 1.',
    'Recusar se o scriptId isolado não tiver sido informado.',
    'Não fazer clasp push, deploy ou alteração de planilha real.'
  ],
  steps: [
    'Criar um projeto Apps Script novo e uma planilha vazia, sem vínculo com a planilha de produção.',
    'Copiar para esse projeto somente apps_script_v10.gs da versão 10.8.42, apontando P3_SHEET_ID para a planilha vazia.',
    'Não publicar o aplicativo da Web. Executar as duas chamadas pelo editor, em duas execuções disparadas juntas, ou por um gatilho de teste que não use o deployment de produção.',
    'Disparar duas criações com clientRequestId diferentes, o mesmo batalhão, a mesma companhia e a mesma data operacional, e REPORT_ID distintos.',
    'A primeira deve terminar CREATED. A segunda, ainda dentro do mesmo período e companhia, deve terminar EXISTING ou CONFLICT, com created=false.',
    'Conferir na planilha isolada que existe uma única linha EM_ANDAMENTO em RCO_RASCUNHOS para essa companhia e DATA_SERVICO.',
    'Apagar a planilha isolada ao final. Não copiar essas linhas para a produção.'
  ],
  expect: { created: 1, secondOutcome: ['EXISTING', 'CONFLICT'], productionRowsTouched: 0 }
};

function refuse(reason) {
  console.log('PROCEDIMENTO NÃO EXECUTADO: ' + reason);
  console.log(JSON.stringify(PROCEDURE, null, 2));
  process.exit(0);
}

if (require.main === module) {
  const target = String(process.env.RCO_ISOLATED_EXEC_URL || '');
  if (process.env.RCO_CONCURRENT_PROCEDURE_AUTHORIZED !== '1') refuse('falta autorização RCO_CONCURRENT_PROCEDURE_AUTHORIZED=1');
  if (!target || target === PRODUCTION_EXEC) refuse('URL ausente ou igual à Central de produção');
  if (!process.env.RCO_ISOLATED_SCRIPT_ID) refuse('falta o scriptId do projeto isolado');
  refuse('autorização reconhecida, mas a chamada ao Apps Script continua desabilitada neste arquivo');
}

module.exports = PROCEDURE;
