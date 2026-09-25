# Revisão técnica — Central v10

## Escopo implementado
- RSD em nuvem, versionado e disponível ao RCO sem envio de JSON.
- Múltiplas viaturas no RSD e demais relatórios compatíveis; checklist permanece 1:1 com VTR.
- Passagem de serviço persistente.
- Cadastro mestre de militares e viaturas; matrícula canônica `000.000-0`.
- Operações individualizadas e vínculo POD previsto x execução real.
- Ocorrências e prisões/conduções estruturadas.
- RCO com origens preservadas e modo sem CPU.
- Cadeia de custódia CIRVC até entrega ao DETRAN.
- Banco separado de Checklist/Motomecanização, fotos fora da planilha.
- Gestão P3 com controle, produtividade, análise, operações, prisões, CIRVC e auditoria.
- Ponto central de vínculo com Microsoft Power BI.

## Revisões executadas
1. Validação sintática de todos os JS/GS e scripts inline dos HTMLs alterados.
2. Conferência de todas as ações chamadas pelo frontend contra as rotas do backend.
3. Conferência automática das abas referenciadas pelo backend contra as abas reais das duas planilhas.
4. Revisão dos contratos reais de RSD, Operações, RCO, CIRVC e Checklist.
5. Revisão de deduplicação/versionamento por IDs estáveis.
6. Revisão específica de Android/iOS do bloco Operação/POD.
7. Revisão do risco de dupla contagem das operações: registro detalhado é preservado e o vínculo RSD/RCO não multiplica a produtividade.
8. Revisão de segurança: tokens não são versionados no repositório.

## Erros encontrados e corrigidos durante a revisão
- Layout móvel do bloco Operação/POD.
- Caractere de quebra inválido no bootstrap de `central_cloud.js`.
- Rota `operation-upsert` perdida durante uma edição posterior.
- Uso inicial de uma planilha duplicada de Checklist; a duplicata foi excluída e o código foi apontado para a base oficial já existente.
- Divergência de nomes de campos entre o banco oficial de Motomecanização e o primeiro protótipo.
- Payload aninhado da passagem de serviço.
- Ativação tardia do CIRVC após o probe assíncrono do backend.
- Risco de o resumo do RSD sobrescrever a linha detalhada da operação.
- Uso da chave errada no fechamento suplementar do RCO.
- Marcação unitária de RSD no RCO quando o frontend envia lote.
- Validação sintática do checklist após acréscimo da conferência de itens.
- Persistência da assinatura do checklist no Drive.

## Ponto ainda dependente de implantação
O código do backend v10 está pronto na branch, mas precisa ser publicado como um **novo** Google Apps Script Web App. O backend legado não deve ser substituído.
