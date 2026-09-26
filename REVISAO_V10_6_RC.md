# Revisão v10.6 RC — RSD/RCO, passagem, análise e contingência

Branch de homologação: `feature/fluxos-rsd-rco-10-6`

> Esta branch é para avaliação. Não deve ser considerada produção até a homologação dos fluxos e a publicação do backend Apps Script correspondente.

## Escopo implementado

### RSD
- detecção de possível duplicidade antes de criar novo serviço;
- continuidade do registro existente;
- criação excepcional de segundo serviço somente com justificativa;
- distinção entre serviço raiz (`SERVICE_ID`) e segmentos;
- recebimento de passagem pela nuvem com lista de passagens disponíveis;
- preenchimento automático do serviço recebido e identificação do novo comandante pelo Cadastro Mestre;
- passagem em estado aguardando recebimento;
- retificação e cancelamento de passagem antes do recebimento;
- após o recebimento, o novo segmento pode retificar o registro da passagem ou solicitar a anulação do recebimento enquanto ainda não houver movimentação relevante;
- proteção de recebimento simultâneo;
- cancelamento lógico/auditável de RSD;
- no RCO, possíveis duplicidades podem ser comparadas antes da decisão, com identificação dos serviços raiz e segmentos;
- registros cancelados ficam ocultos por padrão e podem ser exibidos em `Mostrar cancelados (n)`, com motivo, autor e data/hora;
- se um RSD incorporado a um RCO ainda aberto for cancelado na origem, a próxima atualização o remove automaticamente da consolidação e recalcula os totais;
- estados de análise do Coordenador e devolutiva ao comandante;
- submenu de contingência `Inserir manualmente`;
- `Início do serviço (limpar histórico)`;
- `Salvar rascunho` e `Carregar rascunho` ao final da sequência auxiliar.

### RCO
- cadastro formal do CPU/P3/Oficial por matrícula e Cadastro Mestre;
- botão próprio `Receber passagem de serviço`, com busca em nuvem e cards somente dos RCOs disponibilizados;
- RCO recebido preserva o relatório existente, abre novo segmento de CPU e exige novo cadastro/autenticação do responsável;
- passagem do RCO pode ser retificada ou cancelada antes do recebimento;
- credencial de Coordenação separada da credencial operacional;
- P3/Oficial usa credencial administrativa;
- preenchimento automático do responsável pela consolidação no rodapé;
- substituto legal pesquisável no Cadastro Mestre;
- ações do Coordenador por RSD: Adicionar, Devolver para retificação, Excluir, Indeferir, Visualizar e Remover do RCO;
- decisões de análise usam seleção explícita entre `Deferido` e `Deferido com ressalvas`;
- devoluções usam motivos padronizados (identificação, comandante/efetivo, VTR, produção, operação, CIRVC, companhia/data, possível duplicidade ou outro);
- cancelamentos usam motivos padronizados (duplicidade, teste, guarnição incorreta, companhia incorreta, novo cadastro por engano ou outro);
- estados `DEFERIDO`, `DEFERIDO_COM_RESSALVAS`, `RETIFICACAO_SOLICITADA`, `INDEFERIDO` e `CANCELADO`;
- alerta de possível duplicidade considerando serviços raiz distintos, sem confundir segmentos legítimos do mesmo serviço;
- indicação de pendências antes da consolidação;
- bloqueio da consolidação P3 se houver pendências relevantes;
- qualquer RSD da unidade/data em `EM_SERVICO`, `PASSAGEM_DISPONIVEL`, `AGUARDANDO_ANALISE`, `RETIFICACAO_SOLICITADA` ou `INDEFERIDO` impede a consolidação até ser resolvido;
- remoção da inclusão independente de TCO; TCO permanece vinculado às ocorrências;
- submenu de contingência `Inserir manualmente`;
- funções de rascunho mantidas ao final;
- remoção do comando genérico `Limpar` do fluxo principal.

### Relatório de Operação
- removidos do menu principal: `Limpar operação atual`, `Salvar rascunho` e `Carregar rascunho`;
- criado `Apagar operações do histórico`, restrito ao histórico local;
- após salvar uma operação, o formulário fica pronto para a próxima;
- resumo superior agrupado por tipo/nome oficial da operação e quantidade.

## Novo módulo — Traslados do Reboque

Foi acrescentado um módulo independente para registrar veículos trasladados pelo reboque durante o serviço, inclusive quando o veículo não passou por CIRVC.

Campos do cabeçalho:
- data;
- turno/horário do serviço;
- prefixo da VTR/Reboque;
- militar mais antigo responsável.

