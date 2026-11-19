# R252 — Autoridade pessoal e idempotência de anexos do BO (REVISÃO, NÃO IMPLANTAR)

Data: 19/11/2026 (America/Fortaleza)
Decisão: **NO-GO** para publicação ou uso operacional. Apenas laboratório local, sem Google Drive/Sheets e sem fotos reais.

## Avanço verificável
- Nova camada de identidade pessoal: `r252_personal_bo_gate.js`, carregada por um adaptador de servidor que obrigatoriamente recebe um **ID token previamente verificado criptograficamente pelo servidor**. A camada não verifica por si a assinatura nem aceita como prova e-mail/matrícula enviados pelo navegador.
- Checagens de issuer/audience, subject, e-mail verificado, idade/expiração, cadastro administrativo único e ativo, matrícula, unidade, papel de escrita e atribuição explícita por evento canônico.
- Toda operação rejeita `CENTRAL_TOKEN` ou outras credenciais do cliente como substituto de identidade individual.
- A autorização pessoal é revisitada em cada `getEvent`, inclusive na revalidação que o motor R239 realiza dentro do lock antes de escrever.
- Cópia endurecida do R239 no arquivo `r252_bo_photo_archive_core.js`: reenvio com `requestId` previamente utilizado só é idempotente se autor e legenda forem os mesmos; retorno COMMITTED requer metadados de autoria e posição consistentes.
- O R239 original, os formulários do BO, o Apps Script e o ambiente de produção foram preservados.

## Testes efetivamente executados
No workspace de desenvolvimento, com o R239 original presente: `node --test tests/r239_bo_photo_archive_auth_idempotency_fake.test.js tests/r252_bo_personal_gate_r239_integration.test.js` → **48/48 PASS** (30 regressões R239 + 18 testes R252).

Na branch de revisão isolada, que contém somente a nova candidata R252: `node --test tests/r252_bo_personal_gate_r239_integration.test.js` → **18/18 PASS**.

Todos os testes executados sem acesso à nuvem. Simulações incluem:
- identidade verificada e sessão válida, escrita, leitura de metadados e replay exato;
- corpo com email/matrícula forjados não altera o autor;
- credencial operacional compartilhada rejeitada;
- identidade falsa, issuer errado, sessão expirada, cadastro duplicado/inativo, matrícula e companhia erradas, ausência ou expiração de atribuição;
- revogação enquanto a operação aguarda o lock, antes de gravar arquivos;
- autorização de outro usuário para o mesmo evento não autoriza reaproveitar requestId anterior;
- legenda alterada ou autoria adulterada em journal são recusadas.

## Dependências ainda não atendidas — proibição de uso real
1. Implementar **verificador criptográfico real de ID token** no servidor, fixando issuer, clientId/audience, subject e expiração; não basta consultar `Session.getActiveUser().getEmail()`, confiar no cliente ou aceitar boolean `SERVER_VERIFIED` injetado.
2. Criar fonte administrativa de identidade e atribuições persistentes, somente acessível ao servidor com auditoria de inclusão, revogação e transferência. O cadastro `MILITARES` atual não fornece prova dessa vinculação.
3. Integrar o núcleo endurecido ao adaptador Apps Script/Drive/Sheets em homologação privada: lock distribuído, journal durável com deduplicação, arquivos Drive privados, hash de comprovante, backup/restauração e retificação.
4. Autoridade deve permanecer válida durante gravações longas e falhas parciais; revalidação **antes** do write não prova revogação durante todo o upload.
5. Reconciliar formato dos journals R239/R252 antes de cutover; ledger antigo sem legenda registrada deve recusar replay, não ser promovido silenciosamente.
6. Testes completos reais com duas identidades independentes, Android Chrome/Safari iPhone físicos, PDF, segurança, política de retenção dos originais e aceite externo.
7. Gate institucional R163 mantém 3/16 — NO-GO e PR fotográfico #30 segue DRAFT.

**Observação:** os 48 testes usam um IdP e registros 100% sintéticos. Os testes de recusa provam lógica local, não autenticação real, assinatura de token, autorizações institucionais ou durabilidade na nuvem.

## Segurança de alterações
Nenhuma nova rota doPost/doGet, nenhum ScriptProperty, nenhum segredo, nenhum dado real, nenhum merge/deploy. O marcador `releaseAllowed` permanece false.
