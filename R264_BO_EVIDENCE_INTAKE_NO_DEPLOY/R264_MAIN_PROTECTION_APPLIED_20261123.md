# R264 — Confirmação administrativa da proteção de `main` (23/11/2026)

**Alteração de segurança REAL aplicada no GitHub — não é uma simulação.**

Repositório: `batalhaodetransitopbp3/central-relatorios-bptran-bprv`
Branch: `main`
SHA **antes e depois**: `4f9ea78e29484d7883baecece01819d0e82dade1`
Estado confirmado por `gh api` (administrador autenticado) e leitura independente da API de branch: **`protected:true`**.

| Configuração da proteção | Estado confirmado |
|---|---|
| Exigir pull request antes de mesclar | ATIVADO |
| Aprovações necessárias | **2** |
| Aplicar restrições a administradores | **ATIVADO** |
| Invalidar aprovações antigas após novos commits | **ATIVADO** |
| Revisor diferente do responsável pelo último push | **EXIGIDO** |
| Resolver conversas de revisão | **ATIVADO** |
| Permitir force-push | **NÃO** |
| Permitir exclusão da branch | **NÃO** |
| Checks de CI obrigatórios na `main` | **AINDA NÃO CONFIGURADOS** (`required_status_checks:null`) |

A configuração foi aplicada via API oficial de proteção de branch, com revisão do estado anterior e verificação de SHA invariável depois. **Nenhum commit foi escrito na `main`; nenhum PR foi mesclado; nenhum Apps Script foi implantado; nenhuma planilha ou fotografia Google foi alterada.**

## Restrição para futuras aprovações

A API GitHub retornou **apenas uma conta colaboradora** no momento da alteração. Com a exigência de duas aprovações, **novos merges ficarão bloqueados até que sejam convidados pelo menos dois revisores independentes, com as permissões adequadas**. Isso é intencional enquanto R163 registra NO-GO, não uma falha dos testes. Nenhum usuário novo foi convidado automaticamente; o responsável pelo repositório deve escolher as contas autorizadas.

A proteção de `main` **não substitui a aprovação institucional externa**; scripts de CI das PRs em rascunho não viram checks obrigatórios automaticamente. A configuração de CI obrigatória precisa de workflow de baseline auditável e execução adequada antes de associar seu nome às regras de branch.

## Verificação reproduzível, somente leitura

Executar na máquina autorizada, via GitHub CLI com sessão administrativa, sem exportar tokens ou credenciais:

```powershell
gh api repos/batalhaodetransitopbp3/central-relatorios-bptran-bprv/branches/main --jq '{protected:.protected,sha:.commit.sha}'

gh api repos/batalhaodetransitopbp3/central-relatorios-bptran-bprv/branches/main/protection --jq '{reviews:.required_pull_request_reviews.required_approving_review_count,admins:.enforce_admins.enabled,stale:.required_pull_request_reviews.dismiss_stale_reviews,last_push:.required_pull_request_reviews.require_last_push_approval,conversations:.required_conversation_resolution.enabled,force_pushes:.allow_force_pushes.enabled,deletions:.allow_deletions.enabled,required_status_checks:.required_status_checks}'
```

No último exame: `reviews:2`, `admins:true`, `stale:true`, `last_push:true`, `conversations:true`, `force_pushes:false`, `deletions:false`, `required_status_checks:null`.

## Estado inalterado do gate externo

O controle R163 executado separadamente continua **`NO_GO`, 3 de 16 critérios atendidos, 13 pendentes, `releaseAllowed:false`, `productionDeployExecuted:false`**. A criação da proteção de branch não deve ser contabilizada artificialmente como um desses treze requisitos: os requisitos do R163 exigem casos em Google isolado, aprovação institucional de testes e deploy, backup/rollback reais, testes em campo e testemunha independente.

O documento original `R264_RELEASE_READINESS_NO_GO.md` registra uma **fotografia da situação em 22/11/2026**, quando a `main` ainda estava desprotegida. **O presente adendo (23/11/2026) substitui somente essa constatação histórica sobre a proteção de branch**. As demais pendências permanecem válidas.

**Não há autorização de publicação.**
