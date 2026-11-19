# R253 — Google OIDC RS256, prova criptográfica e ponte para R252

**Data:** 19/11/2026 (America/Fortaleza)
**Status:** revisão ISOLADA, **NO-GO** em produção. Candidata sem implantação.

## Avanço executado
A R252 recebia uma identidade previamente marcada como `SERVER_VERIFIED` por um adaptador ainda inexistente. A R253 fornece uma **implementação Node.js de verificação criptográfica** para esse contrato e um demonstrador do encadeamento para autorização por BO e journal R239.

- `r253_google_oidc_verifier.cjs`: valida assinatura RSA-SHA256 real de JWT Google **contra chave pública do JWKS confiável**, rejeitando alg=none, algoritmos diferentes, chave injetada no JWT (`jwk`, `jku`, `x5u`), adulteração de conteúdo, emissor fora de `accounts.google.com`, audience não configurada, token futuro/expirado/antigo, e-mail não verificado e nonce incorreto. Exige conta `@gmail.com` ou e-mail Workspace coerente com `hd` e vincula o militar ao `sub` estável via R252.
- `r253_pinned_google_jwks.cjs`: solicita **apenas** `https://www.googleapis.com/oauth2/v3/certs` por HTTPS; sem redirecionamento, com limite de tamanho, `Cache-Control` e falha fechada se chaves expirarem ou a atualização falhar. A URL nunca deriva de token.
- `r253_request_scoped_bo_bridge.cjs`: usa token recebido por canal servidor e nonce que deve vir de estado de sessão de servidor, converte identidade verificada ao contrato R252, que revalida cadastro/autorização por evento dentro do lock, antes de gravar com o núcleo de fotos endurecido.
- Não foram criadas rotas públicas, endereços de callback, credenciais, chaves privadas, banco de dados ou mudanças em documentos HTML/Apps Script.

## Evidências
Comando: `node --test tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js`.

**42/42 PASS** em testes locais (R253 24 e R252 18), usando RSA 2048 e JWTs **assinados em laboratório por chave PRIVADA SINTÉTICA** — jamais por chave privada do Google. Cobrem assinatura válida, invalidez, chave errada, alteração do payload, expiração, issuer/aud, nonce, conta não verificada, domínio Workspace, rotação/cache de JWKS simulados, negação de identidade e revogação de atribuição, escrita idempotente em Drive simulado, tentativa de falsificação do corpo e leitura segura de metadados.

Verificação pública, read-only, no notebook autorizado (Node.js): endpoint oficial JWKS do Google acessível, **2 chaves públicas RSA 2048 RS256** retornadas. Nenhum token de usuário foi consultado.

## Fundamentos oficiais do Google (consultados 19/11/2026)
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/apps-script/reference/base/session

O Google recomenda biblioteca de identidade apropriada na implementação de produção e diz que o endpoint `tokeninfo` serve para depuração, não para verificação operacional frequente. Apps Script executado como proprietário **não é prova segura da identidade individual do visitante**.

## Dependências críticas ainda pendentes
1. **Definição e implementação de ambiente Node/Cloud Run (ou equivalente) real** para verificação com a biblioteca oficial `google-auth-library`, ou arquitetura alternativa comprovadamente equivalente. Este código é protótipo isolado; NÃO assume que o Apps Script tenha API Node `crypto.verify`.
2. Configurar Client ID OAuth oficial e providenciar login GIS em domínio correto; obtenção e transmissão de ID token com HTTPS, proteção CSRF/origem, desafio nonce de sessão gerado e validado no servidor. **O nonce no teste é fictício; ainda não há gestão de sessões.**
3. Cadastrar/revisar vínculo administrado `Google sub ↔ matrícula` e autorizações por `EVENT_ID`, com revogação, auditoria, dupla revisão e política institucional. R252 já faz a checagem lógica, mas atualmente em registros falsos.
4. Concluir transporte seguro/verificável para Apps Script/Drive, custódia de originais, hash, metadados, lock persistente, journal e idempotência em Sheets, backups e restauração, incluindo falhas após Drive antes do ACK.
5. Provar fluxo real em dois usuários autenticados, Android Chrome e Safari iOS físicos, PDF e anexos do Index/RSD/RCO; aprovação institucional/LGPD e janela de rollback.
6. Gate geral R163 permanece 3/16 e **NO-GO**. Os PRs #30 (fotos no BO) e #32 (ACL R252) permanecem DRAFT; R253 é independente e empilhado sobre a branch R252.

**Aviso:** uma assinatura RSA correta no teste sintético comprova apenas o algoritmo da implementação. Não valida chaves privadas reais do Google, integração GIS, sessão do militar, proteção de transporte ou operação no Apps Script. Código inclui `releaseAllowed:false` e não tem entrada pública.

## Segurança da execução
Somente cópia Git worktree separada. Nenhum commit em `main`, nenhum `doPost` oficial, deploy Apps Script, mudança de ScriptProperties, Sheets, Drive ou fotos operacionais.
