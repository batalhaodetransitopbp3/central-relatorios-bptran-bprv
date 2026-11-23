# R265 — Baseline de CI para a branch principal da Central (não publicar)

**23/11/2026 | Apenas revisão | NÃO MESCLAR sem duas revisões independentes | R163 permanece NO-GO.**

## Motivação

A `main` estava sem workflows GitHub Actions. A proteção de branch foi aplicada em 23/11/2026, exigindo PR e duas aprovações, porém o requisito `required_status_checks` ainda é `null`. Os testes das R252–R264 rodam em branches de revisão separadas e **não protegem automaticamente a `main`**.

A R265 parte diretamente do commit `4f9ea78e29484d7883baecece01819d0e82dade1` da `main`, não contém mudanças de interface, backend nem Apps Script, e não mescla a longa pilha de revisões fotográficas.

## Alterações do PR

- `.github/workflows/r265_central_main_baseline.yml`: workflow sem segredos, ações de escrita ou deployment, com gatilhos para PR à `main` e push à `main`, `permissions: contents:read`, `persist-credentials:false`, Node.js 24, job de nome estável **`main-baseline`** e `fetch-depth:0` para inspecionar todos os arquivos alterados em relação ao SHA-base confiável informado pelo evento GitHub.
- `ci/r265_main_source_change_guard.cjs`: travamento provisório conservador para alterações operacionais enquanto R163 é NO-GO. Só aceita este workflow exato, o guard, testes, documentação Markdown e `.gitignore`. Mudanças em `.gs`, `.html`, JS operacional ou outro workflow de deploy **são recusadas**. Mesmo quando aceita um PR sem alterações operacionais, reporta sempre `productionRelease:NO_GO`, `releaseAllowed:false`, `productionDeployExecuted:false`. Não interpreta credenciais, não usa API e não faz deployment.
- `tests/rco_metrics_cloud_divergence.test.js`: substitui uma dependência indevida de arquivo `C:\Users\...\Temp\reboque01_cloud_payload.json` (não versionado, potencialmente operacional) por um **payload 100% sintético** com a mesma produção 8 motocicletas / 1 ciclomotor / 1 automóvel. Preserva a execução das funções reais da página do RCO e verificações de divergência/recuperação. O arquivo temporário anterior **não foi aberto nem publicado**. Este teste deixa de comprovar as propriedades exatas da ocorrência histórica, que devem ser verificadas fora do repositório por auditor autorizado.
- `tests/r265_main_source_change_guard.test.cjs`: testes do bloqueio por caminho, ausência de autorização de publicação, hash-base obrigatório e proteção contra alterações de fontes e workflows privilegiados.

## Observação importante sobre a configuração de proteção

**Atualização administrativa — 23/11/2026:** após confirmar o sucesso do check real `main-baseline` na PR #45, o administrador habilitou-o como **required status check** de `main`, com `strict:true` e origem do check `github-actions` (app_id 15368). A API do GitHub confirmou que a regra está ativa, sem alterar o commit principal.

A **PR #45 continua DRAFT, `BLOCKED`, com `REVIEW_REQUIRED`**, mesmo com check aprovado. A `main` continua sem o arquivo do workflow até duas revisões independentes e merge autorizado. Outros PRs podem não executar esse check e ficar bloqueados enquanto a infraestrutura não for incorporada. **Não desligar a verificação obrigatória nem reduzir as duas aprovações para contornar esse bloqueio.**

A fonte do workflow e do guard pode mudar via PR, portanto a segurança depende também da revisão por responsáveis distintos e da verificação das regras GitHub. Este CI é um controle técnico, **não prova que R163 foi satisfeito**, tampouco substitui aprovação institucional, LGPD, testes Google reais ou decisão de release assinada.

## Verificações locais e em CI

Executar:

```powershell
node --test tests/*.test.js tests/r265_main_source_change_guard.test.cjs tests/r265_git_diff_hardening.test.cjs
node ci/r265_main_source_change_guard.cjs  # apenas com R265_TRUSTED_BASE_SHA confiável
```

No Windows PowerShell, enumerar caminhos explicitamente para os testes existentes se a expansão de wildcard do comando não funcionar. O workflow Ubuntu utiliza bash e expande `tests/*.test.js`.

**Gate externo inalterado:** R163 **NO-GO, 3/16 requisitos aprovados e 13 externos pendentes**. A conta Google conectada é operacional, não homologação autorizada. Nenhum BO ou fotografia foi sincronizado com o Drive ou a Central oficial. Nenhuma mudança de fonte operacional está incluída na R265.


## Revisão de segurança do guard — 23/11/2026

Um teste isolado com um repositório Git 100% fictício demonstrou uma vulnerabilidade concreta da primeira versão de `ci/r265_main_source_change_guard.cjs`: uma renomeação `apps_script_v10.gs` → `tests/payload.json` era exibida por `git diff --name-only` apenas pelo **caminho de destino**, sendo incorretamente classificada como mudança de teste autorizada. O teste não envolveu a Central operacional ou qualquer dado real.

**Correção no mesmo PR #45, antes de merge:** o guard agora analisa `git diff --raw -z --no-abbrev --find-renames`, inspeciona **origem, destino, status de alteração e modos de arquivo**. Rejeita qualquer origem ou destino operacional, exclusões de testes, links simbólicos (`120000`), submódulos (`160000`) e mudanças de permissões executáveis. O comando lê a base em SHA verificável, não aceita caminhos fora da lista e não usa shell. O check obrigatório `main-baseline` continua a retornar apenas `ALLOW_NONPRODUCTION_REVIEW` para alterações documentais e de testes, **jamais GO para produção**.

O novo `tests/r265_git_diff_hardening.test.cjs` contém **sete testes com repositórios Git temporários sintéticos**, cobrindo a renomeação evasiva reproduzida, exclusões, links simbólicos, modos executáveis e renomeações legítimas de testes. Portanto a suíte da R265 passa a conter **37 verificações**: 19 de baseline, 11 de contrato e sete de ataque/regressão. Não houve inclusão de arquivos do diretório temporário no repositório.

**Limite importante:** como a CI é executada sobre o código da PR, alguém com permissão para modificar o próprio guard/workflow pode alterar as verificações em um commit futuro. Por isso **continuam indispensáveis duas revisões humanas independentes, regras de proteção da `main` e revisão explícita das alterações de CI**. A proteção do GitHub permanece como mecanismo externo ao código proposto; a R265 não substitui a auditoria institucional R163.
