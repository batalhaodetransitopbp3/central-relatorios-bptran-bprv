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
 *      O Controle Geral usa senha exclusiva validada por hash SHA-256 no backend.
 * 4. Implantar > Aplicativo da Web > Executar como proprietário > acesso conforme política institucional.
 * 5. Substitua CENTRAL_CLOUD_ENDPOINT, no front-end, pela URL /exec da implantação.
 *
 * O banco P3 e o banco do Checklist ficam separados por decisão de arquitetura.
 */

var CENTRAL_V10_VERSION = '10.7.0';
var MASTER_ADMIN_PASSWORD_SHA256 = 'd291d40f83f21c0cbaba275b44c8d70fad57bdb5f72894d012f19c4bc952ffaf';
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
      assertToken_(p.token, 'rco');
      out = cadastroSearch_(p);
    } else if (action === 'guarnicao-next') {
      assertToken_(p.token, 'central');
      out = guarnicaoNext_(p);
    } else if (action === 'rsd-list') {
      assertToken_(p.token, 'rco');
      out = {ok:true, items:rsdList_(p)};
    } else if (action === 'rsd-active') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:rsdActive_(p)};
    } else if (action === 'rsd-get') {
      assertToken_(p.token, 'rco');
      out = {ok:true, rsd:rsdGet_(p.reportId)};
    } else if (action === 'passagens-pendentes') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:passagensPendentes_(p)};
    } else if (action === 'operation-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:operationList_(p)};
    } else if (action === 'rco-draft-list') {
      assertToken_(p.token, 'rco');
      out = {ok:true, items:rcoDraftList_(p)};
    } else if (action === 'rco-draft-get') {
      assertToken_(p.token, 'rco');
      out = {ok:true, rco:rcoDraftGet_(p.reportId)};
    } else if (action === 'reboque-list') {
      assertToken_(p.token, 'rco');
      out = {ok:true, items:reboqueList_(p)};
    } else if (action === 'reboque-get') {
      assertToken_(p.token, 'rco');
      out = {ok:true, reboque:reboqueGet_(p.reportId)};
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
    } else if (action === 'p3-analysis-compare') {
      assertToken_(p.token, 'p3');
      out = p3AnalysisCompare_(p);
    } else if (action === 'p3-config') {
      assertToken_(p.token, 'p3');
      out = p3Config_();
    } else if (action === 'motomecanizacao-list') {
      assertToken_(p.token, 'p3');
      out = motomecanizacaoList_(p);
    } else if (action === 'checklist-list') {
      assertToken_(p.token, 'p3');
      out = checklistList_(p);
    } else if (action === 'master-overview') {
      assertToken_(p.token, 'master-session');
      out = masterOverview_(p);
    } else if (action === 'master-cadastros') {
      assertToken_(p.token, 'master-session');
      out = cadastroSearch_(p);
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
    } else if (action === 'rsd-militar-validar') {
      assertToken_(token, 'central');
      out = rsdMilitarValidar_(payload);
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
      assertToken_(token, 'rco');
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
    } else if (action === 'reboque-draft-upsert') {
      assertToken_(token, 'central');
      out = reboqueUpsert_(payload, false);
    } else if (action === 'reboque-finalize') {
      assertToken_(token, 'central');
      out = reboqueUpsert_(payload, true);
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
      assertToken_(token, 'rco');
      out = rcoDraftUpsert_(payload);
    } else if (action === 'rco-draft-claim') {
      assertToken_(token, 'rco');
      out = rcoDraftClaim_(payload);
    } else if (action === 'rco-retification-open') {
      assertToken_(token, 'p3');
      out = rcoRetificationOpen_(payload);
    } else if (action === 'rco-upsert') {
      assertToken_(token, 'p3');
      out = rcoSupplementalUpsert_(payload);
    } else if (action === 'master-login') {
      assertToken_(token, 'master-session');
      out = masterLogin_();
    } else if (action === 'master-logout') {
      assertToken_(token, 'master-session');
      out = masterLogout_(token);
    } else if (action === 'master-rsd-create') {
      assertToken_(token, 'master-session');
      out = masterRsdCreate_(payload);
    } else if (action === 'master-rsd-unlock') {
      assertToken_(token, 'master-session');
      out = masterRsdUnlock_(payload);
    } else if (action === 'master-rsd-cancel') {
      assertToken_(token, 'master-session');
      out = masterRsdCancel_(payload);
    } else if (action === 'master-rsd-reassign') {
      assertToken_(token, 'master-session');
      out = masterRsdReassign_(payload);
    } else if (action === 'master-rco-unlock') {
      assertToken_(token, 'master-session');
      out = masterRcoUnlock_(payload);
    } else if (action === 'master-rco-cancel') {
      assertToken_(token, 'master-session');
      out = masterRcoCancel_(payload);
    } else if (action === 'master-rco-reassign') {
      assertToken_(token, 'master-session');
      out = masterRcoReassign_(payload);
    } else if (action === 'master-passagem-cancel') {
      assertToken_(token, 'master-session');
      out = masterPassagemCancel_(payload);
    } else if (action === 'master-passagem-anular') {
      assertToken_(token, 'master-session');
      out = masterPassagemAnular_(payload);
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
  if (kind === 'master-session') {
    var cached=CacheService.getScriptCache().get('master-session-v2:'+hash_(token));
    if (!token || cached!=='OK') throw new Error('Sessão do Controle Geral expirada ou inválida.');
    CacheService.getScriptCache().put('master-session-v2:'+hash_(token),'OK',21600);
    return true;
  }
  if (kind === 'master') {
    if (!MASTER_ADMIN_PASSWORD_SHA256) throw new Error('Controle Geral não configurado.');
    if (sha256Hex_(token) !== MASTER_ADMIN_PASSWORD_SHA256) throw new Error('Senha do Controle Geral inválida.');
    return true;
  }
  if (kind === 'coord') {
    if (!coord) throw new Error('Backend não configurado: defina COORD_TOKEN nas Propriedades do script.');
    if (token !== coord && (!p3 || token !== p3)) throw new Error('Chave de Coordenação inválida.');
    return true;
  }
  if (kind === 'rco') {
    if ((!central)&&(!coord)&&(!p3)) throw new Error('Backend do RCO sem credenciais configuradas.');
    if (token !== central && token !== coord && token !== p3) throw new Error('Credencial do RCO inválida.');
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
function sheetOrCreate_(id,name,headers){
  var ss=ss_(id),s=ss.getSheetByName(name);
  if(!s){s=ss.insertSheet(name);if(headers&&headers.length)s.getRange(1,1,1,headers.length).setValues([headers]);}
  else if(headers&&headers.length){
    var current=headers_(s).filter(function(x){return !!String(x||'').trim();});
    if(!current.length)s.getRange(1,1,1,headers.length).setValues([headers]);
    else ensureHeaders_(s,headers);
  }
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
function sha256Hex_(text) {
  var b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text||''), Utilities.Charset.UTF_8);
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

function normVtrPrefix_(v) {
  return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');
}
function normGuarnicaoTipo_(v) {
  var t=String(v||'').trim().toUpperCase();
  return ['BST','BASE','GTTRAN','TOR','REBOQUE'].indexOf(t)>=0?t:'';
}
function guarnicaoTipoFromNome_(nome) {
  var m=String(nome||'').trim().toUpperCase().match(/^(BST|BASE|GTTRAN|TOR|REBOQUE)\b/);
  return m?m[1]:'';
}
function padGuarnicaoOrdem_(n) {
  n=Number(n||0)||0;
  return n<10?'0'+n:String(n);
}
function normalizeGuarnicaoNome_(nome,tipo) {
  var s=String(nome||'').trim().toUpperCase().replace(/\s+/g,' '),m=s.match(/^(BST|BASE|GTTRAN|TOR|REBOQUE)\s*0*(\d{1,2})$/);
  if(!m)return '';
  var t=m[1],n=Number(m[2]),max={BST:10,BASE:4,GTTRAN:3,TOR:3,REBOQUE:3}[t]||0,expected=normGuarnicaoTipo_(tipo||t);
  if(n<1||n>max||!expected||t!==expected)return '';
  return t+' '+padGuarnicaoOrdem_(n);
}
function rsdPrimaryVtr_(r) {
  r=r||{};var g=r.guarnicao||{},vs=r.viaturas||g.viaturas||[];
  if(Array.isArray(vs)&&vs.length){
    var v=vs[0];return normVtrPrefix_(typeof v==='string'?v:(v.prefixo||v.viatura||''));
  }
  var raw=g.vtrPrincipal||r.vtrPrincipal||g.viatura||'';
  if(String(raw).indexOf(',')>=0)raw=String(raw).split(',')[0];
  return normVtrPrefix_(raw);
}
function rsdMainVtrMap_() {
  var out={},rows=objects_(sheet_(P3_SHEET_ID,'RSD_VIATURAS')).sort(function(a,b){
    return Number(a.ORDEM||999)-Number(b.ORDEM||999);
  });
  rows.forEach(function(v){
    var id=String(v.RSD_REPORT_ID||'');
    if(id&&!out[id]&&Number(v.ORDEM||1)===1)out[id]=normVtrPrefix_(v.PREFIXO||'');
  });
  rows.forEach(function(v){
    var id=String(v.RSD_REPORT_ID||'');
    if(id&&!out[id])out[id]=normVtrPrefix_(v.PREFIXO||'');
  });
  return out;
}
function guarnicaoNextOrder_(s,batt,comp,data,tipo) {
  var max=0;
  objects_(s).forEach(function(x){
    if(String(x.BATALHAO||'')!==String(batt))return;
    if(String(x.COMPANHIA||'')!==String(comp))return;
    if(dateText_(x.DATA_SERVICO)!==dateText_(data))return;
    var xt=normGuarnicaoTipo_(x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
    if(xt!==tipo)return;
    var n=Number(x.GUARNICAO_ORDEM||0)||Number((String(x.GUARNICAO||'').match(/(\d+)\s*$/)||[])[1]||0)||0;
    if(n>max)max=n;
  });
  return max+1;
}
function guarnicaoNext_(p) {
  var batt=normBattalion_(p.batalhao||p.batalhaoSigla||'BPTran'),
      comp=p.companhia||normCompany_(batt,p.companhiaNumero),
      data=dateText_(p.data||''),tipo=normGuarnicaoTipo_(p.tipo||'');
  if(!data)throw new Error('Informe a data do serviço.');
  if(!tipo)throw new Error('Selecione BST, BASE, GTTRAN, TOR ou REBOQUE.');
  var ordem=guarnicaoNextOrder_(sheet_(P3_SHEET_ID,'RSD'),batt,comp,data,tipo);
  return {ok:true,tipo:tipo,ordem:ordem,nome:tipo+' '+padGuarnicaoOrdem_(ordem)};
}

function rsdMilitarValidar_(payload) {
  var mat=normMat_(payload.matricula||'');
  if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Matrícula inválida.');
  var items=cadastroSearch_({tipo:'militar',q:mat}).items||[],m=null;
  for(var i=0;i<items.length;i++){if(normMat_(items[i].MATRICULA)===mat){m=items[i];break;}}
  if(!m){
    var ext=payload.cadastroExterno||{},nome=String(ext.nome||'').trim(),posto=String(ext.postoGrad||'').trim(),origem=String(ext.unidadeOrigem||'').trim();
    if(!nome||!posto||!origem)throw new Error('Complete posto/graduação, nome e unidade de origem para pré-cadastrar o militar.');
    m={MILITAR_ID:'mil-'+mat.replace(/\D/g,''),MATRICULA:mat,POSTO_GRAD:posto,NOME:nome,BATALHAO:'',COMPANHIA:'',SITUACAO:'ATIVO',TIPO_CADASTRO:'EXTERNO_RSD_VALIDADO',UNIDADE_ORIGEM:origem,ATUALIZADO_EM:nowIso_()};
    upsert_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat,m);
    audit_('MILITAR',m.MILITAR_ID,1,'CADASTRO_EXTERNO_RSD',mat,nome,'','',{unidadeOrigem:origem,tipoCadastro:m.TIPO_CADASTRO});
    return {ok:true,message:'Militar pré-cadastrado e validado para o serviço.',militar:m,cadastrado:true};
  }
  return {ok:true,message:'Militar localizado no Cadastro Mestre.',militar:m,cadastrado:false};
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
  var tipo=normGuarnicaoTipo_(g.tipo||guarnicaoTipoFromNome_(g.nome)||(old&&old.GUARNICAO_TIPO)||''),vtrPrincipal=rsdPrimaryVtr_(r)||normVtrPrefix_(old&&old.VTR_PRINCIPAL||''),ordem=Number(g.ordem||g.numero||old&&old.GUARNICAO_ORDEM||0)||Number((String(g.nome||old&&old.GUARNICAO||'').match(/(\d+)\s*$/)||[])[1]||0)||0;
  return {REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:g.nome||(old&&old.GUARNICAO)||'',GUARNICAO_TIPO:tipo,GUARNICAO_ORDEM:ordem,VTR_PRINCIPAL:vtrPrincipal,TURNO:'',
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
  ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','DUPLICATE_OVERRIDE_JUSTIFICATIVA','GUARNICAO_TIPO','GUARNICAO_ORDEM','VTR_PRINCIPAL']);
  if(old&&['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD não está disponível para novo início/registro. Situação atual: '+String(old.STATUS||'').replace(/_/g,' ')+'. Use Continuar serviço para consultar a situação ou a devolutiva.');

  var u0=r.unidade||{},g0=r.guarnicao||{},batt0=normBattalion_(u0.batalhao||u0.batalhaoSigla||'BPTran'),
      comp0=u0.companhia||normCompany_(batt0,u0.companhiaNumero),data0=dateText_((r.servico||{}).data),
      mat0=normMat_(g0.matricula||r.matriculaResponsavel||''),tipo0=normGuarnicaoTipo_(g0.tipo||guarnicaoTipoFromNome_(g0.nome)),vtr0=rsdPrimaryVtr_(r),passagem0=!!(r.passagemOrigemId||(r.servico&&r.servico.passagemOrigemId)),guEscolhida0=normalizeGuarnicaoNome_(g0.nome,tipo0);
  if(!tipo0)throw new Error('Selecione o tipo da guarnição: BST, BASE, GTTRAN, TOR ou REBOQUE.');
  if(!vtr0)throw new Error('Informe a VTR principal da guarnição.');
  var mainVtrMap=rsdMainVtrMap_();
  if(old&&normVtrPrefix_(old.VTR_PRINCIPAL||mainVtrMap[String(old.REPORT_ID||'')]||'')&&normVtrPrefix_(old.VTR_PRINCIPAL||mainVtrMap[String(old.REPORT_ID||'')]||'')!==vtr0)throw new Error('A VTR principal identifica este serviço e não pode ser alterada. Registre eventual substituição como VTR adicional/alteração de serviço.');

  if(!old&&data0&&!passagem0){
    var candidates=objects_(s).filter(function(x){
      var xv=normVtrPrefix_(x.VTR_PRINCIPAL||mainVtrMap[String(x.REPORT_ID||'')]||'');
      return ['CANCELADO','INDEFERIDO'].indexOf(String(x.STATUS))<0 &&
        xv===vtr0 &&
        dateText_(x.DATA_SERVICO)===data0 &&
        String(x.BATALHAO||'')===String(batt0) &&
        String(x.COMPANHIA||'')===String(comp0) &&
        String(x.REPORT_ID||'')!==reportId;
    }).sort(function(a,b){
      return String(b.ULTIMO_RASCUNHO_EM||b.INICIADO_EM||b.FINALIZADO_EM||'').localeCompare(String(a.ULTIMO_RASCUNHO_EM||a.INICIADO_EM||a.FINALIZADO_EM||''));
    });
    if(candidates.length){
      return {ok:true,existing:true,possible_duplicate:true,message:'A VTR '+vtr0+' já identifica um serviço nesta unidade e data. Continue o serviço existente. Se o cadastro anterior estiver incorreto, cancele-o auditavelmente antes de registrar novamente.',
        candidates:candidates.slice(0,8).map(function(x){return {reportId:String(x.REPORT_ID||''),serviceId:String(x.SERVICE_ID||''),segmento:Number(x.SEGMENTO||1),status:String(x.STATUS||''),guarnicao:String(x.GUARNICAO||''),vtrPrincipal:normVtrPrefix_(x.VTR_PRINCIPAL||mainVtrMap[String(x.REPORT_ID||'')]||''),responsavel:String(x.RESPONSAVEL_NOME||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),iniciadoEm:String(x.INICIADO_EM||''),finalizadoEm:String(x.FINALIZADO_EM||'')};}),
        reportId:String(candidates[0].REPORT_ID||''),serviceId:String(candidates[0].SERVICE_ID||''),segmento:Number(candidates[0].SEGMENTO||1),status:String(candidates[0].STATUS||'')};
    }
    if(guEscolhida0){
      var teamCandidates=objects_(s).filter(function(x){
        return ['CANCELADO','INDEFERIDO'].indexOf(String(x.STATUS))<0 &&
          normalizeGuarnicaoNome_(x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO))===guEscolhida0 &&
          dateText_(x.DATA_SERVICO)===data0 && String(x.BATALHAO||'')===String(batt0) &&
          String(x.COMPANHIA||'')===String(comp0) && String(x.REPORT_ID||'')!==reportId;
      }).sort(function(a,b){return String(b.ULTIMO_RASCUNHO_EM||b.INICIADO_EM||'').localeCompare(String(a.ULTIMO_RASCUNHO_EM||a.INICIADO_EM||''));});
      if(teamCandidates.length){
        return {ok:true,existing:true,possible_duplicate:true,message:'A guarnição '+guEscolhida0+' já possui serviço registrado nesta unidade e data. Continue o serviço existente ou cancele o cadastro incorreto antes de criar outro.',
          candidates:teamCandidates.slice(0,8).map(function(x){return {reportId:String(x.REPORT_ID||''),serviceId:String(x.SERVICE_ID||''),segmento:Number(x.SEGMENTO||1),status:String(x.STATUS||''),guarnicao:String(x.GUARNICAO||''),vtrPrincipal:normVtrPrefix_(x.VTR_PRINCIPAL||mainVtrMap[String(x.REPORT_ID||'')]||''),responsavel:String(x.RESPONSAVEL_NOME||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),iniciadoEm:String(x.INICIADO_EM||''),finalizadoEm:String(x.FINALIZADO_EM||'')};}),
          reportId:String(teamCandidates[0].REPORT_ID||''),serviceId:String(teamCandidates[0].SERVICE_ID||''),segmento:Number(teamCandidates[0].SEGMENTO||1),status:String(teamCandidates[0].STATUS||'')};
      }
    }
  }
  if(old){
    g0.nome=String(old.GUARNICAO||g0.nome||'');
    g0.tipo=normGuarnicaoTipo_(old.GUARNICAO_TIPO||tipo0)||tipo0;
    g0.ordem=Number(old.GUARNICAO_ORDEM||0)||Number((String(g0.nome).match(/(\d+)\s*$/)||[])[1]||0)||0;
    g0.vtrPrincipal=normVtrPrefix_(old.VTR_PRINCIPAL||vtr0)||vtr0;
  }else if(!passagem0){
    if(guEscolhida0){
      var ordem0=Number((guEscolhida0.match(/(\d+)$/)||[])[1]||0);
      g0.tipo=tipo0;g0.ordem=ordem0;g0.nome=guEscolhida0;g0.vtrPrincipal=vtr0;
    }else{
      var ordemAuto0=guarnicaoNextOrder_(s,batt0,comp0,data0,tipo0);
      g0.tipo=tipo0;g0.ordem=ordemAuto0;g0.nome=tipo0+' '+padGuarnicaoOrdem_(ordemAuto0);g0.vtrPrincipal=vtr0;
    }
  }else{
    g0.tipo=tipo0;g0.vtrPrincipal=vtr0;
    if(!String(g0.nome||'').trim()){var ordemPass=guarnicaoNextOrder_(s,batt0,comp0,data0,tipo0);g0.ordem=ordemPass;g0.nome=tipo0+' '+padGuarnicaoOrdem_(ordemPass);}
  }
  r.guarnicao=g0;

  var newMat=mat0;
  if(old&&old.RESPONSAVEL_MATRICULA&&newMat&&normMat_(old.RESPONSAVEL_MATRICULA)!==newMat)throw new Error('O comandante deste segmento já está definido. Para mudança de comandante, realize a passagem de serviço.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var obj=rsdDraftObject_(r,old,deviceId);
  upsert_(s,'REPORT_ID',reportId,obj);syncRsdVehicles_(r,reportId);
  audit_('RSD',reportId,obj.DRAFT_REVISION,old?'RASCUNHO_ATUALIZADO':'INICIADO',obj.RESPONSAVEL_MATRICULA,obj.RESPONSAVEL_NOME,obj.BATALHAO,obj.COMPANHIA,r);
  return {ok:true,message:old?'Serviço em andamento atualizado na nuvem.':'Guarnição '+obj.GUARNICAO+' registrada em serviço e disponível ao coordenador.',reportId:reportId,serviceId:obj.SERVICE_ID,segmento:obj.SEGMENTO,draftRevision:obj.DRAFT_REVISION,status:'EM_SERVICO',guarnicaoNome:obj.GUARNICAO,guarnicaoTipo:obj.GUARNICAO_TIPO,guarnicaoOrdem:Number(obj.GUARNICAO_ORDEM||0),vtrPrincipal:obj.VTR_PRINCIPAL};
  }finally{lock.releaseLock();}
}
function rsdDraftSync_(payload){
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD'),old=findOne_(s,'REPORT_ID',reportId);
  if(!old)return rsdStart_(payload);
  var incomingVtr=rsdPrimaryVtr_(r),oldVtr=normVtrPrefix_(old.VTR_PRINCIPAL||rsdMainVtrMap_()[reportId]||''),incomingTipo=normGuarnicaoTipo_((r.guarnicao||{}).tipo||guarnicaoTipoFromNome_((r.guarnicao||{}).nome)),oldTipo=normGuarnicaoTipo_(old.GUARNICAO_TIPO||guarnicaoTipoFromNome_(old.GUARNICAO));
  if(oldVtr&&incomingVtr&&oldVtr!==incomingVtr)throw new Error('A VTR principal identifica este serviço e não pode ser alterada.');
  if(oldTipo&&incomingTipo&&oldTipo!==incomingTipo)throw new Error('O tipo da guarnição já foi definido para este serviço e não pode ser alterado.');
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
  audit_('RSD',reportId,Number(row.VERSAO||1),'ACESSO_CONTINUIDADE',row.RESPONSAVEL_MATRICULA||'',row.RESPONSAVEL_NOME||'',row.BATALHAO,row.COMPANHIA,{deviceId:deviceId,forceTakeover:!!payload.forceTakeover});
  var p=rsdGet_(reportId);p.versao=Number(row.VERSAO||1);p.serviceId=row.SERVICE_ID||p.serviceId||'';p.segmento=Number(row.SEGMENTO||p.segmento||1);
  return {ok:true,message:String(row.STATUS)==='RETIFICACAO_SOLICITADA'?'Relatório devolvido carregado para retificação.':'Serviço assumido neste aparelho.',rsd:p,meta:{reportId:reportId,serviceId:row.SERVICE_ID||'',segmento:Number(row.SEGMENTO||1),draftRevision:Number(row.DRAFT_REVISION||0)}};
}
function rsdUpsert_(payload) {
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD');ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','GUARNICAO_TIPO','GUARNICAO_ORDEM','VTR_PRINCIPAL']);
  var old=findOne_(s,'REPORT_ID',reportId),newMat=normMat_((r.guarnicao||{}).matricula||r.matriculaResponsavel||''),incomingVtr=rsdPrimaryVtr_(r),oldVtr=old?normVtrPrefix_(old.VTR_PRINCIPAL||rsdMainVtrMap_()[reportId]||''):'',incomingTipo=normGuarnicaoTipo_((r.guarnicao||{}).tipo||guarnicaoTipoFromNome_((r.guarnicao||{}).nome)),oldTipo=old?normGuarnicaoTipo_(old.GUARNICAO_TIPO||guarnicaoTipoFromNome_(old.GUARNICAO)):'';
  if(!old)throw new Error('Registre a guarnição no serviço antes de finalizar o RSD.');
  if(oldVtr&&incomingVtr&&oldVtr!==incomingVtr)throw new Error('A VTR principal identifica este serviço e não pode ser alterada.');
  if(oldTipo&&incomingTipo&&oldTipo!==incomingTipo)throw new Error('O tipo da guarnição já foi definido para este serviço e não pode ser alterado.');
  if(old&&old.RESPONSAVEL_MATRICULA&&newMat&&normMat_(old.RESPONSAVEL_MATRICULA)!==newMat)throw new Error('O comandante deste segmento já está definido. Para mudança de comandante, realize a passagem de serviço.');
  if(old&&['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD já não está disponível para finalização. Situação atual: '+String(old.STATUS||'').replace(/_/g,' ')+'. Consulte a devolutiva do Coordenador antes de qualquer nova ação.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var wasReturned=!!(old&&String(old.STATUS)==='RETIFICACAO_SOLICITADA'),version=Math.max(Number(r.versao||r.version||0),old?Number(old.VERSAO||0)+1:1);
  var u=r.unidade||{},g=r.guarnicao||{},json=JSON.stringify(r),saved=saveJsonPayload_(reportId,version,json),batt=normBattalion_(u.batalhao||u.batalhaoSigla||'BPTran'),comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var serviceId=String(r.serviceId||(r.servico||{}).serviceId||(old&&old.SERVICE_ID)||uid_('svc')),seg=Number(r.segmento||(r.servico||{}).segmento||(old&&old.SEGMENTO)||1)||1;
  var tipoFinal=normGuarnicaoTipo_(g.tipo||old&&old.GUARNICAO_TIPO||guarnicaoTipoFromNome_(g.nome||old&&old.GUARNICAO)),ordemFinal=Number(g.ordem||old&&old.GUARNICAO_ORDEM||0)||Number((String(g.nome||old&&old.GUARNICAO||'').match(/(\d+)\s*$/)||[])[1]||0)||0,vtrFinal=oldVtr||incomingVtr;
  var obj={REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:g.nome||old&&old.GUARNICAO||'',GUARNICAO_TIPO:tipoFinal,GUARNICAO_ORDEM:ordemFinal,VTR_PRINCIPAL:vtrFinal,TURNO:'',STATUS:'AGUARDANDO_ANALISE',
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
  ensureHeaders_(rs,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','GUARNICAO_TIPO','GUARNICAO_ORDEM','VTR_PRINCIPAL']);
  var list=objects_(rs),batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||''),mat=normMat_(p.matricula||''),showCancelled=String(p.showCancelled||'')==='1',vtrs=objects_(sheet_(P3_SHEET_ID,'RSD_VIATURAS'));
  var allowed=['EM_SERVICO','PASSAGEM_DISPONIVEL','ENCERRADO_PASSAGEM','AGUARDANDO_ANALISE','DEFERIDO','DEFERIDO_COM_RESSALVAS','RETIFICACAO_SOLICITADA','INDEFERIDO','FINALIZADO','INCLUIDO_RCO'];
  if(showCancelled)allowed.push('CANCELADO');
  var filtered=list.filter(function(x){if(allowed.indexOf(String(x.STATUS))<0)return false;if(batt&&String(x.BATALHAO)!==batt)return false;if(comp&&String(x.COMPANHIA)!==String(comp))return false;if(data&&dateText_(x.DATA_SERVICO)!==data)return false;if(mat&&normMat_(x.RESPONSAVEL_MATRICULA)!==mat)return false;return true;});
  var mainVtrMap=rsdMainVtrMap_(),servicesByKey={};filtered.filter(function(x){return String(x.STATUS)!=='CANCELADO';}).forEach(function(x){
    var pv=normVtrPrefix_(x.VTR_PRINCIPAL||mainVtrMap[String(x.REPORT_ID||'')]||''),k=[x.BATALHAO,x.COMPANHIA,dateText_(x.DATA_SERVICO),pv||('LEGACY:'+String(x.GUARNICAO||'').trim().toUpperCase())].join('|');
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
    var pv=normVtrPrefix_(x.VTR_PRINCIPAL||mainVtrMap[String(x.REPORT_ID||'')]||''),key=[x.BATALHAO,x.COMPANHIA,dateText_(x.DATA_SERVICO),pv||('LEGACY:'+String(x.GUARNICAO||'').trim().toUpperCase())].join('|');
    return {reportId:x.REPORT_ID,serviceId:x.SERVICE_ID||'',segmento:Number(x.SEGMENTO||1),rsdAnteriorId:x.RSD_ANTERIOR_ID||'',passagemOrigemId:x.PASSAGEM_ORIGEM_ID||'',version:Number(x.VERSAO||1),draftRevision:Number(x.DRAFT_REVISION||0),
      data:x.DATA_SERVICO,batalhao:x.BATALHAO,companhia:x.COMPANHIA,guarnicao:x.GUARNICAO,guarnicaoTipo:normGuarnicaoTipo_(x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO)),guarnicaoOrdem:Number(x.GUARNICAO_ORDEM||0)||0,vtrPrincipal:pv,status:x.STATUS,responsavel:x.RESPONSAVEL_NOME,matricula:x.RESPONSAVEL_MATRICULA,
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
  audit_('PASSAGEM',id,1,'PASSAGEM_DISPONIBILIZADA',obj.ENTREGUE_POR_MATRICULA,obj.ENTREGUE_POR_NOME,batt,comp,{serviceId:obj.SERVICE_ID,rsdOrigemId:obj.RSD_ORIGEM_ID,guarnicao:obj.GUARNICAO});
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
    audit_('PASSAGEM',id,1,'PASSAGEM_RECEBIDA',row.RECEBIDA_POR_MATRICULA,row.RECEBIDA_POR_NOME,row.BATALHAO,row.COMPANHIA,{serviceId:row.SERVICE_ID||'',rsdOrigemId:row.RSD_ORIGEM_ID||'',rsdDestinoId:row.RSD_DESTINO_ID||''});
    return {ok:true,message:'Recebimento do serviço registrado.',passagemId:id,serviceId:row.SERVICE_ID||'',rsdOrigemId:row.RSD_ORIGEM_ID||'',rsdDestinoId:row.RSD_DESTINO_ID||'',segmentoDestino:row.SEGMENTO_DESTINO||''};
  } finally {lock.releaseLock();}
}


function linkedRcoInRetification_(rsdRow){
  var rid=String((rsdRow||{}).RCO_REPORT_ID||'');if(!rid)return false;
  var d=findOne_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),'RCO_REPORT_ID',rid);
  return !!(d&&String(d.STATUS)==='EM_RETIFICACAO');
}

function rsdReview_(payload){
  var reportId=String(payload.reportId||''),decision=String(payload.decision||'').toUpperCase(),s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);
  if(!row)throw new Error('RSD não localizado.');
  ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM']);
  var allowed={DEFERIDO:'DEFERIDO',DEFERIDO_COM_RESSALVAS:'DEFERIDO_COM_RESSALVAS',RETIFICACAO_SOLICITADA:'RETIFICACAO_SOLICITADA',INDEFERIDO:'INDEFERIDO'};
  if(!allowed[decision])throw new Error('Decisão de análise inválida.');
  if(['CANCELADO','ENCERRADO_PASSAGEM'].indexOf(String(row.STATUS))>=0)throw new Error('Este RSD não pode ser analisado neste estado.');
  if(String(row.STATUS)==='INCLUIDO_RCO'){
    if(!linkedRcoInRetification_(row))throw new Error('Este RSD já integra um RCO consolidado. O P3 deve reabrir formalmente o RCO para retificação antes de qualquer correção.');
    if(['RETIFICACAO_SOLICITADA','INDEFERIDO'].indexOf(decision)<0)throw new Error('Durante a retificação do RCO, um RSD já incluído somente pode ser devolvido para correção ou indeferido.');
  }
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
  if(String(row.STATUS)==='INCLUIDO_RCO'){
    if(String(payload.perfil||'').toUpperCase()==='GUARNICAO')throw new Error('Este RSD já foi incorporado ao RCO e não pode ser cancelado pela guarnição.');
    if(!linkedRcoInRetification_(row))throw new Error('Este RSD já foi incorporado a um RCO consolidado. O P3 deve reabrir formalmente o RCO para retificação antes do cancelamento.');
  }
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
  var perfil=String(payload.perfil||'CPU').toUpperCase();
  assertToken_(token,perfil==='P3'||perfil==='OFICIAL'?'p3':'coord');

  var mat=normMat_(payload.matricula||'');
  if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Matrícula inválida.');

  var items=cadastroSearch_({tipo:'militar',q:mat}).items||[],m=null;
  for(var i=0;i<items.length;i++){
    if(normMat_(items[i].MATRICULA)===mat){m=items[i];break;}
  }

  var ext=payload.cadastroExterno||null;
  if(!m){
    if(!ext){
      return {
        ok:true,
        message:'Militar não localizado no Cadastro Mestre. Complete os dados para cadastro externo validado.',
        perfil:perfil,
        matricula:mat,
        needsCadastroExterno:true
      };
    }

    var nome=String(ext.nome||'').trim();
    var posto=String(ext.postoGrad||'').trim();
    var origem=String(ext.unidadeOrigem||'').trim();
    if(!posto)throw new Error('Informe o posto/graduação do militar externo.');
    if(!nome)throw new Error('Informe o nome do militar externo.');
    if(!origem)throw new Error('Informe a unidade de origem do militar externo.');

    m={
      MILITAR_ID:'mil-'+mat.replace(/\D/g,''),
      MATRICULA:mat,
      POSTO_GRAD:posto,
      NOME:nome,
      BATALHAO:'',
      COMPANHIA:'',
      SITUACAO:'ATIVO',
      TIPO_CADASTRO:'EXTERNO_RCO_VALIDADO',
      UNIDADE_ORIGEM:origem,
      ATUALIZADO_EM:nowIso_()
    };
    upsert_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat,m);
    audit_('MILITAR',m.MILITAR_ID,1,'CADASTRO_EXTERNO_RCO',mat,nome,'','',{
      perfilRco:perfil,
      unidadeOrigem:origem,
      tipoCadastro:m.TIPO_CADASTRO
    });
  }

  return {
    ok:true,
    message:ext?'Militar externo cadastrado e responsável validado.':'Responsável identificado e credencial validada.',
    perfil:perfil,
    needsCadastroExterno:false,
    militar:{
      matricula:mat,
      nome:m.NOME||'',
      postoGrad:m.POSTO_GRAD||'',
      batalhao:m.BATALHAO||'',
      companhia:m.COMPANHIA||'',
      unidadeOrigem:m.UNIDADE_ORIGEM||'',
      tipoCadastro:m.TIPO_CADASTRO||''
    }
  };
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
   Traslados do Reboque — rascunho diário em nuvem
   ========================= */

function reboqueSheet_(){
  return sheetOrCreate_(P3_SHEET_ID,'REBOQUE_TRASLADOS',[
    'REBOQUE_REPORT_ID','RSD_REPORT_ID','SERVICE_ID','SEGMENTO','DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO',
    'PREFIXO','RESPONSAVEL','STATUS','VEICULOS_QTD','REVISAO','CRIADO_EM','ULTIMO_SYNC_EM','FINALIZADO_EM',
    'PAYLOAD_JSON','PAYLOAD_FILE_ID','PAYLOAD_FILE_URL','PAYLOAD_HASH','ORIGEM'
  ]);
}
function reboqueList_(p){
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=String(p.companhia||''),data=dateText_(p.data||''),
      sid=String(p.serviceId||''),rid=String(p.rsdReportId||''),status=String(p.status||'').toUpperCase();
  return objects_(reboqueSheet_()).filter(function(x){
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==comp)return false;
    if(data&&dateText_(x.DATA_SERVICO)!==data)return false;
    if(sid&&String(x.SERVICE_ID)!==sid)return false;
    if(rid&&String(x.RSD_REPORT_ID)!==rid)return false;
    if(status&&String(x.STATUS||'').toUpperCase()!==status)return false;
    return true;
  }).map(function(x){
    return {reportId:x.REBOQUE_REPORT_ID||'',rsdReportId:x.RSD_REPORT_ID||'',serviceId:x.SERVICE_ID||'',segmento:Number(x.SEGMENTO||0)||1,
      data:dateText_(x.DATA_SERVICO),batalhao:x.BATALHAO||'',companhia:x.COMPANHIA||'',guarnicao:x.GUARNICAO||'',prefixo:x.PREFIXO||'',
      responsavel:x.RESPONSAVEL||'',status:x.STATUS||'',veiculosQtd:Number(x.VEICULOS_QTD||0),revision:Number(x.REVISAO||0),
      criadoEm:x.CRIADO_EM||'',ultimoSyncEm:x.ULTIMO_SYNC_EM||'',finalizadoEm:x.FINALIZADO_EM||''};
  }).sort(function(a,b){return String(b.ultimoSyncEm||b.finalizadoEm||b.criadoEm||'').localeCompare(String(a.ultimoSyncEm||a.finalizadoEm||a.criadoEm||''));});
}
function reboqueGet_(reportId){
  var row=findOne_(reboqueSheet_(),'REBOQUE_REPORT_ID',String(reportId||''));if(!row)throw new Error('Relatório de traslados não localizado.');
  var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('Conteúdo do relatório de traslados indisponível.');
  p.reportId=row.REBOQUE_REPORT_ID||p.reportId||'';p.status=row.STATUS||p.status||'';p.revision=Number(row.REVISAO||p.revision||0);
  p.serviceId=row.SERVICE_ID||p.serviceId||'';p.rsdReportId=row.RSD_REPORT_ID||p.rsdReportId||'';p.segmento=Number(row.SEGMENTO||p.segmento||1);
  p.centralMeta={ultimoSyncEm:row.ULTIMO_SYNC_EM||'',finalizadoEm:row.FINALIZADO_EM||'',batalhao:row.BATALHAO||'',companhia:row.COMPANHIA||'',guarnicao:row.GUARNICAO||''};
  return p;
}
function reboqueUpsert_(payload,finalizar){
  var r=payload.reboque||payload||{},ctx=r.contextoServico||{},reportId=String(r.reportId||payload.reportId||'');
  if(!reportId)reportId=uid_('reboque');
  var data=dateText_(r.data||ctx.data||''),prefixo=normVtrPrefix_(r.prefixo||(ctx.vtrs||[])[0]||''),responsavel=String(r.responsavel||ctx.comandante||'').trim();
  if(!data)throw new Error('Informe a data do serviço.');
  if(!prefixo)throw new Error('Informe o prefixo da VTR/Reboque.');
  if(!responsavel)throw new Error('Informe o militar mais antigo responsável.');
  var serviceId=String(r.serviceId||ctx.serviceId||''),rsdReportId=String(r.rsdReportId||ctx.rsdReportId||'');
  if(!serviceId||!rsdReportId)throw new Error('Para salvar na Central, abra este módulo a partir de uma guarnição REBOQUE já registrada no RSD.');
  var unidade=r.unidade||ctx.unidade||{},batt=normBattalion_(unidade.batalhao||unidade.batalhaoSigla||'BPTran'),
      comp=unidade.companhia||normCompany_(batt,unidade.companhiaNumero),gu=String(r.guarnicao||ctx.guarnicao||'REBOQUE').trim();
  var s=reboqueSheet_(),old=findOne_(s,'REBOQUE_REPORT_ID',reportId);
  if(!old&&serviceId){
    var sameService=objects_(s).filter(function(x){return String(x.SERVICE_ID||'')===serviceId;}).sort(function(a,b){return String(b.ULTIMO_SYNC_EM||b.CRIADO_EM||'').localeCompare(String(a.ULTIMO_SYNC_EM||a.CRIADO_EM||''));});
    if(sameService.length){old=sameService[0];reportId=String(old.REBOQUE_REPORT_ID||reportId);}
  }
  if(old&&old.SERVICE_ID&&String(old.SERVICE_ID)!==serviceId)throw new Error('Este relatório de traslados pertence a outro serviço.');
  if(old&&String(old.STATUS||'')==='FINALIZADO'){
    if(!finalizar)throw new Error('Este relatório de traslados já foi finalizado.');
    return {ok:true,message:'Relatório de traslados já finalizado.',reportId:reportId,status:'FINALIZADO',revision:Number(old.REVISAO||1),serviceId:serviceId,rsdReportId:old.RSD_REPORT_ID||rsdReportId,veiculosQtd:Number(old.VEICULOS_QTD||0)};
  }
  var vehicles=Array.isArray(r.vehicles)?r.vehicles:[],revision=old?Number(old.REVISAO||0)+1:1,now=nowIso_(),
      status=finalizar?'FINALIZADO':'EM_SERVICO';
  var normalized={};
  Object.keys(r).forEach(function(k){normalized[k]=r[k];});
  normalized.reportId=reportId;normalized.status=status;normalized.revision=revision;normalized.serviceId=serviceId;normalized.rsdReportId=rsdReportId;
  normalized.segmento=Number(r.segmento||ctx.segmento||1)||1;normalized.contextoServico=ctx;normalized.prefixo=prefixo;
  var json=JSON.stringify(normalized),saved=saveJsonPayload_(reportId,revision,json,'RSD_PAYLOAD_FOLDER_ID','Central Reboque - Payloads',old&&old.PAYLOAD_FILE_ID||'');
  var obj={REBOQUE_REPORT_ID:reportId,RSD_REPORT_ID:rsdReportId,SERVICE_ID:serviceId,SEGMENTO:normalized.segmento,DATA_SERVICO:data,
    BATALHAO:batt,COMPANHIA:comp,GUARNICAO:gu,PREFIXO:prefixo,RESPONSAVEL:responsavel,STATUS:status,VEICULOS_QTD:vehicles.length,
    REVISAO:revision,CRIADO_EM:old&&old.CRIADO_EM||now,ULTIMO_SYNC_EM:now,FINALIZADO_EM:finalizar?now:(old&&old.FINALIZADO_EM||''),
    PAYLOAD_JSON:saved.json,PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json),ORIGEM:'REBOQUE_WEB'};
  upsert_(s,'REBOQUE_REPORT_ID',reportId,obj);
  audit_('REBOQUE_TRASLADOS',reportId,revision,finalizar?'FINALIZADO':'RASCUNHO_SINCRONIZADO','',responsavel,batt,comp,normalized);
  return {ok:true,message:finalizar?'Relatório de traslados finalizado e disponível ao Coordenador.':'Rascunho do reboque salvo na Central.',
    reportId:reportId,status:status,revision:revision,serviceId:serviceId,rsdReportId:rsdReportId,veiculosQtd:vehicles.length};
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
    var d=dateText_(x.DATA_SERVICO||x.DATA||x.DATA_HORA||x.ABERTA_EM||x.DATA_CADASTRO||'');
    if(di&&(!d||d<di))return false;if(df&&(!d||d>df))return false;
    var xt=String(x.TURNO||x.HORARIO_SERVICO||'').toLowerCase(),xg=String(x.GUARNICAO||x.GUARNICAO_RESPONSAVEL||'').toLowerCase();
    if(turno&&xt!==turno)return false;
    if(gu&&xg.indexOf(gu)<0)return false;
    return true;
  });
}
function p3FirstField_(h,names){
  for(var i=0;i<(names||[]).length;i++){var x=h.indexOf(names[i]);if(x>=0)return x;}
  return -1;
}
function p3Companies_(p){
  p=p||{};var raw=p.companhias!=null?p.companhias:p.companhia,a=[];
  if(Array.isArray(raw))a=raw;
  else a=String(raw||'').split(/[|;,]+/);
  var seen={},out=[];
  a.forEach(function(v){v=String(v||'').trim();if(v&&!seen[v]){seen[v]=1;out.push(v)}});
  return out;
}
function p3IndicatorLeaf_(v){
  var s=String(v||'').trim(),a=s.split('.');return a[a.length-1]||s;
}
function p3RowChunks_(rows){
  rows=(rows||[]).slice().sort(function(a,b){return a-b});var out=[],cur=null;
  rows.forEach(function(r){
    if(!cur){cur={start:r,end:r};return;}
    if(r-cur.end<=6&&r-cur.start<250){cur.end=r;return;}
    out.push(cur);cur={start:r,end:r};
  });
  if(cur)out.push(cur);return out;
}
function p3ValuesForRows_(s,rows,startCol,numCols){
  var map={},want={};(rows||[]).forEach(function(r){want[String(r)]=1});
  p3RowChunks_(rows).forEach(function(ch){
    var vals=s.getRange(ch.start,startCol,ch.end-ch.start+1,numCols).getValues();
    for(var i=0;i<vals.length;i++){var row=ch.start+i;if(want[String(row)])map[String(row)]=vals[i];}
  });
  return map;
}
function p3ObjectsForRows_(s,h,rows,limit){
  var chosen=(rows||[]).slice().sort(function(a,b){return a-b});
  if(limit&&chosen.length>limit)chosen=chosen.slice(chosen.length-limit);
  var vals=p3ValuesForRows_(s,chosen,1,s.getLastColumn()),out=[];
  chosen.forEach(function(row){
    var a=vals[String(row)];if(!a)return;var o={_row:row};
    h.forEach(function(k,j){if(k)o[k]=a[j]});out.push(o);
  });
  return out;
}
function p3IndexedRows_(s,p,dateCandidates){
  var last=s.getLastRow(),n=Math.max(0,last-1),h=headers_(s);if(!n)return {headers:h,rows:[]};
  var dateIdx=p3FirstField_(h,dateCandidates||['DATA_SERVICO','DATA','DATA_HORA','ABERTA_EM','DATA_CADASTRO']),
      battIdx=p3FirstField_(h,['BATALHAO']),compIdx=p3FirstField_(h,['COMPANHIA']),
      turnoIdx=p3FirstField_(h,['TURNO','HORARIO_SERVICO']),guIdx=p3FirstField_(h,['GUARNICAO','GUARNICAO_RESPONSAVEL']),
      indexes=[dateIdx,battIdx,compIdx,turnoIdx,guIdx].filter(function(x){return x>=0}),blockStart=indexes.length?Math.min.apply(null,indexes):0,
      blockEnd=indexes.length?Math.max.apply(null,indexes):0,iv=s.getRange(2,blockStart+1,n,blockEnd-blockStart+1).getValues();
  function valueAt(row,idx){return idx>=0?row[idx-blockStart]:''}
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comps=p3Companies_(p),di=dateText_(p.dataInicio||p.inicio||''),df=dateText_(p.dataFim||p.fim||''),
      turno=String(p.turno||'').toLowerCase(),gu=String(p.guarnicao||'').toLowerCase(),rows=[];
  for(var i=0;i<n;i++){
    var row=iv[i],d=dateIdx>=0?dateText_(valueAt(row,dateIdx)):'',co=compIdx>=0?String(valueAt(row,compIdx)||''):'';
    if(di&&(!d||d<di))continue;if(df&&(!d||d>df))continue;
    if(batt&&(battIdx<0||String(valueAt(row,battIdx)||'')!==batt))continue;
    if(comps.length&&(compIdx<0||comps.indexOf(co)<0))continue;
    if(turno&&(turnoIdx<0||String(valueAt(row,turnoIdx)||'').toLowerCase()!==turno))continue;
    if(gu&&(guIdx<0||String(valueAt(row,guIdx)||'').toLowerCase().indexOf(gu)<0))continue;
    rows.push(i+2);
  }
  return {headers:h,rows:rows};
}
function p3FastObjects_(sheetName,p,limit,dateCandidates){
  var s=ss_(P3_SHEET_ID).getSheetByName(sheetName);if(!s)return [];
  var idx=p3IndexedRows_(s,p||{},dateCandidates);return p3ObjectsForRows_(s,idx.headers,idx.rows,limit);
}
function p3HistoricalOrigin_(v){return /histor|importa|legado|migr/.test(String(v||'').toLowerCase());}
function p3ProductionScan_(p){
  var s=sheet_(P3_SHEET_ID,'PRODUCAO'),h=headers_(s),last=s.getLastRow(),n=Math.max(0,last-1);
  if(!n)return {sheet:s,headers:h,matched:[],effective:[],sourceStats:{digital:0,historico:0,historicoSuprimido:0}};
  var dateIdx=h.indexOf('DATA_SERVICO'),battIdx=h.indexOf('BATALHAO'),compIdx=h.indexOf('COMPANHIA'),guIdx=h.indexOf('GUARNICAO'),origIdx=h.indexOf('ORIGEM_RELATORIO');
  var indexCols=[dateIdx,battIdx,compIdx,guIdx],indexStart=Math.min.apply(null,indexCols),indexEnd=Math.max.apply(null,indexCols),
      iv=s.getRange(2,indexStart+1,n,indexEnd-indexStart+1).getValues(),ov=s.getRange(2,origIdx+1,n,1).getDisplayValues();
  function ix(row,col){return row[col-indexStart];}
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comps=p3Companies_(p),di=dateText_(p.dataInicio||p.inicio||''),df=dateText_(p.dataFim||p.fim||''),
      gu=String(p.guarnicao||'').toLowerCase(),matched=[],digitalKeys={};
  if(p.turno)return {sheet:s,headers:h,matched:[],effective:[],sourceStats:{digital:0,historico:0,historicoSuprimido:0}};
  for(var i=0;i<n;i++){
    var row=iv[i],d=dateText_(ix(row,dateIdx)),b=String(ix(row,battIdx)||''),co=String(ix(row,compIdx)||''),g=String(ix(row,guIdx)||''),o=String(ov[i][0]||'');
    if(di&&(!d||d<di))continue;if(df&&(!d||d>df))continue;if(batt&&b!==batt)continue;if(comps.length&&comps.indexOf(co)<0)continue;if(gu&&g.toLowerCase().indexOf(gu)<0)continue;
    var hist=p3HistoricalOrigin_(o),key=[d,b,co].join('|'),m={row:i+2,data:d,batalhao:b,companhia:co,guarnicao:g,origem:o,historico:hist,key:key};
    matched.push(m);if(!hist)digitalKeys[key]=1;
  }
  var effective=[],digital=0,historico=0,suppressed=0;
  matched.forEach(function(m){
    if(m.historico&&digitalKeys[m.key]){suppressed++;return}
    effective.push(m);if(m.historico)historico++;else digital++;
  });
  return {sheet:s,headers:h,matched:matched,effective:effective,sourceStats:{digital:digital,historico:historico,historicoSuprimido:suppressed}};
}
function p3ProductionFacts_(p,mode,limit){
  var scan=p3ProductionScan_(p||{}),base=mode==='historico'?scan.matched.filter(function(x){return x.historico}):scan.effective,
      total=base.length,chosen=base.slice();
  if(limit&&chosen.length>limit)chosen=chosen.slice(chosen.length-limit);
  var h=scan.headers,gc=h.indexOf('GRUPO_CODIGO'),gn=h.indexOf('GRUPO_NOME'),ic=h.indexOf('INDICADOR_CODIGO'),inn=h.indexOf('INDICADOR_NOME'),q=h.indexOf('QUANTIDADE');
  var first=Math.min(gc,gn,ic,inn,q),last=Math.max(gc,gn,ic,inn,q),vals=p3ValuesForRows_(scan.sheet,chosen.map(function(x){return x.row}),first+1,last-first+1),items=[];
  chosen.forEach(function(m){
    var a=vals[String(m.row)];if(!a)return;
    function at(idx){return a[idx-first];}
    items.push({DATA_SERVICO:m.data,BATALHAO:m.batalhao,COMPANHIA:m.companhia,GUARNICAO:m.guarnicao,
      GRUPO_CODIGO:at(gc),GRUPO_NOME:at(gn),INDICADOR_CODIGO:at(ic),INDICADOR_NOME:at(inn),QUANTIDADE:Number(at(q)||0),
      ORIGEM_RELATORIO:m.origem,_row:m.row});
  });
  var histAll=scan.matched.filter(function(x){return x.historico}).length,digAll=scan.matched.length-histAll;
  return {items:items,total:total,totalHistorico:histAll,totalDigital:digAll,sourceStats:scan.sourceStats};
}

