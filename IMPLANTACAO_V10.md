# Implantação da Central v10

## Objetivo
Ativar os módulos em nuvem preparados nesta branch sem substituir o backend legado que continua recebendo os RCOs atuais.

## Arquitetura
- Backend legado: permanece ativo e não deve ser sobrescrito.
- Backend v10 complementar: `apps_script_v10.gs`.
- Base estatística P3: `BASE ESTATÍSTICA P3 - BPTran-BPRv`.
- Base separada de Checklist/Motomecanização: `BASE CHECKLIST E MOTOMECANIZAÇÃO - BPTran-BPRv`.
- Fotos e assinaturas: arquivos no Google Drive; planilhas armazenam URLs/metadados.

## Publicação segura
1. Abrir o projeto Google Apps Script v10 já existente.
2. Substituir integralmente o conteúdo de `Code.gs` pelo `apps_script_v10.gs` atual.
3. Em **Configurações do projeto > Propriedades do script**, criar:
   - `CENTRAL_TOKEN`: chave longa e aleatória para RSD, Operações, CIRVC e Checklist.
   - `P3_TOKEN`: chave longa e aleatória, distinta, para Gestão P3, cadastros e consolidação.
4. Implantar como **Aplicativo da Web**, executando como o proprietário. Definir o nível de acesso conforme a política institucional. Como a interface está no GitHub Pages, validar que a política escolhida permite chamadas do navegador; nunca retirar a validação por token do código.
5. Copiar a URL `/exec` da nova implantação.
6. Em `central_cloud.js`, substituir apenas o endpoint padrão pelo novo `/exec`. Não alterar o endpoint legado existente nos fluxos antigos do RCO.
7. Abrir `<NOVO_ENDPOINT>?action=version`. A resposta esperada contém `"version":"10.4.1"`.
8. Testar a matriz abaixo antes de promover a branch para `main`.

## Matriz mínima de homologação
- RSD Android/Chrome e iOS/Safari: operação responsiva; múltiplas VTRs; finalizar; aparecer no RCO.
- RSD: retificar e confirmar aviso de versão mais recente no RCO.
- Passagem de serviço: disponibilizar e receber na mesma guarnição.
- Operação: salvar duas operações distintas no mesmo dia e confirmar dois registros independentes em Gestão P3.
- Operação: conferir local previsto, local executado e coordenadas reais.
- RCO: adicionar todos os RSDs finalizados; testar consolidação normal e "sem guarnição CPU".
- Checklist: uma VTR por checklist; assinatura; foto comprimida; criação de alteração.
- Motomecanização: alterar ABERTA > EM_ANALISE > EM_MANUTENCAO > SOLUCIONADA.
- CIRVC: cadastrar veículo; visualizar no módulo Transporte; iniciar carga; impedir dupla carga; entregar ao DETRAN com duas assinaturas; confirmar BAIXADO_DETRAN.
- Gestão P3: Controle Diário, Produtividade, Análise, Operações, Prisões/Conduções, CIRVC e Auditoria.
- Power BI: informar URL institucional em Gestão P3 e confirmar persistência central.
- Contingência: interromper internet e confirmar preservação local/fila; reconectar e sincronizar.
- Continuidade RSD: iniciar e registrar em um aparelho, preencher parcialmente, abrir outro aparelho, usar `Continuar serviço`, assumir a edição e confirmar o mesmo `REPORT_ID`.
- Conflito RSD: depois da assunção pelo segundo aparelho, confirmar que o primeiro não consegue sobrescrever a nuvem.
- Passagem RSD: finalizar segmento 1, publicar passagem, receber em outro aparelho com novo comandante e confirmar mesmo `SERVICE_ID`, novo `REPORT_ID`, `SEGMENTO=2` e produtividade zerada.
- Operações por segmento: salvar operação no segmento 1 e outra no segmento 2; confirmar que cada RSD importa somente sua própria operação e que o RCO soma ambos.
- Continuidade RCO: salvar RCO na nuvem, retomá-lo em outro aparelho e confirmar mesmo `REPORT_ID`.
- Passagem RCO: registrar passagem do Coordenador, retomar pela nuvem em outro aparelho, assumir novo slot de auditoria e preservar os coordenadores anteriores bloqueados.
- Credenciais: usar `Início do serviço` e confirmar que CENTRAL_TOKEN/P3_TOKEN continuam disponíveis.

