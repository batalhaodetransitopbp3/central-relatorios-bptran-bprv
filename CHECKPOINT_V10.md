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

## Publicação do backend v10 — 25/09/2026
- Novo Web App publicado e validado externamente pelo usuário.
- Resposta confirmada em `?action=version`: `{"ok":true,"version":"10.3.0","schema":"central-v10"}`.
- Endpoint v10 publicado: `https://script.google.com/macros/s/AKfycbyxmDMgk-h2lTuf_6BvUngMLu-yMDvfenHNshQ3aa0V3lDPzh5kosUfiqm90IugmepPpw/exec`.
- `central_cloud.js` atualizado em `main` para apontar ao novo endpoint v10.
- Commit da troca de endpoint: `44473fb49dd8412c4dd368e317ea0ee4a1afaeec`.
- `CONFIG.BACKEND_V10_STATUS` deve permanecer `AGUARDANDO_PUBLICACAO` até conclusão da matriz de homologação.
- Backend legado não foi removido nem sobrescrito.

## Regra de Cadastro Mestre de Militares — 25/09/2026
- A matrícula identifica o militar globalmente no Cadastro Mestre.
- Batalhão e companhia permanecem como dados de lotação/origem, não como restrição operacional de consulta.
- RSD e demais telas operacionais devem localizar o militar independentemente da companhia em que ele esteja tirando serviço no dia (ex.: extra, reforço ou apoio).
- A unidade/companhia registrada no relatório representa o local do serviço, não necessariamente a lotação administrativa do militar.
- Viaturas podem continuar sendo filtradas por unidade/companhia quando isso fizer sentido operacional.

## Correção crítica de credenciais — 25/09/2026
- Identificada falha: uma `CENTRAL_TOKEN` ou `P3_TOKEN` digitada incorretamente podia permanecer salva no `localStorage` e ser reutilizada indefinidamente, impedindo nova tentativa de autenticação.
- `central_cloud.js` passou a reconhecer explicitamente a resposta `Chave inválida.` do backend.
- Ao detectar chave inválida, a credencial correspondente é removida automaticamente do navegador.
- A consulta ao Cadastro Mestre solicita imediatamente uma nova chave e repete a consulta uma única vez.
- Envios rejeitados por chave inválida não são mais adicionados à fila offline.
- Itens antigos da fila que contenham chave inválida têm a credencial descartada para que uma chave válida possa ser usada na tentativa seguinte.
- A recuperação vale tanto para a chave operacional (`CENTRAL_TOKEN`) quanto para a chave administrativa (`P3_TOKEN`), conforme a ação executada.
- O módulo corrigido foi versionado com cache-busting `central_cloud.js?v=10.3.0-20260925d` nas telas cloud.

## Comunicação cloud v10.3.1 — 25/09/2026
- O Web App v10.3.0 já estava publicado e validado manualmente; `BACKEND_V10_STATUS=AGUARDANDO_PUBLICACAO` era apenas um estado de homologação desatualizado e não bloqueava as rotas.
- A aba CONFIG foi corrigida para `BACKEND_V10_STATUS=EM_HOMOLOGACAO`.
- Identificada falha no transporte JSONP carregado como script externo pelo GitHub Pages, apesar de a resposta JSONP funcionar quando aberta diretamente no navegador.
- Backend atualizado para `10.3.1` com ponte GET via iframe + `postMessage`, usando `HtmlService.XFrameOptionsMode.ALLOWALL`.
- `central_cloud.js` mantém a API `jsonp()`, porém internamente passou a usar iframe + `postMessage`, com `requestId` para correlação segura das respostas.
- Gestão P3 deixou de exibir a mensagem enganosa “Backend v10 ainda não publicado” e passa a informar falha de conexão quando o probe não responder.
- Telas cloud foram atualizadas para carregar `central_cloud.js?v=10.3.1-20260925e`.
- Próximo passo obrigatório: substituir o `Code.gs` do projeto Apps Script pelo conteúdo atual de `apps_script_v10.gs` e atualizar a implantação existente para uma nova versão, mantendo a mesma URL `/exec`. Depois confirmar `?action=version` retornando `10.3.1`.

## Solução 50 — Registro da Guarnição em Serviço — 25/09/2026
- Escopo simplificado por decisão operacional: o registro da guarnição em serviço contém apenas **nome da guarnição + comandante (nome e matrícula)**. Não há cadastro individual de todos os componentes nem campo de turno para essa finalidade.
- A lotação administrativa do comandante não restringe a pesquisa; o Cadastro Mestre é consultado globalmente.
- A busca do comandante aceita matrícula completa ou nome/QRA.
- Nova rota backend: `rsd-start` (CENTRAL_TOKEN).
- Fluxo do mesmo `REPORT_ID`: `EM_SERVICO → FINALIZADO → INCLUIDO_RCO`.
- O RCO pode adicionar a identificação da guarnição enquanto ela está `EM_SERVICO`; após a finalização, apresenta `NOVA VERSÃO` para substituir os dados sem duplicidade.
- O RCO bloqueia a consolidação P3 enquanto houver origem adicionada ainda `EM_SERVICO`.
- O backend não permite marcar RSD `EM_SERVICO` como `INCLUIDO_RCO`.
- JSON permanece apenas como contingência.
- A aba temporária `RSD_COMPONENTES` foi removida da Base P3, pois deixou de ser necessária após a simplificação.
- Correção de comunicação na v10.4.1: o HTML do Apps Script envia resposta também para `window.top`, e o frontend deixa de exigir igualdade entre `event.source` e o iframe externo, mantendo correlação por `requestId` único.
- Backend preparado na versão `10.4.1`; é necessária atualização da implantação do Apps Script antes da nova homologação.