function p3ProductionFastEffective_(p,di,df){
  p=p||{};var s=sheet_(P3_SHEET_ID,'PRODUCAO'),h=headers_(s),last=s.getLastRow(),n=Math.max(0,last-1);
  if(!n||p.turno)return {items:[],matched:[],sourceStats:{digital:0,historico:0,historicoSuprimido:0}};
  var idx={
    d:h.indexOf('DATA_SERVICO'),b:h.indexOf('BATALHAO'),c:h.indexOf('COMPANHIA'),g:h.indexOf('GUARNICAO'),
    gc:h.indexOf('GRUPO_CODIGO'),gn:h.indexOf('GRUPO_NOME'),ic:h.indexOf('INDICADOR_CODIGO'),inn:h.indexOf('INDICADOR_NOME'),
    q:h.indexOf('QUANTIDADE'),o:h.indexOf('ORIGEM_RELATORIO')
  },cols=Object.keys(idx).map(function(k){return idx[k]}).filter(function(x){return x>=0});
  if(cols.length<10)return {items:[],matched:[],sourceStats:{digital:0,historico:0,historicoSuprimido:0}};
  var first=Math.min.apply(null,cols),lastCol=Math.max.apply(null,cols),vals=s.getRange(2,first+1,n,lastCol-first+1).getValues();
  function at(row,i){return row[i-first]}
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comps=p3Companies_(p),gu=String(p.guarnicao||'').toLowerCase(),
      start=dateText_(di||p.dataInicio||p.inicio||''),end=dateText_(df||p.dataFim||p.fim||''),matched=[],digitalKeys={};
  for(var i=0;i<vals.length;i++){
    var row=vals[i],d=dateText_(at(row,idx.d)),b=String(at(row,idx.b)||''),co=String(at(row,idx.c)||''),g=String(at(row,idx.g)||'');
    if(start&&(!d||d<start))continue;if(end&&(!d||d>end))continue;if(batt&&b!==batt)continue;if(comps.length&&comps.indexOf(co)<0)continue;if(gu&&g.toLowerCase().indexOf(gu)<0)continue;
    var o=String(at(row,idx.o)||''),hist=p3HistoricalOrigin_(o),key=[d,b,co].join('|');
    var m={DATA_SERVICO:d,BATALHAO:b,COMPANHIA:co,GUARNICAO:g,GRUPO_CODIGO:at(row,idx.gc),GRUPO_NOME:at(row,idx.gn),
      INDICADOR_CODIGO:at(row,idx.ic),INDICADOR_NOME:at(row,idx.inn),QUANTIDADE:Number(at(row,idx.q)||0),ORIGEM_RELATORIO:o,
      historico:hist,key:key,suppressed:false};
    matched.push(m);if(!hist)digitalKeys[key]=1;
  }
  var items=[],digital=0,historico=0,suppressed=0;
  matched.forEach(function(m){
    if(m.historico&&digitalKeys[m.key]){m.suppressed=true;suppressed++;return}
    items.push(m);if(m.historico)historico++;else digital++;
  });
  return {items:items,matched:matched,sourceStats:{digital:digital,historico:historico,historicoSuprimido:suppressed}};
}
function p3PeriodStatsFast_(scan,start,end){
  start=dateText_(start||'');end=dateText_(end||'');var digital=0,historico=0,suppressed=0,rows=0;
  (scan.matched||[]).forEach(function(m){
    var d=m.DATA_SERVICO;if(start&&d<start)return;if(end&&d>end)return;
    if(m.suppressed){suppressed++;return}rows++;if(m.historico)historico++;else digital++;
  });
  return {digital:digital,historico:historico,historicoSuprimido:suppressed,rows:rows};
}
function p3CacheKey_(prefix,obj){
  try{return prefix+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,JSON.stringify(obj))).replace(/=+$/,'')}
  catch(_){return prefix+String(new Date().getTime())}
}
function p3ProductivityMatrixFast_(p){
  var keyObj={di:p.dataInicio||'',df:p.dataFim||'',b:p.batalhao||'',c:p3Companies_(p),g:p.guarnicao||'',t:p.turno||''},
      ck=p3CacheKey_('p3mx65:',keyObj),cache=CacheService.getScriptCache(),cached=cache.get(ck);
  if(cached){try{return JSON.parse(cached)}catch(_){}}
  var scan=p3ProductionFastEffective_(p,p.dataInicio||p.inicio||'',p.dataFim||p.fim||''),map={},companies={};
  scan.items.forEach(function(x){
    var ic=p3IndicatorLeaf_(x.INDICADOR_CODIGO),co=String(x.COMPANHIA||'Não informada'),gc=String(x.GRUPO_CODIGO||'');
    companies[co]=1;var k=[co,gc,ic].join('||');
    if(!map[k])map[k]={COMPANHIA:co,GUARNICAO:'CONSOLIDADO',GRUPO_CODIGO:gc,GRUPO_NOME:x.GRUPO_NOME,INDICADOR_CODIGO:ic,INDICADOR_NOME:x.INDICADOR_NOME,QUANTIDADE:0};
    map[k].QUANTIDADE+=Number(x.QUANTIDADE||0);
  });
  var items=Object.keys(map).map(function(k){return map[k]}).sort(function(a,b){
    return String(a.GRUPO_CODIGO+'|'+a.INDICADOR_CODIGO+'|'+a.COMPANHIA).localeCompare(String(b.GRUPO_CODIGO+'|'+b.INDICADOR_CODIGO+'|'+b.COMPANHIA));
  }),out={ok:true,items:items,companies:Object.keys(companies).sort(),rawRows:scan.items.length,sourceStats:scan.sourceStats,fast:true};
  try{cache.put(ck,JSON.stringify(out),60)}catch(_){}
  return out;
}
function p3ProductivityMatrix_(p){return p3ProductivityMatrixFast_(p)}
function p3IntegratedCatalog_(){
  return [
    {codigo:'acionamentos-total',nome:'Total de acionamentos',descricao:'Acionamentos CICC + apoios PMPB.'},
    {codigo:'ait-165',nome:'AIT art. 165',descricao:'Dirigir sob influência de álcool.'},
    {codigo:'ait-165-a',nome:'AIT art. 165-A',descricao:'Recusa aos procedimentos de verificação de álcool/outra substância psicoativa.'},
    {codigo:'ait-230-xi',nome:'AIT art. 230, XI',descricao:'Descarga livre ou silenciador defeituoso, deficiente ou inoperante.'},
    {codigo:'aits-total',nome:'Total de AITs',descricao:'AITs com abordagem + AITs sem abordagem.'},
    {codigo:'aits-com-abordagem',nome:'Total de AITs com abordagem',descricao:'Art. 165 + art. 165-A + art. 230, XI + demais AITs com abordagem.'},
    {codigo:'aits-sem-abordagem',nome:'Total de AITs sem abordagem',descricao:'AITs lavrados sem abordagem.'},
    {codigo:'veiculos-apreendidos-total',nome:'Veículos apreendidos — total',descricao:'Total geral de motocicletas, ciclomotores, automóveis e outros veículos recolhidos.'},
    {codigo:'prisoes-total',nome:'Prisões — total',descricao:'Somatório das prisões registradas, excluídos TCO-SASP.'},
    {codigo:'veiculos-crime-total',nome:'Veículos relacionados a crime',descricao:'Apreensões classificadas como SIVA-R + SINAIS.'},
    {codigo:'abordagens-pessoas',nome:'Pessoas abordadas',descricao:'Total de pessoas abordadas.'},
    {codigo:'abordagens-veiculos',nome:'Veículos abordados — total',descricao:'Motocicletas + ciclomotores + automóveis + outros veículos abordados.'},
    {codigo:'testes-etilometro',nome:'Testes de etilômetro realizados',descricao:'Quantidade de testes de etilômetro realizados.'}
  ];
}
function p3MetricContribution_(x,code){
  var gc=String(x.GRUPO_CODIGO||''),ic=p3IndicatorLeaf_(x.INDICADOR_CODIGO),q=Number(x.QUANTIDADE||0);
  if(!q)return 0;
  if(code==='acionamentos-total')return gc==='acionamentos'&&['bsts','reboque-outras-unidades'].indexOf(ic)>=0?q:0;
  if(code==='ait-165')return gc==='notificacoes'&&ic==='art-165'?q:0;
  if(code==='ait-165-a')return gc==='notificacoes'&&ic==='art-165-a'?q:0;
  if(code==='ait-230-xi')return gc==='notificacoes'&&ic==='art-230-xi'?q:0;
  if(code==='aits-sem-abordagem')return gc==='notificacoes'&&ic==='aits-sem-abordagem'?q:0;
  if(code==='aits-com-abordagem')return gc==='notificacoes'&&['art-165','art-165-a','art-230-xi','demais-aits-com-abordagem'].indexOf(ic)>=0?q:0;
  if(code==='aits-total')return gc==='notificacoes'&&['art-165','art-165-a','art-230-xi','demais-aits-com-abordagem','aits-sem-abordagem'].indexOf(ic)>=0?q:0;
  if(code==='veiculos-apreendidos-total')return ['apreensoes-veiculos-recolhimentos','remocoes-veiculos-legado'].indexOf(gc)>=0&&['motocicletas','ciclomotores','automoveis','outros'].indexOf(ic)>=0?q:0;
  if(code==='prisoes-total')return gc==='prisoes'&&ic!=='tco-sasp'?q:0;
  if(code==='veiculos-crime-total')return gc==='apreensoes'&&['siva-r','sinais'].indexOf(ic)>=0?q:0;
  if(code==='abordagens-pessoas')return gc==='abordagens'&&ic==='pessoas'?q:0;
  if(code==='abordagens-veiculos')return gc==='abordagens'&&['motocicletas','ciclomotores','automoveis','outros'].indexOf(ic)>=0?q:0;
  if(code==='testes-etilometro')return ic==='testes-etilometro'?q:0;
  return 0;
}
function p3Analysis_(p) {
  var catalog=p3IntegratedCatalog_(),requested=String(p.indicador||catalog[0].codigo),
      meta=catalog.filter(function(x){return x.codigo===requested||x.nome===requested})[0]||catalog[0],code=meta.codigo;
  var facts=p3ProductionFacts_(p,'effective',0),list=facts.items,byCompany={},byDate={},total=0;
  list.forEach(function(x){
    var q=p3MetricContribution_(x,code);if(!q)return;
    var co=String(x.COMPANHIA||'Não informada'),d=dateText_(x.DATA_SERVICO||'');
    total+=q;byCompany[co]=(byCompany[co]||0)+q;if(d)byDate[d]=(byDate[d]||0)+q;
  });
  return {ok:true,indicadores:catalog.map(function(x){return x.nome}),catalogo:catalog,indicador:meta,total:total,sourceStats:facts.sourceStats,
    porCompanhia:Object.keys(byCompany).sort().map(function(k){return {nome:k,valor:byCompany[k]};}),
    porData:Object.keys(byDate).sort().map(function(k){return {data:k,valor:byDate[k]};})};
}


