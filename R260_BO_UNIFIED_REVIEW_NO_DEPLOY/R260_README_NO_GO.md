# R260 — BO: revisão unificada Index / RSD / RCO com cadeia R252–R259

**Data:** 21/11/2026
**Resultado:** CANDIDATO EM BRANCH ISOLADA / `NO_GO` / NÃO IMPLANTAR.
**Google Drive:** nenhuma gravação em conta real, nenhuma implantação de Apps Script.
**Produção:** `main`, Google Apps Script, Sheets, Drive e usuários operacionais preservados.

## Integração realizada nesta branch

Esta revisão reúne, por um **merge Git de revisão (não em `main`)**, as 7 alterações do PR #30 (R240, layout visual dos anexos nos BO HTML normal e iOS) e a pilha das R252–R259 (identidade pessoal, sessão, evidência cifrada local, backup assinado, adaptador Google Apps Script isolado e verificação de conta/ACL).

O merge não apresentou conflitos. As duas páginas BO contêm interface para escolher/cortar enquadramento de fotos, legendas e impressão com 4 fotografias por página. Os links existentes no Index, RSD e RCO apontam para essa família de páginas.

Adição própria da R260:

- `r260_canonical_entry_bridge.js` é um **resolvedor exclusivamente de backend**: recebe pistas de navegação Index/RSD/RCO, número canônico do BO e um serviço de consulta do BO verdadeiro, obtido independentemente da entrada do cliente.
- A consulta por número de BO precisa retornar **exatamente um evento canônico**; nem a URL, nem o formulário, nem localStorage selecionam o eventId privilegiado.
- A autoridade pessoal R252 precisa autenticar novamente o usuário e validar sua designação para o evento real; o adaptador R239/252 revalida as permissões novamente dentro do lock na efetiva gravação.
- A navegação RSD exige serviceId + rsdReportId, e os valores precisam coincidir com o evento real. A navegação RCO aceita a URL real `from=rco` sem IDs na query (o contexto RCO fica no browser), mas exige o vínculo canônico no servidor, sem confiar no localStorage.
- Se Index, RSD e RCO apontarem ao **mesmo BO canônico**, todas as operações do mock de arquivo usam o mesmo eventId. RCO independente sem serviceId pode trabalhar com rcoReportId legítimo.
- Exige evento BO ativo e não bloqueado, vínculo com serviço ou RCO, mesmo batalhão/companhia e autorização pessoal. Nega enumeração ambígua, número inexistente, evento cancelado, tentativa de escolher matrícula/tokens/eventId, RSD falsificado, RCO falsificado e revalidação após alteração da designação.
- **Não adiciona nenhuma rota HTTP, API de fotos real, script Google ou mudança de sincronização à interface.** `connectedToLiveBoPage:false` e `releaseAllowed:false` explicitamente.

## Limites críticos que NÃO foram superados

1. **O anexo visual R240 continua offline** (IndexedDB criptografado com senha local), sem sincronização com Drive/Sheets. Uma cópia do HTML e a implementação de um resolvedor de servidor não fazem a ligação automática. Os arquivos anexados em um navegador não surgem em outro computador.
2. A R255 usa Node SQLite para sessão. O Apps Script V8 não executa automaticamente esse Node backend. As R258–R259 foram testadas com APIs simuladas; nenhuma conta Google homologada ou endpoint institucional de fotos foi provisionado.
3. O Drive conectado está em uma **conta operacional não aprovada para teste**, portanto **nenhum recurso, arquivo, permissão ou configuração Google foi criado/editado**.
4. A navegação RCO preenche parte do contexto em localStorage. O resolvedor R260 deliberadamente ignora esse dado para autorização e exige consulta canônica do servidor, que ainda precisa de interface real contra o backend de BO.
5. R256/R257 cifram e assinam arquivos **locais**. R258 guarda JPEG original em Drive privado de teste. As soluções não constituem uma única cadeia de custódia institucional nem backup homologado de conteúdo em Drive.
6. A interface R240 permite remover foto **do armazenamento local**, enquanto o servidor R258 bloqueia exclusão sem política de custódia. A reconciliação, a retenção e a visualização controlada devem ser acordadas formalmente.
7. R163 permanece `NO_GO`: evidências independentes ausentes para os 26 cenários R81, 8 checkpoints, autorização de staging, aprovação de deploy, execução R82, gate R162, inventário de escritores, backup restaurável, roundtrip multi-módulo, conciliação de IDs legados, provas em aparelho físico/PDF, revisão de segurança e testemunha externa. Testes locais/CI **não podem** compensar esses 13 bloqueios.

## Verificações concluídas

Comando, sem segredos e sem Google real:

```powershell
node --test tests/r260_unified_bo_context_security.test.cjs tests/bo_photo_annex_ci.test.cjs tests/r259_gas_account_workspace_preflight.test.js tests/r258_gas_private_drive_sheets_bridge.test.js tests/r257_signed_backup_restore.test.js tests/r256_photo_ledger_persistent_integration.test.js tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

**215/215 PASS**, incluindo R260 **21 novos cenários**, R240 **11 verificações estáticas**, R252–R259 **183 testes anteriores**. A suíte completa passou **duas vezes seguidas** no notebook de homologação com Node 24. A CI separada da R240 executa testes de navegação RSD/RCO/Index e impressão em navegador Chromium e WebKit simulados; esses testes não substituem os físicos Android/iPhone/Safari.

## Próxima porta de homologação (externa)

- Conectar conta Google dedicada a desenvolvimento/homologação, diferente da conta operacional e confirmada pelo operador.
- Criar/verificar projeto Apps Script, pasta e Sheets de teste independentes com propriedade/ACL revisadas fora do repositório público.
- Executar o pré-check R259 de **somente leitura** com política aprovada; depois autorizar, separadamente, escritas **sintéticas** do R258.
- Homologar uma implementação real de servidor confiável que ligue R252/R255/R260 ao frontend R240, com segurança de sessão, CSRF, HTTPS, autorização por evento e armazenamento/recuperação institucional.
- Testar BO real do serviço simulado a partir de Index/RSD/RCO, com anexos em 4 fotos/página no PDF e equipamentos Android/iOS físicos; verificar multiusuário e segregação de acesso.
- Obter as aprovações independentes e documentar cada requisito R163. **Não publicar antes do release gate aprovar expressamente.**

Nenhuma foto ou credencial real está nesta revisão.
