# Checkpoint Central v10 — 25/09/2026

Este arquivo é a fotografia atual para retomada segura do projeto.

## Repositório ativo
- Repositório: `batalhaodetransitopbp3/central-relatorios-bptran-bprv`
- Branch de homologação desta rodada: `cirvc-rsd-checklist-motomec-v10-5-2`
- Backend complementar atual: `apps_script_v10.gs`
- Versão atual do código em homologação: **10.5.2**
- Endpoint v10 existente:
  `https://script.google.com/macros/s/AKfycbyxmDMgk-h2lTuf_6BvUngMLu-yMDvfenHNshQ3aa0V3lDPzh5kosUfiqm90IugmepPpw/exec`
- O endpoint já está publicado em 10.5.1. A versão 10.5.2 desta rodada ainda precisa ser promovida na implantação existente e confirmada por `?action=version`.

## Estado de homologação
- `CONFIG.BACKEND_V10_STATUS = EM_HOMOLOGACAO`
- `CONFIG.BACKEND_V10_GITHUB_BRANCH = main`
- Backend legado preservado.
- Não alterar para `ATIVO` antes da homologação funcional completa.

## Rotas v10 atuais
- RSD: `rsd-start`, `rsd-draft-sync`, `rsd-active`, `rsd-claim`, `rsd-upsert`, `rsd-list`, `rsd-get`, `rsd-mark-included`.
- Passagem RSD: `passagem-publicar`, `passagem-receber`, `passagens-pendentes`.
- Operações: `operation-upsert`, `operation-list`.
- RCO: `rco-draft-upsert`, `rco-draft-list`, `rco-draft-get`, `rco-draft-claim`, `rco-upsert`.
- Cadastros: `cadastros`, `cadastro-upsert`.
- CIRVC: `cirvc-register`, `cirvc-list`, `cirvc-pending`, `cirvc-transport-create`, `cirvc-transport-finalize`, `cirvc-transport-list`, `cirvc-transport-get`.
- Checklist/Motomecanização: `checklist-upsert`, `checklist-list`, `motomecanizacao-list`, `motomecanizacao-update`.
- Gestão P3: `p3-query`, `p3-analysis`, `p3-config`, `p3-config-set`.

## Bases oficiais
- Base P3: `1fNE2hEz4vYjX6r-KmLowswlejkVpj6CeD_2FdNK_keM`.
- Base Checklist/Motomecanização: `15KvRMVC8ofELZLXGlllMq7h5SkPV5qDcC1qtOVB6jBs`.
- Matrícula canônica PMPB: `000.000-0`.
- Cadastro Mestre de militares é global por matrícula; lotação não restringe a consulta operacional.
- Cadastro de viaturas permanece associado à unidade/companhia quando aplicável.

## Numeração das soluções
- Solução 46: existente.
- Solução 47: não existe; a numeração histórica salta da 46 para a 48.
- Solução 48: Cadastro Mestre de militares, matrícula `000.000-0`.
- Solução 49: Cadastro Mestre de viaturas e padronização marca/modelo.
- Solução 50: Registro da Guarnição em Serviço — somente nome da guarnição + comandante.
- Solução 51: Continuidade em Nuvem, Passagem Encadeada e continuidade do Coordenador.

## Solução 50 — Registro da Guarnição em Serviço
- O RSD registra em nuvem apenas **nome da guarnição + comandante (nome e matrícula)**.
- Não cadastra toda a composição da equipe e não exige turno para esta finalidade.
- Busca do comandante por matrícula ou nome/QRA no Cadastro Mestre global.
- Fluxo do segmento: `EM_SERVICO → FINALIZADO → INCLUIDO_RCO`.
- O RCO pode visualizar a guarnição ainda `EM_SERVICO`.
- Se a origem foi adicionada ao RCO antes da finalização, a versão final aparece como `NOVA VERSÃO`.
- O RCO não consolida para P3 enquanto houver origem adicionada ainda `EM_SERVICO`.

## Solução 51 — Continuidade em Nuvem e Passagem Encadeada
- Cada serviço contínuo recebe um `SERVICE_ID`.
- Cada comandante da guarnição trabalha em um `SEGMENTO` próprio, com `REPORT_ID` próprio.
- Mesmo comandante em outro aparelho: `Continuar serviço` recupera o mesmo RSD pela matrícula e mantém o mesmo `REPORT_ID`. Se tentar registrar/iniciar novamente a mesma guarnição, o backend detecta o RSD ativo e direciona para o registro existente, impedindo duplicidade.
- O RSD sincroniza rascunho em nuvem por `rsd-draft-sync` após período de inatividade.
- Controle de edição: `EDIT_DEVICE_ID` + `EDIT_LEASE_UNTIL`. Um novo aparelho pode assumir a edição; o anterior deixa de sincronizar.
- Troca de comandante dentro do mesmo segmento é bloqueada. Para mudar comandante é obrigatória a passagem de serviço.
- Ao realizar a passagem pela nuvem, o sistema finaliza/sincroniza automaticamente o RSD de origem antes de publicar a passagem; o trecho anterior fica imutável.
- Novo comandante recebe a passagem com:
  - mesmo `SERVICE_ID`;
  - novo `REPORT_ID`;
  - `SEGMENTO` incrementado;
  - referência ao `RSD_ANTERIOR_ID`;
  - VTR/contexto/pendências preservados;
  - produtividade, ocorrências, operações, veículos recuperados, TCOs e CIRVC zerados.