function p3AnalysisCompare_(p){
  p=p||{};var curStart=dateText_(p.dataInicio||p.inicio||''),curEnd=dateText_(p.dataFim||p.fim||''),
      refStart=dateText_(p.refInicio||p.referenciaInicio||''),refEnd=dateText_(p.refFim||p.referenciaFim||'');
  if(!curStart||!curEnd)throw new Error('Informe o período analisado.');
  if(!refStart||!refEnd)throw new Error('Informe a janela de referência.');
  var unionStart=curStart<refStart?curStart:refStart,unionEnd=curEnd>refEnd?curEnd:refEnd,
      keyObj={cs:curStart,ce:curEnd,rs:refStart,re:refEnd,b:p.batalhao||'',c:p3Companies_(p),g:p.guarnicao||'',t:p.turno||''},
      ck=p3CacheKey_('p3cmp65:',keyObj),cache=CacheService.getScriptCache(),cached=cache.get(ck);
  if(cached){try{return JSON.parse(cached)}catch(_){}}
  var scan=p3ProductionFastEffective_(p,unionStart,unionEnd),catalog=p3IntegratedCatalog_(),metrics={};
  catalog.forEach(function(m){metrics[m.codigo]={codigo:m.codigo,nome:m.nome,descricao:m.descricao,totalPeriodo:0,totalReferencia:0,periodoComp:{},periodoData:{},referenciaComp:{},referenciaData:{}}});
  scan.items.forEach(function(x){
    var d=x.DATA_SERVICO,inCur=d>=curStart&&d<=curEnd,inRef=d>=refStart&&d<=refEnd;if(!inCur&&!inRef)return;
    catalog.forEach(function(meta){
      var q=p3MetricContribution_(x,meta.codigo);if(!q)return;var m=metrics[meta.codigo],co=String(x.COMPANHIA||'Não informada');
      if(inCur){m.totalPeriodo+=q;m.periodoComp[co]=(m.periodoComp[co]||0)+q;m.periodoData[d]=(m.periodoData[d]||0)+q}
      if(inRef){m.totalReferencia+=q;m.referenciaComp[co]=(m.referenciaComp[co]||0)+q;m.referenciaData[d]=(m.referenciaData[d]||0)+q}
    });
  });
  function pairs(o,nameKey){return Object.keys(o).sort().map(function(k){var z={valor:o[k]};z[nameKey]=k;return z})}
  var outMetrics=catalog.map(function(meta){var m=metrics[meta.codigo];return {
    codigo:m.codigo,nome:m.nome,descricao:m.descricao,totalPeriodo:m.totalPeriodo,totalReferencia:m.totalReferencia,
    periodoPorCompanhia:pairs(m.periodoComp,'nome'),periodoPorData:pairs(m.periodoData,'data'),
    referenciaPorCompanhia:pairs(m.referenciaComp,'nome'),referenciaPorData:pairs(m.referenciaData,'data')
  }});
  var out={ok:true,catalogo:catalog,metricas:outMetrics,periodo:{inicio:curStart,fim:curEnd,sourceStats:p3PeriodStatsFast_(scan,curStart,curEnd)},
    referencia:{inicio:refStart,fim:refEnd,sourceStats:p3PeriodStatsFast_(scan,refStart,refEnd)},fast:true};
  try{cache.put(ck,JSON.stringify(out),60)}catch(_){}
  return out;
}

