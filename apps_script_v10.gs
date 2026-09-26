/**
 * CENTRAL DE RELATÓRIOS BPTran/BPRv — Backend complementar v10
 *
 * Implantação:
 * 1. Crie/abra um projeto do Google Apps Script.
 * 2. Cole este arquivo como Code.gs.
 * 3. Em Propriedades do script, defina:
 *      CENTRAL_TOKEN = chave operacional dos módulos
 *      COORD_TOKEN   = chave exclusiva de CPU/Coordenação
 *      P3_TOKEN      = chave exclusiva da Gestão P3/Oficial
 * 4. Implantar > Aplicativo da Web > Executar como proprietário > acesso conforme política institucional.
 * 5. Substitua CENTRAL_CLOUD_ENDPOINT, no front-end, pela URL /exec da implantação.
 *
 * O banco P3 e o banco do Checklist ficam separados por decisão de arquitetura.
 */

var CENTRAL_V10_VERSION = '10.6.0-rc1';
var P3_SHEET_ID = '1fNE2hEz4vYjX6r-KmLowswlejkVpj6CeD_2FdNK_keM';
var CHECKLIST_SHEET_ID = '15KvRMVC8ofELZLXGlllMq7h5SkPV5qDcC1qtOVB6jBs';
var CHECKLIST_PHOTO_FOLDER_ID = '13dEydl5Ej4zCW0Z1TNOLxooizF6lx3ZC';
var RSD_PAYLOAD_FOLDER_ID = '13eMc58sdk2uD_6Np-8fvoUq9Dw3Sk3jn';
var CIRVC_SIGNATURE_FOLDER_ID = '1IonmgIFfbeSvkBtDLOnrWJBnbzJ6AMfa';

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || 'version');
    var out;

    if (action === 'version') {
      out = {ok:true, version:CENTRAL_V10_VERSION, schema:'central-v10'};
    } else if (action === 'cadastros') {
      assertToken_(p.token, 'central');
      out = cadastroSearch_(p);
    } else if (action === 'rsd-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:rsdList_(p)};
    } else if (action === 'rsd-active') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:rsdActive_(p)};
    } else if (action === 'rsd-get') {
      assertToken_(p.token, 'central');
      out = {ok:true, rsd:rsdGet_(p.reportId)};
    } else if (action === 'passagens-pendentes') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:passagensPendentes_(p)};
    } else if (action === 'operation-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:operationList_(p)};
    } else if (action === 'rco-draft-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:rcoDraftList_(p)};
    } else if (action === 'rco-draft-get') {
      assertToken_(p.token, 'central');
      out = {ok:true, rco:rcoDraftGet_(p.reportId)};
    } else if (action === 'cirvc-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:cirvcList_(p)};
    } else if (action === 'cirvc-pending') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:cirvcPendentes_(p)};
    } else if (action === 'cirvc-transport-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:cirvcTransportList_(p)};
    } else if (action === 'cirvc-transport-get') {
      assertToken_(p.token, 'central');
      out = {ok:true, transporte:cirvcTransportGet_(p.transporteId)};
    } else if (action === 'p3-query') {
      assertToken_(p.token, 'p3');
      out = p3Query_(p);
    } else if (action === 'p3-analysis') {
      assertToken_(p.token, 'p3');
      out = p3Analysis_(p);
    } else if (action === 'p3-config') {
      assertToken_(p.token, 'p3');
      out = p3Config_();
    } else if (action === 'motomecanizacao-list') {
      assertToken_(p.token, 'p3');
      out = motomecanizacaoList_(p);
    } else if (action === 'checklist-list') {
      assertToken_(p.token, 'p3');
      out = checklistList_(p);
    } else {
      throw new Error('Ação GET não reconhecida: ' + action);
    }
    if (String(p.transport||'') === 'message') return postMessagePage_(action, out, p.requestId||'');
    return jsonp_(out, p.callback);
  } catch (err) {
    var ep=((e||{}).parameter||{}), ea=String(ep.action||'version');
    var eo={ok:false, message:String(err && err.message || err)};
    if (String(ep.transport||'') === 'message') return postMessagePage_(ea, eo, ep.requestId||'');
    return jsonp_(eo, ep.callback);
  }
}

function doPost(e) {
  var action = '';
  try {
    var p = (e && e.parameter) || {};
    action = String(p.action || 'rco-upsert');
    var token = String(p.token || '');
    var payload = parseJson_(p.payload, {});

    var out;
    if (action === 'operation-upsert') {
      assertToken_(token, 'central');
      out = operationUpsert_(payload);
    } else if (action === 'rsd-start') {
      assertToken_(token, 'central');
      out = rsdStart_(payload);
    } else if (action === 'rsd-draft-sync') {
      assertToken_(token, 'central');
      out = rsdDraftSync_(payload);
    } else if (action === 'rsd-claim') {
      assertToken_(token, 'central');
      out = rsdClaim_(payload);
    } else if (action === 'rsd-upsert') {
      assertToken_(token, 'central');
      out = rsdUpsert_(payload);
    } else if (action === 'rsd-mark-included') {
      assertToken_(token, 'central');
      out = rsdMarkIncluded_(payload);
    } else if (action === 'passagem-publicar') {
      assertToken_(token, 'central');
      out = passagemPublicar_(payload);
    } else if (action === 'passagem-receber') {
      assertToken_(token, 'central');
      out = passagemReceber_(payload);
    } else if (action === 'passagem-cancelar') {
      assertToken_(token, 'central');
      out = passagemCancelar_(payload);
    } else if (action === 'passagem-retificar') {
      assertToken_(token, 'central');
      out = passagemRetificar_(payload);
    } else if (action === 'passagem-anular') {
      assertToken_(token, 'central');
      out = passagemAnular_(payload);
    } else if (action === 'rsd-review') {
      assertToken_(token, 'coord');
      out = rsdReview_(payload);
    } else if (action === 'rsd-cancel') {
      if(String(payload.perfil||'').toUpperCase()==='GUARNICAO') assertToken_(token, 'central'); else assertToken_(token, 'coord');
      out = rsdCancel_(payload);
    } else if (action === 'rco-responsavel-validar') {
      out = rcoResponsavelValidar_(payload, token);
    } else if (action === 'cirvc-register') {
      assertToken_(token, 'central');
      out = cirvcRegister_(payload);
    } else if (action === 'cirvc-transport-create') {
      assertToken_(token, 'central');
      out = cirvcTransportCreate_(payload);
    } else if (action === 'cirvc-transport-finalize') {
      assertToken_(token, 'central');
      out = cirvcTransportFinalize_(payload);
    } else if (action === 'checklist-upsert') {
      assertToken_(token, 'central');
      out = checklistUpsert_(payload);
    } else if (action === 'motomecanizacao-update') {
      assertToken_(token, 'p3');
      out = motomecanizacaoUpdate_(payload);
    } else if (action === 'cadastro-upsert') {
      assertToken_(token, 'p3');
      out = cadastroUpsert_(payload);
    } else if (action === 'p3-config-set') {
      assertToken_(token, 'p3');
      out = p3ConfigSet_(payload);
    } else if (action === 'rco-draft-upsert') {
      assertToken_(token, 'central');
      out = rcoDraftUpsert_(payload);
    } else if (action === 'rco-draft-claim') {
      assertToken_(token, 'central');
      out = rcoDraftClaim_(payload);
    } else if (action === 'rco-retification-open') {
      assertToken_(token, 'p3');
      out = rcoRetificationOpen_(payload);
    } else if (action === 'rco-upsert') {
      assertToken_(token, 'p3');
      out = rcoSupplementalUpsert_(payload);
    } else {
      throw new Error('Ação POST não reconhecida: ' + action);
    }
    return postMessagePage_(action, out, String(p.requestId||''));
  } catch (err) {
    var ep=(e&&e.parameter)||{};
    return postMessagePage_(action, {ok:false, message:String(err && err.message || err)}, String(ep.requestId||''));
  }
}

/* =========================
   Núcleo
   ========================= */

function assertToken_(token, kind) {
  var props = PropertiesService.getScriptProperties();
  var central = String(props.getProperty('CENTRAL_TOKEN') || '');
  var p3 = String(props.getProperty('P3_TOKEN') || '');
  var coord = String(props.getProperty('COORD_TOKEN') || '');
  token = String(token || '');
  if (kind === 'coord') {
    if (!coord) throw new Error('Backend não configurado: defina COORD_TOKEN nas Propriedades do script.');
    if (token !== coord && (!p3 || token !== p3)) throw new Error('Chave de Coordenação inválida.');
    return true;
  }
  if (kind === 'p3') {
    if (!p3) throw new Error('Backend não configurado: defina P3_TOKEN nas Propriedades do script.');
    if (token !== p3) throw new Error('Chave administrativa inválida.');
    return true;
  }
  if (!central) throw new Error('Backend não configurado: defina CENTRAL_TOKEN nas Propriedades do script.');
  if (token !== central) throw new Error('Chave operacional inválida.');
  return true;
}

function ss_(id) { return SpreadsheetApp.openById(id); }
function sheet_(id, name) {
  var s = ss_(id).getSheetByName(name);
  if (!s) throw new Error('Aba ausente no banco: ' + name);
  return s;
}
function headers_(s) {
  var last = Math.max(1, s.getLastColumn());
  return s.getRange(1,1,1,last).getValues()[0].map(function(x){return String(x||'').trim();});
}
function ensureHeaders_(s, names) {
  var h=headers_(s), missing=(names||[]).filter(function(n){return h.indexOf(String(n))<0;});
  if(missing.length){
    s.getRange(1,h.length+1,1,missing.length).setValues([missing]);
    h=h.concat(missing);
  }
  return h;
}
function objects_(s) {
  var lastRow = s.getLastRow(), lastCol = s.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var h = headers_(s);
  return s.getRange(2,1,lastRow-1,lastCol).getValues().map(function(row, i){
    var o = {_row:i+2};
    h.forEach(function(k,j){ if (k) o[k] = row[j]; });
    return o;
  });
}
function rowFor_(headers, obj) {
  return headers.map(function(k){
    var v = obj.hasOwnProperty(k) ? obj[k] : '';
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}
function upsert_(s, keyField, keyValue, obj) {
  if (!keyValue) throw new Error('Identificador ausente para ' + s.getName());
  var h = headers_(s), keyIdx = h.indexOf(keyField);
  if (keyIdx < 0) throw new Error('Coluna chave ausente: ' + keyField + ' em ' + s.getName());
  var last = s.getLastRow(), row = 0;
  if (last >= 2) {
    var vals = s.getRange(2,keyIdx+1,last-1,1).getDisplayValues();
    for (var i=0;i<vals.length;i++) if (String(vals[i][0]) === String(keyValue)) { row=i+2; break; }
  }
  if (!row) row = last + 1;
  s.getRange(row,1,1,h.length).setValues([rowFor_(h,obj)]);
  return row;
}
function append_(s, obj) {
  var h = headers_(s);
  s.getRange(s.getLastRow()+1,1,1,h.length).setValues([rowFor_(h,obj)]);
}
function deleteWhere_(s, field, value) {
  var h = headers_(s), idx = h.indexOf(field);
  if (idx < 0 || s.getLastRow() < 2) return;
  var vals=s.getRange(2,idx+1,s.getLastRow()-1,1).getDisplayValues();
  for (var i=vals.length-1;i>=0;i--) if (String(vals[i][0]) === String(value)) s.deleteRow(i+2);
}
function findOne_(s, field, value) {
  var list=objects_(s);
  for (var i=0;i<list.length;i++) if (String(list[i][field])===String(value)) return list[i];
  return null;
}
function uid_(p) { return (p||'id') + '-' + Utilities.getUuid(); }
function nowIso_() { return new Date().toISOString(); }
function normMat_(v) {
  var d=String(v||'').replace(/\D/g,'').slice(0,7);
  if (d.length!==7) return d;
  return d.slice(0,3)+'.'+d.slice(3,6)+'-'+d.slice(6);
}
function normBattalion_(v) { return String(v||'').toUpperCase()==='BPRV' ? 'BPRv' : 'BPTran'; }
function normCompany_(b, v) {
  var n = Number(String(v||'').match(/\d+/) && String(v||'').match(/\d+/)[0] || 1);
  return n + 'ª ' + (normBattalion_(b)==='BPRv' ? 'CPRv' : 'CPTran');
}
function parseJson_(v, fallback) { try { return JSON.parse(String(v||'')); } catch(_) { return fallback; } }
function dateText_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v)==='[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone()||'America/Fortaleza','yyyy-MM-dd');
  return String(v).slice(0,10);
}
function hash_(text) {
  var b=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text||''), Utilities.Charset.UTF_8);
  return b.map(function(x){var z=(x<0?x+256:x).toString(16);return z.length===1?'0'+z:z;}).join('');
}
function jsonp_(obj, callback) {
  var raw=JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(String(callback)+'('+raw+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(raw).setMimeType(ContentService.MimeType.JSON);
}
function postMessagePage_(action, obj, requestId) {
  var data=JSON.stringify(Object.assign({source:'central-p3-v10',action:action,requestId:String(requestId||'')},obj||{})).replace(/</g,'\\u003c');
  var html='<!doctype html><meta charset="utf-8"><title>Central</title><style>body{font:14px Arial;padding:24px;color:#17375e}.ok{color:#176b3a}.err{color:#9d1d36}</style>'+
    '<p class="'+((obj||{}).ok===false?'err':'ok')+'">'+escapeHtml_((obj||{}).message||((obj||{}).ok===false?'Falha.':'Operação concluída.'))+'</p>'+
    '<script>(function(){var d='+data+';try{if(window.opener)window.opener.postMessage(d,"*");if(window.parent&&window.parent!==window)window.parent.postMessage(d,"*");if(window.top&&window.top!==window)window.top.postMessage(d,"*");}catch(e){}setTimeout(function(){try{window.close()}catch(e){}},700)})();<\/script>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function escapeHtml_(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function folderFor_(propertyName, defaultName) {
  var props=PropertiesService.getScriptProperties(), defaults={CHECKLIST_PHOTO_FOLDER_ID:CHECKLIST_PHOTO_FOLDER_ID,RSD_PAYLOAD_FOLDER_ID:RSD_PAYLOAD_FOLDER_ID,CIRVC_SIGNATURE_FOLDER_ID:CIRVC_SIGNATURE_FOLDER_ID}, id=props.getProperty(propertyName)||defaults[propertyName]||'';
  if (id) { try { return DriveApp.getFolderById(id); } catch(_) {} }
  var f=DriveApp.createFolder(defaultName);
  props.setProperty(propertyName, f.getId());
  return f;
}
function saveDataUrl_(dataUrl, fileName, folderProp, folderName) {
  if (!dataUrl || String(dataUrl).indexOf('data:')!==0) return {fileId:'',fileUrl:''};
  var m=String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if(!m) return {fileId:'',fileUrl:''};
  var blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],fileName||('arquivo-'+Date.now()));
  var file=folderFor_(folderProp,folderName).createFile(blob);
  return {fileId:file.getId(),fileUrl:file.getUrl(),mimeType:m[1],size:file.getSize()};
}
function saveJsonPayload_(reportId, version, json, folderProp, folderName, existingFileId) {
  if (String(json||'').length <= 45000) return {json:json,fileId:'',fileUrl:''};
  if(existingFileId){try{var oldFile=DriveApp.getFileById(String(existingFileId));oldFile.setContent(String(json));return {json:'',fileId:oldFile.getId(),fileUrl:oldFile.getUrl()};}catch(_){}}
  var prop=folderProp||'RSD_PAYLOAD_FOLDER_ID', name=folderName||'Central RSD - Payloads';
  var file=folderFor_(prop,name).createFile(
    Utilities.newBlob(json,'application/json',String(reportId)+'-v'+version+'.json')
  );
  return {json:'',fileId:file.getId(),fileUrl:file.getUrl()};
}
function isoAfterMinutes_(m){return new Date(Date.now()+Number(m||0)*60000).toISOString();}
function leaseActive_(row){var t=Date.parse(String((row||{}).EDIT_LEASE_UNTIL||''));return isFinite(t)&&t>Date.now();}
function assertLease_(row,deviceId,force){
  if(!row)return;
  var owner=String(row.EDIT_DEVICE_ID||''), dev=String(deviceId||'');
  if(owner&&dev&&owner!==dev&&leaseActive_(row)&&!force) throw new Error('Este serviço está em edição em outro aparelho. Confirme a assunção para continuar neste dispositivo.');
}
function loadJsonPayload_(row) {
  if (row.PAYLOAD_JSON) return parseJson_(row.PAYLOAD_JSON,{});
  if (row.PAYLOAD_FILE_ID) {
    try { return parseJson_(DriveApp.getFileById(String(row.PAYLOAD_FILE_ID)).getBlob().getDataAsString('UTF-8'),{}); } catch(_) {}
  }
  return {};
}

