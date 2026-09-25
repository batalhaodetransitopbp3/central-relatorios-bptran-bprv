# Revisão técnica — Central v10.5.0

## Escopo atual
- RSD em nuvem com registro da guarnição e comandante.
- Continuidade do mesmo RSD em outro aparelho.
- Controle de assunção de edição entre dispositivos.
- Passagem encadeada com `SERVICE_ID` e segmentos por comandante.
- Operações individualizadas e vinculadas ao segmento/RSD responsável.
- RCO com múltiplos segmentos da mesma guarnição sem perda de produção anterior.
- RCO com rascunho em nuvem e continuidade entre aparelhos.
- Passagem de Coordenador no mesmo RCO com slots sucessivos de auditoria.
- Cadastro Mestre global de militares.
- Múltiplas viaturas no RSD; checklist permanece 1:1.
- CIRVC, Checklist/Motomecanização, Gestão P3 e Power BI preservados.

## Revisões executadas
1. Sintaxe de `apps_script_v10.gs` e `central_cloud.js`.
2. Sintaxe dos scripts inline de RSD, RCO e Relatório de Operação em desktop/iOS.
3. Conferência das rotas frontend/backend.
4. Conferência dos cabeçalhos reais da Base P3.
5. Deduplicação por IDs estáveis.
6. Separação de produção por segmento após passagem de comandante.
7. Preservação do resumo estatístico das operações recuperadas da nuvem.
8. Controle de edição por dispositivo/lease.
9. Autosave periódico separado da auditoria.
10. Preservação de credenciais ao iniciar novo serviço.
11. JSON mantido apenas como contingência nos fluxos principais.

## Estruturas verificadas na Base P3
- RSD: campos de `SERVICE_ID`, segmento, RSD anterior, passagem, rascunho e lease.
- PASSAGENS_SERVICO: serviço contínuo e segmentos.
- OPERACOES: vínculo a serviço, segmento e comandante.
- RCO_RASCUNHOS: persistência do RCO em andamento.
- `CONFIG.BACKEND_V10_STATUS = EM_HOMOLOGACAO`.

## Ponto ainda dependente de implantação
O código atual 10.5.0 está em `main`, mas precisa ser promovido na implantação Apps Script existente. A publicação só será considerada concluída quando `?action=version` retornar `10.5.0`.

## Segurança
- `CENTRAL_TOKEN` e `P3_TOKEN` permanecem fora do repositório.
- Backend legado não deve ser removido durante a homologação.