function p3Config_(){
  var rows=objects_(sheet_(P3_SHEET_ID,'CONFIG')),out={};
  rows.forEach(function(x){if(['POWERBI_URL','AMBIENTE','BACKEND_V10_STATUS','HISTORICO_2026_STATUS','HISTORICO_2026_PERIODO','HISTORICO_2026_PRODUCAO_LINHAS'].indexOf(String(x.CHAVE))>=0)out[String(x.CHAVE)]=x.VALOR||'';});
  return {ok:true,config:out};
}
function p3ConfigSet_(payload){
  var key=String(payload.chave||payload.key||'');if(['POWERBI_URL'].indexOf(key)<0)throw new Error('Configuração não autorizada.');
  var s=sheet_(P3_SHEET_ID,'CONFIG'),row=findOne_(s,'CHAVE',key)||{CHAVE:key,DESCRICAO:'Configuração da Gestão P3',EDITAVEL_P3:'SIM'};
  row.VALOR=String(payload.valor||payload.value||'').trim();upsert_(s,'CHAVE',key,row);
  return {ok:true,message:'Configuração atualizada.',chave:key,valor:row.VALOR};
}
function p3LegacyCirvcMap_(x){
  return Object.assign({},x,{CIRVC_ID:x.CIRVC_ID||x.REGISTRO_ID||'',DATA_CADASTRO:x.DATA_CADASTRO||x.DATA||'',LOCAL_CUSTODIA:x.LOCAL_CUSTODIA||x.LOCAL_DEIXADO||'',
    STATUS_CUSTODIA:x.STATUS_CUSTODIA||'REGISTRO LEGADO',DESTINO_FINAL:x.DESTINO_FINAL||x.LOCAL_DEIXADO||'',ORIGEM:x.ORIGEM||'CIRVC_LEGADO'});
}
function p3MergeById_(a,b,fields){
  var map={},out=[];function add(x){var k='';for(var i=0;i<fields.length&&!k;i++)k=String(x[fields[i]]||'');if(!k)k='row-'+out.length+'-'+Math.random();if(!map[k]){map[k]=x;out.push(x)}}
  (a||[]).forEach(add);(b||[]).forEach(add);return out;
}
function p3Query_(p) {
  var view=String(p.view||'controle-diario'),list;
  if(view==='controle-diario'){
    var rsd=p3FastObjects_('RSD',p,1000),rco=p3FastObjects_('RCO',p,500);
    return {ok:true,rsd:rsd.reverse(),rco:rco.reverse()};
  }
  if(view==='produtividade-matriz')return p3ProductivityMatrix_(p);
  if(view==='produtividade'){
    var prod=p3ProductionFacts_(p,'effective',5000);
    return {ok:true,items:prod.items.reverse(),total:prod.total,sourceStats:prod.sourceStats};
  }
  if(view==='historico'){
    var hist=p3ProductionFacts_(p,'historico',5000);
    return {ok:true,items:hist.items.reverse(),totalHistorico:hist.totalHistorico,totalDigital:hist.totalDigital,sourceStats:hist.sourceStats};
  }
  if(view==='rco'){
    var drafts=p3FastObjects_('RCO_RASCUNHOS',p,2000),draftMap={};drafts.forEach(function(d){draftMap[String(d.RCO_REPORT_ID||'')]=d});
    list=p3FastObjects_('RCO',p,2000).map(function(x){
      var d=draftMap[String(x.REPORT_ID||'')]||{};x.DRAFT_STATUS=d.STATUS||'';x.RETIFICACAO_MOTIVO=d.RETIFICACAO_MOTIVO||'';x.RETIFICACAO_ABERTA_EM=d.RETIFICACAO_ABERTA_EM||'';x.RETIFICACAO_ABERTA_POR=d.RETIFICACAO_ABERTA_POR||'';return x;
    });
  }
  else if(view==='rco-origens'){
    list=objects_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'));if(p.rcoReportId)list=list.filter(function(x){return String(x.RCO_REPORT_ID||'')===String(p.rcoReportId)});
  }
  else if(view==='operacoes'){
    var ops=p3FastObjects_('OPERACOES',p,2000,['DATA']),pods=p3FastObjects_('POD_EXECUCAO',p,4000,['DATA']),pm={};pods.forEach(function(x){pm[String(x.REGISTRO_ID||'')]=x});
    list=ops.map(function(x){var d=pm[String(x.REGISTRO_ID||'')]||{};x.POD_STATUS=d.STATUS_CUMPRIMENTO||'';x.LOCAL_PREVISTO=d.LOCAL_PREVISTO||'';x.COORDENADAS_PREVISTAS=d.COORDENADAS_PREVISTAS||'';x.LOCAL_EXECUTADO=d.LOCAL_EXECUTADO||x.LOCAL||'';x.COORDENADAS_EXECUTADAS=d.COORDENADAS_EXECUTADAS||[x.LATITUDE,x.LONGITUDE].filter(Boolean).join(', ');return x});
  }
  else if(view==='pod')list=p3FastObjects_('POD_EXECUCAO',p,2000,['DATA']);
  else if(view==='ocorrencias')list=p3FastObjects_('OCORRENCIAS',p,2000,['DATA']);
  else if(view==='prisoes')list=p3FastObjects_('PRISOES',p,2000,['DATA','DATA_SERVICO']);
  else if(view==='cirvc'){
    var newer=p3FastObjects_('CIRVC_CUSTODIA',p,2000,['DATA_CADASTRO','DATA_SERVICO','DATA']),legacy=p3FastObjects_('CIRVC',p,2000,['DATA']).map(p3LegacyCirvcMap_);
    list=p3MergeById_(newer,legacy,['CIRVC_ID','REGISTRO_ID']);
  }
  else if(view==='auditoria')list=p3FastObjects_('AUDITORIA_VERSOES',p,2000,['DATA_HORA']);
  else if(view==='fisco')list=p3FastObjects_('FISCO',p,2000,['DATA']);
  else if(view==='nace-cicc'){
    var pn=Object.assign({},p);pn.batalhao='';pn.companhia='';pn.guarnicao='';pn.turno='';
    list=p3FastObjects_('NACE_CICC',pn,2000,['DATA']);
  }
  else if(view==='veiculos-operacionais'){
    var ss=ss_(P3_SHEET_ID),newSheet=ss.getSheetByName('VEICULOS_OPERACIONAIS'),oldSheet=ss.getSheetByName('VEICULOS_RECUPERADOS');
    var newRows=newSheet?p3FastObjects_('VEICULOS_OPERACIONAIS',p,2000,['DATA']):[],oldRows=oldSheet?p3FastObjects_('VEICULOS_RECUPERADOS',p,2000,['DATA']):[];
    list=p3MergeById_(newRows,oldRows,['REGISTRO_ID']);
  }
  else if(view==='viaturas')list=objects_(sheet_(P3_SHEET_ID,'VIATURAS'));
  else if(view==='militares')list=objects_(sheet_(P3_SHEET_ID,'MILITARES'));
  else throw new Error('Visão P3 desconhecida.');
  return {ok:true,items:(list||[]).slice(-2000).reverse()};
}


