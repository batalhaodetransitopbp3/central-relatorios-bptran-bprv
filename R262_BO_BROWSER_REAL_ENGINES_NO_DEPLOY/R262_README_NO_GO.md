# R262 — ensaio visual em navegadores reais com HTTPS e sessão do BO

**Status:** revisão independente, **NO-GO**, `releaseAllowed:false`.
**Produção:** nenhum App Script, usuário, planilha, arquivo Drive, HTML de BO real ou `main` alterado.
**Data:** 21/11/2026.

## O que foi implementado e testado

A R262 entrega uma página de ensaio **separada dos arquivos oficiais de BO**. Ela importa o cliente R261 e chama, através de HTTPS de teste com certificado efêmero, o backend R255/R254 com token Google-format **RSA sintético**, verificador JWKS injetado, sessão pessoal R252, vínculo canônico R260 e armazenamento em memória de teste.

- `r262_isolated_preview.html` e `r262_preview_ui.js`: página que mostra aviso de ambiente sintético e possui cinco controles: login fictício, origem Index/RSD/RCO, adicionar fotografia sintética, consultar anexos e encerrar sessão. O enquadramento é representado por **recorte sintético em canvas**, e a interface de resultados mostra 4 imagens por anexo/página. **Não é a interface R240, não usa foto real ou cofre IndexedDB e não foi conectada à Central.**
- `tests/r262_real_browser_canonical_https_smoke.cjs`: servidor local **somente 127.0.0.1**, com arquivos permitidos por lista de caminhos, CSP que não permite scripts/requests externos, certificado TLS gerado no diretório temporário do sistema e endpoint exclusivo de testes `/r262-fixture/issue-token`. O endpoint emite **apenas JWTs fictícios**, nunca tokens reais; não existe na API R254 nem no BO oficial.
- O ensaio automatiza o navegador com Playwright e chama o **servidor HTTP real em loopback**. Confere `Secure; HttpOnly; SameSite=Strict`, proteção CSRF, vinculação pelo mesmo evento canônico em Index/RSD/RCO, nove imagens em três páginas (4+4+1), bloqueio de usuário revogado, segunda aba sem CSRF em memória, logout e ausência de requisições externas.
- Os certificados e a CA fictícia são gerados apenas em diretório temporário e **não são instalados em nenhum repositório de confiança do sistema**, nem na estação do operador nem no contêiner CI. O ensaio positivo de sessão/CSRF/cookie é Chromium; WebKit verifica que um certificado não confiável não consegue obter sessão por `Origin:null`.
- Em **WebKit Windows com CA não confiável**, observou-se `Origin:null` em POST HTTPS; o servidor R255 o recusa corretamente, antes de criar sessão ou fotografia. Foi criado um ensaio separado `webkit-untrusted` que comprova esse **fail-closed**, sem dispensar cabeçalho `Origin`.

## Execução local (Windows)

Necessita Node.js 24, OpenSSL do Git, Google Chrome e Playwright de testes. O teste não requer nem acessa Google real:

```powershell
npm.cmd install --no-save --no-package-lock --ignore-scripts playwright@1.65.1
node tests/r262_real_browser_canonical_https_smoke.cjs chromium
node tests/r262_real_browser_canonical_https_smoke.cjs webkit-untrusted
```

Numa execução local validada, **Chromium: 8/8 verificações funcionais PASS** (9 fotos sintéticas, 0 requisições externas). **WebKit Windows sem CA confiável: acesso negado corretamente, 0 fotografias gravadas**. Também foi tentada uma CA efêmera no contêiner CI, mas WebKit continuou enviando `Origin:null`; a verificação agora testa explicitamente esse bloqueio, sem afrouxar a segurança. Um sucesso Chromium não certifica Safari de iPhone.

## Execução automatizada CI

`.github/workflows/r262_bo_real_browser_https_ci.yml` tem três trabalhos independentes: regressão Node R252–R261 (232 testes), Chromium real com HTTPS local e WebKit Playwright em contêiner descartável confirmando o **bloqueio seguro** de `Origin:null` sob HTTPS sem CA confiável. **Não se trata de autenticação WebKit aprovada**; o ensaio positivo WebKit exigirá posteriormente certificado efetivamente confiável e infraestrutura de staging autorizada.

## Bloqueios não superados

1. Não há login Google real: o botão de login obtém um JWT exclusivamente do emissor fictício `/r262-fixture/issue-token`, existente somente no script de teste. **Jamais disponibilizar esse endpoint em uma implantação**.
2. O armazenamento usa mapas de memória e IDs sintéticos, **não** Drive/Sheets, nuvem institucional, banco de BO oficial ou cadeia de custódia. O cliente R261 ainda não está embutido na interface R240 e a sincronização permanece desativada.
3. A R262 confirma uma **prévia de navegador**. Não substitui ensaios de fotografia original, crop e PDF da R240 (já testados separadamente), nem comprova impressão segura de BO operacional, dispositivos físicos Android/iOS ou falhas em rede móvel.
4. Autenticação/ACL Google reais, endpoint HTTPS institucional, LGPD, backups WORM, controles de custódia e os 13 bloqueios externos do R163 continuam pendentes.
5. `main`, Apps Script, Google Drive e Sheets operacionais permanecem intocados. Não mesclar ou publicar os PRs de revisão até aprovação formal de segurança e liberação independente `R163=GO`.

**Gate:** R163 anterior `NO_GO` (3/16 PASS), mesmo com testes locais e CI verdes.
