# R255 — Persistência de sessão em SQLite criptografado (REVISÃO ISOLADA)

Data: 21/11/2026
Decisão: **NO-GO em produção.** Apenas testes locais com identidades/BO/fotos fictícios.

## Entrega técnica

- `r255_encrypted_sqlite_store.cjs` usa SQLite do Node 24, journaling WAL e transações `BEGIN IMMEDIATE`. Os cookies/desafios nunca aparecem em texto claro na base: as chaves são indexadas com HMAC-SHA256 usando segredo de 32 bytes, e o conteúdo é autenticado e criptografado com AES-256-GCM, IV aleatório de 12 bytes, tag de 16 bytes e AAD vinculada à coleção e chave indexada.
- Os estados de desafio de login e sessão foram separados em namespaces `challenge` e `session`, persistentes no mesmo banco. O desafio é consumido/invalidado numa transação antes de validar o token, inclusive entre duas conexões/processos.
- `r255_server_session_gate.cjs` adapta a R254 para receber stores persistentes obrigatórios (nunca cria um Map implícito); revalida a sessão pela revisão criptograficamente aleatória a cada autorização de operação, inclusive dentro do lock de anexação.
- Nenhuma chave real ou banco SQLite integra este repositório. O segredo simulado é gerado aleatoriamente nos testes; infraestrutura de produção precisará de gerenciamento de segredos, permissões NTFS/Unix restritas, backups criptografados e rotação de chaves.
- Nenhum código HTTP foi exposto na internet; reutilizamos o adaptador de API R254 e conectamos apenas a `127.0.0.1` durante os testes.

## Evidência reproduzível

```text
node --test tests/r255_sqlite_durable_session_integration.test.js tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js
```

**78/78 PASS no notebook**, correspondendo a R255 15, R254 21, R253 24, R252 18.

Entre os 15 cenários novos:
- ciphertext/identificadores protegidos e ausência de segredo de sessão legível em arquivos SQLite/WAL;
- consumo irrepetível de desafio por outro processo Node e por duas conexões simultâneas;
- reinicialização em etapas do fluxo real de requisições HTTP em loopback e restauração de sessão autorizada;
- cross-process logout e revogação de autorização durante lock de gravação;
- expiração e CSRF/origem inadequados após reinicialização;
- detecção de ciphertext manipulado e rejeição de chave de criptografia incorreta;
- falha fechada sem store persistente e desafio expirado não reutilizável.

Nenhuma identidade Google autêntica, arquivo Drive real ou planilha operacional foi acessado durante esses testes.

## Pendências e condições de NO-GO

1. O SQLite do exemplo é **um único nó local**, não alta disponibilidade nem replicação. Para produção em múltiplas instâncias o contrato deve usar armazenamento transacional comum (p. ex., Cloud SQL/Postgres com transações e locks) ou um servidor dedicado com backups/restore e engenharia de disponibilidade; nenhuma dessas integrações está aqui.
2. Não existe provedor de autenticação Google de produção com Client ID autorizado, origem/nonce gerenciados pela aplicação e biblioteca oficial com suporte institucional; testes usam chaves RSA privadas **sintéticas**.
3. Não há cadastro institucional de subject Google ↔ matrícula, designação por evento e trilha de auditoria homologada. R252 é um contrato verificado com dados sintéticos.
4. Não foi implementado o arquivo fotográfico persistente no Drive/Sheets, nem política de retenção, download autorizado, retificação, backup/restore ou mecanismo real de reconciliação do journal R239.
5. Dependem de validação física os fluxos de Index/RSD/RCO em Android/iOS e PDF. O gate R163 externo ainda é **NO-GO (último resultado 3 de 16 requisitos)**.
6. Faltam revisão independente de segurança (incluindo proteção XSS e CSRF real, headers HTTPS efetivos, rate limit, monitoração e controle de sessões) e aceite LGPD/operacional. `releaseAllowed=false`.
7. A chave AES-GCM HMAC/criptografia compartilhada pelo exemplo não é um desenho completo de rotação. Não usar o SQLite real do cliente sem backups consistentes com WAL, restrição de acesso ao host e política de custódia.

## Escopo seguro

Branch de código separada da produção, derivada da R254. Nenhum merge, deploy, ScriptProperty, Apps Script, HTML do BO, planilha, fotografia real ou token OAuth real. O GitHub Actions executa apenas testes.
