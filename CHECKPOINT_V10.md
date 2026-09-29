# Checkpoint Central v10 — 28/09/2026

Fotografia atual para retomada segura.

## Ambiente
- **Repo:** `batalhaodetransitopbp3/central-relatorios-bptran-bprv` (`main`)
- **Pages:** https://batalhaodetransitopbp3.github.io/central-relatorios-bptran-bprv/
- **Backend /exec:** `AKfycbyxmDMgk-h2lTuf_6BvUngMLu-yMDvfenHNshQ3aa0V3lDPzh5kosUfiqm90IugmepPpw`
- **Frontend cache bust:** `?v=10.8.16`
- **Apps Script no código:** `CENTRAL_V10_VERSION = 10.8.10` (schema `central-v10`)
- Confirmar produção com `?action=version` após republicar o deployment `/exec`

## Regras permanentes
- Chave só no ingresso; sem loop de alert sem campo.
- Continuar = companhia → lista (não por matrícula). Receber = só passagens.
- Leituras autenticadas preferem POST (token no corpo); JSONP fica para `version` e fallback.
- Credencial RCO em nova aba via `sessionStorage`, nunca `?token=` na URL de páginas.
- Preservar portões: `centralReturnToAccess`, `central-module-auth-lost`, `central-module-access-ready`.

## Este ciclo (local, ainda não publicado)
1. Auth + UX RSD/RCO (picker, barra, BOPM resume, POD, P3_ACTIONS, cache).
2. Performance: `findOne_`, motomec sem viaturas, `p3Analysis_` fast, master-overview por campos.
3. Feedback P3 90s + status Motomecanização.
4. Leituras via POST (`handleApiReadViaGet_` + `jsonp`→`submitForm` com token).
5. Ajuda alinhada a Novo / Continuar / Receber.

## Deploy checklist
- [ ] Push front `main` → Pages → testar URL pública anônima com `?v=10.8.16`
- [ ] Publicar `apps_script_v10.gs` no `/exec` → `?action=version` = **10.8.10**
- [ ] Smoke: Continuar com chave; Gestão P3; Motomecanização; Ajuda

## Próximo
- Power BI com fonte estável
- Mais índices no Controle Geral se ainda lento em planilhas grandes