/* =========================
   Controle Geral do Serviço — Administrador-mestre
   ========================= */
function masterLogin_(){
  var session=uid_('master')+'-'+Utilities.getUuid();
  CacheService.getScriptCache().put('master-session-v2:'+hash_(session),'OK',21600);
  return {ok:true,message:'Acesso administrativo autorizado.',session:session,expiresInSeconds:21600};
}
function masterLogout_(session){
  try{CacheService.getScriptCache().remove('master-session-v2:'+hash_(session));}catch(_){}
  return {ok:true,message:'Sessão administrativa encerrada.'};
}
function masterFilter_(x,p,dateFields){
  p=p||{};var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=String(p.companhia||''),data=dateText_(p.data||'');
  if(batt&&String(x.BATALHAO||'')!==batt)return false;
  if(comp&&String(x.COMPANHIA||'')!==comp)return false;
  if(data){
    var d='';(dateFields||['DATA_SERVICO','DATA']).some(function(k){d=dateText_(x[k]||'');return !!d;});
    if(d!==data)return false;
  }
  return true;
}
function masterLeaseState_(row){
  var until=String((row||{}).EDIT_LEASE_UNTIL||''),active=leaseActive_(row);
  return {active:active,deviceId:String((row||{}).EDIT_DEVICE_ID||''),until:until};
}
function masterOverview_(p){
  p=p||{};var rsd=objects_(sheet_(P3_SHEET_ID,'RSD')).filter(function(x){return masterFilter_(x,p,['DATA_SERVICO']);}),
      rco=objects_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS')).filter(function(x){return masterFilter_(x,p,['DATA_SERVICO']);}),
      pass=objects_(sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO')).filter(function(x){return masterFilter_(x,p,['DATA_SERVICO']);}),
      aud=objects_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES')).filter(function(x){
        if(p.batalhao&&String(x.BATALHAO||'')!==normBattalion_(p.batalhao))return false;
        if(p.companhia&&String(x.COMPANHIA||'')!==String(p.companhia))return false;
        if(p.data&&dateText_(x.DATA_HORA)!==dateText_(p.data))return false;
        return true;
      }).slice(-250).reverse(),
      mainVtr=rsdMainVtrMap_(),now=Date.now();
  var rsds=rsd.map(function(x){
    var lease=masterLeaseState_(x);
    return {reportId:String(x.REPORT_ID||''),serviceId:String(x.SERVICE_ID||''),segmento:Number(x.SEGMENTO||1),data:dateText_(x.DATA_SERVICO),
      batalhao:String(x.BATALHAO||''),companhia:String(x.COMPANHIA||''),guarnicao:String(x.GUARNICAO||''),tipo:String(x.GUARNICAO_TIPO||''),
      vtrPrincipal:normVtrPrefix_(x.VTR_PRINCIPAL||mainVtr[String(x.REPORT_ID||'')]||''),status:String(x.STATUS||''),
      responsavel:String(x.RESPONSAVEL_NOME||''),postoGrad:String(x.RESPONSAVEL_POSTO_GRAD||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),
      iniciadoEm:String(x.INICIADO_EM||''),finalizadoEm:String(x.FINALIZADO_EM||''),ultimoSync:String(x.ULTIMO_RASCUNHO_EM||x.SINCRONIZADO_EM||''),
      rcoReportId:String(x.RCO_REPORT_ID||''),lease:lease,canceladoMotivo:String(x.CANCELADO_MOTIVO||''),canceladoEm:String(x.CANCELADO_EM||''),
      canceladoPor:String(x.CANCELADO_POR_NOME||''),reviewStatus:String(x.REVIEW_STATUS||'')};
  }).sort(function(a,b){return String(b.ultimoSync||b.iniciadoEm||'').localeCompare(String(a.ultimoSync||a.iniciadoEm||''));});
  var rcos=rco.map(function(x){
    var lease=masterLeaseState_(x);
    return {reportId:String(x.RCO_REPORT_ID||''),data:dateText_(x.DATA_SERVICO),batalhao:String(x.BATALHAO||''),companhia:String(x.COMPANHIA||''),
      status:String(x.STATUS||''),responsavel:String(x.RESPONSAVEL_NOME||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),revision:Number(x.REVISAO||0),
      ultimoSync:String(x.ULTIMO_SYNC_EM||x.ATUALIZADO_EM||''),lease:lease,origem:String(x.ORIGEM||'')};
  }).sort(function(a,b){return String(b.ultimoSync||'').localeCompare(String(a.ultimoSync||''));});
  var passagens=pass.map(function(x){
    return {passagemId:String(x.PASSAGEM_ID||''),serviceId:String(x.SERVICE_ID||''),data:dateText_(x.DATA_SERVICO),batalhao:String(x.BATALHAO||''),companhia:String(x.COMPANHIA||''),
      guarnicao:String(x.GUARNICAO||''),status:String(x.STATUS||''),entreguePor:String(x.ENTREGUE_POR_NOME||''),entregueMatricula:String(x.ENTREGUE_POR_MATRICULA||''),
      disponibilizadaEm:String(x.DISPONIBILIZADA_EM||''),recebidaPor:String(x.RECEBIDA_POR_NOME||''),recebidaMatricula:String(x.RECEBIDA_POR_MATRICULA||''),
      recebidaEm:String(x.RECEBIDA_EM||''),observacoes:String(x.OBSERVACOES||''),atualizadoEm:String(x.ATUALIZADO_EM||'')};
  }).sort(function(a,b){return String(b.atualizadoEm||b.disponibilizadaEm||'').localeCompare(String(a.atualizadoEm||a.disponibilizadaEm||''));});
  var auditoria=aud.map(function(x){return {id:String(x.AUDITORIA_ID||''),tipo:String(x.TIPO_ENTIDADE||''),entidadeId:String(x.ENTIDADE_ID||''),acao:String(x.ACAO||''),
    dataHora:String(x.DATA_HORA||''),responsavel:String(x.RESPONSAVEL_NOME||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),batalhao:String(x.BATALHAO||''),companhia:String(x.COMPANHIA||'')};});
  var activeStatuses=['EM_SERVICO','PASSAGEM_DISPONIVEL','RETIFICACAO_SOLICITADA'];
  return {ok:true,geradoEm:nowIso_(),resumo:{
    rsdTotal:rsds.length,guarnicoesEmServico:rsds.filter(function(x){return activeStatuses.indexOf(x.status)>=0;}).length,
    rsdAguardandoAnalise:rsds.filter(function(x){return x.status==='AGUARDANDO_ANALISE';}).length,
    rsdCancelados:rsds.filter(function(x){return x.status==='CANCELADO';}).length,
    rsdComTrava:rsds.filter(function(x){return x.lease&&x.lease.active;}).length,
    rcoEmAndamento:rcos.filter(function(x){return ['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(x.status)>=0;}).length,
    rcoComTrava:rcos.filter(function(x){return x.lease&&x.lease.active;}).length,
    passagensPendentes:passagens.filter(function(x){return x.status==='AGUARDANDO_RECEBIMENTO';}).length
  },rsds:rsds,rcos:rcos,passagens:passagens,auditoria:auditoria};
}
function masterEmptyProduction_(){
  return {
    'apreensoes-veiculos-recolhimentos':{motocicletas:0,ciclomotores:0,automoveis:0,outros:0},
    'remocoes-sinistros':{motocicletas:0,ciclomotores:0,automoveis:0,outros:0},
    'sinistros-sem-embriaguez':{'c-vitimas':0,'c-vitimas-s-cnh':0,'s-vitimas-menores':0,'s-vitimas-vtr-pmpb':0,atropelamentos:0,outros:0},
    'sinistros-embriaguez':{'c-vitimas':0,'s-vitimas':0,atropelamentos:0,outros:0},
    acionamentos:{bsts:0,'apoio-outras-unidades':0},
    notificacoes:{'art-165':0,'art-165-a':0,'art-230-xi':0,'demais-aits-com-abordagem':0,'aits-sem-abordagem':0,'total-aits':0},
    'cnh-etilometro':{'cnhs-recolhidas':0,'testes-etilometro':0},
    apreensoes:{armas:0,drogas:0,menores:0,'siva-r':0,sinais:0},
    prisoes:{embriaguez:0,sinistro:0,armas:0,drogas:0,mandado:0,'siva-r':0,sinais:0,'tco-sasp':0,outros:0},
    abordagens:{pessoas:0,motocicletas:0,ciclomotores:0,automoveis:0,outros:0,checkpoints:0}
  };
}
function masterRsdCreate_(payload){
  payload=payload||{};var data=dateText_(payload.data||''),batt=normBattalion_(payload.batalhao||'BPTran'),
      comp=String(payload.companhia||normCompany_(batt,payload.companhiaNumero)),tipo=normGuarnicaoTipo_(payload.tipo||''),
      vtr=normVtrPrefix_(payload.vtr||payload.vtrPrincipal||''),mat=normMat_(payload.matricula||''),nome=String(payload.nome||'').trim(),
      posto=String(payload.postoGrad||'').trim(),turno=String(payload.turno||'').trim(),motivo=String(payload.motivo||'').trim();
  if(!data)throw new Error('Informe a data do serviço.');if(!tipo)throw new Error('Informe o tipo da guarnição.');if(!vtr)throw new Error('Informe a VTR principal.');
  if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Informe uma matrícula válida.');if(!nome)throw new Error('Informe o responsável pela guarnição.');
  if(!motivo)throw new Error('Informe o motivo da inclusão administrativa.');
  var now=nowIso_(),reportId=uid_('sd-master'),serviceId=uid_('svc'),n=Number(String(comp).match(/\d+/)&&String(comp).match(/\d+/)[0]||1);
  var r={schema:'pmpb-transito-servico-diario-v2',schemaVersion:2,reportId:reportId,generatedAt:now,tipoRelatorio:'servico-diario-guarnicao',
    unidade:{batalhao:batt,batalhaoSigla:batt,companhiaNumero:n,companhiaTipo:batt==='BPRv'?'CPRv':'CPTran',companhia:comp},
    servico:{data:data,iniciadoEm:now,serviceId:serviceId,segmento:1,turno:turno},
    guarnicao:{tipo:tipo,nome:'',viatura:vtr,vtrPrincipal:vtr,responsavel:nome,matricula:mat,postoGrad:posto,efetivo:'',viaturas:[{prefixo:vtr,ordem:1,origem:'MASTER_ADMIN'}]},
    producao:masterEmptyProduction_(),alteracoes:{viatura:'',servico:'',materialCarga:'',planoOperacionalDiario:''},observacoes:'Inclusão administrativa: '+motivo,
    ocorrencias:[],operacoes:[],veiculosRecuperados:[],tcos:[],arvc:[],fisco:{ativo:false,quantidadeOcorrencias:0,alteracoesEfetivo:''},
    auditoria:{schema:'pmpb-transito-auditoria-rsd-v2',version:2,activated:false,activeSlot:1,actors:{1:{}},events:[],passagens:[],snapshots:{}},
    viaturas:[{prefixo:vtr,ordem:1,origem:'MASTER_ADMIN'}],serviceId:serviceId,segmento:1,origem:'MASTER_ADMIN'};
  var out=rsdStart_({rsd:r,deviceId:'',forceTakeover:true});
  audit_('RSD',out.reportId,1,'MASTER_CRIADO_EM_NOME_DA_GUARNICAO','', 'ADMINISTRADOR MESTRE',batt,comp,{motivo:motivo,responsavel:nome,matricula:mat,vtr:vtr});
  out.message='RSD criado administrativamente e deixado livre para continuidade pela guarnição.';return out;
}
function masterRsdUnlock_(payload){
  var id=String((payload||{}).reportId||''),motivo=String((payload||{}).motivo||'').trim(),s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',id);
  if(!row)throw new Error('RSD não localizado.');if(!motivo)throw new Error('Informe o motivo do destravamento.');
  row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.SINCRONIZADO_EM=nowIso_();upsert_(s,'REPORT_ID',id,row);
  audit_('RSD',id,Number(row.VERSAO||1),'MASTER_DESTRAVADO','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:motivo});
  return {ok:true,message:'Trava do RSD removida. O serviço pode ser continuado em outro aparelho.'};
}
function masterRsdCancel_(payload){
  payload=Object.assign({},payload||{},{perfil:'MASTER',autorNome:'ADMINISTRADOR MESTRE',autorMatricula:''});
  var out=rsdCancel_(payload);return out;
}
function masterRsdReassign_(payload){
  payload=payload||{};var id=String(payload.reportId||''),motivo=String(payload.motivo||'').trim(),mat=normMat_(payload.matricula||''),nome=String(payload.nome||'').trim(),posto=String(payload.postoGrad||'').trim(),
      s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',id);
  if(!row)throw new Error('RSD não localizado.');if(!motivo)throw new Error('Informe o motivo da correção.');if(!/^\d{3}\.\d{3}-\d$/.test(mat)||!nome)throw new Error('Informe nome e matrícula válidos.');
  if(['CANCELADO','INCLUIDO_RCO'].indexOf(String(row.STATUS||''))>=0)throw new Error('Este RSD não pode ter o responsável corrigido neste estado.');
  var before={nome:row.RESPONSAVEL_NOME||'',matricula:row.RESPONSAVEL_MATRICULA||'',postoGrad:row.RESPONSAVEL_POSTO_GRAD||''};
  row.RESPONSAVEL_NOME=nome;row.RESPONSAVEL_MATRICULA=mat;row.RESPONSAVEL_POSTO_GRAD=posto;row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.SINCRONIZADO_EM=nowIso_();
  try{
    var p=loadJsonPayload_(row)||{};p.guarnicao=p.guarnicao||{};p.guarnicao.responsavel=nome;p.guarnicao.matricula=mat;p.guarnicao.postoGrad=posto;
    p.observacoes=String(p.observacoes||'')+(p.observacoes?'\n':'')+'Correção administrativa de responsável: '+motivo;
    var json=JSON.stringify(p),saved=saveJsonPayload_(id,Number(row.VERSAO||1),json,null,null,row.PAYLOAD_FILE_ID||'');
    row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);
  }catch(_){}
  upsert_(s,'REPORT_ID',id,row);
  audit_('RSD',id,Number(row.VERSAO||1),'MASTER_RESPONSAVEL_CORRIGIDO','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:motivo,antes:before,depois:{nome:nome,matricula:mat,postoGrad:posto}});
  return {ok:true,message:'Responsável do RSD corrigido e trava liberada.'};
}
function masterRcoUnlock_(payload){
  var id=String((payload||{}).reportId||''),motivo=String((payload||{}).motivo||'').trim(),s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',id);
  if(!row)throw new Error('RCO não localizado.');if(!motivo)throw new Error('Informe o motivo do destravamento.');
  row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',id,row);
  audit_('RCO',id,Number(row.REVISAO||1),'MASTER_DESTRAVADO','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:motivo});
  return {ok:true,message:'Trava do RCO removida. Outro coordenador poderá assumir o relatório.'};
}
function masterRcoCancel_(payload){
  payload=payload||{};var id=String(payload.reportId||''),motivo=String(payload.motivo||'').trim(),s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',id);
  if(!row)throw new Error('RCO não localizado.');if(!motivo)throw new Error('Informe o motivo do cancelamento.');
  if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(row.STATUS||''))<0)throw new Error('Somente RCO em andamento ou em retificação pode ser cancelado administrativamente.');
  row.STATUS='CANCELADO_ADMIN';row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',id,row);
  audit_('RCO',id,Number(row.REVISAO||1),'MASTER_CANCELADO','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:motivo});
  return {ok:true,message:'RCO cancelado administrativamente e preservado para auditoria.'};
}
function masterRcoReassign_(payload){
  payload=payload||{};var id=String(payload.reportId||''),motivo=String(payload.motivo||'').trim(),mat=normMat_(payload.matricula||''),nome=String(payload.nome||'').trim(),posto=String(payload.postoGrad||'').trim(),
      s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',id);
  if(!row)throw new Error('RCO não localizado.');if(!motivo)throw new Error('Informe o motivo da correção.');if(!/^\d{3}\.\d{3}-\d$/.test(mat)||!nome)throw new Error('Informe nome e matrícula válidos.');
  if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(row.STATUS||''))<0)throw new Error('Somente RCO em andamento/retificação pode ter o responsável corrigido.');
  var before={nome:row.RESPONSAVEL_NOME||'',matricula:row.RESPONSAVEL_MATRICULA||''};
  row.RESPONSAVEL_NOME=nome;row.RESPONSAVEL_MATRICULA=mat;row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();
  try{
    var p=loadJsonPayload_(row)||{};p.consolidacaoResponsavel=p.consolidacaoResponsavel||{};p.consolidacaoResponsavel.nome=nome;p.consolidacaoResponsavel.matricula=mat;p.consolidacaoResponsavel.postoGrad=posto;
    var json=JSON.stringify(p),saved=saveJsonPayload_(id,'draft-'+Number(row.REVISAO||1),json,'RCO_DRAFT_FOLDER_ID','Central RCO - Rascunhos',row.PAYLOAD_FILE_ID||'');
    row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);
  }catch(_){}
  upsert_(s,'RCO_REPORT_ID',id,row);
  audit_('RCO',id,Number(row.REVISAO||1),'MASTER_RESPONSAVEL_CORRIGIDO','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:motivo,antes:before,depois:{nome:nome,matricula:mat,postoGrad:posto}});
  return {ok:true,message:'Responsável do RCO corrigido e trava liberada.'};
}
function masterPassagemCancel_(payload){
  payload=Object.assign({},payload||{},{autorNome:'ADMINISTRADOR MESTRE',autorMatricula:''});
  var out=passagemCancelar_(payload);var s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),row=findOne_(s,'PASSAGEM_ID',String(payload.passagemId||''));
  if(row)audit_('PASSAGEM',row.PASSAGEM_ID,1,'MASTER_PASSAGEM_CANCELADA','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:payload.motivo||''});
  return out;
}
function masterPassagemAnular_(payload){
  payload=Object.assign({},payload||{},{autorNome:'ADMINISTRADOR MESTRE',autorMatricula:''});
  var out=passagemAnular_(payload);var s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),row=findOne_(s,'PASSAGEM_ID',String(payload.passagemId||''));
  if(row)audit_('PASSAGEM',row.PASSAGEM_ID,1,'MASTER_RECEBIMENTO_ANULADO','', 'ADMINISTRADOR MESTRE',row.BATALHAO,row.COMPANHIA,{motivo:payload.motivo||''});
  return out;
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
      return ['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS||''))>=0 &&
        dateText_(x.DATA_SERVICO)===data &&
        String(x.BATALHAO||'')===String(batt) &&
        String(x.COMPANHIA||'')===String(comp) &&
        String(x.RCO_REPORT_ID||'')!==reportId;
    }).sort(function(a,b){return String(b.ULTIMO_SYNC_EM||b.ATUALIZADO_EM||'').localeCompare(String(a.ULTIMO_SYNC_EM||a.ATUALIZADO_EM||''));})[0]||null;
    if(existing)throw new Error(String(existing.STATUS)==='EM_RETIFICACAO'?'Já existe um RCO desta unidade/data aberto para retificação. Use Continuar serviço para carregar o mesmo relatório.':'Já existe RCO em andamento para esta unidade e data. Use Continuar serviço para carregar o relatório existente.');
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
    audit_('RCO',reportId,Number(row.REVISAO||1),'ACESSO_CONTINUIDADE',row.RESPONSAVEL_MATRICULA||'',row.RESPONSAVEL_NOME||'',row.BATALHAO,row.COMPANHIA,{deviceId:deviceId,forceTakeover:!!payload.forceTakeover});
    return {ok:true,message:String(row.STATUS)==='EM_RETIFICACAO'?'RCO em retificação assumido neste aparelho.':'RCO assumido neste aparelho.',rco:rcoDraftGet_(reportId),revision:Number(row.REVISAO||0),status:String(row.STATUS||''),retificacaoMotivo:row.RETIFICACAO_MOTIVO||'',retificacaoAbertaEm:row.RETIFICACAO_ABERTA_EM||'',retificacaoAbertaPor:row.RETIFICACAO_ABERTA_POR||''};
  }finally{lock.releaseLock();}
}
function rcoRetificationOpen_(payload){
  var reportId=String(payload.reportId||''),motivo=String(payload.motivo||'').trim(),perfil=String(payload.autorPerfil||payload.perfil||'P3').toUpperCase(),mat=normMat_(payload.autorMatricula||payload.matricula||'');
  if(!reportId)throw new Error('Informe o REPORT_ID do RCO.');
  if(!motivo)throw new Error('Informe o motivo da retificação.');
  if(['P3','OFICIAL'].indexOf(perfil)<0)throw new Error('A reabertura para retificação exige perfil P3 ou Oficial.');
  if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Identifique o P3/oficial responsável por matrícula válida.');
  var cad=cadastroSearch_({tipo:'militar',q:mat}).items||[],m=null;
  for(var i=0;i<cad.length;i++)if(normMat_(cad[i].MATRICULA)===mat){m=cad[i];break;}
  if(!m)throw new Error('P3/oficial não localizado no Cadastro Mestre.');
  var autorNome=String(m.NOME||''),autorPosto=String(m.POSTO_GRAD||''),autorTexto=[autorPosto,autorNome,mat].filter(Boolean).join(' — ');
  var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');
  ensureHeaders_(s,['RETIFICACAO_MOTIVO','RETIFICACAO_ABERTA_EM','RETIFICACAO_ABERTA_POR','RETIFICACAO_ABERTA_POR_MATRICULA','RETIFICACAO_ABERTA_POR_PERFIL']);
  var row=findOne_(s,'RCO_REPORT_ID',reportId);if(!row)throw new Error('Rascunho original do RCO não localizado.');
  if(String(row.STATUS)==='EM_RETIFICACAO')return {ok:true,message:'Este RCO já está aberto para retificação.',reportId:reportId,status:'EM_RETIFICACAO',autor:{perfil:perfil,matricula:mat,nome:autorNome,postoGrad:autorPosto}};
  if(String(row.STATUS)!=='FINALIZADO')throw new Error('O RCO só pode ser reaberto para retificação após a consolidação/finalização.');
  row.STATUS='EM_RETIFICACAO';row.RETIFICACAO_MOTIVO=motivo;row.RETIFICACAO_ABERTA_EM=nowIso_();row.RETIFICACAO_ABERTA_POR=autorTexto;row.RETIFICACAO_ABERTA_POR_MATRICULA=mat;row.RETIFICACAO_ABERTA_POR_PERFIL=perfil;
  row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',reportId,row);
  audit_('RCO',reportId,Number(row.REVISAO||1),'RETIFICACAO_ABERTA',mat,autorNome,row.BATALHAO,row.COMPANHIA,{motivo:motivo,perfil:perfil,postoGrad:autorPosto});
  return {ok:true,message:'RCO reaberto para retificação. O responsável poderá carregá-lo em “Continuar serviço”.',reportId:reportId,status:'EM_RETIFICACAO',autor:{perfil:perfil,matricula:mat,nome:autorNome,postoGrad:autorPosto}};
}