/* =========================
   Cadastros
   ========================= */

function cadastroSearch_(p) {
  var tipo=String(p.tipo||'militar').toLowerCase(), q=String(p.q||'').toLowerCase().trim();
  var name=tipo.indexOf('viat')===0?'VIATURAS':'MILITARES';
  var list=objects_(sheet_(P3_SHEET_ID,name));
  var b=p.batalhao?normBattalion_(p.batalhao):'', comp=p.companhia?String(p.companhia):'';
  list=list.filter(function(x){
    if (b && String(x.BATALHAO)!==b) return false;
    if (comp && x.COMPANHIA && String(x.COMPANHIA)!==comp) return false;
    var hay=Object.keys(x).map(function(k){return String(x[k]||'');}).join(' ').toLowerCase();
    return !q || hay.indexOf(q)>=0;
  }).slice(0,50);
  return {ok:true,items:list};
}
function cadastroUpsert_(payload) {
  var tipo=String(payload.tipo||'militar').toLowerCase();
  if (tipo==='militar') {
    var m=payload.militar||{};
    var mat=normMat_(m.matricula||m.MATRICULA);
    if (!/^\d{3}\.\d{3}-\d$/.test(mat)) throw new Error('Matrícula inválida.');
    var obj={
      MILITAR_ID:m.militarId||m.MILITAR_ID||('mil-'+mat.replace(/\D/g,'')),
      MATRICULA:mat,POSTO_GRAD:m.postoGrad||m.POSTO_GRAD||'',NOME:m.nome||m.NOME||'',
      BATALHAO:normBattalion_(m.batalhao||m.BATALHAO),COMPANHIA:m.companhia||m.COMPANHIA||'',
      SITUACAO:m.situacao||'ATIVO',TIPO_CADASTRO:m.tipoCadastro||'MANUAL_VALIDADO',
      UNIDADE_ORIGEM:m.unidadeOrigem||'',ATUALIZADO_EM:nowIso_()
    };
    upsert_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat,obj);
    return {ok:true,message:'Militar atualizado.',item:obj};
  }
  var v=payload.viatura||{}, prefix=String(v.prefixo||v.PREFIXO||'').trim().toUpperCase();
  if(!prefix) throw new Error('Informe o prefixo.');
  var vo={
    VIATURA_ID:v.viaturaId||v.VIATURA_ID||('vtr-'+prefix.replace(/[^A-Z0-9]/g,'-').toLowerCase()),
    PREFIXO:prefix,PLACA:String(v.placa||v.PLACA||'').toUpperCase(),MARCA_MODELO:v.marcaModelo||v.MARCA_MODELO||'',
    TIPO:v.tipo||v.TIPO||'',BATALHAO:normBattalion_(v.batalhao||v.BATALHAO),COMPANHIA:v.companhia||v.COMPANHIA||'',
    SITUACAO:v.situacao||'ATIVA',ORIGEM:v.origem||'CADASTRO_MANUAL',ATUALIZADO_EM:nowIso_()
  };
  upsert_(sheet_(P3_SHEET_ID,'VIATURAS'),'PREFIXO',prefix,vo);
  upsert_(sheet_(CHECKLIST_SHEET_ID,'VIATURAS'),'PREFIXO',prefix,vo);
  return {ok:true,message:'Viatura atualizada.',item:vo};
}


/* =========================
   Operações individualizadas
   ========================= */