## Promoção
Somente após homologação:
1. Atualizar `CONFIG.BACKEND_V10_STATUS` para `ATIVO`.
2. Registrar a nova URL como configuração do backend v10.
3. Registrar o commit/checkpoint homologado no `main`.
4. Validar GitHub Pages em desktop, Android/Chrome e iOS/Safari.

## Observações
O arquivo JSON deixa de ser fluxo principal, mas continua disponível como contingência. O Power BI é camada de visualização e não substitui os bancos operacionais.


## Homologação adicional — Solução 50
1. No RSD, usar `Início do serviço`.
2. Informar o **nome da guarnição**.
3. Identificar o **comandante** pelo Cadastro Mestre usando matrícula ou nome/QRA; a lotação não restringe a busca.
4. Clicar `Registrar guarnição no serviço`.
5. No RCO da mesma unidade/data, clicar `Buscar guarnições / RSDs` e confirmar que a origem aparece como `EM_SERVICO`, identificada pela guarnição e comandante.
6. Adicionar a identificação ao RCO.
7. Finalizar o RSD da guarnição.
8. Atualizar a lista no RCO e confirmar `NOVA VERSÃO`.
9. Clicar `Atualizar` e confirmar que a mesma guarnição foi substituída sem duplicação.
10. Confirmar que o RCO bloqueia `Consolidar P3` enquanto houver origem adicionada ainda `EM_SERVICO`.
11. Confirmar que, após todos os RSDs finalizados/atualizados, a consolidação é liberada.
12. JSON deve permanecer apenas como contingência.


## Homologação adicional — Solução 51
1. **Mesmo comandante / mesmo aparelho:** iniciar RSD, registrar guarnição, digitar dados, fechar e usar `Continuar serviço`; conferir preservação do `REPORT_ID`.
2. **Mesmo comandante / outro aparelho:** abrir RSD em aparelho diferente, clicar `Continuar serviço`, informar matrícula e selecionar o RSD `EM_SERVICO`.
3. Se o primeiro aparelho ainda tiver lease ativo, confirmar a mensagem de assunção; aceitar e conferir que o segundo aparelho passa a editar.
4. Alterar um campo no segundo aparelho, aguardar sincronização e confirmar que o primeiro aparelho recebe bloqueio ao tentar sincronizar depois.
5. Finalizar o RSD do primeiro comandante e publicar a passagem.
6. No aparelho do substituto, informar guarnição + novo comandante e clicar `Receber passagem de serviço`.
7. Conferir: mesmo `SERVICE_ID`, novo `REPORT_ID`, segmento incrementado, VTR/contexto preservados e produtividade zerada.
8. Abrir Relatório de Operação no novo segmento e confirmar preenchimento automático de unidade, data, guarnição, VTR(s) e responsável.
9. Salvar operações distintas nos dois segmentos e confirmar que cada RSD carrega apenas as operações vinculadas ao seu próprio `RSD_REPORT_ID`.
10. No RCO, adicionar/atualizar os dois segmentos da mesma guarnição e confirmar soma cumulativa sem exclusão do segmento anterior.
11. No RCO, salvar na nuvem; abrir em outro aparelho e usar `Continuar serviço`.
12. Registrar passagem do Coordenador e, no aparelho seguinte, retomar o mesmo RCO e assumir o novo slot de autoria.
13. Confirmar que os registros anteriores ficam bloqueados para auditoria e as novas alterações são atribuídas ao Coordenador atual.
14. Confirmar que JSON de passagem aparece somente como opção de contingência.
15. Somente depois dessa matriz promover `BACKEND_V10_STATUS` de `EM_HOMOLOGACAO` para `ATIVO`.