- `PASSAGENS_SERVICO` registra `SERVICE_ID`, segmentos e vínculo entre RSDs.
- Relatório de Operação recebe automaticamente o contexto do RSD ativo e grava `RSD_REPORT_ID`, `SERVICE_ID`, `SEGMENTO` e comandante.
- Cada RSD carrega somente as operações do seu próprio segmento.
- O RCO soma múltiplos segmentos da mesma guarnição sem apagar segmentos anteriores.
- Criada a aba `RCO_RASCUNHOS` para continuidade do Coordenador.
- O RCO pode ser retomado em outro aparelho mantendo o mesmo `REPORT_ID`.
- Passagem do Coordenador mantém o mesmo RCO e abre novo slot de autoria (CPU 2, CPU 3...), preservando a auditoria dos anteriores. O backend também bloqueia a abertura de um segundo RCO concorrente para a mesma unidade/data.
- JSON de passagem do RCO é apenas contingência.
- `Início do serviço` foi corrigido para não apagar `CENTRAL_TOKEN`, `P3_TOKEN`, fila de sincronização nem ID do dispositivo.

## Ajustes da versão 10.5.2 — CIRVC e Checklist/Motomecanização
- Cada CIRVC produzido durante um RSD ativo passa a guardar `RSD_REPORT_ID`, `SERVICE_ID` e `SEGMENTO`.
- O CIRVC possui ação explícita **Salvar CIRVCs na Central**; a geração do PDF também tenta registrar os CIRVCs na Central.
- O RSD recebeu **Carregar remoções do dia**, com deduplicação por ID e filtro pelo segmento atual.
- Finalização/passagem do RSD tenta incorporar os CIRVCs já vinculados antes de encerrar o segmento.
- O backend também sincroniza os CIRVCs presentes no RSD final com `CIRVC_CUSTODIA`, preservando eventual estado de transporte/baixa existente.
- O RCO continua recebendo os CIRVCs pela cadeia normal `CIRVC → RSD → RCO`, sem redigitação.
- Confirmado que a integração Checklist → Motomecanização já existe por `checklist_cloud.js` + `checklist-upsert`.
- O Checklist agora usa o rótulo **Finalizar e enviar à Motomecanização**, valida pendências antes do envio e mantém `Pendências: 0` como indicador de preenchimento, não de ausência de avarias.
- Checklist, Operações e CIRVC deixaram de exibir o botão genérico de início/continuidade que poderia apagar o contexto do RSD; cada módulo mantém suas próprias ações de rascunho/novo registro.

## Estruturas adicionadas na Base P3
- RSD: `SERVICE_ID`, `SEGMENTO`, `RSD_ANTERIOR_ID`, `PASSAGEM_ORIGEM_ID`, `ULTIMO_RASCUNHO_EM`, `EDIT_DEVICE_ID`, `EDIT_LEASE_UNTIL`, `DRAFT_REVISION`.
- PASSAGENS_SERVICO: `SERVICE_ID`, `SEGMENTO_ORIGEM`, `SEGMENTO_DESTINO`, `RSD_ANTERIOR_ID`.
- OPERACOES: `SERVICE_ID`, `SEGMENTO`, `COMANDANTE_MATRICULA`.
- Nova aba: `RCO_RASCUNHOS`.

## Revisões já executadas
- Sintaxe validada em:
  - `apps_script_v10.gs`
  - `central_cloud.js`
  - RSD desktop/iOS
  - RCO desktop/iOS
  - Relatório de Operação desktop/iOS
- Operações recuperadas da nuvem preservam resumo estatístico.
- Autosave periódico do RSD não gera linha de auditoria a cada sincronização.
- Respostas GET e POST usam `requestId` para correlação via `postMessage`.
- Credenciais não estão versionadas no GitHub.

## Próximo passo obrigatório
1. Substituir o `Code.gs` do projeto Apps Script pelo `apps_script_v10.gs` da branch de homologação 10.5.2.
2. Salvar.
3. `Implantar → Gerenciar implantações → Editar → Nova versão`.
4. Manter a mesma URL `/exec`.
5. Confirmar:
   `?action=version` → `{"ok":true,"version":"10.5.2","schema":"central-v10"}`.
6. Executar a matriz de homologação descrita em `IMPLANTACAO_V10.md`.
7. Somente depois alterar `BACKEND_V10_STATUS` para `ATIVO`.

## Regra de segurança
Não substituir nem excluir o backend legado durante a homologação.