Tabela:
- ordem automática (01, 02, 03...);
- nº do termo;
- marca;
- tipo do veículo em seleção;
- modelo;
- cor;
- placa;
- motivo: Transporte para DETRAN, Transporte para Delegacia, Sinistro de trânsito ou Outro;
- ao selecionar Outro, abre campo para especificação;
- bairro/cidade;
- nome/matrícula.

O módulo permite acrescentar e retirar veículos, mantém rascunho local do dia e gera PDF em A4 paisagem. A assinatura do militar responsável é feita em tela cheia, no mesmo padrão dos demais relatórios, e é inserida no PDF. Não há vistos do CPU ou do comandante da companhia.

Arquivos:
- `relatorio_traslados_reboque.html`
- `relatorio_traslados_reboque_ios.html`

O acesso foi incluído na página principal da Central.

## Gestão P3
### Sessão administrativa P3/Oficial

A Gestão P3 exige identificação formal antes de exibir os dados:

- perfil `P3` ou `Oficial responsável`;
- matrícula no padrão `000.000-0`;
- militar existente no Cadastro Mestre;
- validação da credencial `P3_TOKEN`;
- identidade mantida somente na sessão do navegador;
- a Tabela Operacional exige a mesma sessão e redireciona para identificação quando acessada diretamente;
- a reabertura de RCO para retificação não aceita mais autor digitado livremente: nome, posto/graduação e matrícula são recuperados do Cadastro Mestre e gravados na auditoria.


A Gestão P3 foi reorganizada em cinco acessos principais: **Painel Geral**, **Tabela Operacional**, **Histórico**, **Controle de RCOs** e **Power BI**.

- A Tabela Operacional fica em `tabela_operacional_p3.html` e segue a mesma ordem de grupos/indicadores do quadro do RCO, com colunas por guarnição e total.
- Histórico separa registros identificados como importação, legado, migração ou histórico da produção digital corrente.
- Controle de RCOs mostra responsável, modo de consolidação, versão, REPORT_ID e permite ao P3 reabrir formalmente um RCO finalizado para retificação, com motivo e autor.
- RCO finalizado não pode ser reaberto por autosave antigo. Após autorização do P3, ele entra em `EM_RETIFICACAO`, mantém o mesmo REPORT_ID e recebe versões incrementais a cada nova consolidação.
- O backend v10 reconhece `state.reportId`, lê corretamente o período do RCO e sincroniza diretamente a produção e o POD do pacote estatístico.
- Foi criada a base `VEICULOS_OPERACIONAIS` para registros civis detalhados, separada do Cadastro Mestre `VIATURAS`.
- O Painel Geral distingue motocicletas e automóveis abordados, AITs especiais (165, 165-A e 230 XI), AITs com abordagem e AITs sem abordagem.
- Power BI utiliza a configuração `POWERBI_URL`. Quando configurado e permitido pelo serviço Microsoft, o painel é exibido dentro da própria Gestão P3; o botão para abrir em nova aba permanece disponível.

## Backend Apps Script

A versão de código desta branch está identificada como `10.6.0-rc1`.

Além das propriedades já existentes, configurar nas **Propriedades do script**:

- `CENTRAL_TOKEN`: acesso operacional regular;
- `COORD_TOKEN`: nova credencial de CPU/Coordenação;
- `P3_TOKEN`: credencial administrativa P3/Oficial.

A publicação do arquivo `apps_script_v10.gs` no repositório **não publica automaticamente uma nova implantação do Apps Script**. Para homologar os fluxos em nuvem, a implantação utilizada pela Central precisa receber esse código e ser republicada.

## Novos/ajustados estados relevantes

RSD:
- `EM_SERVICO`
- `PASSAGEM_DISPONIVEL`
- `ENCERRADO_PASSAGEM`
- `AGUARDANDO_ANALISE`
- `DEFERIDO`
- `DEFERIDO_COM_RESSALVAS`
- `RETIFICACAO_SOLICITADA`
- `INDEFERIDO`
- `CANCELADO`
- `INCLUIDO_RCO`

Passagem:
- `AGUARDANDO_RECEBIMENTO`
- `RECEBIDA`
- `CANCELADA`
- `ANULADA`

## Reconciliação de retificações do RCO

A retificação do RCO é reconciliada nos dois sentidos, sem apagar os registros operacionais originais:

