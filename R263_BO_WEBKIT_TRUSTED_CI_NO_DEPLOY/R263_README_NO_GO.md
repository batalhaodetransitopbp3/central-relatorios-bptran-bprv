# R263 — Compatibilidade de POST seguro no WebKit sem comprometer CSRF

**Estado:** PR DRAFT, revisão isolada, NO-GO; sem merge, implantação, dados policiais ou escrita no Google.

## Causa comprovada

A R262 mostrou que Chromium aceitava a requisição POST e WebKit enviava `Origin: null`. A primeira hipótese era exclusivamente a confiança do certificado TLS. O teste R263 confirmou em WebKit Linux **com CA efêmera confiável e `ignoreHTTPSErrors:false`** que a origem ainda era `null`: portanto o certificado **não** era a causa determinante.

O contrato R261 utilizava simultaneamente `mode:'same-origin'` e `referrerPolicy:'no-referrer'`. O padrão Fetch/Referrer Policy prevê que essa combinação pode produzir `Origin:null` em POST; documentação: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header .

**Prova empírica WebKit HTTPS da R263 (execução CI anterior):**
- `no-referrer`: `Origin:null`, sem `Referer`;
- `origin`: `Origin:https://127.0.0.1:<porta>`, `Referer` com **apenas** esquema, host e porta, sem caminho ou parâmetros;
- `same-origin` e `strict-origin-when-cross-origin`: origem correta, porém `Referer` inclui caminho da página, desnecessário para fotos/BO.

## Correção

1. `R261_BO_BROWSER_CANONICAL_CANDIDATE_NO_DEPLOY/r261_bo_browser_session_client.js`: altera **somente** `referrerPolicy:'no-referrer'` para **`referrerPolicy:'origin'`**, sem alterar `mode:'same-origin'`, URLs relativas fixas, cookies HttpOnly/Secure/SameSite, CSRF, acesso pessoal ou `releaseAllowed:false`. O navegador revela apenas a origem ao servidor que já detém a mesma origem, e não o número do BO na URL.
2. `R262_BO_BROWSER_REAL_ENGINES_NO_DEPLOY/r262_preview_ui.js`: aplica a mesma política somente à chamada que obtém **token RSA sintético de ensaio**. Essa rota jamais deve ser publicada.
3. `tests/r262_real_browser_canonical_https_smoke.cjs`: o modo negativo `webkit-untrusted` (nome herdado) agora força deliberadamente um POST `no-referrer` e exige HTTP 403 por `Origin:null` e zero gravações; não atribui falsamente a causa ao certificado TLS.
4. `tests/r263_webkit_trusted_https_smoke.cjs`: conserva a exigência de `Origin` exato; verifica que `origin` não entrega caminho/BO e que `no-referrer` é recusado. Testa sessão completa WebKit com CA de 1 dia apenas num contêiner GitHub descartável; `ignoreHTTPSErrors:false`, nenhuma flexibilização de origem.
5. `tests/r263_referrer_origin_contract.test.cjs`: três novas verificações de contrato da política, rotas same-origin, ausência de campos privilegiados e configuração somente de homologação.

**CA temporária:** o código exige `CI=true`, Linux, root, sinalizador específico e `/.dockerenv` ou `/run/.containerenv`. A CA não é confiada ao notebook nem à máquina hospedeira; é retirada do contêiner descartável ao final. O job de guarda confirma que o modo positivo é proibido no runner host.

## Verificação

Antes do novo push: **235/235 testes Node PASS**, Chrome real **8/8 PASS**, e WebKit no modo de `no-referrer` **HTTP 403, zero fotos**, todos locais/sintéticos. A verificação positiva do WebKit com `referrerPolicy:'origin'` só deve ser considerada aprovada depois do GitHub Actions final.

## Limites

Esses testes executam página **R262 de homologação**, não o BO oficial R240. O login/JWKS, BO, identidade e fotos são fictícios, e o armazenamento é em memória; não existe Google Drive/Sheets real, endpoint institucional, sincronização de fotos do IndexedDB, dispositivo físico Safari/iOS ou aprovação LGPD/custódia/WORM. A conta conectada de Google Drive ainda é **operacional**, não homologação; nenhum acesso de escrita foi feito nela.

Gate externo R163: **NO-GO, 3/16 atendidos e 13 bloqueios independentes**; nunca mesclar/publicar a revisão sem autorização formal externa.

## Correção de concorrência e limites observados

Uma execução positiva do WebKit em contêiner chegou até o logout, mas encontrou **10 gravações em vez de nove** depois de a conta de teste ter sido reativada imediatamente após uma rejeição. Para evitar que ações simultâneas ou requisições atrasadas reaproveitem uma autorização restaurada, a página isolada R262 passou a bloquear todos os botões e a origem do BO enquanto cada ação assíncrona estiver em andamento; os testes mantêm o cadastro **revogado até o logout** e exigem exatamente **nove uploads aceitos + um upload recusado**, sem outras solicitações. Trata-se de proteção da **prévia de homologação**, não de implantação na Central.

A execução local do WebKit Windows com `ignoreHTTPSErrors:true` conseguiu corrigir `Origin`, mas não preservou a interpretação esperada de `SameSite=Strict`. Por isso, **não é considerada homologação positiva de cookie**; o ensaio positivo deve passar em contêiner com certificado de CA confiável e `ignoreHTTPSErrors:false`. Nenhuma verificação de cookie ou origem foi relaxada.

### Verificações adicionais

Após a correção da prévia, o Chrome local percorreu o fluxo de nove fotos sem duplicações, e o WebKit no teste deliberado de `Origin:null` continuou recusando a autenticação. O resultado positivo WebKit precisa ser confirmado novamente no GitHub Actions da versão final.
