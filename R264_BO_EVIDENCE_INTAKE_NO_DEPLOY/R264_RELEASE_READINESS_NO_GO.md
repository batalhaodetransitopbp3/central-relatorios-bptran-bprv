# R264 — Matriz de liberação do anexo fotográfico e controle de riscos da `main`

**Data:** 22/11/2026. **Decisão:** NO-GO. **Ramo:** isolado, revisão, nunca executar `deploy`.
**Origem:** reexecução local do gate externo `audits/r163_external_evidence_release_gate.js` no diretório de auditoria protegido, inspeção de `main` no GitHub e testes sintéticos das R240/R252–R263.

## 1. Situação real auditada

| Evidência | Resultado |
|---|---|
| `main` remota | `4f9ea78e29484d7883baecece01819d0e82dade1`; inalterada |
| GitHub `GET /repos/.../branches/main` | `protected:false` |
| GitHub `GET /repos/.../rulesets` | lista vazia `[]` |
| GitHub `GET /branches/main/protection` | acesso via integração negado (403), não é prova de proteção |
| `.github/workflows` na árvore de `main` | **sem workflows**; os workflows da cadeia fotográfica estão somente nas branches de revisão |
| `R163` no diretório de auditoria separado | `NO_GO`, **3/16 verificados**, **13 pendentes**, `releaseAllowed:false`, `productionDeployExecuted:false` |
| Google Drive conectado | conta operacional **não autorizada como staging fotográfico**; nenhuma alteração efetuada |
| Anexo das páginas BO | implementação de revisão R240 ainda local, não sincronizada em Drive |
| Cliente R261 e página R262 | contrato e ensaio sintético; **não integrados ao HTML operacional** |
| R263 Chrome/WebKit | testes isolados positivos para navegador e controles de segurança; não constituem aprovação operacional |

O relatório não substitui o gate R163. O R163 atualmente mantém `decision:'NO_GO'` e `releaseAllowed:false` por construção, inclusive quando são fornecidos dados locais de supostas aprovações; a testemunha independente out-of-band é `false`. **Não trocar esse estado por `true` no código:** o caminho legítimo para uma autorização de publicação é um ato assinado, separado e verificado fora da própria ferramenta.

## 2. As dezesseis exigências e suas evidências

| # | Verificação R163 | Estado | Evidência necessária e responsável primário |
|---|---|---|---|
| 01 | `R81_26_DEFINED` | **PASS** | Os 26 cenários estão enumerados na R81 — engenharia |
| 02 | `R81_EXTERNAL_CASE_EVIDENCE` | PENDENTE | Executar cada um dos 26 cenários **no Google isolado**, registrar resultado, ID da evidência e aprovação do revisor — engenharia + segurança |
| 03 | `R81_8_CHECKPOINTS_DEFINED` | **PASS** | Oito checkpoints estão enumerados — engenharia |
| 04 | `R81_8_CHECKPOINTS_APPROVED` | PENDENTE | Aprovar com prova `ISOLATION`, `IDENTITY`, `DATA_HANDLING`, `BACKUP_ROLLBACK`, `EXTERNAL_CONTINUITY`, `TEST_EXECUTION_APPROVAL`, `MOBILE_PHYSICAL_SIGNOFF`, `RELEASE_APPROVAL` — revisores designados |
| 05 | `STAGING_APPROVAL` | PENDENTE | Aprovação expressa para testes com recursos isolados, verificados por **segundo revisor** — autoridade institucional + segurança |
| 06 | `DEPLOY_APPROVAL` | PENDENTE | Autorização expressa para publicação, **não inferida de CI** — autoridade institucional |
| 07 | `R82_EXTERNAL_GATE` | PENDENTE | Executar R82 e atestar projeto, planilhas, pasta e identidade Google segregados — auditor externo de homologação |
| 08 | `LOCAL_BASELINE` | **PASS** | R162 passou nos 4 critérios locais — engenharia |
| 09 | `R162_RELEASE_GATE` | PENDENTE | R162 não autoriza publicação; exigir encerramento e atestação independente — responsável de release |
| 10 | `EXTERNAL_activeWriterInventory` | PENDENTE | Inventário completo e confirmado de todos os gravadores do sistema, permissões e versões GAS — engenharia + gestor |
| 11 | `EXTERNAL_restorableBackup` | PENDENTE | Backup com restauração **real**, manifesto/custódia, conferência de integridade e logs — responsável de dados |
| 12 | `EXTERNAL_crossModuleStagingRoundtrip` | PENDENTE | No staging real: BO via Index, RSD e RCO, nove imagens, auditoria de autoria, impressão e recuperação em novo dispositivo — homologadores |
| 13 | `EXTERNAL_offlineLegacyRequestIdReconciliation` | PENDENTE | Conciliar IDs históricos, colisões, duplicidades e revisões anteriores antes de migrar — responsável dos dados |
| 14 | `EXTERNAL_physicalMobileAndPdfReview` | PENDENTE | Teste e assinatura em Android/iOS **físicos**, corte/enquadramento, impressão PDF, quatro fotos por página, acessibilidade — equipe de campo |
| 15 | `EXTERNAL_independentSecuritySignoff` | PENDENTE | Atestado independente sobre identidade individual, LGPD, retenção, ACL efetiva, integridade, exclusão, custódia e resposta a incidentes — segurança/DPO |
| 16 | `OUT_OF_BAND_INDEPENDENT_WITNESS` | PENDENTE | Decisão de liberação assinada **fora** da máquina e do repositório de desenvolvimento — autoridade distinta |