function splitCoords_(v) {
  var s=String(v||'').trim(), m=s.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? {lat:m[1],lng:m[2]} : {lat:'',lng:''};
}
function operationUpsert_(payload) {
  var p=payload.operacaoPayload||payload.operacaoCompleta||payload||{};
  if(String(p.schema||'')!=='pmpb-transito-operacao-v2') throw new Error('Operação incompatível.');
  var id=String(p.reportId||''); if(!id) throw new Error('Operação sem REGISTRO_ID.');
  var u=p.unidade||{}, op=p.operacao||{}, pod=p.pod||{}, loc=p.local||{}, res=p.resultados||{}, ab=res.abordagens||{}, nt=res.notificacoes||{}, rem=res.remocoes||{}, cr=res.criminal||{};
  var batt=normBattalion_(u.batalhao||u.batalhaoSigla), comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var coord=splitCoords_(loc.coordenadas), prev=splitCoords_(pod.coordenadasPrevistas);
  var old=findOne_(sheet_(P3_SHEET_ID,'OPERACOES'),'REGISTRO_ID',id), version=old?Number(old.VERSAO_ORIGEM||1)+1:1;
  var row={
    REGISTRO_ID:id,REPORT_ID:id,DATA:dateText_(op.data),TURNO:op.turno||'',BATALHAO:batt,COMPANHIA:comp,GUARNICAO_RESPONSAVEL:op.guarnicoes||'',
    OPERACAO:op.nome||'',MODALIDADE:op.modalidade||'',LOCAL:loc.descricao||'',RODOVIA:loc.rodovia||'',KM:loc.km||'',MUNICIPIO:loc.municipio||'',
    BAIRRO_LOCALIDADE:loc.bairroLocalidade||'',LATITUDE:loc.latitude||coord.lat,LONGITUDE:loc.longitude||coord.lng,EFETIVO:Number(op.qtdPms||0),VTRS:op.vtrs||'',
    PESSOAS_ABORDADAS:Number(ab.pessoas||0),MOTOCICLETAS_ABORDADAS:Number(ab.motocicletas||0),CICLOMOTORES_ABORDADOS:Number(ab.ciclomotores||0),
    AUTOMOVEIS_ABORDADOS:Number(ab.automoveis||0),CHECKPOINTS:Number(ab.checkpoints||0),TESTES_ETILOMETRO:Number(nt.testesEtilometro||0),
    ART_165:Number(nt.art165||0),ART_165_A:Number(nt.art165a||0),ART_230_XI:Number(nt.art230xi||0),OUTROS_AITS_COM_ABORDAGEM:Number(nt.aitsComAbordagem||0),
    AITS_SEM_ABORDAGEM:Number(nt.aitsSemAbordagem||0),REMOCOES_MOTOCICLETAS:Number(rem.motocicletas||0),REMOCOES_CICLOMOTORES:Number(rem.ciclomotores||0),
    REMOCOES_AUTOMOVEIS:Number(rem.automoveis||0),ARMAS_APREENDIDAS:Number(cr.armas||0),PRISOES:Number(cr.prisoes||0),DROGAS:Number(cr.drogas||0),
    MANDADOS_PRISAO:Number(cr.mandados||0),VEICULOS_RECUPERADOS:Number(cr.veiculosRecuperados||0),VEICULOS_ADULTERADOS:Number(cr.veiculosAdulterados||0),TCOS:Number(cr.tcos||0),
    RESPONSAVEL:op.responsavel||'',DESCRICAO_APOIO:p.descricaoApoio||'',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_(),
    RSD_REPORT_ID:p.rsdReportId||(p.contextoServico||{}).rsdReportId||(old&&old.RSD_REPORT_ID)||'',
    RCO_REPORT_ID:old&&old.RCO_REPORT_ID||'',STATUS_REGISTRO:'OPERACAO_FINALIZADA',VERSAO_ORIGEM:version,
    SERVICE_ID:p.serviceId||(p.contextoServico||{}).serviceId||(old&&old.SERVICE_ID)||'',
    SEGMENTO:Number(p.segmento||(p.contextoServico||{}).segmento||(old&&old.SEGMENTO)||0)||'',
    COMANDANTE_MATRICULA:normMat_(p.comandanteMatricula||(p.contextoServico||{}).comandanteMatricula||'')
  };
  upsert_(sheet_(P3_SHEET_ID,'OPERACOES'),'REGISTRO_ID',id,row);
  var changed=['Executado em local diverso','Executado parcialmente','Não executado'].indexOf(String(pod.statusCumprimento||''))>=0;
  upsert_(sheet_(P3_SHEET_ID,'POD_EXECUCAO'),'REGISTRO_ID',id,{
    REGISTRO_ID:id,REPORT_ID:id,DATA:dateText_(op.data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:op.guarnicoes||'',OPERACAO:op.nome||'',TURNO:op.turno||'',
    STATUS_CUMPRIMENTO:pod.statusCumprimento||'',LOCAL_PREVISTO:pod.localPrevisto||'',COORDENADAS_PREVISTAS:pod.coordenadasPrevistas||'',
    LOCAL_EXECUTADO:loc.descricao||'',COORDENADAS_EXECUTADAS:loc.coordenadas||'',HORA_INICIO:op.horaInicio||'',HORA_FIM:op.horaFim||'',
    HOUVE_ALTERACAO:changed?'SIM':'NÃO',MOTIVO_ALTERACAO:pod.motivoAlteracao||'',ORIGEM_RELATORIO:'OPERACAO',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_()
  });
  audit_('OPERACAO',id,version,old?'RETIFICADA':'FINALIZADA','',op.responsavel||'',batt,comp,p);
  return {ok:true,message:old?'Operação atualizada no banco estatístico.':'Operação registrada individualmente no banco estatístico.',registroId:id,version:version};
}

function operationList_(p) {
  var list=objects_(sheet_(P3_SHEET_ID,'OPERACOES')), pods=objects_(sheet_(P3_SHEET_ID,'POD_EXECUCAO')), pm={};
  pods.forEach(function(x){pm[String(x.REGISTRO_ID||'')]=x});
  return list.filter(function(x){
    if(p.rsdReportId && String(x.RSD_REPORT_ID)!==String(p.rsdReportId))return false;
    if(p.serviceId && String(x.SERVICE_ID)!==String(p.serviceId))return false;
    if(p.data && dateText_(x.DATA)!==dateText_(p.data))return false;
    return String(x.STATUS_REGISTRO||'')!=='INATIVO';
  }).map(function(x){
    var d=pm[String(x.REGISTRO_ID||'')]||{};
    return {schema:'pmpb-transito-operacao-v2',schemaVersion:2,reportId:x.REGISTRO_ID,
      serviceId:x.SERVICE_ID||'',rsdReportId:x.RSD_REPORT_ID||'',segmento:Number(x.SEGMENTO||0)||'',
      comandanteMatricula:x.COMANDANTE_MATRICULA||'',unidade:{batalhao:x.BATALHAO,companhia:x.COMPANHIA,companhiaNumero:Number(String(x.COMPANHIA||'').match(/\d+/)?.[0]||1)},
      operacao:{nome:x.OPERACAO||'',data:dateText_(x.DATA),turno:x.TURNO||'',modalidade:x.MODALIDADE||'',guarnicoes:x.GUARNICAO_RESPONSAVEL||'',vtrs:x.VTRS||'',qtdPms:Number(x.EFETIVO||0),responsavel:x.RESPONSAVEL||''},
      pod:{statusCumprimento:d.STATUS_CUMPRIMENTO||'',localPrevisto:d.LOCAL_PREVISTO||'',coordenadasPrevistas:d.COORDENADAS_PREVISTAS||'',motivoAlteracao:d.MOTIVO_ALTERACAO||''},
      local:{descricao:d.LOCAL_EXECUTADO||x.LOCAL||'',coordenadas:d.COORDENADAS_EXECUTADAS||[x.LATITUDE,x.LONGITUDE].filter(Boolean).join(', '),latitude:x.LATITUDE||'',longitude:x.LONGITUDE||''},
      resultados:{abordagens:{pessoas:Number(x.PESSOAS_ABORDADAS||0),motocicletas:Number(x.MOTOCICLETAS_ABORDADAS||0),ciclomotores:Number(x.CICLOMOTORES_ABORDADOS||0),automoveis:Number(x.AUTOMOVEIS_ABORDADOS||0),checkpoints:Number(x.CHECKPOINTS||0)},
        notificacoes:{testesEtilometro:Number(x.TESTES_ETILOMETRO||0),art165:Number(x.ART_165||0),art165a:Number(x.ART_165_A||0),art230xi:Number(x.ART_230_XI||0),aitsComAbordagem:Number(x.OUTROS_AITS_COM_ABORDAGEM||0),aitsSemAbordagem:Number(x.AITS_SEM_ABORDAGEM||0)},
        remocoes:{motocicletas:Number(x.REMOCOES_MOTOCICLETAS||0),ciclomotores:Number(x.REMOCOES_CICLOMOTORES||0),automoveis:Number(x.REMOCOES_AUTOMOVEIS||0)},
        criminal:{armas:Number(x.ARMAS_APREENDIDAS||0),prisoes:Number(x.PRISOES||0),drogas:Number(x.DROGAS||0),mandados:Number(x.MANDADOS_PRISAO||0),veiculosRecuperados:Number(x.VEICULOS_RECUPERADOS||0),veiculosAdulterados:Number(x.VEICULOS_ADULTERADOS||0),tcos:Number(x.TCOS||0)}},
      resumoCpu:{nome:x.OPERACAO||'',local:d.LOCAL_EXECUTADO||x.LOCAL||'',turno:x.TURNO||'',
        apreensoesVeiculos:Number(x.REMOCOES_MOTOCICLETAS||0)+Number(x.REMOCOES_CICLOMOTORES||0)+Number(x.REMOCOES_AUTOMOVEIS||0),
        totalAits:Number(x.ART_165||0)+Number(x.ART_165_A||0)+Number(x.ART_230_XI||0)+Number(x.OUTROS_AITS_COM_ABORDAGEM||0)+Number(x.AITS_SEM_ABORDAGEM||0),
        prisoes:Number(x.PRISOES||0),statusCumprimento:d.STATUS_CUMPRIMENTO||'Não informado',localPrevisto:d.LOCAL_PREVISTO||'',coordenadasPrevistas:d.COORDENADAS_PREVISTAS||'',motivoAlteracao:d.MOTIVO_ALTERACAO||''}};
  });
}

/* =========================
   RSD em nuvem
   ========================= */

function syncRsdVehicles_(r, reportId) {
  var g=r.guarnicao||{}, now=nowIso_();
  deleteWhere_(sheet_(P3_SHEET_ID,'RSD_VIATURAS'),'RSD_REPORT_ID',reportId);
  var vs=r.viaturas||g.viaturas||[];
  if(!Array.isArray(vs)) vs=[];
  if(!vs.length && g.viatura) vs=String(g.viatura).split(',').map(function(x){return {prefixo:String(x||'').trim()};}).filter(function(x){return x.prefixo;});
  var sv=sheet_(P3_SHEET_ID,'RSD_VIATURAS');
  vs.forEach(function(v,i){
    if(typeof v==='string') v={prefixo:v};
    append_(sv,{REGISTRO_ID:uid_('vtr-rsd'),RSD_REPORT_ID:reportId,VIATURA_ID:v.viaturaId||'',
      PREFIXO:v.prefixo||v.viatura||'',PLACA:v.placa||'',MARCA_MODELO:v.marcaModelo||'',TIPO:v.tipo||'',ORDEM:i+1,
      ORIGEM:v.origem||'RSD',REGISTRADO_EM:now});
  });
}
function rsdDraftObject_(r,old,deviceId) {
  var reportId=String(r.reportId||''),u=r.unidade||{},g=r.guarnicao||{};
  var version=old?Number(old.VERSAO||1):1, rev=old?Number(old.DRAFT_REVISION||0)+1:1;
  var serviceId=String(r.serviceId||(r.servico||{}).serviceId||(old&&old.SERVICE_ID)||uid_('svc')),seg=Number(r.segmento||(r.servico||{}).segmento||(old&&old.SEGMENTO)||1)||1;
  r.serviceId=serviceId;r.segmento=seg;r.servico=r.servico||{};r.servico.serviceId=serviceId;r.servico.segmento=seg;
  var json=JSON.stringify(r),saved=saveJsonPayload_(reportId,'draft-'+rev,json,'RSD_PAYLOAD_FOLDER_ID','Central RSD - Payloads',old&&old.PAYLOAD_FILE_ID||''),batt=normBattalion_(u.batalhao||u.batalhaoSigla||'BPTran'),comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  return {REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:g.nome||'',TURNO:'',
    STATUS:'EM_SERVICO',RESPONSAVEL_MATRICULA:normMat_(g.matricula||r.matriculaResponsavel||''),RESPONSAVEL_POSTO_GRAD:g.postoGrad||'',RESPONSAVEL_NOME:g.responsavel||'',
    INICIADO_EM:old&&old.INICIADO_EM||r.iniciadoEm||(r.servico||{}).iniciadoEm||nowIso_(),FINALIZADO_EM:'',RETIFICADO_EM:'',CANCELADO_EM:'',
    RCO_REPORT_ID:old&&old.RCO_REPORT_ID||'',INCLUIDO_RCO_EM:old&&old.INCLUIDO_RCO_EM||'',PAYLOAD_JSON:saved.json,SCHEMA_VERSION:r.schemaVersion||2,SINCRONIZADO_EM:nowIso_(),
    ORIGEM:r.origem||(old&&old.ORIGEM)||'RSD_WEB',OBSERVACOES:r.observacoes||'',PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json),
    SERVICE_ID:serviceId,SEGMENTO:seg,RSD_ANTERIOR_ID:r.rsdAnteriorId||(r.servico||{}).rsdAnteriorId||(old&&old.RSD_ANTERIOR_ID)||'',
    PASSAGEM_ORIGEM_ID:r.passagemOrigemId||(r.servico||{}).passagemOrigemId||(old&&old.PASSAGEM_ORIGEM_ID)||'',ULTIMO_RASCUNHO_EM:nowIso_(),
    EDIT_DEVICE_ID:String(deviceId||old&&old.EDIT_DEVICE_ID||''),EDIT_LEASE_UNTIL:deviceId?isoAfterMinutes_(3):(old&&old.EDIT_LEASE_UNTIL||''),DRAFT_REVISION:rev};
}
function rsdStart_(payload) {
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD'),old=findOne_(s,'REPORT_ID',reportId);
  ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','DUPLICATE_OVERRIDE_JUSTIFICATIVA']);
  if(old&&['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD não está disponível para novo início/registro. Situação atual: '+String(old.STATUS||'').replace(/_/g,' ')+'. Use Continuar serviço para consultar a situação ou a devolutiva.');

  var u0=r.unidade||{},g0=r.guarnicao||{},batt0=normBattalion_(u0.batalhao||u0.batalhaoSigla||'BPTran'),
      comp0=u0.companhia||normCompany_(batt0,u0.companhiaNumero),data0=dateText_((r.servico||{}).data),
      mat0=normMat_(g0.matricula||r.matriculaResponsavel||''),gu0=String(g0.nome||'').trim().toUpperCase();

  if(!old&&gu0&&data0&&!payload.overrideDuplicate&&!r.passagemOrigemId&&!(r.servico&&r.servico.passagemOrigemId)){
    var candidates=objects_(s).filter(function(x){
      return ['CANCELADO','INDEFERIDO'].indexOf(String(x.STATUS))<0 &&
        String(x.GUARNICAO||'').trim().toUpperCase()===gu0 &&
        dateText_(x.DATA_SERVICO)===data0 &&
        String(x.BATALHAO||'')===String(batt0) &&
        String(x.COMPANHIA||'')===String(comp0) &&
        String(x.REPORT_ID||'')!==reportId;
    }).sort(function(a,b){
      return String(b.ULTIMO_RASCUNHO_EM||b.INICIADO_EM||b.FINALIZADO_EM||'').localeCompare(String(a.ULTIMO_RASCUNHO_EM||a.INICIADO_EM||a.FINALIZADO_EM||''));
    });
    if(candidates.length){
      return {ok:true,existing:true,possible_duplicate:true,message:'Já existe registro compatível para esta guarnição, unidade e data. Continue o serviço existente ou justifique a criação de outro serviço.',
        candidates:candidates.slice(0,8).map(function(x){return {reportId:String(x.REPORT_ID||''),serviceId:String(x.SERVICE_ID||''),segmento:Number(x.SEGMENTO||1),status:String(x.STATUS||''),responsavel:String(x.RESPONSAVEL_NOME||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),iniciadoEm:String(x.INICIADO_EM||''),finalizadoEm:String(x.FINALIZADO_EM||'')};}),
        reportId:String(candidates[0].REPORT_ID||''),serviceId:String(candidates[0].SERVICE_ID||''),segmento:Number(candidates[0].SEGMENTO||1),status:String(candidates[0].STATUS||'')};
    }
  }
  if(!old&&payload.overrideDuplicate&&!String(payload.overrideJustification||'').trim())throw new Error('Informe a justificativa para criar um segundo serviço potencialmente duplicado.');

  var newMat=mat0;
  if(old&&old.RESPONSAVEL_MATRICULA&&newMat&&normMat_(old.RESPONSAVEL_MATRICULA)!==newMat)throw new Error('O comandante deste segmento já está definido. Para mudança de comandante, realize a passagem de serviço.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var obj=rsdDraftObject_(r,old,deviceId);
  if(payload.overrideDuplicate)obj.DUPLICATE_OVERRIDE_JUSTIFICATIVA=String(payload.overrideJustification||'');
  upsert_(s,'REPORT_ID',reportId,obj);syncRsdVehicles_(r,reportId);
  audit_('RSD',reportId,obj.DRAFT_REVISION,old?'RASCUNHO_ATUALIZADO':'INICIADO',obj.RESPONSAVEL_MATRICULA,obj.RESPONSAVEL_NOME,obj.BATALHAO,obj.COMPANHIA,r);
  return {ok:true,message:old?'Serviço em andamento atualizado na nuvem.':'Guarnição registrada em serviço e disponível ao coordenador.',reportId:reportId,serviceId:obj.SERVICE_ID,segmento:obj.SEGMENTO,draftRevision:obj.DRAFT_REVISION,status:'EM_SERVICO'};
  }finally{lock.releaseLock();}
}
function rsdDraftSync_(payload){
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD'),old=findOne_(s,'REPORT_ID',reportId);
  if(!old)return rsdStart_(payload);
  if(['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD não está disponível para edição.');
  var newMat=normMat_((r.guarnicao||{}).matricula||r.matriculaResponsavel||'');
  if(old.RESPONSAVEL_MATRICULA&&newMat&&normMat_(old.RESPONSAVEL_MATRICULA)!==newMat)throw new Error('O comandante deste segmento já está definido. Para mudança de comandante, realize a passagem de serviço.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var obj=rsdDraftObject_(r,old,deviceId);obj.STATUS=String(old.STATUS)==='RETIFICACAO_SOLICITADA'?'RETIFICACAO_SOLICITADA':'EM_SERVICO';
  if(old.REVIEW_STATUS)obj.REVIEW_STATUS=old.REVIEW_STATUS;if(old.REVIEW_MOTIVO)obj.REVIEW_MOTIVO=old.REVIEW_MOTIVO;if(old.REVIEW_OBSERVACAO)obj.REVIEW_OBSERVACAO=old.REVIEW_OBSERVACAO;
  upsert_(s,'REPORT_ID',reportId,obj);syncRsdVehicles_(r,reportId);
  return {ok:true,message:'Rascunho sincronizado.',reportId:reportId,serviceId:obj.SERVICE_ID,segmento:obj.SEGMENTO,draftRevision:obj.DRAFT_REVISION,status:obj.STATUS};
}
function rsdClaim_(payload){
  var reportId=String(payload.reportId||''),deviceId=String(payload.deviceId||'');if(!reportId||!deviceId)throw new Error('Identificação de continuidade incompleta.');
  var s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);if(!row)throw new Error('RSD em andamento não localizado.');
  if(['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(row.STATUS))<0)throw new Error('Este RSD não está disponível para continuidade.');
  assertLease_(row,deviceId,!!payload.forceTakeover);row.EDIT_DEVICE_ID=deviceId;row.EDIT_LEASE_UNTIL=isoAfterMinutes_(3);row.SINCRONIZADO_EM=nowIso_();upsert_(s,'REPORT_ID',reportId,row);
  var p=rsdGet_(reportId);p.versao=Number(row.VERSAO||1);p.serviceId=row.SERVICE_ID||p.serviceId||'';p.segmento=Number(row.SEGMENTO||p.segmento||1);
  return {ok:true,message:String(row.STATUS)==='RETIFICACAO_SOLICITADA'?'Relatório devolvido carregado para retificação.':'Serviço assumido neste aparelho.',rsd:p,meta:{reportId:reportId,serviceId:row.SERVICE_ID||'',segmento:Number(row.SEGMENTO||1),draftRevision:Number(row.DRAFT_REVISION||0)}};
}
function rsdUpsert_(payload) {
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD');ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL']);
  var old=findOne_(s,'REPORT_ID',reportId),newMat=normMat_((r.guarnicao||{}).matricula||r.matriculaResponsavel||'');
  if(old&&old.RESPONSAVEL_MATRICULA&&newMat&&normMat_(old.RESPONSAVEL_MATRICULA)!==newMat)throw new Error('O comandante deste segmento já está definido. Para mudança de comandante, realize a passagem de serviço.');
  if(old&&['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD já não está disponível para finalização. Situação atual: '+String(old.STATUS||'').replace(/_/g,' ')+'. Consulte a devolutiva do Coordenador antes de qualquer nova ação.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var wasReturned=!!(old&&String(old.STATUS)==='RETIFICACAO_SOLICITADA'),version=Math.max(Number(r.versao||r.version||0),old?Number(old.VERSAO||0)+1:1);
  var u=r.unidade||{},g=r.guarnicao||{},json=JSON.stringify(r),saved=saveJsonPayload_(reportId,version,json),batt=normBattalion_(u.batalhao||u.batalhaoSigla||'BPTran'),comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var serviceId=String(r.serviceId||(r.servico||{}).serviceId||(old&&old.SERVICE_ID)||uid_('svc')),seg=Number(r.segmento||(r.servico||{}).segmento||(old&&old.SEGMENTO)||1)||1;
  var obj={REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:g.nome||'',TURNO:'',STATUS:'AGUARDANDO_ANALISE',
    RESPONSAVEL_MATRICULA:normMat_(g.matricula||r.matriculaResponsavel||''),RESPONSAVEL_POSTO_GRAD:g.postoGrad||'',RESPONSAVEL_NOME:g.responsavel||'',
    INICIADO_EM:old&&old.INICIADO_EM||r.iniciadoEm||(r.servico||{}).iniciadoEm||'',FINALIZADO_EM:nowIso_(),RETIFICADO_EM:wasReturned?nowIso_():'',CANCELADO_EM:'',
    RCO_REPORT_ID:old&&old.RCO_REPORT_ID||'',INCLUIDO_RCO_EM:old&&old.INCLUIDO_RCO_EM||'',PAYLOAD_JSON:saved.json,SCHEMA_VERSION:r.schemaVersion||2,SINCRONIZADO_EM:nowIso_(),
    ORIGEM:r.origem||(old&&old.ORIGEM)||'RSD_WEB',OBSERVACOES:r.observacoes||'',PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json),
    SERVICE_ID:serviceId,SEGMENTO:seg,RSD_ANTERIOR_ID:r.rsdAnteriorId||(r.servico||{}).rsdAnteriorId||(old&&old.RSD_ANTERIOR_ID)||'',
    PASSAGEM_ORIGEM_ID:r.passagemOrigemId||(r.servico||{}).passagemOrigemId||(old&&old.PASSAGEM_ORIGEM_ID)||'',ULTIMO_RASCUNHO_EM:nowIso_(),
    EDIT_DEVICE_ID:deviceId||old&&old.EDIT_DEVICE_ID||'',EDIT_LEASE_UNTIL:'',DRAFT_REVISION:old?Number(old.DRAFT_REVISION||0):0,
    REVIEW_STATUS:'AGUARDANDO_ANALISE',REVIEW_MOTIVO:'',REVIEW_OBSERVACAO:'',REVIEW_AUTOR_MATRICULA:'',REVIEW_AUTOR_NOME:'',REVIEW_EM:''};
  upsert_(s,'REPORT_ID',reportId,obj);syncRsdVehicles_(r,reportId);syncRsdOperations_(r,reportId,batt,comp,version);syncRsdOccurrences_(r,reportId,batt,comp);syncRsdCirvcs_(r,reportId,batt,comp,serviceId,seg);
  audit_('RSD',reportId,version,wasReturned?'REENVIADO_PARA_ANALISE':'AGUARDANDO_ANALISE',obj.RESPONSAVEL_MATRICULA,obj.RESPONSAVEL_NOME,batt,comp,r);
  return {ok:true,message:wasReturned?'RSD retificado e reenviado para análise do Coordenador.':'RSD finalizado e enviado para análise do Coordenador.',reportId:reportId,serviceId:serviceId,segmento:seg,version:version,status:'AGUARDANDO_ANALISE'};
}
function rsdList_(p) {
  var rs=sheet_(P3_SHEET_ID,'RSD');
  ensureHeaders_(rs,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL']);
  var list=objects_(rs),batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||''),mat=normMat_(p.matricula||''),showCancelled=String(p.showCancelled||'')==='1',vtrs=objects_(sheet_(P3_SHEET_ID,'RSD_VIATURAS'));
  var allowed=['EM_SERVICO','PASSAGEM_DISPONIVEL','ENCERRADO_PASSAGEM','AGUARDANDO_ANALISE','DEFERIDO','DEFERIDO_COM_RESSALVAS','RETIFICACAO_SOLICITADA','INDEFERIDO','FINALIZADO','INCLUIDO_RCO'];
  if(showCancelled)allowed.push('CANCELADO');
  var filtered=list.filter(function(x){if(allowed.indexOf(String(x.STATUS))<0)return false;if(batt&&String(x.BATALHAO)!==batt)return false;if(comp&&String(x.COMPANHIA)!==String(comp))return false;if(data&&dateText_(x.DATA_SERVICO)!==data)return false;if(mat&&normMat_(x.RESPONSAVEL_MATRICULA)!==mat)return false;return true;});
  var servicesByKey={};filtered.filter(function(x){return String(x.STATUS)!=='CANCELADO';}).forEach(function(x){
    var k=[x.BATALHAO,x.COMPANHIA,dateText_(x.DATA_SERVICO),String(x.GUARNICAO||'').trim().toUpperCase()].join('|');
    if(!servicesByKey[k])servicesByKey[k]={};
    var sid=String(x.SERVICE_ID||x.REPORT_ID||'');
    if(sid){
      var meta=servicesByKey[k][sid]||{justified:false,iniciadoEm:String(x.INICIADO_EM||'')};
      if(String(x.DUPLICATE_OVERRIDE_JUSTIFICATIVA||'').trim())meta.justified=true;
      if(!meta.iniciadoEm)meta.iniciadoEm=String(x.INICIADO_EM||'');
      servicesByKey[k][sid]=meta;
    }
  });
  return filtered.map(function(x){
    var rv=vtrs.filter(function(v){return String(v.RSD_REPORT_ID)===String(x.REPORT_ID);}).sort(function(a,b){return Number(a.ORDEM||0)-Number(b.ORDEM||0);});
    var key=[x.BATALHAO,x.COMPANHIA,dateText_(x.DATA_SERVICO),String(x.GUARNICAO||'').trim().toUpperCase()].join('|');
    return {reportId:x.REPORT_ID,serviceId:x.SERVICE_ID||'',segmento:Number(x.SEGMENTO||1),rsdAnteriorId:x.RSD_ANTERIOR_ID||'',passagemOrigemId:x.PASSAGEM_ORIGEM_ID||'',version:Number(x.VERSAO||1),draftRevision:Number(x.DRAFT_REVISION||0),
      data:x.DATA_SERVICO,batalhao:x.BATALHAO,companhia:x.COMPANHIA,guarnicao:x.GUARNICAO,status:x.STATUS,responsavel:x.RESPONSAVEL_NOME,matricula:x.RESPONSAVEL_MATRICULA,
      iniciadoEm:x.INICIADO_EM,finalizadoEm:x.FINALIZADO_EM,ultimoRascunhoEm:x.ULTIMO_RASCUNHO_EM,rcoReportId:x.RCO_REPORT_ID,editDeviceId:x.EDIT_DEVICE_ID||'',editLeaseUntil:x.EDIT_LEASE_UNTIL||'',
      reviewStatus:x.REVIEW_STATUS||'',reviewMotivo:x.REVIEW_MOTIVO||'',reviewObservacao:x.REVIEW_OBSERVACAO||'',reviewAutorNome:x.REVIEW_AUTOR_NOME||'',reviewEm:x.REVIEW_EM||'',
      canceladoMotivo:x.CANCELADO_MOTIVO||'',canceladoPorNome:x.CANCELADO_POR_NOME||'',canceladoPorMatricula:x.CANCELADO_POR_MATRICULA||'',canceladoPorPerfil:x.CANCELADO_POR_PERFIL||'',canceladoEm:x.CANCELADO_EM||'',
      duplicateJustification:x.DUPLICATE_OVERRIDE_JUSTIFICATIVA||'',
      possibleDuplicate:(function(){var svc=servicesByKey[key]||{},ids=Object.keys(svc);if(ids.length<=1)return false;var justified=ids.filter(function(id){return !!svc[id].justified;}).length;return justified<ids.length-1;})(),
      duplicateCount:Math.max(1,Object.keys(servicesByKey[key]||{}).length),
      viaturas:rv.map(function(v){return {prefixo:v.PREFIXO,placa:v.PLACA,marcaModelo:v.MARCA_MODELO,tipo:v.TIPO};})};
  });
}
function rsdActive_(p) {
  var mat=normMat_(p.matricula||''),gu=String(p.guarnicao||'').toLowerCase(),items=rsdList_(p);
  return items.filter(function(x){if(['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(x.status))<0)return false;if(mat&&normMat_(x.matricula)!==mat)return false;if(gu&&String(x.guarnicao||'').toLowerCase()!==gu)return false;return true;}).sort(function(a,b){return String(b.ultimoRascunhoEm||b.iniciadoEm||'').localeCompare(String(a.ultimoRascunhoEm||a.iniciadoEm||''));});
}
function rsdGet_(reportId) {
  var row=findOne_(sheet_(P3_SHEET_ID,'RSD'),'REPORT_ID',reportId);if(!row)throw new Error('RSD não localizado.');
  var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('Conteúdo do RSD indisponível.');
  p.versao=Number(row.VERSAO||1);p.serviceId=row.SERVICE_ID||p.serviceId||'';p.segmento=Number(row.SEGMENTO||p.segmento||1);p.rsdAnteriorId=row.RSD_ANTERIOR_ID||p.rsdAnteriorId||'';p.passagemOrigemId=row.PASSAGEM_ORIGEM_ID||p.passagemOrigemId||'';
  p.centralStatus=String(row.STATUS||'');p.revisaoCoordenador={status:row.REVIEW_STATUS||'',motivo:row.REVIEW_MOTIVO||'',observacao:row.REVIEW_OBSERVACAO||'',autorNome:row.REVIEW_AUTOR_NOME||'',autorMatricula:row.REVIEW_AUTOR_MATRICULA||'',em:row.REVIEW_EM||''};
  p.cancelamento={motivo:row.CANCELADO_MOTIVO||'',autorNome:row.CANCELADO_POR_NOME||'',autorMatricula:row.CANCELADO_POR_MATRICULA||'',perfil:row.CANCELADO_POR_PERFIL||'',em:row.CANCELADO_EM||''};
  return p;
}
function rsdMarkIncluded_(payload) {
  var ids=payload.rsdReportIds||payload.reportIds||[];if(!Array.isArray(ids))ids=[];if(payload.reportId)ids.unshift(payload.reportId);ids=ids.filter(Boolean);
  if(!ids.length)throw new Error('Nenhum RSD informado.');
  var rcoId=String(payload.rcoReportId||''),s=sheet_(P3_SHEET_ID,'RSD'),count=0;
  ids.forEach(function(reportId){var row=findOne_(s,'REPORT_ID',String(reportId));if(!row)return;
    if(['DEFERIDO','DEFERIDO_COM_RESSALVAS','INCLUIDO_RCO'].indexOf(String(row.STATUS))<0)return;
    row.STATUS='INCLUIDO_RCO';row.RCO_REPORT_ID=rcoId;row.INCLUIDO_RCO_EM=nowIso_();row.SINCRONIZADO_EM=nowIso_();upsert_(s,'REPORT_ID',String(reportId),row);count++;
  });
  return {ok:true,message:count+' RSD(s) marcado(s) como incluído(s).',quantidade:count,rcoReportId:rcoId};
}
function syncRsdOperations_(r, reportId, batt, comp, version) {
  var ops=r.operacoes||[]; if(!Array.isArray(ops)) ops=[];
  var detailed=r.operacoesAcumuladas||[];if(!Array.isArray(detailed))detailed=[];
  var s=sheet_(P3_SHEET_ID,'OPERACOES'), pod=sheet_(P3_SHEET_ID,'POD_EXECUCAO');
  detailed.forEach(function(p){
    var id=String(p.reportId||'');
    if(id&&!findOne_(s,'REGISTRO_ID',id)){try{operationUpsert_(p)}catch(_){}}
  });
  ops.forEach(function(o){
    var id=String(o.id||o.reportId||uid_('op')),gu=(r.guarnicao||{}).nome||'',old=findOne_(s,'REGISTRO_ID',id)||{};
    var obj=Object.assign({},old,{
      REGISTRO_ID:id,DATA:old.DATA||dateText_((r.servico||{}).data),TURNO:old.TURNO||o.turno||'',BATALHAO:batt,COMPANHIA:comp,
      GUARNICAO_RESPONSAVEL:old.GUARNICAO_RESPONSAVEL||gu,OPERACAO:old.OPERACAO||o.nome||o.operacao||'',LOCAL:old.LOCAL||o.local||'',
      VTRS:old.VTRS||(r.viaturas||[]).map(function(v){return typeof v==='string'?v:(v.prefixo||'');}).filter(Boolean).join(' / '),
      PRISOES:Number(old.PRISOES||o.prisoes||0),ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_(),RSD_REPORT_ID:reportId,
      STATUS_REGISTRO:'RSD_FINALIZADO',VERSAO_ORIGEM:Number(old.VERSAO_ORIGEM||version||1)
    });
    if(!obj.REPORT_ID)obj.REPORT_ID=id;
    upsert_(s,'REGISTRO_ID',id,obj);
    var po=findOne_(pod,'REGISTRO_ID',id)||{};
    upsert_(pod,'REGISTRO_ID',id,Object.assign({},po,{
      REGISTRO_ID:id,REPORT_ID:po.REPORT_ID||id,DATA:po.DATA||dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:po.GUARNICAO||gu,
      OPERACAO:po.OPERACAO||o.nome||'',TURNO:po.TURNO||o.turno||'',STATUS_CUMPRIMENTO:o.statusCumprimento||po.STATUS_CUMPRIMENTO||'Não informado',
      LOCAL_PREVISTO:o.localPrevisto||po.LOCAL_PREVISTO||'',COORDENADAS_PREVISTAS:o.coordenadasPrevistas||po.COORDENADAS_PREVISTAS||'',
      LOCAL_EXECUTADO:o.local||po.LOCAL_EXECUTADO||'',COORDENADAS_EXECUTADAS:o.coordenadas||po.COORDENADAS_EXECUTADAS||'',
      HOUVE_ALTERACAO:['Executado em local diverso','Executado parcialmente','Não executado'].indexOf(o.statusCumprimento)>=0?'SIM':(po.HOUVE_ALTERACAO||'NÃO'),
      MOTIVO_ALTERACAO:o.motivoAlteracao||po.MOTIVO_ALTERACAO||'',ORIGEM_RELATORIO:'RSD',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_()
    }));
  });
}
function syncRsdCirvcs_(r,reportId,batt,comp,serviceId,seg){
  var list=r.cirvc||r.arvc||[];if(!Array.isArray(list)||!list.length)return;
  var u=r.unidade||{},g=r.guarnicao||{};
  var cirvcs=list.map(function(c){
    return Object.assign({},c,{rsdReportId:reportId,serviceId:serviceId,segmento:seg,
      guarnicao:c.guarnicao||g.nome||'',matriculaResponsavel:c.matriculaResponsavel||g.matricula||'',
      responsavelCirvc:c.responsavelCirvc||c.militarResponsavelAit||g.responsavel||'',
      vtr:c.vtr||c.prefixo||g.viatura||'',prefixo:c.prefixo||c.vtr||g.viatura||'',
      unidade:{batalhao:batt,companhia:comp,companhiaNumero:u.companhiaNumero||Number(String(comp||'').match(/\d+/)&&String(comp||'').match(/\d+/)[0]||1)}});
  });
  cirvcRegister_({unidade:{batalhao:batt,companhia:comp,companhiaNumero:u.companhiaNumero},cirvcs:cirvcs});
}
function syncRsdOccurrences_(r,reportId,batt,comp){
  var list=r.ocorrencias||[];if(!Array.isArray(list))return;
  var so=sheet_(P3_SHEET_ID,'OCORRENCIAS'),sp=sheet_(P3_SHEET_ID,'PRISOES'),gu=(r.guarnicao||{}).nome||'',dataServico=dateText_((r.servico||{}).data);
  list.forEach(function(o){
    var id=String(o.id||uid_('oc')),nat=o.naturezaPrincipal||o.tipificacao||o.tipo||'',rel=o.tipificacoesRelacionadas||'';
    upsert_(so,'REGISTRO_ID',id,{REGISTRO_ID:id,REPORT_ID:reportId,DATA:dateText_(o.data||dataServico),HORA:o.hora||'',BATALHAO:batt,COMPANHIA:comp,GUARNICAO:gu,
      TIPO:o.tipo||'',NUMERO_OCORRENCIA:o.numero||'',TIPIFICACAO:nat,TCO_SASP:o.tcoSasp||'',NUMERO_TCO:o.numeroTco||'',LOCAL:o.local||'',MUNICIPIO:o.municipio||'',
      LATITUDE:o.latitude||'',LONGITUDE:o.longitude||'',ORIGEM_RELATORIO:'RSD',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_(),DESCRICAO:o.descricao||'',
      NATUREZA_PRINCIPAL:nat,TIPIFICACOES_RELACIONADAS:rel,CONDUZIDOS:Number(o.conduzidos||0),PRESOS_FLAGRANTE:Number(o.presosFlagrante||0),
      MANDADOS_CUMPRIDOS:Number(o.mandadosCumpridos||0),ADOLESCENTES_APREENDIDOS:Number(o.adolescentesApreendidos||0)});
    var groups=[
      ['FLAGRANTE',Number(o.presosFlagrante||0),nat],
      ['CUMPRIMENTO_MANDADO',Number(o.mandadosCumpridos||0),nat||'Mandado de prisão'],
      ['APREENSAO_ADOLESCENTE',Number(o.adolescentesApreendidos||0),nat],
      ['CONDUCAO_SEM_PRISAO',Math.max(0,Number(o.conduzidos||0)-Number(o.presosFlagrante||0)-Number(o.mandadosCumpridos||0)-Number(o.adolescentesApreendidos||0)),nat]
    ];
    groups.forEach(function(g){
      var pid=id+'-'+g[0].toLowerCase();
      if(g[1]>0)upsert_(sp,'PRISAO_ID',pid,{PRISAO_ID:pid,OCORRENCIA_ID:id,RSD_REPORT_ID:reportId,RCO_REPORT_ID:'',DATA:dateText_(o.data||dataServico),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:gu,
        SITUACAO:g[0],TIPIFICACAO_PRINCIPAL:g[2]||'',TIPIFICACOES_RELACIONADAS:rel,QUANTIDADE:g[1],OBSERVACAO:o.descricao||'',ORIGEM_RELATORIO:'RSD',ORIGEM_REGISTRO_ID:id,REGISTRADO_EM:nowIso_()});
      else {
        var old=findOne_(sp,'PRISAO_ID',pid);if(old){old.QUANTIDADE=0;old.OBSERVACAO='INATIVADO POR RETIFICAÇÃO';old.REGISTRADO_EM=nowIso_();upsert_(sp,'PRISAO_ID',pid,old);}
      }
    });
  });
}

/* =========================
   Passagem de serviço
   ========================= */

function passagemPublicar_(payload) {
  var p=payload.passagem||payload||{}, id=p.passagemId||uid_('passagem'),rs=sheet_(P3_SHEET_ID,'RSD'),src=null;
  if(p.rsdOrigemId){src=findOne_(rs,'REPORT_ID',String(p.rsdOrigemId));if(!src||['AGUARDANDO_ANALISE','FINALIZADO','DEFERIDO','DEFERIDO_COM_RESSALVAS'].indexOf(String(src.STATUS))<0)throw new Error('Finalize o segmento do comandante que está saindo antes de disponibilizar a passagem.');if(!p.serviceId)p.serviceId=src.SERVICE_ID||'';if(!p.segmentoOrigem)p.segmentoOrigem=Number(src.SEGMENTO||1);}
  var ps=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO');ensureHeaders_(ps,['CANCELADA_EM','CANCELADA_MOTIVO','CANCELADA_POR_MATRICULA','CANCELADA_POR_NOME','RETIFICADA_EM','RETIFICADA_MOTIVO','ANULADA_EM','ANULADA_MOTIVO']);
  var u=p.unidade||{}, batt=normBattalion_(u.batalhao), comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var obj={PASSAGEM_ID:id,RSD_ORIGEM_ID:p.rsdOrigemId||'',RSD_DESTINO_ID:'',DATA_SERVICO:dateText_(p.dataServico),BATALHAO:batt,COMPANHIA:comp,
    GUARNICAO:(p.guarnicao||{}).nome||p.guarnicao||'',TURNO_ORIGEM:p.turnoOrigem||'',ENTREGUE_POR_MATRICULA:normMat_(p.entreguePorMatricula||(p.entreguePor||{}).matricula||''),
    ENTREGUE_POR_NOME:p.entreguePorNome||(p.entreguePor||{}).nome||'',DISPONIBILIZADA_EM:nowIso_(),STATUS:'AGUARDANDO_RECEBIMENTO',
    RECEBIDA_POR_MATRICULA:'',RECEBIDA_POR_NOME:'',RECEBIDA_EM:'',VTRS_JSON:JSON.stringify(p.viaturas||[]),
    ALTERACOES_VTR_JSON:JSON.stringify(p.alteracoesVtr||p.alteracoesViatura||[]),MATERIAIS_JSON:JSON.stringify(p.materiais||[]),PENDENCIAS_JSON:JSON.stringify(p.pendencias||[]),
    OBSERVACOES:p.observacoes||'',ATUALIZADO_EM:nowIso_(),SERVICE_ID:p.serviceId||'',SEGMENTO_ORIGEM:Number(p.segmentoOrigem||0)||'',SEGMENTO_DESTINO:'',RSD_ANTERIOR_ID:p.rsdOrigemId||''};
  upsert_(ps,'PASSAGEM_ID',id,obj);
  if(src){src.STATUS='PASSAGEM_DISPONIVEL';src.SINCRONIZADO_EM=nowIso_();upsert_(rs,'REPORT_ID',String(src.REPORT_ID),src);}
  return {ok:true,message:'Passagem de serviço disponibilizada. O serviço permanece aberto aguardando o próximo comandante.',passagemId:id,status:'AGUARDANDO_RECEBIMENTO'};
}
function passagensPendentes_(p) {
  var batt=p.batalhao?normBattalion_(p.batalhao):'', comp=p.companhia||'', gu=String(p.guarnicao||'').toLowerCase(), data=dateText_(p.data||''),serviceId=String(p.serviceId||'');
  return objects_(sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO')).filter(function(x){
    if(String(x.STATUS)!=='AGUARDANDO_RECEBIMENTO') return false;
    if(data && dateText_(x.DATA_SERVICO)!==data) return false;
    if(batt && String(x.BATALHAO)!==batt) return false;
    if(comp && String(x.COMPANHIA)!==String(comp)) return false;
    if(gu && String(x.GUARNICAO||'').toLowerCase()!==gu) return false;
    if(serviceId && String(x.SERVICE_ID||'')!==serviceId) return false;
    return true;
  }).sort(function(a,b){return String(b.DISPONIBILIZADA_EM||'').localeCompare(String(a.DISPONIBILIZADA_EM||''));}).map(function(x){x.VTRS=parseJson_(x.VTRS_JSON,[]);x.PENDENCIAS=parseJson_(x.PENDENCIAS_JSON,[]);return x;});
}
function passagemReceber_(payload) {
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    var id=String(payload.passagemId||''), s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'), row=findOne_(s,'PASSAGEM_ID',id);
    if(!row) throw new Error('Passagem não localizada.');
    if(String(row.STATUS)!=='AGUARDANDO_RECEBIMENTO')throw new Error('Esta passagem já foi recebida, cancelada ou encerrada.');
    if(!payload.rsdDestinoId)throw new Error('RSD de destino não informado para a passagem.');
    row.STATUS='RECEBIDA';row.RSD_DESTINO_ID=payload.rsdDestinoId||'';row.SEGMENTO_DESTINO=Number(payload.segmentoDestino||0)||'';row.RSD_ANTERIOR_ID=row.RSD_ORIGEM_ID||row.RSD_ANTERIOR_ID||'';var ator=payload.recebidoPor||{};row.RECEBIDA_POR_MATRICULA=normMat_(payload.matricula||payload.recebidaPorMatricula||ator.matricula||'');
    row.RECEBIDA_POR_NOME=payload.nome||payload.recebidaPorNome||ator.nome||'';row.RECEBIDA_EM=nowIso_();row.ATUALIZADO_EM=nowIso_();upsert_(s,'PASSAGEM_ID',id,row);
    if(row.RSD_ORIGEM_ID){var rs=sheet_(P3_SHEET_ID,'RSD'),src=findOne_(rs,'REPORT_ID',String(row.RSD_ORIGEM_ID));if(src){src.STATUS='ENCERRADO_PASSAGEM';src.SINCRONIZADO_EM=nowIso_();upsert_(rs,'REPORT_ID',String(src.REPORT_ID),src);}}
    return {ok:true,message:'Recebimento do serviço registrado.',passagemId:id,serviceId:row.SERVICE_ID||'',rsdOrigemId:row.RSD_ORIGEM_ID||'',rsdDestinoId:row.RSD_DESTINO_ID||'',segmentoDestino:row.SEGMENTO_DESTINO||''};
  } finally {lock.releaseLock();}
}


function rsdReview_(payload){
  var reportId=String(payload.reportId||''),decision=String(payload.decision||'').toUpperCase(),s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);
  if(!row)throw new Error('RSD não localizado.');
  ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM']);
  var allowed={DEFERIDO:'DEFERIDO',DEFERIDO_COM_RESSALVAS:'DEFERIDO_COM_RESSALVAS',RETIFICACAO_SOLICITADA:'RETIFICACAO_SOLICITADA',INDEFERIDO:'INDEFERIDO'};
  if(!allowed[decision])throw new Error('Decisão de análise inválida.');
  if(['CANCELADO','ENCERRADO_PASSAGEM'].indexOf(String(row.STATUS))>=0)throw new Error('Este RSD não pode ser analisado neste estado.');
  if((decision==='RETIFICACAO_SOLICITADA'||decision==='INDEFERIDO'||decision==='DEFERIDO_COM_RESSALVAS')&&!String(payload.motivo||payload.observacao||'').trim())throw new Error('Informe o motivo/observação da decisão.');
  row.STATUS=allowed[decision];row.REVIEW_STATUS=allowed[decision];row.REVIEW_MOTIVO=String(payload.motivo||'');row.REVIEW_OBSERVACAO=String(payload.observacao||'');
  row.REVIEW_AUTOR_MATRICULA=normMat_(payload.autorMatricula||'');row.REVIEW_AUTOR_NOME=String(payload.autorNome||'');row.REVIEW_EM=nowIso_();row.SINCRONIZADO_EM=nowIso_();
  upsert_(s,'REPORT_ID',reportId,row);audit_('RSD',reportId,Number(row.VERSAO||1),'ANALISE_'+decision,row.REVIEW_AUTOR_MATRICULA,row.REVIEW_AUTOR_NOME,row.BATALHAO,row.COMPANHIA,payload);
  return {ok:true,message:decision==='RETIFICACAO_SOLICITADA'?'RSD devolvido para retificação.':decision==='DEFERIDO_COM_RESSALVAS'?'RSD deferido com ressalvas.':decision==='INDEFERIDO'?'RSD indeferido.':'RSD deferido.',status:row.STATUS};
}

function rsdCancel_(payload){
  var reportId=String(payload.reportId||''),s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);if(!row)throw new Error('RSD não localizado.');
  if(String(row.STATUS)==='CANCELADO')return {ok:true,message:'RSD já se encontra cancelado.',status:'CANCELADO'};
  if(String(row.STATUS)==='PASSAGEM_DISPONIVEL')throw new Error('Há uma passagem de serviço aguardando recebimento. Cancele primeiro a passagem e, se necessário, cancele depois o registro.');
  if(String(row.STATUS)==='INCLUIDO_RCO')throw new Error('Este RSD já foi incorporado ao RCO. A correção deve seguir o fluxo de retificação pelo Coordenador/P3.');
  if(!String(payload.motivo||'').trim())throw new Error('Informe o motivo do cancelamento.');
  ensureHeaders_(s,['CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL']);
  row.STATUS='CANCELADO';row.CANCELADO_EM=nowIso_();row.CANCELADO_MOTIVO=String(payload.motivo||'');row.CANCELADO_POR_MATRICULA=normMat_(payload.autorMatricula||'');row.CANCELADO_POR_NOME=String(payload.autorNome||'');row.CANCELADO_POR_PERFIL=String(payload.perfil||'');row.EDIT_LEASE_UNTIL='';row.SINCRONIZADO_EM=nowIso_();
  upsert_(s,'REPORT_ID',reportId,row);audit_('RSD',reportId,Number(row.VERSAO||1),'CANCELADO',row.CANCELADO_POR_MATRICULA,row.CANCELADO_POR_NOME,row.BATALHAO,row.COMPANHIA,payload);
  return {ok:true,message:'Registro cancelado e preservado para auditoria.',status:'CANCELADO'};
}

function restoreRsdAfterPassage_(rs, src){
  if(!src)return;
  src.STATUS='EM_SERVICO';src.FINALIZADO_EM='';src.EDIT_LEASE_UNTIL='';src.SINCRONIZADO_EM=nowIso_();
  try{
    var p=loadJsonPayload_(src)||{};
    if(p.servico)p.servico.finalizadoEm='';
    if(Object.prototype.hasOwnProperty.call(p,'finalizadoEm'))p.finalizadoEm='';
    p.centralStatus='EM_SERVICO';
    var version=Math.max(1,Number(src.VERSAO||p.versao||1));
    var json=JSON.stringify(p),saved=saveJsonPayload_(String(src.REPORT_ID||''),version,json);
    src.PAYLOAD_JSON=saved.json;src.PAYLOAD_FILE_ID=saved.fileId;src.PAYLOAD_FILE_URL=saved.fileUrl;src.PAYLOAD_HASH=hash_(json);
  }catch(_){}
  upsert_(rs,'REPORT_ID',String(src.REPORT_ID),src);
}

function passagemCancelar_(payload){
  var id=String(payload.passagemId||''),s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),row=findOne_(s,'PASSAGEM_ID',id);if(!row)throw new Error('Passagem não localizada.');
  if(String(row.STATUS)!=='AGUARDANDO_RECEBIMENTO')throw new Error('Somente passagem ainda não recebida pode ser cancelada.');
  if(!String(payload.motivo||'').trim())throw new Error('Informe o motivo do cancelamento.');
  ensureHeaders_(s,['CANCELADA_EM','CANCELADA_MOTIVO','CANCELADA_POR_MATRICULA','CANCELADA_POR_NOME']);
  row.STATUS='CANCELADA';row.CANCELADA_EM=nowIso_();row.CANCELADA_MOTIVO=String(payload.motivo||'');row.CANCELADA_POR_MATRICULA=normMat_(payload.autorMatricula||'');row.CANCELADA_POR_NOME=String(payload.autorNome||'');row.ATUALIZADO_EM=nowIso_();upsert_(s,'PASSAGEM_ID',id,row);
  if(row.RSD_ORIGEM_ID){var rs=sheet_(P3_SHEET_ID,'RSD'),src=findOne_(rs,'REPORT_ID',String(row.RSD_ORIGEM_ID));if(src&&String(src.STATUS)==='PASSAGEM_DISPONIVEL')restoreRsdAfterPassage_(rs,src);}
  return {ok:true,message:'Passagem cancelada. O serviço voltou ao comandante atual.',status:'CANCELADA'};
}

function passagemRetificar_(payload){
  var id=String(payload.passagemId||''),s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),row=findOne_(s,'PASSAGEM_ID',id);if(!row)throw new Error('Passagem não localizada.');
  var status=String(row.STATUS||'');
  if(['AGUARDANDO_RECEBIMENTO','RECEBIDA'].indexOf(status)<0)throw new Error('Esta passagem não pode ser retificada neste estado.');
  ensureHeaders_(s,['RETIFICADA_EM','RETIFICADA_MOTIVO','RETIFICADA_POR_MATRICULA','RETIFICADA_POR_NOME']);
  if(status==='AGUARDANDO_RECEBIMENTO'){
    if(payload.viaturas)row.VTRS_JSON=JSON.stringify(payload.viaturas);
    if(payload.pendencias)row.PENDENCIAS_JSON=JSON.stringify(payload.pendencias);
  }
  if(payload.observacoes!==undefined)row.OBSERVACOES=String(payload.observacoes||'');
  row.RETIFICADA_EM=nowIso_();row.RETIFICADA_MOTIVO=String(payload.motivo||'Retificação de passagem');
  row.RETIFICADA_POR_MATRICULA=normMat_(payload.autorMatricula||'');row.RETIFICADA_POR_NOME=String(payload.autorNome||'');
  row.ATUALIZADO_EM=nowIso_();upsert_(s,'PASSAGEM_ID',id,row);
  return {ok:true,message:status==='RECEBIDA'?'Registro da passagem retificado. O recebimento permanece válido.':'Passagem retificada.',status:row.STATUS};
}

function passagemAnular_(payload){
  var id=String(payload.passagemId||''),s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),row=findOne_(s,'PASSAGEM_ID',id);if(!row)throw new Error('Passagem não localizada.');
  if(String(row.STATUS)!=='RECEBIDA')throw new Error('Esta passagem não está em situação de recebimento anulável.');
  var rs=sheet_(P3_SHEET_ID,'RSD'),dest=row.RSD_DESTINO_ID?findOne_(rs,'REPORT_ID',String(row.RSD_DESTINO_ID)):null;
  if(dest&&Number(dest.DRAFT_REVISION||0)>1)throw new Error('O novo segmento já possui movimentação. A correção deverá ser realizada pelo Coordenador/P3.');
  ensureHeaders_(s,['ANULADA_EM','ANULADA_MOTIVO']);row.STATUS='ANULADA';row.ANULADA_EM=nowIso_();row.ANULADA_MOTIVO=String(payload.motivo||'Recebimento realizado por engano');row.ATUALIZADO_EM=nowIso_();upsert_(s,'PASSAGEM_ID',id,row);
  if(dest){ensureHeaders_(rs,['CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL']);dest.STATUS='CANCELADO';dest.CANCELADO_EM=nowIso_();dest.CANCELADO_MOTIVO='Segmento cancelado por anulação de recebimento de passagem.';dest.CANCELADO_POR_MATRICULA=normMat_(payload.autorMatricula||'');dest.CANCELADO_POR_NOME=String(payload.autorNome||'');dest.CANCELADO_POR_PERFIL=String(payload.perfil||'COORDENACAO');upsert_(rs,'REPORT_ID',String(dest.REPORT_ID),dest);}
  var src=row.RSD_ORIGEM_ID?findOne_(rs,'REPORT_ID',String(row.RSD_ORIGEM_ID)):null;if(src)restoreRsdAfterPassage_(rs,src);
  return {ok:true,message:'Recebimento anulado. O serviço retornou ao segmento anterior.',status:'ANULADA'};
}

