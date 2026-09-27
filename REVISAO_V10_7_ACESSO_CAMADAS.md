# Revisão 10.7 — Acesso em camadas RSD/RCO

## Objetivo
Simplificar o início, a continuidade e a passagem de serviço, adotando a nuvem como fonte oficial dos dados e preservando compatibilidade com registros anteriores.

## RSD
### Camada 1 — escolha do fluxo
- Iniciar um novo serviço.
- Continuar serviço em andamento.
- Receber serviço em andamento.

### Iniciar novo serviço
- Limpa somente rascunhos e contexto local do aparelho.
- Não exclui registros históricos da Central.
- Abre a identificação do serviço.
- Guarnição passa a ser escolha explícita entre:
  - BST 01 a BST 10;
  - BASE 01 a BASE 04;
  - GTTRAN 01 a GTTRAN 03;
  - REBOQUE 01 a REBOQUE 03;
  - TOR 01 a TOR 03.
- VTR continua podendo ser utilizada mesmo quando não estiver no Cadastro Mestre, mediante confirmação.
- Busca de militar é global, sem restrição à companhia do serviço.
- Militar não localizado pode ser pré-cadastrado com posto/graduação, nome e unidade de origem usando a chave operacional válida.
- Depois do registro do serviço, a chave não é solicitada novamente para salvamentos normais enquanto a credencial armazenada permanecer válida.
- Identidade do serviço fica bloqueada após o registro: guarnição, VTR principal e comandante do segmento não podem ser alterados silenciosamente.

### Continuar serviço
- Lista RSDs ativos da unidade na nuvem.
- Exibe guarnição, VTR, comandante, data e status.
- Não cria novo serviço.
- Ao assumir em outro aparelho, utiliza o mesmo REPORT_ID/SERVICE_ID e mecanismo de lease já existente.

### Receber serviço
- Usa exclusivamente passagens com status aguardando recebimento.
- Mantém o mesmo SERVICE_ID e cria novo segmento para o novo comandante.
- Preserva histórico de entrega e recebimento.
- Pré-cadastro externo também é aceito no recebimento, quando necessário.

### Salvamento
- Rascunho em nuvem continua automático.
- Confirmação de sincronização marca o conteúdo como salvo.
- Aviso ao sair é destinado a alterações ainda pendentes.
- localStorage permanece apenas como contingência/cache local.

## RCO
### Camada 1
- Iniciar novo serviço de coordenação.
- Continuar serviço de coordenação.
- Receber serviço de coordenação.

### Novo serviço
- Abre identificação do CPU/Coordenador, P3 ou oficial responsável.
- Mantém validação da credencial da função.
- Militar externo continua permitido pelo fluxo já existente.
- Após registrar o responsável, o painel completo do RCO é liberado e a consulta das guarnições pode ser atualizada.

### Continuidade e passagem
- Continuidade consulta os rascunhos RCO existentes na nuvem.
- Recebimento lista somente passagens RCO pendentes.
- A troca de responsável preserva o mesmo RCO e seu histórico.

### Guarnições no RCO
- RSDs em EM_SERVICO continuam visíveis.
- Não é necessário aguardar a guarnição finalizar o RSD para incluí-la/acompanhar sua produção.
- Status possíveis permanecem visíveis, incluindo EM_SERVICO, PASSAGEM_DISPONIVEL, AGUARDANDO_ANALISE e RETIFICACAO_SOLICITADA.
- RSD atualizado pode substituir sua versão anterior na consolidação sem dupla contagem.

## Backend
- Versão: 10.7.0.
- Adicionada normalização/validação da escolha explícita da guarnição.
- Mantido fallback de numeração automática para clientes legados.
- Detectada duplicidade tanto pela VTR principal quanto pela guarnição escolhida na mesma unidade/data.
- Adicionada ação rsd-militar-validar para pré-cadastro operacional de militar externo.
- SERVICE_ID permanece como identidade canônica do serviço; VTR e guarnição são atributos operacionais.

## Compatibilidade
- Registros antigos continuam legíveis.
- Clientes antigos que não enviarem guarnição explícita continuam usando o fallback de numeração automática.
- Nenhum histórico da nuvem é apagado ao iniciar novo serviço.

## Arquivos alterados
- apps_script_v10.gs
- relatorio_servico_diario.html
- relatorio_servico_diario_ios.html
- relatorio_cpu.html
- relatorio_cpu_ios.html
- service_access_layers.js (novo)

## Validação executada
- service_access_layers.js: sintaxe validada com Node.js.
- apps_script_v10.gs: sintaxe validada com Node.js.
- relatorio_servico_diario.html: 8/8 scripts inline validados.
- relatorio_servico_diario_ios.html: 8/8 scripts inline validados.
- relatorio_cpu.html: 9/9 scripts inline validados.
- relatorio_cpu_ios.html: 9/9 scripts inline validados.

## Ordem segura de publicação
1. Publicar o backend Apps Script 10.7.0.
2. Confirmar que o endpoint /exec responde version 10.7.0.
3. Publicar frontend da mesma revisão.
4. Testar RSD novo, continuidade e passagem.
5. Testar RCO novo, continuidade, recebimento e inclusão de RSD ainda em serviço.
