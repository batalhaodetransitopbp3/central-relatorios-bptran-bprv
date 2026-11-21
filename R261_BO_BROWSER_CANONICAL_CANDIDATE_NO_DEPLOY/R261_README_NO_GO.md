# R261 — Contrato de cliente navegador ↔ sessão HTTP ↔ BO canônico

**Estado:** revisão isolada / NÃO PUBLICAR / R163 NO-GO.
**Origem:** R260 PR #40 (anexo visual R240 + pilha de segurança R252–R259).
**Data:** 21/11/2026.

## Entrega técnica

- `R261_BO_BROWSER_CANONICAL_CANDIDATE_NO_DEPLOY/r261_bo_browser_session_client.js`: cliente JavaScript independente, **não inserido nos HTMLs oficiais de BO**, sem `doPost`, sem solicitação automática de consentimento OAuth, sem conexão a Drive, sem cache ou leitura do cofre IndexedDB.
- Opt-in com `mode:'ISOLATED_HOMOLOGATION'` obrigatório; sem esse valor a construção falha. Requisições `POST` somente a caminhos relativos fixos da mesma origem `/bo-api/login/start`, `/bo-api/login/complete`, `/bo-api/photos/upload`, `/bo-api/photos/list`, `/bo-api/logout`.
- `credentials:'same-origin'`, `mode:'same-origin'`, `redirect:'error'`, `cache:'no-store'`, `referrerPolicy:'no-referrer'`; cookies `HttpOnly;Secure;SameSite=Strict` são responsabilidade do backend R255. O cliente retém somente o CSRF na memória da página, não em localStorage e não envia token de serviço compartilhado nem IDs de armazenamento para endpoints.
- O login precisa de um **Google ID Token verificado pelo servidor**, adquirido de um fluxo OAuth independente. Esta revisão NÃO implementa integração com Google Identity Services real: os tokens RSA dos testes são sintéticos.
- `formPayload` admite apenas `numeroBO`, `launch` (from, module e pistas de contexto) e, no upload, `photo` (requestId, photoId, position, caption, renderedDataUrl JPEG). Não aceita escolha de actorMatricula, eventId, token, unidade ou URL do Drive. Limites de formato e tamanho, validação e saída sem revelar fileId.
- **Ajuste opt-in no código de sessão R255**: se `canonicalMode='ISOLATED_HOMOLOGATION'`, exige `canonicalEventLookup` injetado por um backend confiável, impede campos extras do navegador e passa apenas pistas de navegação para o resolvedor R260. O serviço R260 decide o evento oficial único e o R252 revalida a matrícula e lotação pessoal dentro do lock R239.
- A rota HTTP R254 existente NÃO foi publicada, não foi iniciada fora de testes Node em `127.0.0.1`, e não há novo acesso à produção.

## Evidências e testes

```powershell
node --test tests/r261_browser_http_canonical_end_to_end.test.cjs tests/r260_unified_bo_context_security.test.cjs tests/bo_photo_annex_ci.test.cjs tests/r259_gas_account_workspace_preflight.test.js tests/r258_gas_private_drive_sheets_bridge.test.js tests/r257_signed_backup_restore.test.js tests/r256_photo_ledger_persistent_integration.test.js tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

R261 adiciona 17 testes de contrato HTTP completo usando servidor Node escutando exclusivamente no `127.0.0.1`, RSA/JWKS fictícios, cookies de sessão R255 em SQLite temporário criptografado, autorização R252, lookup canônico R260 e registros de foto totalmente sintéticos. Cobre Index/RSD/RCO, RCO sem RSD, 9 fotos e 3 páginas, replay idempotente, token compartilhado/campos indevidos, permissão revogada, BO duplicado ou cancelado, logout e proteção CSRF, conta não autorizada, ligação falsificada e cliente não carregado no BO oficial.

**Importante:** os testes usam `fetch` do Node para exercer o contrato implementado para navegadores. Os testes Chromium/WebKit do R240/PR #40 executam os HTMLs de BO locais; **não** validam este novo cliente R261 em navegador físico. A descrição dos resultados jamais deverá afirmar que o Google real foi integrado ou que Safari/iPhone físicos foram homologados.

## Limites / blockers

1. **Nenhum HTML da Central importou o módulo R261**. O R240 continua com anexos locais, protegidos por senha em IndexedDB. A biblioteca R261 não importa fotos do IndexedDB automaticamente e não é uma migração de evidências.
2. Backend Node R255 usa banco SQLite local como prova de conceito, não é a infraestrutura da Central Google Apps Script. Está pendente a instalação de serviço HTTPS/identidade institucional, controle de CSRF no domínio real e testes de segurança/pentests.
3. DriveApp/SpreadsheetApp R258 e pré-check R259 permanecem **não homologados com serviços Google reais**; a conta atualmente conectada é operacional e não foi autorizada para testes. Nenhum recurso real foi criado/editado.
4. A cadeia Google/Drive ainda não unifica armazenamento local cifrado R256/R257, persistência Drive R258, política WORM, backup offsite ou LGPD. O navegador não recebe URL de arquivo para consulta — o serviço de visualização autorizada depende de novo contrato formal.
5. O upload de uma imagem recortada é explícito; a ferramenta R240 de enquadramento é local e a R261 ainda não a invoca. É necessária uma UX de migração/proveniência e sincronização com confirmação do usuário, verificações antes de imprimir, salvamento parcial e recuperação.
6. R163: 13 itens externos pendentes. Esta CI **não constitui** aprovação de deploy ou alteração da `main`.

A revisão deve ser mantida `DRAFT`; `releaseAllowed:false`, `connectedToLiveBoPage:false`.

## Próximo passo somente após autorizações

Conectar uma conta Google de testes exclusivamente, validar e provisionar Drive/Sheets isolados por auditoria externa, executar preflight R259 e teste sintético na nuvem, construir um endpoint HTTPS institucional com sessão R255 / ponte canônica R260 / contrato R261 e testar em equipamentos físicos Android/iOS. O gate R163 deve aprovar independentemente a publicação.