function rcoResponsavelValidar_(payload,token){
  var perfil=String(payload.perfil||'CPU').toUpperCase();assertToken_(token,perfil==='P3'||perfil==='OFICIAL'?'p3':'coord');
  var mat=normMat_(payload.matricula||'');if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Matrícula inválida.');
  var items=cadastroSearch_({tipo:'militar',q:mat}).items||[],m=null;for(var i=0;i<items.length;i++)if(normMat_(items[i].MATRICULA)===mat){m=items[i];break;}
  if(!m)throw new Error('Militar não localizado no Cadastro Mestre.');
  return {ok:true,message:'Responsável identificado e credencial validada.',perfil:perfil,militar:{matricula:mat,nome:m.NOME||'',postoGrad:m.POSTO_GRAD||'',batalhao:m.BATALHAO||'',companhia:m.COMPANHIA||''}};
}

/* =========================
   CIRVC — continuidade de custódia
   ========================= */

function cirvcRegister_(payload) {
  var list=payload.cirvcs||[], u=payload.unidade||{};
  if(!Array.isArray(list)) list=[];
  var s=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA'), count=0;
  ensureHeaders_(s,['NUMERO_TERMO','HORA_CADASTRO','SERVICE_ID','SEGMENTO','SOURCE_REPORT_ID','LOCAL_APREENSAO','MOTIVO']);
  list.forEach(function(c){
    var id=String(c.id||c.cirvcId||c.registroId||uid_('cirvc')), old=findOne_(s,'CIRVC_ID',id);
    var batt=normBattalion_((c.unidade||u).batalhao), comp=(c.unidade||u).companhia||normCompany_(batt,(c.unidade||u).companhiaNumero);
    var obj={CIRVC_ID:id,RSD_REPORT_ID:c.rsdReportId||old&&old.RSD_REPORT_ID||'',RCO_REPORT_ID:c.rcoReportId||old&&old.RCO_REPORT_ID||'',DATA_CADASTRO:dateText_(c.data||old&&old.DATA_CADASTRO||new Date()),
      BATALHAO:batt,COMPANHIA:comp,GUARNICAO:c.guarnicao||old&&old.GUARNICAO||'',PLACA:String(c.placaUf||c.placa||old&&old.PLACA||'').toUpperCase(),TIPO:c.tipo||old&&old.TIPO||'',MARCA_MODELO:c.marcaModelo||old&&old.MARCA_MODELO||'',
      PREFIXO_ORIGEM:c.prefixo||c.vtr||old&&old.PREFIXO_ORIGEM||'',CADASTRADO_POR_MATRICULA:normMat_(c.matriculaResponsavel||old&&old.CADASTRADO_POR_MATRICULA||''),CADASTRADO_POR_NOME:c.responsavelCirvc||old&&old.CADASTRADO_POR_NOME||'',
      LOCAL_CUSTODIA:c.local||c.localDestino||old&&old.LOCAL_CUSTODIA||'',STATUS_CUSTODIA:old&&old.STATUS_CUSTODIA||'AGUARDANDO_TRANSPORTE',TRANSPORTE_ID:old&&old.TRANSPORTE_ID||'',
      ATUALIZADO_EM:nowIso_(),BAIXADO_EM:old&&old.BAIXADO_EM||'',DESTINO_FINAL:old&&old.DESTINO_FINAL||'',RECEBEDOR_NOME:old&&old.RECEBEDOR_NOME||'',
      RECEBEDOR_IDENTIFICACAO:old&&old.RECEBEDOR_IDENTIFICACAO||'',NUMERO_TERMO:c.numeroTermo||old&&old.NUMERO_TERMO||'',HORA_CADASTRO:c.hora||old&&old.HORA_CADASTRO||'',
      SERVICE_ID:c.serviceId||old&&old.SERVICE_ID||'',SEGMENTO:Number(c.segmento||old&&old.SEGMENTO||0)||'',SOURCE_REPORT_ID:c.sourceReportId||old&&old.SOURCE_REPORT_ID||'',
      LOCAL_APREENSAO:c.localApreensao||old&&old.LOCAL_APREENSAO||'',MOTIVO:c.motivo||old&&old.MOTIVO||''};
    upsert_(s,'CIRVC_ID',id,obj);count++;
  });
  return {ok:true,message:count+' CIRVC(s) disponibilizado(s) para continuidade da custódia.',quantidade:count};
}
function cirvcList_(p) {
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',rid=String(p.rsdReportId||p.reportId||''),sid=String(p.serviceId||''),seg=Number(p.segmento||0)||0;
  var data=dateText_(p.data||''),gu=String(p.guarnicao||'').toLowerCase().trim();
  return objects_(sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA')).filter(function(x){
    if(rid && String(x.RSD_REPORT_ID||'')!==rid)return false;
    if(!rid && sid && String(x.SERVICE_ID||'')!==sid)return false;
    if(!rid && sid && seg && Number(x.SEGMENTO||0)!==seg)return false;
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==String(comp))return false;
    if(data&&dateText_(x.DATA_CADASTRO)!==data)return false;
    if(gu&&String(x.GUARNICAO||'').toLowerCase().trim()!==gu)return false;
    if(String(x.STATUS_CUSTODIA||'')==='CANCELADO')return false;
    return true;
  }).map(function(x){
    return {id:x.CIRVC_ID||'',sourceReportId:x.SOURCE_REPORT_ID||'',rsdReportId:x.RSD_REPORT_ID||'',rcoReportId:x.RCO_REPORT_ID||'',
      serviceId:x.SERVICE_ID||'',segmento:Number(x.SEGMENTO||0)||'',data:dateText_(x.DATA_CADASTRO),hora:x.HORA_CADASTRO||'',numeroTermo:x.NUMERO_TERMO||'',
      placa:x.PLACA||'',tipo:x.TIPO||'',marcaModelo:x.MARCA_MODELO||'',guarnicao:x.GUARNICAO||'',vtr:x.PREFIXO_ORIGEM||'',
      militarResponsavelAit:x.CADASTRADO_POR_NOME||'',matriculaResponsavel:x.CADASTRADO_POR_MATRICULA||'',local:x.LOCAL_CUSTODIA||'',
      localApreensao:x.LOCAL_APREENSAO||'',motivo:x.MOTIVO||'',statusCustodia:x.STATUS_CUSTODIA||'',transporteId:x.TRANSPORTE_ID||''};
  }).slice(-1000).reverse();
}
function cirvcPendentes_(p) {
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'';
  return objects_(sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA')).filter(function(x){
    var st=String(x.STATUS_CUSTODIA||'');
    if(st==='BAIXADO_DETRAN'||st==='CANCELADO')return false;
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==String(comp))return false;
    return true;
  });
}