- `PRODUCAO`: a versão anterior do mesmo REPORT_ID é substituída integralmente, inclusive quando a nova versão não possui determinado item;
- `RCO_ORIGENS`: a relação de RSDs é reconstruída conforme a versão atual;
- `RSD`: relatórios que saem da nova versão perdem o vínculo com o RCO; se ainda estavam apenas em `INCLUIDO_RCO`, voltam ao resultado da análise anterior;
- `PRISOES` e `CIRVC_CUSTODIA`: vínculos antigos com o RCO são removidos e somente as origens atuais são vinculadas novamente;
- `POD_EXECUCAO` e `OPERACOES`: registros retirados da retificação deixam de apontar para aquele RCO, mas permanecem preservados como registros operacionais;
- `VEICULOS_OPERACIONAIS`: a versão detalhada dos veículos é reconstruída por REPORT_ID;
- a consolidação/retificação é protegida por `LockService`, evitando duas versões simultâneas do mesmo RCO;
- enquanto houver RCO `EM_RETIFICACAO` para unidade/data, não é possível iniciar um segundo RCO concorrente;
- a ponte v10 só é acionada depois que o envio P3 principal passa pelas validações e é submetido;
- se a Central v10 estiver indisponível/offline, o pacote complementar é preservado na fila de sincronização.

## Auditoria e segurança

- cancelamentos são lógicos, não exclusões físicas;
- motivos e responsáveis ficam registrados;
- RSD já incorporado ao RCO não pode ser cancelado silenciosamente;
- uma passagem pendente deve ser cancelada antes de cancelar o RSD de origem;
- `LockService` protege o recebimento simultâneo de passagem;
- `LockService` também protege a criação simultânea do primeiro RSD, a criação inicial de um RCO e a assunção do RCO por outro aparelho;
- RSD já finalizado/analisado não pode voltar silenciosamente para `EM_SERVICO`; ao tentar novo envio, a interface consulta e mostra a devolutiva existente;
- segmentos com o mesmo `SERVICE_ID` não são sinalizados como duplicidade entre si;
- registros JSON de contingência podem carregar origem `CONTINGENCIA_JSON`.

## Validação estática realizada

Em 25/09/2026:
- `apps_script_v10.gs`
- `central_cloud.js`: sintaxe JavaScript validada;
- scripts inline de RSD desktop/iOS: sintaxe validada;
- scripts inline de RCO desktop/iOS: sintaxe validada;
- scripts inline do Relatório de Operação desktop/iOS: sintaxe validada;
- não foram encontrados IDs HTML duplicados nos seis frontends modificados.

A validação estática não substitui homologação funcional com o Apps Script implantado.

## Roteiro de homologação

