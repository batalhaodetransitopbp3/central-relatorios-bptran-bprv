# R258 — adaptador Google Apps Script Drive/Sheets para fotos do BO (NO-GO)

Data: 21/11/2026
Classificação: **REVISÃO ISOLADA; NÃO PUBLICAR, NÃO IMPLANTAR**.

## Entrega real de código

Esta revisão apresenta o primeiro adaptador de armazenamento fotográfico com **chamadas nativas documentadas do Google Apps Script**: `DriveApp`, `SpreadsheetApp`, `LockService`, `Utilities` e `PropertiesService`.

O código está pronto **para auditoria**, mas ainda **não foi executado contra uma conta Google real**. Os testes de integração usam objetos que reproduzem as interfaces dos serviços Google, arquivos JPEG fictícios e credenciais/identidades sintéticas. Não afirmar "Drive testado em nuvem" ou "implantação concluída".

Arquivos:
- `r258_gas_private_drive_sheets_adapter.js`: adaptador R239/R252 que grava originais JPEG em pasta Drive privada e eventos sequenciais de escrita em UMA aba Sheets de homologação, com encadeamento HMAC-SHA256 do histórico. A última versão de cada registro é reconstituída a partir do ledger de operações, sem atualizações mutáveis de linhas.
- `r258_gas_isolated_bootstrap.js`: lê propriedades de script **apenas depois** de conferir modo explícito de homologação; não cria tabelas, pasta, conta ou endpoint. A verificação `preflight()` apenas lê.
- `tests/r258_gas_private_drive_sheets_bridge.test.js`: valida regras de privacidade, recuperação de interrupções, sequência de páginas e integração completa sintética usando HTTP em loopback + JWT RSA falso + sessões R255 + ACL R252 + arquivo Drive/ledger Sheets simulados.

## Requisitos para eventual homologação real separada

1. Criar **um projeto Apps Script de HOMOLOGAÇÃO independente**, sem compartilhar a implantação `doPost` oficial, sem permissões operacionais e sem dados pessoais reais.
2. Provisionar previamente uma pasta Drive e uma planilha dedicadas, **sem acesso geral por link nem por domínio**. Verificar também usuários individualmente compartilhados e permissões herdadas com uma auditoria institucional; `getSharingAccess()===PRIVATE` não prova ausência de pessoas com acesso individual.
3. Na planilha isolada, criar manualmente uma aba de nome EXATO `BO_PHOTO_LEDGER_R258`, com a primeira linha:
   `seq | kind | event_id | object_key | payload_b64 | payload_sha256 | prev_hmac | row_hmac | recorded_at`
4. Configurar SOMENTE no projeto de homologação, por `PropertiesService.getScriptProperties()`, as propriedades:
   - `R258_BO_PHOTO_MODE = ISOLATED_HOMOLOGATION`
   - `R258_BO_PHOTO_FOLDER_ID = <ID da pasta de homologação>`
   - `R258_BO_PHOTO_SHEET_ID = <ID da planilha de homologação>`
   - `R258_BO_PHOTO_HMAC_KEY = <segredo aleatório exclusivo com pelo menos 32 caracteres>`
5. Carregar ambos os arquivos JavaScript no runtime V8 Apps Script. `R258BoGasIsolatedBootstrap.fromNativeGlobals()` é uma fábrica de adaptador; **não cria automaticamente uma rota HTTP, autorização pessoal, login ou deploy**. A autoridade individual e o BO canônico devem continuar sendo verificados por um serviço confiável compatível com o contrato R252.
6. Não executar testes com fotografias reais antes de um aceite de proteção de dados e de segurança. Nenhuma propriedade/id/token/chave real deve ser inserida no GitHub público.

## Segurança e comportamento

