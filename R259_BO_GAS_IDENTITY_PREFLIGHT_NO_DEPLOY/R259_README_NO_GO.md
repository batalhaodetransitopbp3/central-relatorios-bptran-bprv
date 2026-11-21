# R259 — Conta Google e área de homologação: verificação obrigatória antes de usar Drive/Sheets

Data: 21/11/2026
Situação: **REVISÃO ISOLADA / NO-GO — NÃO FAZER DEPLOY NO APPS SCRIPT OFICIAL**.

## Impedimento real encontrado

Uma chamada de **somente leitura** ao conector Google Drive retornou uma **conta corporativa/operacional**, distinta da conta de desenvolvimento anteriormente destinada a isolar os testes. Por segurança, **NENHUMA pasta, planilha, foto, propriedade, permissão ou script foi criado/editado nessa conta**. Não foram usados Google Drive/Sheets reais para validar o adaptador da R258.

Não publicar a identificação da conta/ID real no GitHub: os resultados públicos devem apenas registrar `CONNECTED_ACCOUNT_IS_NOT_APPROVED_TEST_ACCOUNT`, sem expor email, IDs ou token.

## Código produzido

`r259_gas_account_workspace_gate.js`: módulo puro e de somente leitura em Apps Script V8 com `releaseAllowed:false`, sem `doPost`, `doGet`, triggers, criação ou alteração de arquivo. Só autoriza o *candidato de homologação* se houver uma **política de autorização externa e independente** dos ScriptProperties:

- `expectedAccountEmail`: email exato da identidade executora do projeto de teste, previamente aprovada.
- `expectedScriptId`: ID exato do Apps Script de homologação, sem vínculo com o script oficial.
- `expectedFolderId` e `expectedSpreadsheetId`: recursos exclusivos de teste, cadastrados previamente com acesso geral privado.
- `protectedResourceIds`: IDs de fontes operacionais que **jamais** devem ser usados em testes.
- `disallowedAccountEmails`: contas operacionais que **não** podem executar a homologação.
- `requireEmptyLedger: true` para iniciar com apenas o cabeçalho, sem registros antigos.

**Ordem das verificações:** primeiro `Session.getEffectiveUser().getEmail()` e `ScriptApp.getScriptId()` (identidade ausente, conta operacional, conta ou script divergentes causam falha sem nenhum acesso Drive/Sheets); em seguida modo e IDs em `PropertiesService`; só então DriveApp lê pasta/planilha, proprietários, compartilhamentos gerais, editores/leitores diretos e a cadeia de pastas-pai. Por fim a aba `BO_PHOTO_LEDGER_R258` é lida e seu cabeçalho verificado.

`preflight()` devolve somente um resumo sanitizado, sem emails, tokens, chaves, IDs ou conteúdos fotográficos e com `filesWritten:0`, `releaseAllowed:false`, `productionDeployExecuted:false`.

`guardedStorage(storage)` é uma camada complementar ao adaptador R258 e à autorização pessoal R252: revalida conta/projeto/recursos **antes de tentar o script lock e novamente dentro do lock antes de gravar**. Mesmo se a identidade ou o compartilhamento mudar enquanto a operação aguarda, o acesso é recusado.

**Limite de privacidade:** `DriveApp.getSharingAccess()=PRIVATE` e `getEditors/getViewers` não atestam todas as permissões efetivas/institucionais nem regras de domínio. A auditoria das permissões herdadas com a API administrativa continua necessária. O resultado declara explicitamente `inheritedAclFullyVerified:false`.

## Procedimento obrigatório para um teste Google real posterior

1. Conectar ou autorizar, por ação expressa do usuário, a **conta Google de homologação**, diferente da conta operacional atualmente conectada. Confirmar o perfil ativo antes de qualquer escrita.
2. Em um projeto Apps Script **novo, isolado e manualmente provisionado**, criar recursos Drive/Sheets de teste sem fotografias pessoais. Usar apenas dados falsos.
3. Confirmar IDs e proprietários dos recursos, bem como permissões diretas e herdadas, por uma conta administradora com acesso à auditoria apropriada.
4. Registrar uma **política independente, revisada e mantida fora do repositório público**, com conta, projeto, IDs permitidos/proibidos.
5. Configurar exclusivamente nesse projeto de teste as propriedades `R258_BO_PHOTO_MODE=ISOLATED_HOMOLOGATION`, `R258_BO_PHOTO_FOLDER_ID`, `R258_BO_PHOTO_SHEET_ID`. Manter qualquer chave HMAC fora do repositório.
6. Rodar **apenas** a função de leitura `R259BoAccountWorkspaceGate.fromNativeGlobals(policy).preflight()`. Se houver qualquer falha, parar; não tentar contornar a proteção com login partilhado.
7. Somente após aprovação da conta/recursos e autorização institucional separada, testar a escrita sintética do R258 com identidade verificada do R252 e BO fictício. Esta etapa **NÃO FOI EXECUTADA** na R259.

## Testes e evidências

```powershell
node --test tests/r259_gas_account_workspace_preflight.test.js tests/r258_gas_private_drive_sheets_bridge.test.js tests/r257_signed_backup_restore.test.js tests/r256_photo_ledger_persistent_integration.test.js tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

**183/183 testes locais PASS:** R259 32 + R258 30 + R257 22 + R256 21 + R255 15 + R254 21 + R253 24 + R252 18. O teste novo valida 32 cenários, incluindo conta/projeto errados, email em branco, propriedades impostas, recursos protegidos, pasta/planilha públicas, proprietários divergentes, compartilhamento direto ou de pais, cabeçalho incorreto e revogação após a entrada no lock. Todas as identidades e recursos dos testes unitários são sintéticos.

## NO-GO e responsabilidades externas

- Nenhum upload em Google Drive, planilha real, login Google real nem autenticação institucional foi validado na R259. O conector Google atualmente apontava para **uma conta não autorizada para testes**. Recurso de homologação real continua pendente.
- Este módulo é um **pré-requisito**, não substitui OAuth/servidor R252/R255, política LGPD, governança e custódia, backup institucional, auditoria ACL completa, avaliação de quotas Apps Script ou testes Android/iOS.
- Bloqueio externo R163 continua no estado NO-GO enquanto faltarem suas evidências independentes; não há merge ou deploy desta branch.
- O projeto no GitHub é **público**: nenhum email real, token, chave, script ID ou folder ID deve ser gravado nas fontes ou nos testes.

## Referências técnicas oficiais

- Session.getEffectiveUser: https://developers.google.com/apps-script/reference/base/session
- ScriptApp.getScriptId: https://developers.google.com/apps-script/reference/script/script-app
- Drive Folder.getOwner / getEditors / getViewers / getSharingAccess: https://developers.google.com/apps-script/reference/drive/folder
- Drive File access/ownership: https://developers.google.com/apps-script/reference/drive/file