As 26 linhas de cenários e os oito checkpoints ainda constam **sem execução/aprovação** na evidência R81 original, que também relaciona **15 campos de recursos/autorizações não fornecidos**. Não gerar valores fictícios para esses campos nem copiar IDs operacionais para satisfazê-los.

## 3. Condições da branch principal — prioridade imediata

`main` está **sem proteção efetiva**. O app GitHub conectado oferece leitura da branch, mas a consulta administrativa `/branches/main/protection` retornou 403 e nenhuma ferramenta disponível autoriza alterar a configuração com segurança. O assistente **não aplicou** regras nem políticas da organização.

**Ação de administrador do repositório no GitHub:** em *Settings → Rules → Rulesets* (ou *Settings → Branches*, conforme o plano/permissão), criar regra para `main` com:
- Pull request obrigatório, revisão por pelo menos dois responsáveis e impedimento de autoaprovação;
- proibição de force push e exclusão de `main`; bloqueio de pushes diretos, com exceções justificadas e auditadas;
- checagens CI de versão oficial que serão obrigatórias **após** existirem em `main`, especialmente testes de integração, revisão estática, R163/evidências externas e validação de backup;
- rechecagem do estado de proteção no GitHub e salvamento de evidência por segundo revisor;
- regras de publicação do Apps Script/Google com autorização institucional e registro de implantação independente das regras do GitHub.

**Não considerar que uma CI de PR rascunho já proteja a `main`**. As regras de proteção do GitHub devem ser configuradas por administrador; este relatório não o faz.

## 4. Sequência executável de homologação

1. **Proteger `main`** e exigir revisão independente antes de qualquer inclusão dos PRs.
2. **Conectar uma conta Google dedicada a homologação**, diversa da conta operacional; o uso de uma conta operativa para criar recursos fictícios está vedado.
3. Prover **Apps Script, Sheets, pasta Drive e identificação** de homologação isolados; apresentar a propriedade, permissões e IDs apenas aos autorizados, por canal apropriado, sem publicar segredos no GitHub.
4. Obter aprovação para executar testes sintéticos; rodar **R259 preflight de somente leitura**, com checagem de propriedade e ACL externa.
5. Com autorização distinta, executar o **roundtrip real** e os 26 cenários R81, documentando artefatos, falhas e restaurações.
6. Concluir os 13 requisitos externos com revisores; realizar Android/iOS e PDF físicos e auditoria de segurança/dados.
7. Receber decisão formal GO/NO-GO fora do repositório, vinculada ao SHA e aos IDs de implantação, com testemunha e rollback.
8. **Só então** planejar merge e eventual publicação controlada, sob gate independente.

## 5. Código R264: observação, não autorização

`r264_release_readiness_observer.cjs` lê **somente um JSON resumido** do gate R163 e metadados da branch. Ele produz relatório sanitizado, sem credenciais, sem IDs de arquivos Google, sem chamadas de rede, sem escrita, sem acesso ao script de produção. Rejeita marca de origem incorreta, checklist duplicado, 16 itens incompletos, contagem inconsistente ou alegação de `GO`. O campo `releaseAllowed` permanece `false` mesmo se o arquivo alegar 16/16 aprovações.

Para teste local, criar **fora do repositório** um JSON com `{r163:{...},branch:{protected:false,sha:"..."}}`, fundamentado na auditoria R163. Não criar relatórios com o nome/identidade de policiais, credenciais ou fotos. O relatório observacional não substitui a verificação direta dos sistemas Google e do GitHub.

```powershell
node --test tests/r264_release_readiness_observer.test.cjs
node R264_BO_EVIDENCE_INTAKE_NO_DEPLOY/r264_release_readiness_observer.cjs <arquivo_de_evidencia_local.json>
```

## 6. Proibições

- Não mesclar nem publicar PRs R240/R252–R264 sem aprovação independente.
- Não alterar o R163 para forçar estado `GO`.
- Não importar a UI fictícia R262 nem o emissor de tokens sintéticos para a Central oficial.
- Não compartilhar publicamente URLs de arquivos, tokens, matrícula, fotografias ou chaves.
- Não modificar a conta Google atualmente conectada para produção, nem inventar contas de teste.
