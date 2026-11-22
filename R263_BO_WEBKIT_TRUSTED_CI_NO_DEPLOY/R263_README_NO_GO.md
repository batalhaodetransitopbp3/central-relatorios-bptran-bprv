# R263 — WebKit HTTPS com certificado de teste confiável (em contêiner descartável)

**Revisão somente para homologação**, não mesclar, não implantar, não conectar à Central oficial.

## Finalidade e hipótese técnica

Na R262, o Chrome validou o contrato ponta a ponta em HTTPS local (8 verificações, 9 fotos sintéticas). O WebKit em Windows e Linux enviou `Origin: null` ao acessar um certificado de desenvolvimento não confiável; o backend negou corretamente o login. A tentativa anterior de confiar uma CA no contêiner não alterou isso porque o contexto de Playwright estava configurado com `ignoreHTTPSErrors:true`, podendo manter a origem opaca.

A R263 testa a hipótese **sem flexibilizar a regra de origem nem ignorar falhas TLS**: gera CA e certificado de um dia, confia temporariamente nessa CA **somente dentro de contêiner Linux descartável**, abre o WebKit com `ignoreHTTPSErrors:false`, exige que o servidor receba exatamente a origem HTTPS autorizada e exercita as oito verificações positivas.

Os novos testes são executados no arquivo `tests/r263_webkit_trusted_https_smoke.cjs` isolado da R262; o código original da R262 permanece preservado. O teste valida a mesma página fictícia R262 que utiliza a biblioteca cliente R261, mas sem importar a biblioteca no BO oficial.

## Escopo da CI

- Job WebKit: Playwright WebKit em `mcr.microsoft.com/playwright:v1.65.1-noble` no GitHub Actions, `CI=true`, usuário root, `/.dockerenv` ou `/run/.containerenv`, confirmação de ferramentas de CA, instalação de pacote Playwright sem scripts, emissão de certificado temporário e submissão do login com origem HTTPS real. A CA é retirada ao fim e o contêiner é destruído.
- Job de segurança: confirma que a tentativa de rodar `webkit-trusted` diretamente no host Linux de CI falha sem instalar certificados no sistema.

## Resultados esperados

No modo positivo, comprovar cookie `Secure; HttpOnly; SameSite=Strict`, CSRF, nove JPEGs gerados em canvas com 4+4+1 posições, correspondência do BO por Index/RSD/RCO, revogação, segunda aba sem CSRF, logout e zero chamadas externas. Todos os eventos/usuários/arquivos de teste são sintéticos, e não há persistência em Drive/Sheets.

**Não afirmar sucesso positivo WebKit antes de confirmação dos jobs no GitHub Actions.** Se WebKit continuar reportando `Origin: null`, a falha é segura e deve ser registrada sem contornar a validação.

## Limites

Este teste não corresponde a Safari em iPhone físico. Não fornece OAuth Google real, identidade institucional, armazenamento Drive/Sheets, deploy HTTPS, cadeia de custódia, backup WORM, autorização LGPD ou acesso à Central em produção. A conta Google conectada continua operacional e não foi utilizada para arquivos de homologação.

O R163 continua **NO-GO (3/16 requisitos, 13 externos pendentes)**. Mesmo testes WebKit positivos não alteram o gate externo nem autorizam mesclar os PRs de revisão.
