# Implantação da Central v10

## Objetivo
Ativar os módulos em nuvem preparados nesta branch sem substituir o backend legado que continua recebendo os RCOs atuais.

## Arquitetura
- Backend legado: permanece ativo e não deve ser sobrescrito.
- Backend v10 complementar: `apps_script_v10.gs`.
- Base estatística P3: `BASE ESTATÍSTICA P3 - BPTran-BPRv`.
- Base separada de Checklist/Motomecanização: `BASE CHECKLIST E MOTOMECANIZAÇÃO - BPTran-BPRv`.
- Fotos e assinaturas: arquivos no Google Drive; planilhas armazenam URLs/metadados.

## Publicação segura
1. Criar um NOVO projeto Google Apps Script.
2. Copiar integralmente `apps_script_v10.gs` para `Code.gs`.
3. Em **Configurações do projeto > Propriedades do script**, criar:
   - `CENTRAL_TOKEN`: chave longa e aleatória para RSD, Operações, CIRVC e Checklist.
   - `P3_TOKEN`: chave longa e aleatória, distinta, para Gestão P3, cadastros e consolidação.
4. Implantar como **Aplicativo da Web**, executando como o proprietário. Definir o nível de acesso conforme a política institucional. Como a interface está no GitHub Pages, validar que a política escolhida permite chamadas do navegador; nunca retirar a validação por token do código.
5. Copiar a URL `/exec` da nova implantação.
6. Em `central_cloud.js`, substituir apenas o endpoint padrão pelo novo `/exec`. Não alterar o endpoint legado existente nos fluxos antigos do RCO.
7. Abrir `<NOVO_ENDPOINT>?action=version`. A resposta esperada contém `"version":"10.3.0"`.
8. Testar a matriz abaixo antes de promover a branch para `main`.

## Matriz mínima de homologação
- RSD Android/Chrome e iOS/Safari: operação responsiva; múltiplas VTRs; finalizar; aparecer no RCO.
- RSD: retificar e confirmar aviso de versão mais recente no RCO.
- Passagem de serviço: disponibilizar e receber na mesma guarnição.
- Operação: salvar duas operações distintas no mesmo dia e confirmar dois registros independentes em Gestão P3.
- Operação: conferir local previsto, local executado e coordenadas reais.
- RCO: adicionar todos os RSDs finalizados; testar consolidação normal e "sem guarnição CPU".
- Checklist: uma VTR por checklist; assinatura; foto comprimida; criação de alteração.
- Motomecanização: alterar ABERTA > EM_ANALISE > EM_MANUTENCAO > SOLUCIONADA.
- CIRVC: cadastrar veículo; visualizar no módulo Transporte; iniciar carga; impedir dupla carga; entregar ao DETRAN com duas assinaturas; confirmar BAIXADO_DETRAN.
- Gestão P3: Controle Diário, Produtividade, Análise, Operações, Prisões/Conduções, CIRVC e Auditoria.
- Power BI: informar URL institucional em Gestão P3 e confirmar persistência central.
- Contingência: interromper internet e confirmar preservação local/fila; reconectar e sincronizar.

## Promoção
Somente após homologação:
1. Atualizar `CONFIG.BACKEND_V10_STATUS` para `ATIVO`.
2. Registrar a nova URL como configuração do backend v10.
3. Mesclar a PR/branch em `main`.
4. Validar GitHub Pages em desktop, Android/Chrome e iOS/Safari.

## Observações
O arquivo JSON deixa de ser fluxo principal, mas continua disponível como contingência. O Power BI é camada de visualização e não substitui os bancos operacionais.