function cirvcTransportList_(p) {
  var batt=p.batalhao?normBattalion_(p.batalhao):'', comp=p.companhia||'', status=String(p.status||'');
  return objects_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTES')).filter(function(x){
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==String(comp))return false;
    if(status&&String(x.STATUS)!==status)return false;
    return true;
  }).slice(-500).reverse();
}
function cirvcTransportGet_(id) {
  var tr=findOne_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTES'),'TRANSPORTE_ID',String(id||''));
  if(!tr) throw new Error('Transporte não localizado.');
  var cust=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA');
  var items=objects_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTE_ITENS')).filter(function(x){return String(x.TRANSPORTE_ID)===String(id);}).map(function(x){var v=findOne_(cust,'CIRVC_ID',x.CIRVC_ID)||{};x.TIPO=v.TIPO||'';x.MARCA_MODELO=v.MARCA_MODELO||'';x.LOCAL_CUSTODIA=v.LOCAL_CUSTODIA||'';return x;});
  tr.ITENS=items;
  return tr;
}

function cirvcTransportCreate_(payload) {
  var t=payload.transporte||payload||{}, ids=t.cirvcIds||[];
  if(!Array.isArray(ids)||!ids.length) throw new Error('Selecione ao menos um veículo.');
  var tid=t.transporteId||uid_('transporte'), now=nowIso_(), batt=normBattalion_(t.batalhao), comp=t.companhia||normCompany_(batt,t.companhiaNumero);
  var tr={TRANSPORTE_ID:tid,DATA:dateText_(t.data||new Date()),BATALHAO:batt,COMPANHIA:comp,TRANSPORTADOR_MATRICULA:normMat_(t.transportadorMatricula||''),
    TRANSPORTADOR_POSTO_GRAD:t.transportadorPostoGrad||'',TRANSPORTADOR_NOME:t.transportadorNome||'',VIATURA_ID:t.viaturaId||'',PREFIXO:t.prefixo||'',
    INICIO_EM:now,DESTINO_FINAL:t.destinoFinal||'DETRAN-PB',STATUS:'EM_TRANSPORTE',VEICULOS_QTD:ids.length,CRIADO_EM:now,ATUALIZADO_EM:now};
  upsert_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTES'),'TRANSPORTE_ID',tid,tr);
  var cust=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA'), items=sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTE_ITENS');
  ids.forEach(function(id){
    var c=findOne_(cust,'CIRVC_ID',id); if(!c) throw new Error('CIRVC não localizado: '+id);
    if(String(c.STATUS_CUSTODIA)==='BAIXADO_DETRAN') throw new Error('Veículo já baixado: '+(c.PLACA||id));
    if(String(c.STATUS_CUSTODIA)==='EM_TRANSPORTE' && String(c.TRANSPORTE_ID||'')!==tid) throw new Error('Veículo já vinculado a outro transporte: '+(c.PLACA||id));
    c.STATUS_CUSTODIA='EM_TRANSPORTE';c.TRANSPORTE_ID=tid;c.ATUALIZADO_EM=now;upsert_(cust,'CIRVC_ID',id,c);
    upsert_(items,'ITEM_ID',tid+'-'+id,{ITEM_ID:tid+'-'+id,TRANSPORTE_ID:tid,CIRVC_ID:id,PLACA:c.PLACA||'',STATUS_ITEM:'CARREGADO',SELECIONADO_EM:now,CARREGADO_EM:now});
  });
  return {ok:true,message:'Transporte iniciado com '+ids.length+' veículo(s).',transporteId:tid};
}
function cirvcTransportFinalize_(payload) {
  var t=payload.transporte||payload||{}, tid=String(t.transporteId||''), s=sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTES'), row=findOne_(s,'TRANSPORTE_ID',tid);
  if(!row) throw new Error('Transporte não localizado.');
  var sig1=saveDataUrl_(t.assinaturaTransportadorDataUrl,'assinatura-transportador-'+tid+'.png','CIRVC_SIGNATURE_FOLDER_ID','Central CIRVC - Assinaturas');
  var sig2=saveDataUrl_(t.assinaturaRecebedorDataUrl,'assinatura-recebedor-'+tid+'.png','CIRVC_SIGNATURE_FOLDER_ID','Central CIRVC - Assinaturas');
  var now=nowIso_(); row.STATUS='ENTREGUE_DETRAN';row.DESTINO_FINAL=t.destinoFinal||row.DESTINO_FINAL||'DETRAN-PB';
  row.ASSINATURA_TRANSPORTADOR_URL=sig1.fileUrl||row.ASSINATURA_TRANSPORTADOR_URL||'';row.RECEBEDOR_NOME=t.recebedorNome||'';
  row.RECEBEDOR_IDENTIFICACAO=t.recebedorIdentificacao||'';row.ASSINATURA_RECEBEDOR_URL=sig2.fileUrl||'';
  row.ENTREGUE_EM=now;row.RELATORIO_ID=t.relatorioId||('ENTREGA-'+tid);row.OBSERVACOES=t.observacoes||'';row.ATUALIZADO_EM=now;
  upsert_(s,'TRANSPORTE_ID',tid,row);
  var cust=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA'), items=objects_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTE_ITENS')).filter(function(x){return String(x.TRANSPORTE_ID)===tid;});
  items.forEach(function(it){
    var c=findOne_(cust,'CIRVC_ID',it.CIRVC_ID);if(c){c.STATUS_CUSTODIA='BAIXADO_DETRAN';c.BAIXADO_EM=now;c.DESTINO_FINAL=row.DESTINO_FINAL;c.RECEBEDOR_NOME=row.RECEBEDOR_NOME;c.RECEBEDOR_IDENTIFICACAO=row.RECEBEDOR_IDENTIFICACAO;c.ATUALIZADO_EM=now;upsert_(cust,'CIRVC_ID',c.CIRVC_ID,c);}
    it.STATUS_ITEM='ENTREGUE';it.ENTREGUE_EM=now;upsert_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTE_ITENS'),'ITEM_ID',it.ITEM_ID,it);
  });
  return {ok:true,message:'Entrega final registrada. '+items.length+' veículo(s) baixado(s) do controle da PMPB.',transporteId:tid,quantidade:items.length};
}