1. Criar um RSD novo.
2. Tentar cadastrar a mesma guarnição novamente.
3. Continuar o mesmo RSD em outro aparelho.
4. Criar excepcionalmente um segundo serviço e exigir justificativa.
5. Realizar passagem do RSD.
6. Localizar a passagem em `Receber passagem de serviço`.
7. Confirmar preenchimento automático de unidade, companhia, data, guarnição e VTR.
8. Identificar o novo comandante apenas pela matrícula e Cadastro Mestre.
9. Cancelar uma passagem antes do recebimento.
10. Retificar uma passagem antes do recebimento.
11. Tentar dois recebimentos simultâneos da mesma passagem.
12. Verificar que segmentos do mesmo `SERVICE_ID` não aparecem como duplicidade.
13. Verificar que dois serviços raiz incompatíveis/duplicados recebem alerta.
14. Cancelar um RSD duplicado pela própria guarnição.
15. Cancelar um RSD indevido pelo Coordenador.
16. Confirmar diferença entre `Remover do RCO` e `Excluir`.
17. Finalizar RSD e confirmar `AGUARDANDO_ANALISE`.
18. Deferir um RSD no RCO.
19. Deferir com ressalvas.
20. Devolver para retificação e conferir a mensagem no RSD.
21. Corrigir e reenviar o mesmo RSD, sem criar outro.
22. Indeferir e conferir `Contate o Coordenador`.
23. Registrar CPU com matrícula + credencial de Coordenação.
24. Registrar P3/Oficial com matrícula + credencial administrativa.
25. Conferir preenchimento automático do rodapé.
26. Pesquisar substituto legal por trecho do nome (ex.: `mir`) e por matrícula.
27. Testar `Inserir manualmente` no RSD e RCO.
28. Confirmar que `Início do serviço (limpar histórico)` não apaga nuvem.
29. Salvar diferentes operações e conferir o resumo nominal/quantitativo no topo.
30. Confirmar que TCO registrado em ocorrência acompanha o RSD/RCO sem cadastro independente ou duplicação.
31. Retificar o registro de uma passagem já recebida sem criar novo segmento.
32. Anular imediatamente um recebimento de passagem e confirmar retorno ao segmento anterior.
33. Confirmar bloqueio da anulação quando o novo segmento já possuir movimentação relevante.
34. Testar a assinatura em tela cheia do Relatório de Traslados do Reboque e sua impressão no PDF.
35. Tentar criar a mesma guarnição em dois aparelhos simultaneamente e confirmar que apenas um serviço raiz é criado.
36. Em um RCO com possível duplicidade, usar “Comparar registros” e conferir serviço raiz, segmentos, comandante, VTR, datas e conteúdo.
37. Cancelar um RSD já incorporado a um RCO ainda aberto e, ao atualizar a lista, confirmar sua retirada automática e o recálculo.
38. Usar “Mostrar cancelados” e conferir motivo, autor e data/hora do cancelamento.
39. Após deferir ou devolver um RSD, manter a tela antiga aberta e pressionar “Finalizar serviço” novamente; confirmar que o estado não é reaberto e a devolutiva é exibida.
40. Conferir os motivos padronizados de devolução e cancelamento no RCO e no cancelamento pela própria guarnição.
41. Manter um RSD em serviço ou aguardando análise e tentar “Consolidar P3”; confirmar que a consolidação é bloqueada com indicação de pendência.
42. Abrir a Gestão P3 e conferir os cinco acessos principais.
43. Comparar a Tabela Operacional com a ordem de grupos e indicadores do RCO.
44. Consolidar um RCO e confirmar sua presença no Controle de RCOs com versão e REPORT_ID.
45. Reabrir o RCO pelo P3 para retificação, informar motivo e autor, continuar o mesmo RCO e reenviá-lo.
46. Confirmar que o reenvio do mesmo RCO incrementa a versão e não duplica a produtividade.
47. Abrir Histórico e confirmar a separação entre dados importados/legados e produção digital.
48. Conferir a visualização Veículos e a separação entre motocicletas/automóveis abordados e AITs no Painel Geral.
49. Testar Power BI sem URL e, depois, com uma URL de homologação.
50. Retirar um RSD de um RCO já consolidado após reabertura formal para retificação; reenviar e confirmar que o RSD perde o vínculo com o RCO e que a produção dele deixa de compor a nova versão.
51. Em uma retificação, retirar uma operação/POD e confirmar que o registro operacional permanece existente, mas deixa de apontar para aquele RCO.
52. Em uma retificação, retirar um RSD com prisão e/ou CIRVC e confirmar que os registros permanecem preservados, porém sem vínculo com o RCO retificado.
53. Durante um RCO em `EM_RETIFICACAO`, tentar iniciar outro RCO para a mesma unidade/data e confirmar o bloqueio.
54. Tentar dois envios simultâneos do mesmo RCO e confirmar que a consolidação é serializada e não gera versões concorrentes.
55. Colocar o navegador offline no momento do envio complementar v10 e confirmar que o pacote fica na fila de sincronização, sem ser apresentado como “sincronizado”.
56. Clicar em “Enviar ao P3” sem chave ou com pacote inválido e confirmar que a ponte v10 não é disparada.
57. Confirmar que o cadastro do CPU exige `COORD_TOKEN` e o cadastro P3/Oficial exige `P3_TOKEN`.
58. Abrir a Gestão P3 sem sessão administrativa e confirmar que nenhum dado é carregado antes da identificação do P3/Oficial.
59. Identificar um P3/Oficial por matrícula + credencial e confirmar o nome/posto recuperados do Cadastro Mestre.
60. Abrir diretamente a Tabela Operacional sem sessão e confirmar o redirecionamento para a Gestão P3; após autenticar, confirmar o retorno automático à tabela.
61. Invalidar/limpar a Chave P3 durante a sessão e confirmar que a Gestão volta ao estado de identificação.
62. Reabrir um RCO para retificação e confirmar que o autor é preenchido automaticamente pela sessão administrativa, sem campo livre.
63. Informar uma senha de Coordenação inválida no cadastro do CPU e confirmar que a chave operacional regular da Central permanece intacta.
64. Informar uma credencial P3/Oficial inválida e confirmar que somente a sessão/chave administrativa P3 é encerrada, sem apagar a chave operacional.

## Arquivos alterados
- `apps_script_v10.gs`
- `relatorio_servico_diario.html`
- `relatorio_servico_diario_ios.html`
- `relatorio_cpu.html`
- `relatorio_cpu_ios.html`
- `relatorio_operacao.html`
- `relatorio_operacao_ios.html`
- `relatorio_traslados_reboque.html`
- `relatorio_traslados_reboque_ios.html`
- `gestao_p3.html`
- `tabela_operacional_p3.html`
- `ajuda.html`
- `index.html`
