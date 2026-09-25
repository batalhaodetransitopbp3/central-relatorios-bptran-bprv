# Implantação e Homologação — Central v10.5.1

## Estado atual
A Central v10 já possui Web App publicado. Esta etapa **não cria outro projeto** e **não troca a URL**. O objetivo é promover o código atual para a versão 10.5.1 e homologar as novas rotinas de continuidade em nuvem.

Endpoint atual:
`https://script.google.com/macros/s/AKfycbyxmDMgk-h2lTuf_6BvUngMLu-yMDvfenHNshQ3aa0V3lDPzh5kosUfiqm90IugmepPpw/exec`

## Atualização do Apps Script
1. Abra o projeto Apps Script v10 existente.
2. Abra `Code.gs`.
3. No GitHub, abra `apps_script_v10.gs` da branch `main`.
4. Confirme no início:
   `var CENTRAL_V10_VERSION = '10.5.1';`
5. Substitua todo o conteúdo de `Code.gs` pelo arquivo atual.
6. Salve.
7. Não altere `CENTRAL_TOKEN` nem `P3_TOKEN`.
8. Vá em `Implantar → Gerenciar implantações`.
9. Selecione a implantação atual e clique em editar.
10. Em versão, selecione **Nova versão**.
11. Descrição sugerida:
    `Backend V10.5.1 — continuidade em nuvem e passagem encadeada`
12. Mantenha execução como proprietário e o mesmo nível de acesso já homologado.
13. Clique em `Implantar`.
14. Confirme que a URL `/exec` permaneceu a mesma.

## Verificação de versão
Abra:
`<ENDPOINT>?action=version`

Resultado esperado:
`{"ok":true,"version":"10.5.1","schema":"central-v10"}`

Depois feche a Central, abra novamente e use `Ctrl + Shift + R`.

## Homologação — Cadastro Mestre e Registro da Guarnição
1. Abra o RSD.
2. Use `Início do serviço`.
3. Informe nome da guarnição.
4. Busque o comandante por matrícula ou nome/QRA.
5. Clique `Registrar guarnição no serviço`.
6. No RCO da mesma unidade/data, clique `Buscar guarnições / RSDs`.
7. Confirme status `EM_SERVICO` com guarnição e comandante.
8. Adicione a identificação ao RCO.
9. Finalize o RSD.
10. Atualize a lista do RCO e confirme `NOVA VERSÃO`.
11. Atualize a origem e confirme ausência de duplicidade.

## Homologação — Continuidade do mesmo comandante
1. Inicie e registre um RSD em aparelho A.
2. Digite alguns dados e aguarde alguns segundos para sincronização.
3. Em aparelho B, abra o RSD e clique `Continuar serviço`.
4. Informe a matrícula do mesmo comandante.
5. Selecione o RSD `EM_SERVICO`.
6. Se o aparelho A ainda possuir lease ativo, confirme `Assumir neste dispositivo`.
7. Verifique que o aparelho B recebe o **mesmo REPORT_ID**.
8. Edite um campo no aparelho B e aguarde sincronização.
9. No aparelho A, tente editar/sincronizar e confirme que ele não consegue sobrescrever a nuvem sem nova assunção.

## Homologação — Passagem de comandante da guarnição
1. Com o RSD do comandante 1 em andamento, clique `Realizar passagem de serviço`.
2. Confirme que o sistema finaliza/sincroniza automaticamente o segmento do comandante 1 antes de disponibilizar a passagem.
3. Em aparelho B, abra RSD e use `Início do serviço`.
4. Informe a mesma guarnição e identifique o comandante 2.
5. Clique `Receber passagem de serviço`.
6. Confirme:
   - mesmo `SERVICE_ID`;
   - novo `REPORT_ID`;
   - `SEGMENTO = segmento anterior + 1`;
   - RSD anterior vinculado;
   - VTR/contexto e pendências preservados;
   - produtividade zerada.
7. Adicione produção própria do comandante 2.
8. Finalize o novo RSD.

## Homologação — Operações por segmento
1. No segmento 1, abra Relatório de Operação.
2. Confirme preenchimento automático de unidade, data, guarnição, VTR(s) e responsável.
3. Salve uma operação.
4. Após a passagem, no segmento 2, salve outra operação.
5. No RSD do segmento 2, clique `Carregar operações do dia`.
6. Confirme que a operação do segmento 1 **não** é importada para o segmento 2.
7. Confirme que a operação do segmento 2 é importada.
8. No RCO, adicione os dois RSDs e confirme soma cumulativa da mesma guarnição sem apagar o segmento anterior.
9. Na Gestão P3, confirme duas operações independentes, cada uma com seu `RSD_REPORT_ID` e segmento.

## Homologação — Continuidade do Coordenador
1. Abra o RCO.
2. Preencha dados e clique `Salvar RCO na nuvem` pelo menos uma vez.
3. Faça alterações e aguarde autosave.
4. Em outro aparelho, abra o RCO e clique `Continuar serviço`.
5. Se necessário, selecione o RCO correto.
6. Confirme o mesmo `REPORT_ID`.
7. Se o outro aparelho ainda estiver ativo, aceite a assunção.
8. Confirme que o aparelho anterior não sobrescreve o novo.

## Homologação — Passagem do Coordenador
1. No RCO, identifique o coordenador atual.
2. Clique `Realizar passagem de serviço`.
3. Confirme que a passagem é sincronizada na nuvem.
4. No aparelho do substituto, abra o RCO e clique `Continuar serviço`.
5. Carregue o mesmo RCO.
6. Confirme a assunção como novo Coordenador.
7. Verifique que:
   - o mesmo RCO continua;
   - o coordenador anterior permanece bloqueado na auditoria;
   - é criado novo slot de autoria (CPU 2, CPU 3...);
   - novas alterações pertencem ao coordenador atual.
8. JSON deve aparecer apenas como:
   - `Exportar passagem JSON (contingência)`;
   - `Receber passagem JSON (contingência)`.

## Homologação complementar
- RSD Android/Chrome e iOS/Safari.
- RCO desktop e iOS/Safari.
- Múltiplas VTRs no RSD.
- Retificação de RSD.
- Duas operações distintas no mesmo dia.
- Local previsto x local executado.
- RCO normal e modo sem CPU.
- Checklist 1 VTR por checklist, assinatura, fotos e alteração.
- Motomecanização: ABERTA → EM_ANALISE → EM_MANUTENCAO → SOLUCIONADA.
- CIRVC: cadastro, custódia, transporte, dupla carga bloqueada, entrega ao DETRAN.
- Gestão P3: Controle Diário, Produtividade, Análise, Operações, Prisões/Conduções, CIRVC e Auditoria.
- Power BI: persistência do `POWERBI_URL`.
- Offline: preservar dados/fila e sincronizar após reconexão.
- `Início do serviço`: confirmar que dados do serviço anterior são zerados e que `CENTRAL_TOKEN`, `P3_TOKEN`, fila de sincronização e ID do dispositivo permanecem.

## Promoção para ativo
Somente depois de toda a matriz:
1. Alterar `CONFIG.BACKEND_V10_STATUS` de `EM_HOMOLOGACAO` para `ATIVO`.
2. Registrar a versão homologada no checkpoint.
3. Validar novamente GitHub Pages em desktop, Android/Chrome e iOS/Safari.
4. Manter o backend legado preservado enquanto houver necessidade de compatibilidade.