/* =========================
   Checklist / Motomecanização
   ========================= */

function checklistUpsert_(payload) {
  var c=payload.checklist||payload||{}, id=c.checklistId||uid_('chk'), now=nowIso_();
  var batt=normBattalion_(c.batalhao),comp=c.companhia||normCompany_(batt,c.companhiaNumero),v=c.viatura||{};
  var items=c.itens||[];if(!Array.isArray(items))items=[];
  var negatives=['NAO','DEFEITO','AVARIA','BAIXO','BAIXA','AUSENTE'];
  var alter=items.filter(function(x){return negatives.indexOf(String(x.situacao||'').toUpperCase())>=0;});
  var dt=String(c.dataHora||now),parts=dt.split('T');
  var sig=saveDataUrl_(c.assinaturaDataUrl,'assinatura-checklist-'+id+'.png','CHECKLIST_PHOTO_FOLDER_ID','Central Checklist - Fotos');
  var obj={CHECKLIST_ID:id,DATA_SERVICO:dateText_(parts[0]),HORA_INICIO:(parts[1]||'').slice(0,5),BATALHAO:batt,COMPANHIA:comp,
    VIATURA_ID:v.viaturaId||c.viaturaId||'',PREFIXO:v.prefixo||c.prefixo||'',PLACA:v.placa||c.placa||'',MARCA_MODELO:v.marcaModelo||c.marcaModelo||'',
    CONDUTOR_MATRICULA:normMat_(c.condutorMatricula||''),CONDUTOR_NOME:c.condutorNome||'',TURNO:c.turno||'',LOCAL_INSPECAO:c.local||'',
    KM_INICIAL:c.km||'',STATUS_GERAL:alter.length?'COM_ALTERACAO':'SEM_ALTERACAO',QTD_ALTERACOES:alter.length,CRIADO_EM:c.criadoEm||now,
    FINALIZADO_EM:now,VERSAO:c.versao||1,ORIGEM:'CENTRAL_RELATORIOS',ASSINATURA_URL:sig.fileUrl||'',OBSERVACOES:c.observacoes||''};
  upsert_(sheet_(CHECKLIST_SHEET_ID,'CHECKLISTS'),'CHECKLIST_ID',id,obj);
  deleteWhere_(sheet_(CHECKLIST_SHEET_ID,'CHECKLIST_ITENS'),'CHECKLIST_ID',id);
  var si=sheet_(CHECKLIST_SHEET_ID,'CHECKLIST_ITENS'), sa=sheet_(CHECKLIST_SHEET_ID,'ALTERACOES');
  items.forEach(function(it){
    var iid=it.itemId||uid_('item'), irregular=negatives.indexOf(String(it.situacao||'').toUpperCase())>=0, altId='';
    if(irregular){
      altId=it.pendenciaId||('alt-'+id+'-'+String(iid).replace(/[^A-Za-z0-9_-]/g,'-'));
      var old=findOne_(sa,'ALTERACAO_ID',altId);
      upsert_(sa,'ALTERACAO_ID',altId,{ALTERACAO_ID:altId,CHECKLIST_ID:id,VIATURA_ID:obj.VIATURA_ID,PREFIXO:obj.PREFIXO,DATA_CONSTACAO:obj.DATA_SERVICO,
        BATALHAO:batt,COMPANHIA:comp,ITEM_CODIGO:iid,ITEM_NOME:it.item||'',DESCRICAO:it.descricao||'',STATUS:old&&old.STATUS||'ABERTA',
        PRIORIDADE:it.prioridade||old&&old.PRIORIDADE||'NORMAL',RESPONSAVEL_MATRICULA:old&&old.RESPONSAVEL_MATRICULA||'',RESPONSAVEL_NOME:old&&old.RESPONSAVEL_NOME||'',
        ABERTO_EM:old&&old.ABERTO_EM||now,EM_ANALISE_EM:old&&old.EM_ANALISE_EM||'',EM_MANUTENCAO_EM:old&&old.EM_MANUTENCAO_EM||'',RESOLVIDO_EM:old&&old.RESOLVIDO_EM||'',
        SOLUCAO:old&&old.SOLUCAO||'',FOTO_INICIAL_URL:old&&old.FOTO_INICIAL_URL||'',FOTO_FINAL_URL:old&&old.FOTO_FINAL_URL||'',ATUALIZADO_EM:now});
    }
    append_(si,{ITEM_ID:iid+'-'+id,CHECKLIST_ID:id,SECAO:it.grupo||'',ITEM_CODIGO:iid,ITEM_NOME:it.item||'',RESPOSTA:it.situacao||'',DETALHE:it.descricao||'',ALTERACAO_GERADA:irregular?'SIM':'NÃO',REGISTRADO_EM:now});
    (it.fotos||[]).forEach(function(f){var ph=saveChecklistPhoto_(id,altId,obj.VIATURA_ID,obj.PREFIXO,f,'ALTERACAO');if(ph.fileUrl&&altId){var ar=findOne_(sa,'ALTERACAO_ID',altId);if(ar&&!ar.FOTO_INICIAL_URL){ar.FOTO_INICIAL_URL=ph.fileUrl;ar.ATUALIZADO_EM=nowIso_();upsert_(sa,'ALTERACAO_ID',altId,ar);}}});
  });
  (c.fotos||[]).forEach(function(f){saveChecklistPhoto_(id,'',obj.VIATURA_ID,obj.PREFIXO,f,'CHECKLIST_GERAL');});
  return {ok:true,message:'Checklist registrado no banco exclusivo da Motomecanização.',checklistId:id,alteracoes:alter.length};
}
function saveChecklistPhoto_(checklistId,alteracaoId,viaturaId,prefixo,f,tipo) {
  var data=typeof f==='string'?f:(f.dataUrl||''),name='checklist-'+checklistId+'-'+uid_('foto')+'.jpg';
  var x=saveDataUrl_(data,name,'CHECKLIST_PHOTO_FOLDER_ID','Central Checklist - Fotos');
  append_(sheet_(CHECKLIST_SHEET_ID,'FOTOS'),{FOTO_ID:uid_('foto'),CHECKLIST_ID:checklistId,ALTERACAO_ID:alteracaoId||'',VIATURA_ID:viaturaId||'',PREFIXO:prefixo||'',
    TIPO:tipo||'ALTERACAO',URL:x.fileUrl,DRIVE_FILE_ID:x.fileId,MIME_TYPE:x.mimeType||'',TAMANHO_BYTES:x.size||(f||{}).tamanhoBytes||'',
    LARGURA:(f||{}).largura||'',ALTURA:(f||{}).altura||'',CRIADO_EM:nowIso_()});
  return x;
}
function checklistList_(p) {
  var list=objects_(sheet_(CHECKLIST_SHEET_ID,'CHECKLISTS'));
  return {ok:true,items:filterCommon_(list,p).slice(-500).reverse()};
}
function motomecanizacaoList_(p) {
  var pend=filterCommon_(objects_(sheet_(CHECKLIST_SHEET_ID,'ALTERACOES')),p);
  if(p.status) pend=pend.filter(function(x){return String(x.STATUS)===String(p.status);});
  return {ok:true,pendencias:pend.slice(-1000).reverse(),viaturas:objects_(sheet_(CHECKLIST_SHEET_ID,'VIATURAS')).slice(0,3000)};
}
function motomecanizacaoUpdate_(payload) {
  var id=String(payload.pendenciaId||payload.alteracaoId||''), s=sheet_(CHECKLIST_SHEET_ID,'ALTERACOES'), row=findOne_(s,'ALTERACAO_ID',id);
  if(!row) throw new Error('Alteração não localizada.');
  var old=String(row.STATUS||''), novo=String(payload.status||old), now=nowIso_();
  row.STATUS=novo;row.RESPONSAVEL_MATRICULA=normMat_(payload.responsavelMatricula||row.RESPONSAVEL_MATRICULA||'');row.RESPONSAVEL_NOME=payload.responsavelNome||row.RESPONSAVEL_NOME||'';
  if(novo==='EM_ANALISE'&&!row.EM_ANALISE_EM)row.EM_ANALISE_EM=now;
  if(novo==='EM_MANUTENCAO'&&!row.EM_MANUTENCAO_EM)row.EM_MANUTENCAO_EM=now;
  if(novo==='SOLUCIONADA'){row.RESOLVIDO_EM=now;row.SOLUCAO=payload.observacao||'';}
  row.ATUALIZADO_EM=now;
  if(payload.fotoSolucao){
    var ph=saveChecklistPhoto_(row.CHECKLIST_ID,id,row.VIATURA_ID,row.PREFIXO,payload.fotoSolucao,'SOLUCAO');
    if(ph.fileUrl)row.FOTO_FINAL_URL=ph.fileUrl;
  }
  upsert_(s,'ALTERACAO_ID',id,row);
  append_(sheet_(CHECKLIST_SHEET_ID,'MOTOMECANIZACAO'),{MOVIMENTO_ID:uid_('mov'),ALTERACAO_ID:id,VIATURA_ID:row.VIATURA_ID,PREFIXO:row.PREFIXO,DATA_HORA:now,
    STATUS_ANTERIOR:old,STATUS_NOVO:novo,RESPONSAVEL_MATRICULA:row.RESPONSAVEL_MATRICULA,RESPONSAVEL_NOME:row.RESPONSAVEL_NOME,OBSERVACAO:payload.observacao||'',FOTO_URL:row.FOTO_FINAL_URL||''});
  return {ok:true,message:'Alteração atualizada.',pendencia:row};
}

