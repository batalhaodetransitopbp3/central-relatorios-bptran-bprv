# R257 — Backup assinado e restauração verificada das fotos do BO

Data: 21/11/2026
Situação: **CANDIDATO ISOLADO / NO-GO — NÃO IMPLANTAR**.

## Resultado técnico

Esta revisão avança sobre R256 (#36): os arquivos JPEG cifrados e o ledger de custódia locais de teste passam a ter um mecanismo isolado de snapshot e recuperação, **sem integração com Drive/Google Apps Script**.

- **Backup online consistente de SQLite** por `node:sqlite.backup`, sem copiar diretamente um banco em uso por operações de escrita.
- **Evidência protegida:** apenas arquivos `.enc` de AES-256-GCM e um SQLite consistente; os bytes JPEG, sua identidade pessoal e seu número de BO não são colocados no manifesto de backup.
- **Manifesto assinado Ed25519:** registra algoritmo/versão, ID do snapshot, data, SHA-256 e tamanho do SQLite e de cada blob, número de registros e tip da auditoria da R256. A assinatura só é aceita com a chave pública confiável fornecida independentemente.
- **Backups imutáveis por convenção:** diretório novo com UUID, jamais sobreposição de snapshot ou de restauração existente; manifesto e arquivo passam por fsync antes de publicação atômica.
- **Isolamento de operação SQLite:** checkpoint, leitura de auditoria, WAL/SHM e os arquivos transitórios do VFS são manipulados **somente em pastas descartáveis**, fora do diretório final assinado. Compatibilidade Windows e Linux. Nenhum arquivo transitório ou fragmento de journal entra no backup publicado.
- **Verificação independente do snapshot:** valida assinatura Ed25519, esquema, layout permitido, SHA-256 da base, SHA-256 de cada foto cifrada, existência/arquivos regulares e não segue links simbólicos do pacote. A verificação criptográfica **não abre nem modifica** o SQLite assinado.
- **Restauração de segurança:** copia para diretório temporário separado; revalida o manifesto, a integridade da cópia, o AES-GCM dos originais JPEG e a cadeia HMAC/ledger usando outra cópia temporária do SQLite; só então publica o diretório restaurado. Em qualquer erro, elimina o staging e preserva o destino.
- **Controle de mudanças durante operação:** alterações em fonte/staging antes de publicação são detectadas; nenhuma exclusão do acervo original é executada.
- Todos os métodos retornam `releaseAllowed:false`. Nenhuma chave real, banco real, fotografia operacional, token OAuth ou arquivo pessoal está no Git.

## Testes executados

```powershell
node --test tests/r257_signed_backup_restore.test.js tests/r256_photo_ledger_persistent_integration.test.js tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

**121/121 PASS no notebook com Node 24:** R257 22 + R256 21 + R255 15 + R254 21 + R253 24 + R252 18.

A bateria completa de 121 testes foi repetida **4 vezes consecutivas** após resolver problemas transitórios do VFS Windows. Os 22 casos novos cobrem: restauração de 9 fotos em 3 páginas, snapshot vazio, evolução da origem após backup, assinatura adulterada, chave verificadora falsa, alteração de blob/base, arquivo extra, falta de chave de descriptografia e HMAC, backup de origem com evidência ausente, mutação no meio da cópia, falha injetada antes da publicação, proibição de sobrescrever restaurações existentes, corrupção nos instantes finais de backup/restore, proteção contra exposição de dados em manifesto, destino inadequado e chave Ed25519 incoerente.

## Limitações graves e status NO-GO

1. **A solução é um protótipo local.** NÃO há envio para Drive/Sheets, gestão de segredos institucional, conta Google real, login GIS autenticado, serviço HTTPS ativo, backup offsite, retenção adequada ou recuperação testada em equipamento de outro operador.
2. A chave de assinatura Ed25519, sua custódia, HSM/Secret Manager, ancoragem independente e o controle de versões não estão implantados. Assinar um manifesto local não cria trilha WORM nem garante integridade perante atacante com acesso às chaves.
3. AES-256-GCM e HMAC derivam de chaves injetadas pelo servidor; não existe gestão de restauração sem chaves, rotação, escrow, revisão por duas pessoas, segregação de funções e política formal de eliminação/retificação.
4. A restauração é **offline e em novo diretório**, nunca automatiza publicação para produção. A integração da foto com o BO no Index/RSD/RCO ainda não foi homologada contra servidor Google e dois militares reais em aparelho Android/iOS.
5. Falta projeto institucional de infraestrutura, controle de acesso, trilha imutável de auditoria, avaliação LGPD, proteção contra malware/ransomware, teste de recuperação de desastre, revisão de segurança independente e execução do gate externo R163. O gate permanece NO-GO (última aferição: 3/16, 13 ausentes).
6. A API atual não oferece exportação das imagens em claro para terceiros, uma funcionalidade que exigiria autorização por evento e fluxo de custódia formal.

## Escopo Git

Branch exclusiva `feature/bo-photo-recovery-r257-review`, com apenas o arquivo `r257_signed_evidence_snapshot.cjs`, os testes `r257_signed_backup_restore.test.js`, este README e uma execução de CI sem segredos. Não altera o `main`, o arquivo de BO oficial, as folhas operacionais, os serviços Drive nem o Apps Script.
