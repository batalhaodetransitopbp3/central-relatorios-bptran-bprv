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
- estados `DEFERIDO`, `DEFERIDO_COM_RESSALVAS`, `RETIFICACAO_SOLICITADA`, `INDEFERIDO` e `CANCELADO`;
- alerta de possível duplicidade considerando serviços raiz distintos, sem confundir segmentos legítimos do mesmo serviço;
- indicação de pendências antes da consolidação;
- bloqueio da consolidação P3 se houver pendências relevantes;
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

## Auditoria e segurança

- cancelamentos são lógicos, não exclusões físicas;
- motivos e responsáveis ficam registrados;
- RSD já incorporado ao RCO não pode ser cancelado silenciosamente;
- uma passagem pendente deve ser cancelada antes de cancelar o RSD de origem;
- `LockService` protege o recebimento simultâneo de passagem;
- segmentos com o mesmo `SERVICE_ID` não são sinalizados como duplicidade entre si;
- registros JSON de contingência podem carregar origem `CONTINGENCIA_JSON`.

## Validação estática realizada

Em 25/09/2026:
- `apps_script_v10.gs`: sintaxe JavaScript validada;
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

## Arquivos alterados
- `apps_script_v10.gs`
- `relatorio_servico_diario.html`
- `relatorio_servico_diario_ios.html`
- `relatorio_cpu.html`
- `relatorio_cpu_ios.html`
- `relatorio_operacao.html`
- `relatorio_operacao_ios.html`