/* =========================
   Gestão P3 / consultas
   ========================= */

function filterCommon_(list,p) {
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',di=dateText_(p.dataInicio||p.inicio||''),df=dateText_(p.dataFim||p.fim||''),turno=String(p.turno||'').toLowerCase(),gu=String(p.guarnicao||'').toLowerCase();
  return list.filter(function(x){
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==String(comp))return false;
    var d=dateText_(x.DATA_SERVICO||x.DATA||x.DATA_HORA||x.ABERTA_EM||'');
    if(di&&d&&d<di)return false;if(df&&d&&d>df)return false;
    var xt=String(x.TURNO||x.HORARIO_SERVICO||'').toLowerCase(),xg=String(x.GUARNICAO||x.GUARNICAO_RESPONSAVEL||'').toLowerCase();
    if(turno&&xt&&xt!==turno)return false;if(turno&&!xt)return false;
    if(gu&&xg.indexOf(gu)<0)return false;
    return true;
  });
}
function p3Config_(){
  var rows=objects_(sheet_(P3_SHEET_ID,'CONFIG')),out={};
  rows.forEach(function(x){if(['POWERBI_URL','AMBIENTE','BACKEND_V10_STATUS'].indexOf(String(x.CHAVE))>=0)out[String(x.CHAVE)]=x.VALOR||'';});
  return {ok:true,config:out};
}
function p3ConfigSet_(payload){
  var key=String(payload.chave||payload.key||'');if(['POWERBI_URL'].indexOf(key)<0)throw new Error('Configuração não autorizada.');
  var s=sheet_(P3_SHEET_ID,'CONFIG'),row=findOne_(s,'CHAVE',key)||{CHAVE:key,DESCRICAO:'Configuração da Gestão P3',EDITAVEL_P3:'SIM'};
  row.VALOR=String(payload.valor||payload.value||'').trim();upsert_(s,'CHAVE',key,row);
  return {ok:true,message:'Configuração atualizada.',chave:key,valor:row.VALOR};
}

function p3Analysis_(p) {
  var list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'PRODUCAO')),p), indicator=String(p.indicador||'');
  var indicators={},byCompany={},byDate={},total=0;
  list.forEach(function(x){
    var name=String(x.INDICADOR_NOME||x.INDICADOR_CHAVE||'');if(name)indicators[name]=1;
    if(indicator && name!==indicator && String(x.INDICADOR_CHAVE||'')!==indicator)return;
    var q=Number(x.QUANTIDADE||0),co=String(x.COMPANHIA||'Não informada'),d=dateText_(x.DATA_SERVICO||x.DATA||'');
    total+=q;byCompany[co]=(byCompany[co]||0)+q;if(d)byDate[d]=(byDate[d]||0)+q;
  });
  return {ok:true,indicadores:Object.keys(indicators).sort(),indicador:indicator,total:total,
    porCompanhia:Object.keys(byCompany).sort().map(function(k){return {nome:k,valor:byCompany[k]};}),
    porData:Object.keys(byDate).sort().map(function(k){return {data:k,valor:byDate[k]};})};
}

