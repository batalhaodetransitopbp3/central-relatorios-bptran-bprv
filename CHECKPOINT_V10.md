# Checkpoint Central v10 — 25/09/2026

Este arquivo existe para permitir retomada segura após interrupções do ChatGPT sem repetir gravações já concluídas.

## Confirmado no `main`
- Backend complementar preparado em `apps_script_v10.gs` (versão 10.3.0).
- Frontend e backend usam as mesmas rotas v10:
  - RSD: `rsd-upsert`, `rsd-list`, `rsd-get`, `rsd-mark-included`.
  - Passagem: `passagem-publicar`, `passagem-receber`, `passagens-pendentes`.
  - Operações: `operation-upsert` (registro individual).
  - CIRVC: `cirvc-register`, `cirvc-pending`, `cirvc-transport-create`, `cirvc-transport-finalize`, `cirvc-transport-list`, `cirvc-transport-get`.
  - Checklist: `checklist-upsert` e `checklist-list`.
  - Motomecanização: `motomecanizacao-list`, `motomecanizacao-update`.
  - Cadastros: `cadastros`, `cadastro-upsert`.
  - Gestão P3: `p3-query`, `p3-analysis`, `p3-config`, `p3-config-set`.
  - RCO suplementar: `rco-upsert`.
- RSD Android e iOS contêm correção responsiva do bloco Operação/POD.
- RSD admite múltiplas viaturas; checklist permanece 1 checklist = 1 viatura.
- RCO contém modo de consolidação sem guarnição CPU e consulta de RSDs finalizados.
- Operações são individualizadas com local previsto x local executado.
- Módulos existentes: `gestao_p3.html`, `cirvc_transporte.html`, `motomecanizacao.html`, `cadastros_admin.html`.
- Checklist utiliza banco próprio e fotos/assinaturas são previstas fora da planilha.
- Matrícula canônica: `000.000-0`.

## Bases confirmadas
- Base P3: `1fNE2hEz4vYjX6r-KmLowswlejkVpj6CeD_2FdNK_keM`.
- Abas v10 já existentes: RSD, RSD_VIATURAS, RCO_ORIGENS, PASSAGENS_SERVICO, PRISOES, MILITARES, VIATURAS, CIRVC_CUSTODIA, CIRVC_TRANSPORTES, CIRVC_TRANSPORTE_ITENS, AUDITORIA_VERSOES, além das abas legadas.
- Cadastro mestre de militares já populado no banco oficial.
- Viaturas recebidas da 3ª CPTran já populadas no banco oficial.
- Banco separado de Checklist/Motomecanização e pastas de fotos/assinaturas já constam em CONFIG.

## Estado de ativação
- `CONFIG.BACKEND_V10_STATUS = AGUARDANDO_PUBLICACAO`.
- O endpoint atual do `central_cloud.js` continua apontando para o backend legado por segurança.
- Os módulos v10 só ativam a nuvem quando o probe encontra backend com versão iniciada em 10.

## Próximo passo obrigatório
Publicar `apps_script_v10.gs` como **novo Google Apps Script Web App**, configurar `CENTRAL_TOKEN` e `P3_TOKEN`, obter a nova URL `/exec`, testar `?action=version` (esperado: 10.3.0) e só então apontar `central_cloud.js` para o novo endpoint.

## Regra de segurança
Não substituir nem excluir o backend legado durante a homologação.