function closeRcoDraft_(reportId){var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',String(reportId||''));if(row){row.STATUS='FINALIZADO';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',String(reportId),row);}}

/* O backend estatístico principal já recebe o pacote completo do RCO.
   Esta ação complementar preserva origens, auditoria e garante que cada
   operação continue individualizada após a consolidação. */
function rcoSupplementalUpsert_(payload) {
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
  var pkg=payload||{}, rco=pkg.rco||pkg, stat=pkg.estatisticaP3||rco.estatisticaP3||{};
  var reportId=String((rco||{}).reportId||(rco.state||{}).reportId||pkg.reportId||stat.reportId||'');
  if(!reportId) throw new Error('RCO sem REPORT_ID.');
  var rcoSheet=sheet_(P3_SHEET_ID,'RCO');ensureHeaders_(rcoSheet,['VERSAO']);
  var old=findOne_(rcoSheet,'REPORT_ID',reportId),version=old?Number(old.VERSAO||1)+1:1;
  var u=pkg.unidade||rco.unidade||{}, batt=normBattalion_(u.batalhao||pkg.batalhao),comp=u.companhia||pkg.companhia||normCompany_(batt,u.companhiaNumero);
  var cons=rco.consolidacaoResponsavel||{},periodo=rco.periodo||{};
  var obj={REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dateText_(periodo.inicio||rco.data||''),BATALHAO:batt,COMPANHIA:comp,
    INICIO:periodo.inicio||'',TERMINO:periodo.termino||periodo.fim||'',HORARIO_SERVICO:periodo.horario||rco.horarioServico||'',SCHEMA_VERSION:pkg.schemaVersion||rco.schemaVersion||2,
    GERADO_EM:rco.generatedAt||'',ENVIADO_EM:nowIso_(),RETIFICADO_EM:old?nowIso_():'',STATUS:'ATIVO',
    QUANTIDADE_GUARNICOES:(rco.rcoOrigens||[]).length||'',OBSERVACOES:rco.observacoes||'',ORIGEM:'RCO',
    MODO_CONSOLIDACAO:rco.semGuarnicaoCpu?'SEM_CPU':'CPU',CONSOLIDADOR_MATRICULA:normMat_(cons.matricula||''),CONSOLIDADOR_POSTO_GRAD:cons.postoGrad||'',
    CONSOLIDADOR_NOME:cons.nome||'',CONSOLIDADOR_TURNO:cons.turno||''};
  upsert_(rcoSheet,'REPORT_ID',reportId,obj);

  var prodSheet=sheet_(P3_SHEET_ID,'PRODUCAO'),prodRows=stat.producao||pkg.producao||[];
  if(Array.isArray(prodRows)){
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

  var vehHeaders=['REGISTRO_ID','REPORT_ID','DATA','BATALHAO','COMPANHIA','GUARNICAO','PLACA_UF','TIPO','MARCA_MODELO','MARCA','MODELO','ANO','SITUACAO','CLASSIFICACAO_P3','TIPO_RECUPERACAO_DETALHADA','CONTA_COMO_RECUPERADO','PLACA_ORIGINAL_IDENTIFICADA','PLACA_ORIGINAL_UF','RESTRICAO_ORIGINAL','LOCAL','HOUVE_CONDUZIDOS','QUANTIDADE_CONDUZIDOS','VALOR_FIPE','ORIGEM_RELATORIO','ORIGEM_REGISTRO_ID','ENVIADO_EM'];
  var vehSheet=sheetOrCreate_(P3_SHEET_ID,'VEICULOS_OPERACIONAIS',vehHeaders),vehRows=stat.veiculos||pkg.veiculos||[];
  if(Array.isArray(vehRows)){
    deleteWhere_(vehSheet,'REPORT_ID',reportId);
    vehRows.forEach(function(x){
      append_(vehSheet,{
        REGISTRO_ID:String(x.registroId||x.REGISTRO_ID||uid_('veic')),REPORT_ID:reportId,DATA:dateText_(x.data||x.DATA||obj.DATA_SERVICO),BATALHAO:batt,COMPANHIA:comp,
        GUARNICAO:x.guarnicao||x.GUARNICAO||'',PLACA_UF:String(x.placaUf||x.PLACA_UF||'').toUpperCase(),TIPO:x.tipo||x.TIPO||'',MARCA_MODELO:x.marcaModelo||x.MARCA_MODELO||'',
        MARCA:x.marca||x.MARCA||'',MODELO:x.modelo||x.MODELO||'',ANO:x.ano||x.ANO||'',SITUACAO:x.situacao||x.SITUACAO||'',CLASSIFICACAO_P3:x.classificacaoP3||x.CLASSIFICACAO_P3||'',
        TIPO_RECUPERACAO_DETALHADA:x.tipoRecuperacaoDetalhada||x.TIPO_RECUPERACAO_DETALHADA||'',CONTA_COMO_RECUPERADO:x.contaComoRecuperado===true?'SIM':(x.contaComoRecuperado===false?'NÃO':(x.CONTA_COMO_RECUPERADO||'')),
        PLACA_ORIGINAL_IDENTIFICADA:x.placaOriginalIdentificada||x.PLACA_ORIGINAL_IDENTIFICADA||'',PLACA_ORIGINAL_UF:x.placaOriginalUf||x.PLACA_ORIGINAL_UF||'',RESTRICAO_ORIGINAL:x.restricaoOriginal||x.RESTRICAO_ORIGINAL||'',
        LOCAL:x.local||x.LOCAL||'',HOUVE_CONDUZIDOS:x.houveConduzidos||x.HOUVE_CONDUZIDOS||'',QUANTIDADE_CONDUZIDOS:Number(x.quantidadeConduzidos!=null?x.quantidadeConduzidos:(x.QUANTIDADE_CONDUZIDOS||0)),
        VALOR_FIPE:Number(x.valorFipe!=null?x.valorFipe:(x.VALOR_FIPE||0)),ORIGEM_RELATORIO:x.origemRelatorio||x.ORIGEM_RELATORIO||'RCO',ORIGEM_REGISTRO_ID:x.origemRegistroId||x.ORIGEM_REGISTRO_ID||'',ENVIADO_EM:nowIso_()
      });
    });
  }

  deleteWhere_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'),'RCO_REPORT_ID',reportId);
  (rco.rcoOrigens||[]).forEach(function(o){append_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'),{REGISTRO_ID:uid_('orig'),RCO_REPORT_ID:reportId,RSD_REPORT_ID:o.rsdReportId||'',
    GUARNICAO:o.guarnicao||'',VERSAO_RSD:o.versao||'',STATUS_ORIGEM:o.status||'INCLUIDO',ADICIONADO_EM:o.adicionadoEm||nowIso_(),ATUALIZADO_EM:nowIso_(),CONSOLIDADOR_MATRICULA:obj.CONSOLIDADOR_MATRICULA});});
  var originIds=(rco.rcoOrigens||[]).map(function(o){return String(o.rsdReportId||'')}).filter(Boolean);

  var rsdSheet=sheet_(P3_SHEET_ID,'RSD'),rsdRows=objects_(rsdSheet);
  rsdRows.forEach(function(rr){
    var rid=String(rr.REPORT_ID||''),linked=String(rr.RCO_REPORT_ID||'')===reportId,current=originIds.indexOf(rid)>=0,changed=false;
    if(linked&&!current){
      rr.RCO_REPORT_ID='';rr.INCLUIDO_RCO_EM='';changed=true;
      if(String(rr.STATUS||'')==='INCLUIDO_RCO'){
        var review=String(rr.REVIEW_STATUS||'');
        rr.STATUS=['DEFERIDO','DEFERIDO_COM_RESSALVAS'].indexOf(review)>=0?review:'DEFERIDO';
      }
      rr.SINCRONIZADO_EM=nowIso_();
      if(changed){
        upsert_(rsdSheet,'REPORT_ID',rid,rr);
        audit_('RSD',rid,Number(rr.VERSAO||1),'REMOVIDO_RCO_RETIFICACAO','',obj.CONSOLIDADOR_NOME,batt,comp,{rcoReportId:reportId,statusRestaurado:rr.STATUS});
      }
    }else if(current&&['DEFERIDO','DEFERIDO_COM_RESSALVAS','INCLUIDO_RCO'].indexOf(String(rr.STATUS||''))>=0){
      rr.STATUS='INCLUIDO_RCO';rr.RCO_REPORT_ID=reportId;rr.INCLUIDO_RCO_EM=nowIso_();rr.SINCRONIZADO_EM=nowIso_();changed=true;
      upsert_(rsdSheet,'REPORT_ID',rid,rr);
    }
  });

  var ps=sheet_(P3_SHEET_ID,'PRISOES'),plist=objects_(ps);
  plist.forEach(function(pr){
    var changed=false;
    if(String(pr.RCO_REPORT_ID||'')===reportId){pr.RCO_REPORT_ID='';changed=true;}
    if(originIds.indexOf(String(pr.RSD_REPORT_ID||''))>=0){pr.RCO_REPORT_ID=reportId;changed=true;}
    if(changed)upsert_(ps,'PRISAO_ID',pr.PRISAO_ID,pr);
  });
  var cs=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA'),clist=objects_(cs);
  clist.forEach(function(cv){
    var changed=false;
    if(String(cv.RCO_REPORT_ID||'')===reportId){cv.RCO_REPORT_ID='';changed=true;}
    if(originIds.indexOf(String(cv.RSD_REPORT_ID||''))>=0){cv.RCO_REPORT_ID=reportId;changed=true;}
    if(changed){cv.ATUALIZADO_EM=nowIso_();upsert_(cs,'CIRVC_ID',cv.CIRVC_ID,cv);}
  });
  var podRows=stat.podExecucao||pkg.podExecucao||[],podSheet=sheet_(P3_SHEET_ID,'POD_EXECUCAO');
  ensureHeaders_(podSheet,['RCO_REPORT_ID']);
  objects_(podSheet).forEach(function(priorPod){
    if(String(priorPod.RCO_REPORT_ID||'')===reportId){
      priorPod.RCO_REPORT_ID='';
      upsert_(podSheet,'REGISTRO_ID',priorPod.REGISTRO_ID,priorPod);
    }
  });
  if(Array.isArray(podRows)){
    podRows.forEach(function(x){
      var rid=String(x.registroId||x.REGISTRO_ID||x.origemRegistroId||x.ORIGEM_REGISTRO_ID||uid_('pod'));
      var oldPod=findOne_(podSheet,'REGISTRO_ID',rid)||{};
      upsert_(podSheet,'REGISTRO_ID',rid,Object.assign({},oldPod,{
        REGISTRO_ID:rid,REPORT_ID:oldPod.REPORT_ID||rid,RCO_REPORT_ID:reportId,
        DATA:dateText_(x.data||x.DATA||obj.DATA_SERVICO),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:x.guarnicao||x.GUARNICAO||oldPod.GUARNICAO||'',
        OPERACAO:x.operacao||x.OPERACAO||oldPod.OPERACAO||'',TURNO:x.turno||x.TURNO||oldPod.TURNO||'',
        STATUS_CUMPRIMENTO:x.statusCumprimento||x.STATUS_CUMPRIMENTO||oldPod.STATUS_CUMPRIMENTO||'',
        LOCAL_PREVISTO:x.localPrevisto||x.LOCAL_PREVISTO||oldPod.LOCAL_PREVISTO||'',COORDENADAS_PREVISTAS:x.coordenadasPrevistas||x.COORDENADAS_PREVISTAS||oldPod.COORDENADAS_PREVISTAS||'',
        LOCAL_EXECUTADO:x.localExecutado||x.LOCAL_EXECUTADO||oldPod.LOCAL_EXECUTADO||'',COORDENADAS_EXECUTADAS:x.coordenadasExecutadas||x.COORDENADAS_EXECUTADAS||oldPod.COORDENADAS_EXECUTADAS||'',
        HORA_INICIO:x.horaInicio||x.HORA_INICIO||oldPod.HORA_INICIO||'',HORA_FIM:x.horaFim||x.HORA_FIM||oldPod.HORA_FIM||'',
        HOUVE_ALTERACAO:(x.houveAlteracao===true||String(x.houveAlteracao||x.HOUVE_ALTERACAO||'').toUpperCase()==='SIM')?'SIM':'NÃO',
        MOTIVO_ALTERACAO:x.motivoAlteracao||x.MOTIVO_ALTERACAO||oldPod.MOTIVO_ALTERACAO||'',
        ORIGEM_RELATORIO:x.origemRelatorio||x.ORIGEM_RELATORIO||oldPod.ORIGEM_RELATORIO||'RCO',
        ORIGEM_REGISTRO_ID:x.origemRegistroId||x.ORIGEM_REGISTRO_ID||oldPod.ORIGEM_REGISTRO_ID||rid,ENVIADO_EM:nowIso_()
      }));
    });
  }

  var opSheet=sheet_(P3_SHEET_ID,'OPERACOES');
  objects_(opSheet).forEach(function(priorOp){
    if(String(priorOp.RCO_REPORT_ID||'')===reportId){
      priorOp.RCO_REPORT_ID='';
      if(String(priorOp.REPORT_ID||'')===reportId)priorOp.REPORT_ID=priorOp.REGISTRO_ID||'';
      if(String(priorOp.STATUS_REGISTRO||'')==='CONSOLIDADO')priorOp.STATUS_REGISTRO='OPERACAO_FINALIZADA';
      upsert_(opSheet,'REGISTRO_ID',priorOp.REGISTRO_ID,priorOp);
    }
  });
  var ops=pkg.operacoesCompletas||rco.operacoes||[];
  ops.forEach(function(o){var id=String(o.reportId||o.id||uid_('op'));var row=findOne_(opSheet,'REGISTRO_ID',id)||{};
    row.REGISTRO_ID=id;row.REPORT_ID=row.REPORT_ID||id;row.RCO_REPORT_ID=reportId;row.RSD_REPORT_ID=row.RSD_REPORT_ID||o.rsdReportId||'';row.DATA=row.DATA||dateText_(obj.DATA_SERVICO);
    row.BATALHAO=batt;row.COMPANHIA=comp;row.GUARNICAO_RESPONSAVEL=row.GUARNICAO_RESPONSAVEL||o.guarnicao||'';row.OPERACAO=row.OPERACAO||((o.operacao||{}).nome)||o.nome||'';
    row.TURNO=row.TURNO||((o.operacao||{}).turno)||o.turno||'';row.LOCAL=row.LOCAL||((o.local||{}).descricao)||o.local||'';row.LATITUDE=row.LATITUDE||((o.local||{}).latitude)||'';
    row.LONGITUDE=row.LONGITUDE||((o.local||{}).longitude)||'';row.STATUS_REGISTRO='CONSOLIDADO';row.VERSAO_ORIGEM=Number(row.VERSAO_ORIGEM||1);row.ENVIADO_EM=nowIso_();
    upsert_(opSheet,'REGISTRO_ID',id,row);
  });
  audit_('RCO',reportId,version,old?'RETIFICADO':'CONSOLIDADO',obj.CONSOLIDADOR_MATRICULA,obj.CONSOLIDADOR_NOME,batt,comp,pkg);
  closeRcoDraft_(reportId);
  return {ok:true,message:old?'RCO retificado; origens e operações atualizadas.':'RCO consolidado; origens e operações registradas.',reportId:reportId,version:version};
  }finally{lock.releaseLock();}
}
function audit_(tipo,id,versao,acao,mat,nome,batt,comp,snapshot) {
  append_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES'),{AUDITORIA_ID:uid_('audit'),TIPO_ENTIDADE:tipo,ENTIDADE_ID:id,VERSAO:versao,DATA_HORA:nowIso_(),ACAO:acao,
    RESPONSAVEL_MATRICULA:normMat_(mat||''),RESPONSAVEL_NOME:nome||'',BATALHAO:batt||'',COMPANHIA:comp||'',SNAPSHOT_JSON:JSON.stringify(snapshot||{}).slice(0,45000),
    HASH:hash_(JSON.stringify(snapshot||{})),ORIGEM:'CENTRAL_V10'});
}
