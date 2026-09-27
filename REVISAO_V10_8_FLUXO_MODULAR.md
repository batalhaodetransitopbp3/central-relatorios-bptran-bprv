# Revisão 10.8 — Central enxuta e RSD modular

## Objetivo
Reduzir a quantidade de módulos expostos na capa e transformar o RSD em relatório-mãe do serviço, com alimentação automática pelos módulos especializados vinculados pelo mesmo SERVICE_ID.

## Capa
### Boletim de Ocorrência
Permanece como módulo primário.

### Relatórios Operacionais
- RSD — Relatório de Serviço Diário.
- RCO — Relatório do Coordenador.
- Checklist de VTR.
- Translado de veículos:
  - Relatório de Traslados do Reboque.
  - CIRVC — Transporte ao DETRAN.
- Contingência operacional.

ROP e CIRVC de remoção não ficam expostos como módulos primários no fluxo normal: são abertos a partir do RSD.

### Módulos de gestão
- Gestão P3.
- Motomecanização.

Documentos e Normativas e Ferramentas úteis permanecem na capa.

## Cadastro inicial do RSD
- Tipo da guarnição e número são seleções separadas.
- Tipos: BST, BASE, GTTRAN, REBOQUE e TOR.
- Número: 01 a 10 para todos os tipos.
- Comandante: matrícula é informada primeiro.
- Quando localizada no Cadastro Mestre, posto/graduação + nome são preenchidos automaticamente e bloqueados.
- Quando não localizada, somente então o campo de nome é liberado, junto ao posto/graduação e unidade de origem para pré-cadastro.
- A ação principal é “Registrar guarnição e entrar no relatório”.
- Após confirmação do registro pela Central, o RSD é aberto automaticamente e o cabeçalho fica bloqueado.

## RSD como relatório-mãe
O RSD mantém o SERVICE_ID como vínculo canônico. Os módulos especializados recebem o contexto ativo e retornam automaticamente seus resumos.

### + Operação
Abre o ROP correspondente à plataforma. Unidade, data, guarnição, VTR e responsável são herdados do RSD. Após sincronização confirmada:
1. o ROP permanece em sua própria tabela de operações;
2. é gerado um evento resumido do serviço;
3. o usuário retorna ao RSD;
4. o RSD consulta a Central e incorpora o resumo sem importação manual.

### + CIRVC
Abre o módulo CIRVC com SERVICE_ID, RSD_REPORT_ID e segmento. A identidade do serviço fica bloqueada. Após sincronização confirmada, o resumo volta automaticamente ao RSD.

### + Ocorrência
Antes do formulário, o usuário escolhe BST, TCO ou BO.
- BST: abre o formulário resumido do RSD.
- TCO: abre o formulário resumido do RSD.
- BO: pergunta “Você deseja prosseguir com o preenchimento do BO online?”.
  - Sim: abre o módulo BO online vinculado ao serviço.
  - Não: abre o formulário resumido do RSD.
O número do BO vinculado segue o campo Nº FICHA do módulo e é gravado no evento resumido do serviço.

### Veículo recuperado
Permanece como lançamento resumido dentro do RSD e pode ser registrado na Central como evento do serviço.

## SERVICE_EVENTOS
Nova camada de eventos resumidos do serviço, sem substituir os bancos próprios dos módulos.

Campos principais:
- EVENT_ID
- SERVICE_ID
- RSD_REPORT_ID
- SEGMENTO
- TIPO / SUBTIPO
- DATA_EVENTO / HORA_EVENTO
- TITULO / RESUMO
- REFERENCIA_ID / NUMERO_DOCUMENTO
- unidade, guarnição, VTR e comandante
- CRIADO_EM / ATUALIZADO_EM
- PAYLOAD_JSON resumido

A linha do tempo do RSD mostra o horário do evento e, quando disponível, o horário de registro na Central para auditoria.

## RCO
O RCO continua consumindo os RSDs pela nuvem, inclusive quando estão EM_SERVICO. O botão local legado de “Carregar operações do dia” fica fora do fluxo normal. Ao recuperar foco, o RCO atualiza a lista de RSDs/guarnições disponíveis na Central.

## Contingência
Novo módulo `contingencia_operacional.html`:
- funciona sem depender do backend;
- salva rascunho local automaticamente;
- permite registrar cabeçalho, produção, ocorrências, operações, veículos recuperados e CIRVC;
- gera JSON no schema `pmpb-transito-servico-diario-v2`;
- o RCO já aceita esse schema na importação manual de contingência.

## Compatibilidade
- Rotinas antigas de importação permanecem no código apenas como contingência durante a transição.
- Registros antigos permanecem compatíveis.
- ROP e CIRVC continuam mantendo seus dados especializados.
- O novo SERVICE_EVENTOS contém somente o resumo necessário à evolução do RSD e à auditoria.

## Backend
Versão preparada: 10.8.0.

Novas ações:
- GET service-event-list
- POST service-event-upsert

operation-upsert e cirvc-register também alimentam SERVICE_EVENTOS quando há vínculo com SERVICE_ID/RSD_REPORT_ID.

## Arquivos principais alterados/adicionados
- index.html
- apps_script_v10.gs
- service_access_layers.js
- service_flow.js (novo)
- contingencia_operacional.html (novo)
- relatorio_servico_diario.html / _ios
- relatorio_cpu.html / _ios
- relatorio_operacao.html / _ios
- auto_remocao_veiculos.html / _ios
- boletim_ocorrencia_bptrans_1cprv.html / _ios

## Validação
- apps_script_v10.gs: sintaxe validada.
- service_access_layers.js: sintaxe validada.
- service_flow.js: sintaxe validada.
- index e contingência: scripts inline validados.
- RSD desktop/iOS: 8/8 scripts inline validados.
- RCO desktop/iOS: 9/9 scripts inline validados.
- ROP desktop/iOS: 4/4 scripts inline validados.
- CIRVC desktop/iOS: 7/7 scripts inline validados.
- BO desktop/iOS: 4/4 scripts inline validados.

## Ordem futura de publicação
1. Publicar Apps Script 10.8.0 no deployment existente.
2. Confirmar /exec?action=version = 10.8.0.
3. Publicar o frontend da mesma revisão.
4. Homologar um fluxo completo RSD → ROP → RSD.
5. Homologar RSD → CIRVC → RSD.
6. Homologar ocorrência BST/TCO/BO.
7. Homologar RCO recebendo os dados automaticamente.
8. Testar contingência JSON → importação manual no RCO.