function p3Query_(p) {
  var view=String(p.view||'controle-diario'), list;
  if(view==='controle-diario'){
    var rsd=filterCommon_(objects_(sheet_(P3_SHEET_ID,'RSD')),p),rco=filterCommon_(objects_(sheet_(P3_SHEET_ID,'RCO')),p);
    return {ok:true,rsd:rsd.slice(-1000).reverse(),rco:rco.slice(-500).reverse()};
  }
  if(view==='produtividade'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'PRODUCAO')),p);}
  else if(view==='historico'){
    var allProd=filterCommon_(objects_(sheet_(P3_SHEET_ID,'PRODUCAO')),p);
    var hist=allProd.filter(function(x){
      var o=String(x.ORIGEM_RELATORIO||x.ORIGEM||'').toLowerCase();
      return /histor|importa|legado|migr/.test(o);
    });
    return {ok:true,items:hist.slice(-5000).reverse(),totalHistorico:hist.length,totalDigital:allProd.length-hist.length};
  }
  else if(view==='rco'){
    list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'RCO')),p);
  }
  else if(view==='rco-origens'){
    list=objects_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'));
    if(p.rcoReportId)list=list.filter(function(x){return String(x.RCO_REPORT_ID||'')===String(p.rcoReportId)});
  }
  else if(view==='operacoes'){var pods=objects_(sheet_(P3_SHEET_ID,'POD_EXECUCAO')),pm={};pods.forEach(function(x){pm[String(x.REGISTRO_ID||'')]=x});list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'OPERACOES')),p).map(function(x){var d=pm[String(x.REGISTRO_ID||'')]||{};x.POD_STATUS=d.STATUS_CUMPRIMENTO||'';x.LOCAL_PREVISTO=d.LOCAL_PREVISTO||'';x.COORDENADAS_PREVISTAS=d.COORDENADAS_PREVISTAS||'';x.LOCAL_EXECUTADO=d.LOCAL_EXECUTADO||x.LOCAL||'';x.COORDENADAS_EXECUTADAS=d.COORDENADAS_EXECUTADAS||[x.LATITUDE,x.LONGITUDE].filter(Boolean).join(', ');return x});}
  else if(view==='pod'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'POD_EXECUCAO')),p);}
  else if(view==='ocorrencias'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'OCORRENCIAS')),p);}
  else if(view==='prisoes'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'PRISOES')),p);}
  else if(view==='cirvc'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA')),p);}
  else if(view==='auditoria'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES')),p);}
  else if(view==='viaturas'){list=objects_(sheet_(P3_SHEET_ID,'VIATURAS'));}
  else if(view==='militares'){list=objects_(sheet_(P3_SHEET_ID,'MILITARES'));}
  else throw new Error('Visão P3 desconhecida.');
  return {ok:true,items:list.slice(-2000).reverse()};
}

/* =========================
   RCO — rascunho em nuvem
   ========================= */
function rcoDraftUpsert_(payload){
  var r=payload.rco||payload||{},reportId=String((r.state||{}).reportId||r.reportId||''),deviceId=String(payload.deviceId||'');if(!reportId)throw new Error('RCO sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),old=findOne_(s,'RCO_REPORT_ID',reportId),createLock=null;
  if(!old){createLock=LockService.getScriptLock();createLock.waitLock(15000);old=findOne_(s,'RCO_REPORT_ID',reportId);}
  try{
  var u=r.unidade||{},batt=normBattalion_(u.batalhao),comp=u.companhia||normCompany_(batt,u.companhiaNumero),data=dateText_((r.periodo||{}).inicio||r.data||'');

  // Um único RCO em andamento por unidade/data. Impede que "Início do serviço"
  // em outro aparelho crie um documento concorrente em vez de continuar o existente.
  if(!old&&data){
    var existing=objects_(s).filter(function(x){
      return String(x.STATUS)==='EM_ANDAMENTO' &&
        dateText_(x.DATA_SERVICO)===data &&
        String(x.BATALHAO||'')===String(batt) &&
        String(x.COMPANHIA||'')===String(comp) &&
        String(x.RCO_REPORT_ID||'')!==reportId;
    }).sort(function(a,b){return String(b.ULTIMO_SYNC_EM||b.ATUALIZADO_EM||'').localeCompare(String(a.ULTIMO_SYNC_EM||a.ATUALIZADO_EM||''));})[0]||null;
    if(existing)throw new Error('Já existe RCO em andamento para esta unidade e data. Use Continuar serviço para carregar o relatório existente.');
  }

  if(old&&['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(old.STATUS||''))<0)throw new Error('Este RCO já foi finalizado. Para alterar dados consolidados, o P3 deve reabrir formalmente o RCO para retificação.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var draftStatus=old&&String(old.STATUS)==='EM_RETIFICACAO'?'EM_RETIFICACAO':'EM_ANDAMENTO';
  var rev=old?Number(old.REVISAO||0)+1:1,json=JSON.stringify(r),saved=saveJsonPayload_(reportId,'draft-'+rev,json,'RCO_DRAFT_FOLDER_ID','Central RCO - Rascunhos',old&&old.PAYLOAD_FILE_ID||'');
  var cons=r.consolidacaoResponsavel||{},cpus=r.cpu||[],slot=Number((r.auditoria||{}).activeSlot||1)||1,cpu=cpus[Math.max(0,slot-1)]||cpus[0]||{};
  var obj={RCO_REPORT_ID:reportId,DATA_SERVICO:data,BATALHAO:batt,COMPANHIA:comp,STATUS:draftStatus,
    RESPONSAVEL_MATRICULA:normMat_(cons.matricula||cpu.matricula||''),RESPONSAVEL_NOME:cons.nome||cpu.nome||'',REVISAO:rev,ULTIMO_SYNC_EM:nowIso_(),
    EDIT_DEVICE_ID:deviceId||old&&old.EDIT_DEVICE_ID||'',EDIT_LEASE_UNTIL:deviceId?isoAfterMinutes_(3):(old&&old.EDIT_LEASE_UNTIL||''),
    PAYLOAD_JSON:saved.json,PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json),ATUALIZADO_EM:nowIso_(),ORIGEM:'RCO_WEB'};
  upsert_(s,'RCO_REPORT_ID',reportId,obj);return {ok:true,message:'RCO sincronizado na nuvem.',reportId:reportId,revision:rev};
  }finally{if(createLock)createLock.releaseLock();}
}
function rcoDraftList_(p){
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||'');
  return objects_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS')).filter(function(x){
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS))<0)return false;
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==String(comp))return false;
    if(data&&dateText_(x.DATA_SERVICO)!==data)return false;
    return true;
  }).map(function(x){
    var pld={};try{pld=loadJsonPayload_(x)||{};}catch(_){}
    var a=pld.auditoria||{},passes=Array.isArray(a.passagens)?a.passagens:[],last=passes.length?passes[passes.length-1]:null,slot=Number(a.activeSlot||1)||1;
    var passStatus=last?String(last.status||'AGUARDANDO_RECEBIMENTO'):'',passSlot=last?Number(last.slot||0)||0:0;
    var pending=!!(last&&passStatus==='AGUARDANDO_RECEBIMENTO'&&slot<=passSlot);
    return {reportId:x.RCO_REPORT_ID,data:x.DATA_SERVICO,batalhao:x.BATALHAO,companhia:x.COMPANHIA,status:String(x.STATUS||''),responsavel:x.RESPONSAVEL_NOME,matricula:x.RESPONSAVEL_MATRICULA,revision:Number(x.REVISAO||0),ultimoSyncEm:x.ULTIMO_SYNC_EM,editDeviceId:x.EDIT_DEVICE_ID||'',editLeaseUntil:x.EDIT_LEASE_UNTIL||'',
      retificacaoMotivo:x.RETIFICACAO_MOTIVO||'',retificacaoAbertaEm:x.RETIFICACAO_ABERTA_EM||'',retificacaoAbertaPor:x.RETIFICACAO_ABERTA_POR||'',
      passagemPendente:pending,passagemId:last&&last.id||'',passagemDe:last&&last.de||'',passagemEm:last&&last.em||'',passagemObservacao:last&&last.observacao||''};
  }).sort(function(a,b){return String(b.ultimoSyncEm||'').localeCompare(String(a.ultimoSyncEm||''));});
}
function rcoDraftGet_(reportId){var row=findOne_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),'RCO_REPORT_ID',String(reportId||''));if(!row)throw new Error('RCO em andamento não localizado.');var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('Rascunho do RCO indisponível.');return p;}
function rcoDraftClaim_(payload){
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    var reportId=String(payload.reportId||''),deviceId=String(payload.deviceId||'');if(!reportId||!deviceId)throw new Error('Identificação de continuidade do RCO incompleta.');
    var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',reportId);if(!row||['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(row.STATUS))<0)throw new Error('RCO em andamento/retificação não localizado.');
    assertLease_(row,deviceId,!!payload.forceTakeover);row.EDIT_DEVICE_ID=deviceId;row.EDIT_LEASE_UNTIL=isoAfterMinutes_(3);row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',reportId,row);
    return {ok:true,message:String(row.STATUS)==='EM_RETIFICACAO'?'RCO em retificação assumido neste aparelho.':'RCO assumido neste aparelho.',rco:rcoDraftGet_(reportId),revision:Number(row.REVISAO||0),status:String(row.STATUS||''),retificacaoMotivo:row.RETIFICACAO_MOTIVO||'',retificacaoAbertaEm:row.RETIFICACAO_ABERTA_EM||'',retificacaoAbertaPor:row.RETIFICACAO_ABERTA_POR||''};
  }finally{lock.releaseLock();}
}
function rcoRetificationOpen_(payload){
  var reportId=String(payload.reportId||''),motivo=String(payload.motivo||'').trim(),autor=String(payload.autor||payload.autorNome||'').trim();
  if(!reportId)throw new Error('Informe o REPORT_ID do RCO.');
  if(!motivo)throw new Error('Informe o motivo da retificação.');
  if(!autor)throw new Error('Identifique o P3/oficial que autoriza a retificação.');
  var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');
  ensureHeaders_(s,['RETIFICACAO_MOTIVO','RETIFICACAO_ABERTA_EM','RETIFICACAO_ABERTA_POR']);
  var row=findOne_(s,'RCO_REPORT_ID',reportId);if(!row)throw new Error('Rascunho original do RCO não localizado.');
  if(String(row.STATUS)==='EM_RETIFICACAO')return {ok:true,message:'Este RCO já está aberto para retificação.',reportId:reportId,status:'EM_RETIFICACAO'};
  if(String(row.STATUS)!=='FINALIZADO')throw new Error('O RCO só pode ser reaberto para retificação após a consolidação/finalização.');
  row.STATUS='EM_RETIFICACAO';row.RETIFICACAO_MOTIVO=motivo;row.RETIFICACAO_ABERTA_EM=nowIso_();row.RETIFICACAO_ABERTA_POR=autor;
  row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',reportId,row);
  audit_('RCO',reportId,Number(row.REVISAO||1),'RETIFICACAO_ABERTA','',row.RETIFICACAO_ABERTA_POR,row.BATALHAO,row.COMPANHIA,{motivo:motivo});
  return {ok:true,message:'RCO reaberto para retificação. O responsável poderá carregá-lo em “Continuar serviço”.',reportId:reportId,status:'EM_RETIFICACAO'};
}

function closeRcoDraft_(reportId){var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',String(reportId||''));if(row){row.STATUS='FINALIZADO';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',String(reportId),row);}}

/* O backend estatístico principal já recebe o pacote completo do RCO.
   Esta ação complementar preserva origens, auditoria e garante que cada
   operação continue individualizada após a consolidação. */
function rcoSupplementalUpsert_(payload) {
  var pkg=payload.rco||payload||{}, rco=pkg.rco||pkg, stat=pkg.estatisticaP3||rco.estatisticaP3||{};
  var reportId=String((rco||{}).reportId||(rco.state||{}).reportId||pkg.reportId||stat.reportId||'');
  if(!reportId) throw new Error('RCO sem REPORT_ID.');
  var old=findOne_(sheet_(P3_SHEET_ID,'RCO'),'REPORT_ID',reportId);
  var u=pkg.unidade||rco.unidade||{}, batt=normBattalion_(u.batalhao||pkg.batalhao),comp=u.companhia||pkg.companhia||normCompany_(batt,u.companhiaNumero);
  var cons=rco.consolidacaoResponsavel||{},periodo=rco.periodo||{};
  var obj={REPORT_ID:reportId,DATA_SERVICO:dateText_(periodo.inicio||rco.data||''),BATALHAO:batt,COMPANHIA:comp,
    INICIO:periodo.inicio||'',TERMINO:periodo.termino||periodo.fim||'',HORARIO_SERVICO:periodo.horario||rco.horarioServico||'',SCHEMA_VERSION:pkg.schemaVersion||rco.schemaVersion||2,
    GERADO_EM:rco.generatedAt||'',ENVIADO_EM:nowIso_(),RETIFICADO_EM:old?nowIso_():'',STATUS:'ATIVO',
    QUANTIDADE_GUARNICOES:(rco.rcoOrigens||[]).length||'',OBSERVACOES:rco.observacoes||'',ORIGEM:'RCO',
    MODO_CONSOLIDACAO:rco.semGuarnicaoCpu?'SEM_CPU':'CPU',CONSOLIDADOR_MATRICULA:normMat_(cons.matricula||''),CONSOLIDADOR_POSTO_GRAD:cons.postoGrad||'',
    CONSOLIDADOR_NOME:cons.nome||'',CONSOLIDADOR_TURNO:cons.turno||''};
  upsert_(sheet_(P3_SHEET_ID,'RCO'),'REPORT_ID',reportId,obj);

  var prodSheet=sheet_(P3_SHEET_ID,'PRODUCAO'),prodRows=stat.producao||pkg.producao||[];
  if(Array.isArray(prodRows)&&prodRows.length){
    deleteWhere_(prodSheet,'REPORT_ID',reportId);
    prodRows.forEach(function(x){
      var rid=String(x.registroId||x.REGISTRO_ID||uid_('prod'));
      append_(prodSheet,{
        REGISTRO_ID:rid,REPORT_ID:reportId,DATA_SERVICO:dateText_(x.dataServico||x.DATA_SERVICO||obj.DATA_SERVICO),
        BATALHAO:batt,COMPANHIA:comp,GUARNICAO:x.guarnicao||x.GUARNICAO||'',
        GRUPO_CODIGO:x.grupoCodigo||x.GRUPO_CODIGO||'',GRUPO_NOME:x.grupoNome||x.GRUPO_NOME||'',
        INDICADOR_CODIGO:x.indicadorCodigo||x.INDICADOR_CODIGO||'',INDICADOR_NOME:x.indicadorNome||x.INDICADOR_NOME||'',
        QUANTIDADE:Number(x.quantidade!=null?x.quantidade:(x.QUANTIDADE||0)),
        ORIGEM_RELATORIO:x.origemRelatorio||x.ORIGEM_RELATORIO||'RCO',
        ORIGEM_REGISTRO_ID:x.origemRegistroId||x.ORIGEM_REGISTRO_ID||'',ENVIADO_EM:nowIso_()
      });
    });
  }

  deleteWhere_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'),'RCO_REPORT_ID',reportId);
  (rco.rcoOrigens||[]).forEach(function(o){append_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'),{REGISTRO_ID:uid_('orig'),RCO_REPORT_ID:reportId,RSD_REPORT_ID:o.rsdReportId||'',
    GUARNICAO:o.guarnicao||'',VERSAO_RSD:o.versao||'',STATUS_ORIGEM:o.status||'INCLUIDO',ADICIONADO_EM:o.adicionadoEm||nowIso_(),ATUALIZADO_EM:nowIso_(),CONSOLIDADOR_MATRICULA:obj.CONSOLIDADOR_MATRICULA});});
  var originIds=(rco.rcoOrigens||[]).map(function(o){return String(o.rsdReportId||'')}).filter(Boolean);
  if(originIds.length){
    var ps=sheet_(P3_SHEET_ID,'PRISOES'),plist=objects_(ps);
    plist.forEach(function(pr){if(originIds.indexOf(String(pr.RSD_REPORT_ID||''))>=0){pr.RCO_REPORT_ID=reportId;upsert_(ps,'PRISAO_ID',pr.PRISAO_ID,pr)}});
    var cs=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA'),clist=objects_(cs);
    clist.forEach(function(cv){if(originIds.indexOf(String(cv.RSD_REPORT_ID||''))>=0){cv.RCO_REPORT_ID=reportId;cv.ATUALIZADO_EM=nowIso_();upsert_(cs,'CIRVC_ID',cv.CIRVC_ID,cv)}});
  }
  var ops=pkg.operacoesCompletas||rco.operacoes||[];
  ops.forEach(function(o){var id=String(o.reportId||o.id||uid_('op'));var row=findOne_(sheet_(P3_SHEET_ID,'OPERACOES'),'REGISTRO_ID',id)||{};
    row.REGISTRO_ID=id;row.REPORT_ID=reportId;row.RCO_REPORT_ID=reportId;row.RSD_REPORT_ID=row.RSD_REPORT_ID||o.rsdReportId||'';row.DATA=row.DATA||dateText_(obj.DATA_SERVICO);
    row.BATALHAO=batt;row.COMPANHIA=comp;row.GUARNICAO_RESPONSAVEL=row.GUARNICAO_RESPONSAVEL||o.guarnicao||'';row.OPERACAO=row.OPERACAO||((o.operacao||{}).nome)||o.nome||'';
    row.TURNO=row.TURNO||((o.operacao||{}).turno)||o.turno||'';row.LOCAL=row.LOCAL||((o.local||{}).descricao)||o.local||'';row.LATITUDE=row.LATITUDE||((o.local||{}).latitude)||'';
    row.LONGITUDE=row.LONGITUDE||((o.local||{}).longitude)||'';row.STATUS_REGISTRO='CONSOLIDADO';row.VERSAO_ORIGEM=Number(row.VERSAO_ORIGEM||1);row.ENVIADO_EM=nowIso_();
    upsert_(sheet_(P3_SHEET_ID,'OPERACOES'),'REGISTRO_ID',id,row);
  });
  audit_('RCO',reportId,old?2:1,old?'RETIFICADO':'CONSOLIDADO',obj.CONSOLIDADOR_MATRICULA,obj.CONSOLIDADOR_NOME,batt,comp,pkg);
  closeRcoDraft_(reportId);
  return {ok:true,message:old?'RCO retificado; origens e operações atualizadas.':'RCO consolidado; origens e operações registradas.',reportId:reportId};
}
function audit_(tipo,id,versao,acao,mat,nome,batt,comp,snapshot) {
  append_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES'),{AUDITORIA_ID:uid_('audit'),TIPO_ENTIDADE:tipo,ENTIDADE_ID:id,VERSAO:versao,DATA_HORA:nowIso_(),ACAO:acao,
    RESPONSAVEL_MATRICULA:normMat_(mat||''),RESPONSAVEL_NOME:nome||'',BATALHAO:batt||'',COMPANHIA:comp||'',SNAPSHOT_JSON:JSON.stringify(snapshot||{}).slice(0,45000),
    HASH:hash_(JSON.stringify(snapshot||{})),ORIGEM:'CENTRAL_V10'});
}
