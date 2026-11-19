# R254 — sessão BO com nonce, CSRF e API HTTP local: NÃO PUBLICAR

**Data:** 19/11/2026
**Status:** revisão ISOLADA (DRAFT/NO-GO). Nenhuma conexão operacional.

## Construído
- `r254_server_session_gate.cjs`: desafio por login de uso único, nonce criptograficamente aleatório (32 bytes) vinculado ao ID token verificado pelo R253, CSRF separado para conclusão e operações, cookie de login/sessão `__Host-` com `Secure; HttpOnly; SameSite=Strict; Path=/`; troca/rotação de sessão após login; logout; expiração curta; origem HTTPS fixa. Em memória conserva apenas identidade validada (e não token bruto).
- `r254_http_handler.cjs`: rotas POST JSON específicas, sem CORS permissivo; rejeita query strings, cookie duplicado, origem indevida, métodos diferentes, payload acima de 3 MB e operações não permitidas. Respostas de erro genéricas sem vazamento de credenciais.
- Integração lógica completa com a checagem pessoal R252 + arquivo privado simulado R239; ambas impõem as atribuições ativas de BO. Sessão e permissão são revalidadas antes do lock e dentro do lock.
- Sem listener ativo automaticamente; os testes criam servidor apenas em `127.0.0.1` e o fecham no mesmo processo.

## Execução e evidências
`node --test tests/r254_server_session_http_integration.test.js tests/r253_google_oidc_signed_jwt_bridge.test.js tests/r252_bo_personal_gate_r239_integration.test.js`

**63/63 PASS**: 21 cenários R254, 24 cenários R253 e 18 R252. JWTs RSA fictícios, matrículas e BOs fictícios, arquivos Drive em Map local, sem credenciais reais.

Cobertura: inicialização/origem, CSRF e nonce, assinatura inválida, outro subject, identidade forjada, chave compartilhada rejeitada, cookie inválido, expiração, revogação de matrícula/atribuição antes e durante lock, logout no meio da operação, reenvio idempotente, leitura de metadados, tentativa de outro BO, concorrência no desafio, API real HTTP em loopback, limite de payload.

## Limitações e travas críticas
1. Os Map de sessão são **voláteis e de processo único**: não há Redis/Firestore/armazenamento distribuído, failover, criptografia de sessão persistida, rate-limiting por IP/identidade nem auditoria central. Isso é proibitivo para produção.
2. O challenge/nonce é servido somente pelo mesmo origin HTTPS, para cliente GIS ainda não integrado. Falta Client ID OAuth real, verificação com `google-auth-library` de produção, cadastro autorizado de origens, revogação de conta Google e testes em dois usuários reais.
3. Embora o corpo HTTP seja protegido contra CSRF e troca de identidade, o código **não dispensa** mitigação de XSS/CSP rigorosa, SRI onde cabível, proteção de clickjacking, headers/cookies na infraestrutura TLS, prevenção de abuso, limites de requisições e revisão independente.
4. Não existe integração com a Central instalada, com Apps Script, Script Properties, Sheets, Drive, RSD/RCO/index ou storage real. Não usar para evidências reais e não implantar o handler deste protótipo.
5. Permanecem sem projeto real o controle de autorização de militares, atribuição por BO, logs de auditoria, custodiante/retificação/remoção, restauração/backup, jornadas offline, LGPD e aceite de dispositivo Android/iOS físico.
6. O motor R239/R252 revalida a identidade antes do write, mas operações longas podem continuar depois de revogações ocorridas **após** o último check. Precisa de política transacional e reconciliação.
7. O gate institucional R163 continua **3/16, NO-GO** até prova independente. PRs de código #30 (UI), #32 (R252), #33 (R253) são DRAFT; este lote R254 depende das revisões anteriores.

**Política de execução:** todos os arquivos sob `R254_BO_SESSION_CANDIDATE_NO_DEPLOY/` e `tests/`, sem alterações na main, nos formulários, no banco ou em instância pública. `releaseAllowed=false`.