- `LockService.getScriptLock().tryLock(30000)` serializa gravações **dentro do mesmo projeto de Apps Script**. `SpreadsheetApp.flush()` antecede a soltura do lock.
- Os eventos REQUEST PENDING, FILE_STORED, PHOTO e REQUEST COMMITTED são linhas sequenciais imutáveis no mesmo ledger, cada uma contendo SHA-256 do payload, HMAC-SHA256 e referência ao HMAC anterior.
- O payload de metadados é representado como Base64Url, evitando que legendas iniciadas em `=`, `+`, `-` ou `@` virem fórmulas executáveis pelo Sheets.
- Arquivos são procurados pelo nome determinístico dentro de uma pasta exclusiva; duplicidade ou ausência de descrição de custódia causam falha fechada. Os bytes do arquivo Drive são relidos e o SHA-256 é verificado antes de reconhecer a operação.
- A verificação do compartilhamento geral é feita na pasta, na própria planilha e nos arquivos de foto. **Isso não substitui auditoria de ACL completa**, inclusive compartilhamentos individuais, herdados ou administradores de domínio.
- Nenhum `getUrl`, `setSharing`, `delete`, `setTrashed` ou endpoint de download está disponibilizado no adaptador; a exclusão exige nova política de custódia.
- Quando `DriveApp.createFile` foi bem-sucedido e `File.setDescription` falhou, o arquivo órfão é mantido e seu reuso é bloqueado até intervenção autorizada. Se a falha ocorrer depois de gravar a descrição e antes do commit na planilha, um reenvio de mesma ID recupera a gravação sem criar outra foto.
- Nenhuma identidade do usuário pode ser escolhida pelo cliente: as funções padrão `authenticate`/`getEvent` do adaptador **recusam operação**, e somente a camada pessoal de servidor R252 pode ser injetada para os testes.
- `releaseAllowed:false` em ambos os módulos, e nenhuma função de `doPost` ou `doGet` é fornecida.

## Testes

```powershell
node --test tests/r258_gas_private_drive_sheets_bridge.test.js tests/r257_signed_backup_restore.test.js tests/r256_photo_ledger_persistent_integration.test.js tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

**151/151 testes locais PASS:** R258 30; R257 22; R256 21; R255 15; R254 21; R253 24; R252 18.

R258 cobre integração HTTP real via loopback e provedores Google **simulados**, 9 fotos/3 páginas, replay, HMAC comprometido, audit trail interrompido, origem/identidade, pasta ou planilha pública, metadados ausentes, arquivo adulterado, concorrência, edição de legendas via fórmula, falhas injetadas de escrita Drive e Sheets, e configurações ausentes.

## PENDÊNCIAS EXTERNAS — GATE R163 NO-GO

1. **Não houve teste com APIs Google reais**, nem criação de pasta/planilha, nem upload de fotografia real. Os objetos de simulação não capturam integralmente quotas, latência, permission inheritance, comportamento específico de arquivos Google, limites de execução e eventual consistência do Drive/Sheets.
2. O login/sessão da R255 é implementado no Node e **não roda automaticamente no Apps Script V8**. É indispensável construir uma ponte/servidor institucional (sem tokens compartilhados), verificar OAuth real e vincular Google `sub` à matrícula e ao BO canônico em cadastro homologado.
3. As fotos do R258 são JPEGs privados do Drive; **não são os ciphertext AES-256-GCM da R256 local**. E o backup Ed25519 da R257 **não protege esses arquivos Drive nem essa aba Sheets**: desenhos de armazenamento distintos precisam ser unificados após aprovação institucional.
4. Os HMACs usam segredo injetado, não HSM nem armazenamento append-only WORM. É possível truncar o histórico até um prefixo válido sem detecção quando não existe um checkpoint externo; ausência de imutabilidade e auditoria por terceiro.
5. O scanner de ledger percorre todas as linhas em cada operação, tem limite de 12.000 registros e não foi dimensionado para as quotas reais do Apps Script. O `ScriptLock` protege somente um projeto, não implantação em múltiplas instâncias/projetos. Não há SLA/HA/backup externo de Sheets/Drive.
6. Faltam revisão de permissões institucionais, política de conservação e eliminação (LGPD), visualização autorizada, controle de anexo pós-fechamento do BO, homologação Index/RSD/RCO, Chrome Android/iPhone Safari físicos, dois militares reais e aceites independentes de segurança/operacional.
7. O gate externo R163 da Central permanece **NO-GO, 3/16 requisitos**, sem qualquer flexibilização pelos testes locais/CI. Nenhum merge ou deploy é permitido sem aprovação formal.

Documentação consultada: https://developers.google.com/apps-script/reference/drive/folder ;
https://developers.google.com/apps-script/reference/drive/file ;
https://developers.google.com/apps-script/reference/drive/drive-app ;
https://developers.google.com/apps-script/reference/lock/lock ;
https://developers.google.com/apps-script/reference/spreadsheet/sheet .
