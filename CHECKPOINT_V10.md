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

## Auditoria de retomada — 25/09/2026
- Repositório ativo confirmado: `batalhaodetransitopbp3/central-relatorios-bptran-bprv`, branch `main`.
- Sintaxe do `apps_script_v10.gs` e do `central_cloud.js` validada novamente sem erros.
- Todas as rotas v10 esperadas foram encontradas no backend; nenhuma rota esperada ficou ausente.
- Bases reais do Google Sheets foram reabertas e conferidas:
  - `BASE ESTATÍSTICA P3 - BPTran-BPRv`;
  - `BASE CHECKLIST E MOTOMECANIZAÇÃO - BPTran-BPRv`.
- Cabeçalhos reais de RCO, RSD, RSD_VIATURAS, RCO_ORIGENS, PASSAGENS_SERVICO, PRISOES, MILITARES, VIATURAS, OPERACOES, POD_EXECUCAO, CIRVC e Checklist/Motomecanização foram comparados com os contratos do backend e estão compatíveis.
- Individualização das operações reconfirmada: cada nova operação recebe `reportId` próprio, gravado como `REGISTRO_ID`; retificações reaproveitam o mesmo identificador e o RCO atualiza a mesma operação ao consolidar, evitando duplicação estatística.
- `p3-config-set` foi revisado: aceita somente `POWERBI_URL`. A URL do Power BI permanece configurável pela Gestão P3 e não é fixada no código.
- Pesquisa no repositório não encontrou valores versionados de `CENTRAL_TOKEN` ou `P3_TOKEN`; as chaves devem permanecer exclusivamente nas Propriedades do Script.
- `CONFIG.BACKEND_V10_STATUS` continua `AGUARDANDO_PUBLICACAO`, portanto a v10 não foi ativada inadvertidamente.
- Desktop Commander autorizado foi verificado, porém o computador `BOOK-S440LMLLJM` estava offline nesta retomada; por isso a publicação do novo Apps Script não pôde ser executada remotamente.

## Ponto exato para continuar
A revisão de código, contratos e bases está concluída. O próximo passo efetivo permanece a publicação de `apps_script_v10.gs` como NOVO Google Apps Script Web App, configuração de `CENTRAL_TOKEN` e `P3_TOKEN`, teste de `?action=version` esperando `10.3.0` e, somente após sucesso, atualização do endpoint v10 em `central_cloud.js` e execução da matriz de homologação.

## Numeração das soluções
- Solução 46: existente.
- Solução 47: não foi criada; a numeração salta diretamente da 46 para a 48.
- Solução 48: Cadastro Mestre do efetivo do BPRv, com matrícula canônica no padrão PMPB `000.000-0`.
- Solução 49: cadastro das viaturas da 3ª CPTran no Cadastro Mestre de Viaturas. Validação realizada diretamente nas duas bases oficiais em 25/09/2026: 18 registros ativos encontrados para a 3ª CPTran tanto na Base Estatística P3 quanto na Base Checklist/Motomecanização, incluindo Agrale/A8700, prefixo 1697, placa TOZ-8D86, tipo Reboque. O cadastro está propagado para os fluxos que usam viaturas, inclusive Checklist, Motomecanização e Transporte CIRVC.

## Padronização de marca/modelo — 25/09/2026
- Nomenclaturas das viaturas já cadastradas da 3ª CPTran foram normalizadas nas duas bases oficiais, sem alterar prefixo, placa, tipo ou unidade.
- Padrões aplicados: `Fiat Cronos Drive 1.3`, `Fiat Argo Trekking 1.3`, `Honda XRE 300`, `Honda XRE 300 ABS`, `Honda CRF1100L Africa Twin` e `Agrale A8700`.
- Regra adotada: usar fabricante + modelo + versão/motorização quando comprovável; não acrescentar versão presumida. O mesmo critério deverá ser usado nas viaturas das demais companhias que forem recebidas posteriormente.
