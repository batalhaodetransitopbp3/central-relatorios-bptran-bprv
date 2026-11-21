# R256 — Arquivo fotográfico criptografado e journal durável do BO

Data: 21/11/2026
Estado: **CANDIDATE/NO-GO — revisão isolada, NÃO IMPLANTAR**.

## O que foi implementado e realmente testado

A R256 incorpora a primeira persistência **do conteúdo fotográfico** à cadeia R252 (autorização pessoal) + R253 (JWT assinado sintético) + R254 (API local) + R255 (sessão persistente).

- `r256_private_photo_ledger.cjs`: arquivos `.enc` privados localmente cifrados com **AES-256-GCM**, IV aleatório, tag de autenticação e metadados autenticados; SHA-256 sobre os bytes JPEG antes e depois do armazenamento. Nomes de arquivos são o SHA-256 de nomes estáveis; não contém diretamente número do BO ou matrícula. Guardados em diretório isolado no ambiente de teste, com tentativa de permissão restrita.
- Gravação crash-safe via arquivo temporário com `fsync` seguido de `hard link` final **sem sobrescrever** o destino, permitindo detecção de arquivo já existente e reenvio sem duplicação. O adaptador não apaga provas automaticamente.
- SQLite WAL com tabelas `bo_photo_requests` (PENDING / FILE_STORED / COMMITTED), `bo_photo_items` e `bo_photo_audit`; transações `BEGIN IMMEDIATE` e fila de bloqueio assíncrono por caminho de banco no mesmo processo, lock SQLite entre processos e unicidade da posição por BO.
- Auditoria encadeada por **HMAC-SHA256** de cada operação, conteúdo e hash anterior, e reconciliação do ledger com o arquivo real. Sem âncora externa WORM, truncamento integral do log e comprometimento simultâneo do banco/chave **ainda não são detectados**.
- `reconcile()` local identifica metadata sem arquivo, arquivo órfão após crash, escrita temporária abandonada, conteúdo modificado depois da auditoria, inconsistência de autoria/posição/hash e adulteração de arquivo cifrado. O sistema sinaliza, mas **não descarta automaticamente os vestígios**.
- Correção no núcleo R252 (somente nessa branch): um reenvio COMMITTED agora **também valida novamente o arquivo criptografado**; o journal sozinho não pode atestar um arquivo ausente ou corrompido.
- O adaptador **recusa a implementação de exclusão** até aprovação da custódia e não oferece endpoint público de visualização/download das fotografias.

## Testes executados no notebook

```text
node --test tests/r256_photo_ledger_persistent_integration.test.js tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

**99/99 PASS local**, sendo R256 21, R255 15, R254 21, R253 24, R252 18.

Evidências novas da R256:
- login fictício usando token RSA assinado e senha de sessão simulada → escrita persistente de foto → leitura de metadados autorizada;
- arquivos e registros sobrevivem à reinicialização; um processo Node separado consegue confirmar ledger+blob;
- 9 JPEGs fictícios em posições sequenciais, respeitando 4 por página;
- concorrência de duas conexões e também de **dois processos reais**, com falha segura da segunda escrita na mesma posição;
- crash depois de publicar blob mas antes de confirmar SQLite → órfão identificado → retry reconcilia sem novo arquivo;
- arquivo criptografado removido, adulterado ou usando chave errada recusa replay e sinaliza erro;
- alteração direta do journal ou dos metadados das fotos é detectada na comparação com a auditoria;
- rejeição de paths maliciosos, autor divergente, sessão encerrada e tentativa de exclusão sem autorização.

Os testes **NÃO** utilizaram fotos reais, identidade militar real, APIs Google reais de escrita, ou infraestrutura operacional. Todos os JWTs RSA foram criados com chave de teste privada, nunca emitidos pelo Google.

## Riscos impeditivos (NO-GO)

1. Armazenamento de fotos em **diretório local de teste e SQLite**, não no Google Drive nem em repositório institucional aprovado. Não há integração de `doPost` real, Drive ACL, backup cifrado, retenção, versionamento, eliminação segundo política, acesso de cadeia de custódia, visualização autorizada nem restauro em outro host.
2. A prova de unicidade sobre SQLite presume disco local e suporte a locks/hard links e atomicidade da mesma unidade. **Não é desenho Cloud Run/multi-host/HA**. No Windows, ACL do diretório e privilégios do serviço precisam ser especificados e auditados.
3. A auditoria HMAC não tem âncora WORM ou carimbo externo. Não basta para comprovar integridade forense em produção sem revisão institucional.
4. O servidor HTTP, as sessões e a identidade Google/matrícula ainda são módulos de teste, sem OAuth real, autorização individual cadastrada, serviço hospedado confiável, logs estruturados de acesso, quotas, rate limits, revisões CSRF/XSS e gestão real dos segredos.
5. Testes de ponta a ponta nos formulários BO acessados por Index, RSD, RCO, Android físico, Safari iOS físico, geração de PDF, 2 militares reais e aceite institucional/LGPD/segurança seguem externos.
6. O gate R163 de produção permanece **NO-GO** (último valor 3/16), e nenhuma verificação local altera isso. `releaseAllowed:false`.

## Escopo de alterações

Cópia Git worktree exclusiva `feature/bo-photo-ledger-r256-review`, derivada da R255. Somente o novo adaptador de arquivo, a regressão de confirmação do COMMITTED na R252, documentação, testes e workflow de CI. Sem `main`, sem merge/deploy, sem token real, sem Google Apps Script/Drive/Sheets.
