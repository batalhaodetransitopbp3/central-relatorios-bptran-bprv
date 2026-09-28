# Gestão P3 — redução de espera (10.8.4)

A página aguardava uma consulta de versão antes de consultar os dados. Essa verificação também podia ocorrer duas vezes simultaneamente. Em 28/09/2026, três chamadas públicas `action=version` demoraram aproximadamente 20,1 s, 23,8 s e 12,4 s, retornando a versão publicada 10.8.2. São tempos de comunicação com o Apps Script, sem leitura da planilha; não medem a consulta autenticada nem permitem prometer um tempo final.

## Correções

- Gestão P3 e tabela de produtividade consultam diretamente o endpoint autenticado, sem aguardar a verificação de versão. Nos outros módulos, verificações de versão simultâneas compartilham uma chamada.
- Pedidos idênticos em andamento compartilham a resposta. Ao voltar para uma aba, resultados recentes podem ser reutilizados por até 20 segundos, somente na memória da página. A credencial e todos os filtros participam da chave local. Nenhum relatório é persistido no aparelho por esse cache.
- O horário da consulta é exibido. O botão Consultar pede `fresh=1`, ignorando os caches da página e do backend 10.8.4. Uma gravação feita pela Gestão P3 limpa o cache local e consulta novamente.
- Uma resposta atrasada não substitui o resultado de outra aba ou de filtros aplicados depois.
- Backend: colunas pequenas são agrupadas, sem atravessar campos de JSON, fotos ou assinaturas não solicitados. Os filtros leem somente as colunas necessárias. Em bases menores, filtro e resultado são obtidos juntos; bases maiores continuam filtrando antes de buscar detalhes. Leituras de linhas são agrupadas com limite de células e de dispersão.
- Datas repetidas são convertidas uma vez por execução, no mesmo fuso do script.
- Cache compartilhado de 20 segundos para consultas P3, sempre depois da autenticação. Gravações do endpoint POST invalidam a revisão do cache, inclusive em erro parcial. Consultas em andamento antes de uma gravação não substituem a revisão nova. Alterações externas à aplicação são vistas após expiração ou `fresh=1`.
- Respostas maiores são comprimidas; valores ainda maiores que o limite seguro não são armazenados. Falha ou expulsão do cache provoca consulta normal ao banco.
- A resposta informa `queryMs`, `dataGeneratedAt`, `cacheHit` e `cacheAgeMs` para separar tempo do backend da espera total de rede.

## Validação reproduzível

```sh
node --test tests/p3-performance.test.cjs
```

Para testes das páginas em DOM simulado, instale jsdom em um diretório temporário e disponibilize-o por NODE_PATH:

```sh
npm install --prefix /tmp/central-p3-tests jsdom --no-audit --no-fund
NODE_PATH=/tmp/central-p3-tests/node_modules node --test tests/p3-performance.test.cjs tests/p3-ui.test.cjs
```

Os testes comparam resultados com o commit 4155b1b (10.8.3), usando apenas registros fictícios: filtros de data, batalhão, várias companhias, turno e guarnição; limites e ordem; linhas dispersas; produtividade e supressão do histórico já substituído pelo RCO; autenticação; cache, expiração, atualização forçada e invalidação; falha parcial; cliques repetidos e respostas fora de ordem nas duas páginas.

Cenário simulado com 1.000 RSDs e 300 RCOs: leituras caíram de 10 para 5 e células lidas de 16.822 para 9.322. Foram eliminadas 1.000 leituras desnecessárias da coluna de payload. Esses números não são um benchmark de tempo em produção.

## Implantação e verificação

Frontend: publicar `central_cloud.js`, `p3_queries.js`, `gestao_p3.html` e `tabela_operacional_p3.html` juntos. As duas páginas usam versão 10.8.4 nos arquivos JS.

Backend: publicar `apps_script_v10.gs` no projeto Apps Script existente e atualizar a implantação atual, preservando a URL `/exec`, propriedades e permissões. Atualizar o arquivo no GitHub não atualiza a implantação Apps Script. Ao preparar este ajuste, a implantação ainda respondia 10.8.2 e o Desktop Commander estava offline.

O frontend é compatível com o backend 10.8.2 durante a transição; agrupamento de leituras, invalidação compartilhada e `fresh=1` no servidor exigem a implantação 10.8.4. O cache antigo da análise/matriz pode permanecer por 60 segundos enquanto o backend não for atualizado.

Após publicar, conferir `action=version` = 10.8.4; em sessão P3 válida, medir o mesmo filtro na primeira consulta, repetição e atualização forçada. Comparar tempo total com `queryMs`. Confirmar também que a alteração de um RSD/RCO aparece na atualização seguinte. Não foram realizadas consultas autenticadas nem gravações de teste em dados reais nesta validação.

Referências: https://developers.google.com/apps-script/guides/support/best-practices e https://developers.google.com/apps-script/reference/cache/cache.
