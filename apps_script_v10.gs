/**
 * CENTRAL DE RELATÓRIOS BPTran/BPRv — Backend complementar v10
 *
 * Implantação:
 * 1. Crie/abra um projeto do Google Apps Script.
 * 2. Cole este arquivo como Code.gs.
 * 3. Em Propriedades do script, defina:
 *      CENTRAL_TOKEN = chave operacional dos módulos
 *      P3_TOKEN      = chave exclusiva da Gestão P3
 * 4. Implantar > Aplicativo da Web > Executar como proprietário > acesso conforme política institucional.
 * 5. Substitua CENTRAL_CLOUD_ENDPOINT, no front-end, pela URL /exec da implantação.
 *
 * O banco P3 e o banco do Checklist ficam separados por decisão de arquitetura.
 */

var CENTRAL_V10_VERSION = '10.3.0';
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
    } else if (action === 'rsd-get') {
      assertToken_(p.token, 'central');
      out = {ok:true, rsd:rsdGet_(p.reportId)};
    } else if (action === 'passagens-pendentes') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:passagensPendentes_(p)};
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
    } else if (action === 'motomecanizacao-list') {
      assertToken_(p.token, 'p3');
      out = motomecanizacaoList_(p);
    } else if (action === 'checklist-list') {
      assertToken_(p.token, 'p3');
      out = checklistList_(p);
    } else {
      throw new Error('Ação GET não reconhecida: ' + action);
    }
    return jsonp_(out, p.callback);
  } catch (err) {
    return jsonp_({ok:false, message:String(err && err.message || err)}, ((e||{}).parameter||{}).callback);
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
    if (action === 'rsd-upsert') {
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
    } else if (action === 'rco-upsert') {
      assertToken_(token, 'p3');
      out = rcoSupplementalUpsert_(payload);
    } else {
      throw new Error('Ação POST não reconhecida: ' + action);
    }
    return postMessagePage_(action, out);
  } catch (err) {
    return postMessagePage_(action, {ok:false, message:String(err && err.message || err)});
  }
}

/* =========================
   Núcleo
   ========================= */

function assertToken_(token, kind) {
  var props = PropertiesService.getScriptProperties();
  var central = String(props.getProperty('CENTRAL_TOKEN') || '');
  var p3 = String(props.getProperty('P3_TOKEN') || central || '');
  var expected = kind === 'p3' ? p3 : central;
  if (!expected) throw new Error('Backend não configurado: defina CENTRAL_TOKEN e P3_TOKEN nas Propriedades do script.');
  if (String(token || '') !== expected) throw new Error('Chave inválida.');
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
function postMessagePage_(action, obj) {
  var data=JSON.stringify(Object.assign({source:'central-p3-v10',action:action},obj||{})).replace(/</g,'\\u003c');
  var html='<!doctype html><meta charset="utf-8"><title>Central</title><style>body{font:14px Arial;padding:24px;color:#17375e}.ok{color:#176b3a}.err{color:#9d1d36}</style>'+
    '<p class="'+((obj||{}).ok===false?'err':'ok')+'">'+escapeHtml_((obj||{}).message||((obj||{}).ok===false?'Falha.':'Operação concluída.'))+'</p>'+
    '<script>(function(){var d='+data+';try{if(window.opener)window.opener.postMessage(d,"*");if(window.parent&&window.parent!==window)window.parent.postMessage(d,"*");}catch(e){}setTimeout(function(){try{window.close()}catch(e){}},700)})();<\/script>';
  return HtmlService.createHtmlOutput(html);
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
function saveJsonPayload_(reportId, version, json) {
  if (String(json||'').length <= 45000) return {json:json,fileId:'',fileUrl:''};
  var file=folderFor_('RSD_PAYLOAD_FOLDER_ID','Central RSD - Payloads').createFile(
    Utilities.newBlob(json,'application/json',String(reportId)+'-v'+version+'.json')
  );
  return {json:'',fileId:file.getId(),fileUrl:file.getUrl()};
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
    RESPONSAVEL:op.responsavel||'',DESCRICAO_APOIO:p.descricaoApoio||'',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_(),RSD_REPORT_ID:old&&old.RSD_REPORT_ID||'',
    RCO_REPORT_ID:old&&old.RCO_REPORT_ID||'',STATUS_REGISTRO:'OPERACAO_FINALIZADA',VERSAO_ORIGEM:version
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

/* =========================
   RSD em nuvem
   ========================= */

function rsdUpsert_(payload) {
  var r=payload.rsd||payload||{}, reportId=String(r.reportId||'');
  if(!reportId) throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD'), old=findOne_(s,'REPORT_ID',reportId);
  var version=Math.max(Number(r.versao||r.version||0), old?Number(old.VERSAO||0)+1:1);
  var u=r.unidade||{}, g=r.guarnicao||{}, json=JSON.stringify(r);
  var saved=saveJsonPayload_(reportId,version,json);
  var batt=normBattalion_(u.batalhao||u.batalhaoSigla||'BPTran'), comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var obj={
    REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,
    GUARNICAO:g.nome||'',TURNO:g.turno||r.turno||'',STATUS:'FINALIZADO',
    RESPONSAVEL_MATRICULA:normMat_(g.matricula||r.matriculaResponsavel||''),
    RESPONSAVEL_POSTO_GRAD:g.postoGrad||'',RESPONSAVEL_NOME:g.responsavel||'',
    INICIADO_EM:old&&old.INICIADO_EM||r.iniciadoEm||'',FINALIZADO_EM:nowIso_(),
    RETIFICADO_EM:old?nowIso_():'',CANCELADO_EM:'',RCO_REPORT_ID:old&&old.RCO_REPORT_ID||'',INCLUIDO_RCO_EM:old&&old.INCLUIDO_RCO_EM||'',
    PAYLOAD_JSON:saved.json,SCHEMA_VERSION:r.schemaVersion||2,SINCRONIZADO_EM:nowIso_(),ORIGEM:'RSD_WEB',OBSERVACOES:r.observacoes||'',
    PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json)
  };
  upsert_(s,'REPORT_ID',reportId,obj);

  deleteWhere_(sheet_(P3_SHEET_ID,'RSD_VIATURAS'),'RSD_REPORT_ID',reportId);
  var vs=r.viaturas||[];
  if(!Array.isArray(vs)) vs=[];
  if(!vs.length && g.viatura) vs=[{prefixo:g.viatura}];
  var sv=sheet_(P3_SHEET_ID,'RSD_VIATURAS');
  vs.forEach(function(v,i){
    if(typeof v==='string') v={prefixo:v};
    append_(sv,{REGISTRO_ID:uid_('vtr-rsd'),RSD_REPORT_ID:reportId,VIATURA_ID:v.viaturaId||'',
      PREFIXO:v.prefixo||v.viatura||'',PLACA:v.placa||'',MARCA_MODELO:v.marcaModelo||'',TIPO:v.tipo||'',ORDEM:i+1,
      ORIGEM:v.origem||'RSD',REGISTRADO_EM:nowIso_()});
  });

  syncRsdOperations_(r, reportId, batt, comp, version);
  audit_('RSD',reportId,version,old?'RETIFICADO':'FINALIZADO',obj.RESPONSAVEL_MATRICULA,obj.RESPONSAVEL_NOME,batt,comp,r);
  return {ok:true,message:old?'RSD retificado e disponibilizado para consolidação.':'RSD finalizado e disponibilizado para consolidação.',reportId:reportId,version:version};
}
function rsdList_(p) {
  var list=objects_(sheet_(P3_SHEET_ID,'RSD')), batt=p.batalhao?normBattalion_(p.batalhao):'', comp=p.companhia||'', data=dateText_(p.data||'');
  return list.filter(function(x){
    if(String(x.STATUS)!=='FINALIZADO' && String(x.STATUS)!=='INCLUIDO_RCO') return false;
    if(batt && String(x.BATALHAO)!==batt) return false;
    if(comp && String(x.COMPANHIA)!==String(comp)) return false;
    if(data && dateText_(x.DATA_SERVICO)!==data) return false;
    return true;
  }).map(function(x){return {reportId:x.REPORT_ID,version:Number(x.VERSAO||1),data:x.DATA_SERVICO,batalhao:x.BATALHAO,companhia:x.COMPANHIA,guarnicao:x.GUARNICAO,status:x.STATUS,responsavel:x.RESPONSAVEL_NOME,matricula:x.RESPONSAVEL_MATRICULA,finalizadoEm:x.FINALIZADO_EM,rcoReportId:x.RCO_REPORT_ID};});
}
function rsdGet_(reportId) {
  var row=findOne_(sheet_(P3_SHEET_ID,'RSD'),'REPORT_ID',reportId);
  if(!row) throw new Error('RSD não localizado.');
  var p=loadJsonPayload_(row);
  if(!p || !Object.keys(p).length) throw new Error('Conteúdo do RSD indisponível.');
  p.versao=Number(row.VERSAO||1);
  return p;
}
function rsdMarkIncluded_(payload) {
  var ids=payload.rsdReportIds||payload.reportIds||[];
  if(!Array.isArray(ids))ids=[];
  if(payload.reportId)ids.unshift(payload.reportId);
  ids=ids.filter(Boolean);
  if(!ids.length)throw new Error('Nenhum RSD informado.');
  var rcoId=String(payload.rcoReportId||''),s=sheet_(P3_SHEET_ID,'RSD'),count=0;
  ids.forEach(function(reportId){
    var row=findOne_(s,'REPORT_ID',String(reportId));
    if(!row)return;
    row.STATUS='INCLUIDO_RCO';row.RCO_REPORT_ID=rcoId;row.INCLUIDO_RCO_EM=nowIso_();row.SINCRONIZADO_EM=nowIso_();
    upsert_(s,'REPORT_ID',String(reportId),row);count++;
  });
  return {ok:true,message:count+' RSD(s) marcado(s) como incluído(s).',quantidade:count,rcoReportId:rcoId};
}
function syncRsdOperations_(r, reportId, batt, comp, version) {
  var ops=r.operacoes||[]; if(!Array.isArray(ops)) return;
  var s=sheet_(P3_SHEET_ID,'OPERACOES'), pod=sheet_(P3_SHEET_ID,'POD_EXECUCAO');
  ops.forEach(function(o){
    var id=String(o.id||o.reportId||uid_('op'));
    var gu=(r.guarnicao||{}).nome||'';
    var obj={REGISTRO_ID:id,REPORT_ID:reportId,DATA:dateText_((r.servico||{}).data),TURNO:o.turno||'',BATALHAO:batt,COMPANHIA:comp,
      GUARNICAO_RESPONSAVEL:gu,OPERACAO:o.nome||o.operacao||'',LOCAL:o.local||'',VTRS:(r.viaturas||[]).map(function(v){return typeof v==='string'?v:(v.prefixo||'');}).filter(Boolean).join(' / '),
      REMOCOES_AUTOMOVEIS:Number(o.apreensoesVeiculos||0),PRISOES:Number(o.prisoes||0),ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_(),
      RSD_REPORT_ID:reportId,RCO_REPORT_ID:'',STATUS_REGISTRO:'RSD_FINALIZADO',VERSAO_ORIGEM:version};
    upsert_(s,'REGISTRO_ID',id,obj);
    upsert_(pod,'REGISTRO_ID',id,{REGISTRO_ID:id,REPORT_ID:reportId,DATA:dateText_((r.servico||{}).data),BATALHAO:batt,COMPANHIA:comp,GUARNICAO:gu,
      OPERACAO:o.nome||'',TURNO:o.turno||'',STATUS_CUMPRIMENTO:o.statusCumprimento||'Não informado',LOCAL_PREVISTO:o.localPrevisto||'',
      COORDENADAS_PREVISTAS:o.coordenadasPrevistas||'',LOCAL_EXECUTADO:o.local||'',COORDENADAS_EXECUTADAS:o.coordenadas||'',
      HOUVE_ALTERACAO:['Executado em local diverso','Executado parcialmente','Não executado'].indexOf(o.statusCumprimento)>=0?'SIM':'NÃO',
      MOTIVO_ALTERACAO:o.motivoAlteracao||'',ORIGEM_RELATORIO:'RSD',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_()});
  });
}

/* =========================
   Passagem de serviço
   ========================= */

function passagemPublicar_(payload) {
  var p=payload.passagem||payload||{}, id=p.passagemId||uid_('passagem');
  var u=p.unidade||{}, batt=normBattalion_(u.batalhao), comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var obj={PASSAGEM_ID:id,RSD_ORIGEM_ID:p.rsdOrigemId||'',RSD_DESTINO_ID:'',DATA_SERVICO:dateText_(p.dataServico),BATALHAO:batt,COMPANHIA:comp,
    GUARNICAO:(p.guarnicao||{}).nome||p.guarnicao||'',TURNO_ORIGEM:p.turnoOrigem||'',ENTREGUE_POR_MATRICULA:normMat_(p.entreguePorMatricula||(p.entreguePor||{}).matricula||''),
    ENTREGUE_POR_NOME:p.entreguePorNome||(p.entreguePor||{}).nome||'',DISPONIBILIZADA_EM:nowIso_(),STATUS:'AGUARDANDO_RECEBIMENTO',
    RECEBIDA_POR_MATRICULA:'',RECEBIDA_POR_NOME:'',RECEBIDA_EM:'',VTRS_JSON:JSON.stringify(p.viaturas||[]),
    ALTERACOES_VTR_JSON:JSON.stringify(p.alteracoesVtr||p.alteracoesViatura||[]),MATERIAIS_JSON:JSON.stringify(p.materiais||[]),PENDENCIAS_JSON:JSON.stringify(p.pendencias||[]),
    OBSERVACOES:p.observacoes||'',ATUALIZADO_EM:nowIso_()};
  upsert_(sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),'PASSAGEM_ID',id,obj);
  return {ok:true,message:'Passagem de serviço disponibilizada.',passagemId:id};
}
function passagensPendentes_(p) {
  var batt=p.batalhao?normBattalion_(p.batalhao):'', comp=p.companhia||'', gu=String(p.guarnicao||'').toLowerCase();
  return objects_(sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO')).filter(function(x){
    if(String(x.STATUS)!=='AGUARDANDO_RECEBIMENTO') return false;
    if(batt && String(x.BATALHAO)!==batt) return false;
    if(comp && String(x.COMPANHIA)!==String(comp)) return false;
    if(gu && String(x.GUARNICAO||'').toLowerCase()!==gu) return false;
    return true;
  }).map(function(x){x.VTRS=parseJson_(x.VTRS_JSON,[]);x.PENDENCIAS=parseJson_(x.PENDENCIAS_JSON,[]);return x;});
}
function passagemReceber_(payload) {
  var id=String(payload.passagemId||''), s=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'), row=findOne_(s,'PASSAGEM_ID',id);
  if(!row) throw new Error('Passagem não localizada.');
  row.STATUS='RECEBIDA';row.RSD_DESTINO_ID=payload.rsdDestinoId||'';var ator=payload.recebidoPor||{};row.RECEBIDA_POR_MATRICULA=normMat_(payload.matricula||payload.recebidaPorMatricula||ator.matricula||'');
  row.RECEBIDA_POR_NOME=payload.nome||payload.recebidaPorNome||ator.nome||'';row.RECEBIDA_EM=nowIso_();row.ATUALIZADO_EM=nowIso_();
  upsert_(s,'PASSAGEM_ID',id,row);
  return {ok:true,message:'Recebimento do serviço registrado.'};
}

/* =========================
   CIRVC — continuidade de custódia
   ========================= */

function cirvcRegister_(payload) {
  var list=payload.cirvcs||[], u=payload.unidade||{};
  if(!Array.isArray(list)) list=[];
  var s=sheet_(P3_SHEET_ID,'CIRVC_CUSTODIA'), count=0;
  list.forEach(function(c){
    var id=String(c.id||c.cirvcId||c.registroId||uid_('cirvc')), old=findOne_(s,'CIRVC_ID',id);
    var batt=normBattalion_((c.unidade||u).batalhao), comp=(c.unidade||u).companhia||normCompany_(batt,(c.unidade||u).companhiaNumero);
    var obj={CIRVC_ID:id,RSD_REPORT_ID:c.rsdReportId||'',RCO_REPORT_ID:c.rcoReportId||'',DATA_CADASTRO:dateText_(c.data||new Date()),
      BATALHAO:batt,COMPANHIA:comp,GUARNICAO:c.guarnicao||'',PLACA:String(c.placaUf||c.placa||'').toUpperCase(),TIPO:c.tipo||'',MARCA_MODELO:c.marcaModelo||'',
      PREFIXO_ORIGEM:c.prefixo||c.vtr||'',CADASTRADO_POR_MATRICULA:normMat_(c.matriculaResponsavel||''),CADASTRADO_POR_NOME:c.responsavelCirvc||'',
      LOCAL_CUSTODIA:c.local||c.localDestino||'',STATUS_CUSTODIA:old&&old.STATUS_CUSTODIA||'AGUARDANDO_TRANSPORTE',TRANSPORTE_ID:old&&old.TRANSPORTE_ID||'',
      ATUALIZADO_EM:nowIso_(),BAIXADO_EM:old&&old.BAIXADO_EM||'',DESTINO_FINAL:old&&old.DESTINO_FINAL||'',RECEBEDOR_NOME:old&&old.RECEBEDOR_NOME||'',
      RECEBEDOR_IDENTIFICACAO:old&&old.RECEBEDOR_IDENTIFICACAO||''};
    upsert_(s,'CIRVC_ID',id,obj);count++;
  });
  return {ok:true,message:count+' CIRVC(s) disponibilizado(s) para continuidade da custódia.',quantidade:count};
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
  var items=objects_(sheet_(P3_SHEET_ID,'CIRVC_TRANSPORTE_ITENS')).filter(function(x){return String(x.TRANSPORTE_ID)===String(id);});
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
  var obj={CHECKLIST_ID:id,DATA_SERVICO:dateText_(parts[0]),HORA_INICIO:(parts[1]||'').slice(0,5),BATALHAO:batt,COMPANHIA:comp,
    VIATURA_ID:v.viaturaId||c.viaturaId||'',PREFIXO:v.prefixo||c.prefixo||'',PLACA:v.placa||c.placa||'',MARCA_MODELO:v.marcaModelo||c.marcaModelo||'',
    CONDUTOR_MATRICULA:normMat_(c.condutorMatricula||''),CONDUTOR_NOME:c.condutorNome||'',TURNO:c.turno||'',LOCAL_INSPECAO:c.local||'',
    KM_INICIAL:c.km||'',STATUS_GERAL:alter.length?'COM_ALTERACAO':'SEM_ALTERACAO',QTD_ALTERACOES:alter.length,CRIADO_EM:c.criadoEm||now,
    FINALIZADO_EM:now,VERSAO:c.versao||1,ORIGEM:'CENTRAL_RELATORIOS',ASSINATURA_URL:'',OBSERVACOES:c.observacoes||''};
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
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',di=dateText_(p.dataInicio||p.inicio||''),df=dateText_(p.dataFim||p.fim||'');
  return list.filter(function(x){
    if(batt&&String(x.BATALHAO)!==batt)return false;
    if(comp&&String(x.COMPANHIA)!==String(comp))return false;
    var d=dateText_(x.DATA_SERVICO||x.DATA||x.DATA_HORA||x.ABERTA_EM||'');
    if(di&&d&&d<di)return false;if(df&&d&&d>df)return false;
    return true;
  });
}
function p3Query_(p) {
  var view=String(p.view||'controle-diario'), list;
  if(view==='controle-diario'){
    var rsd=filterCommon_(objects_(sheet_(P3_SHEET_ID,'RSD')),p),rco=filterCommon_(objects_(sheet_(P3_SHEET_ID,'RCO')),p);
    return {ok:true,rsd:rsd.slice(-1000).reverse(),rco:rco.slice(-500).reverse()};
  }
  if(view==='produtividade'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'PRODUCAO')),p);}
  else if(view==='operacoes'){list=filterCommon_(objects_(sheet_(P3_SHEET_ID,'OPERACOES')),p);}
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

/* O backend estatístico principal já recebe o pacote completo do RCO.
   Esta ação complementar preserva origens, auditoria e garante que cada
   operação continue individualizada após a consolidação. */
function rcoSupplementalUpsert_(payload) {
  var pkg=payload.rco||payload||{}, rco=pkg.rco||pkg, reportId=String((rco||{}).reportId||pkg.reportId||'');
  if(!reportId) throw new Error('RCO sem REPORT_ID.');
  var old=findOne_(sheet_(P3_SHEET_ID,'RCO'),'REPORT_ID',reportId);
  var u=pkg.unidade||rco.unidade||{}, batt=normBattalion_(u.batalhao||pkg.batalhao),comp=u.companhia||pkg.companhia||normCompany_(batt,u.companhiaNumero);
  var cons=rco.consolidacaoResponsavel||{};
  var obj={REPORT_ID:reportId,DATA_SERVICO:dateText_((rco.periodo||{}).inicio||rco.data||''),BATALHAO:batt,COMPANHIA:comp,
    INICIO:(rco.periodo||{}).inicio||'',TERMINO:(rco.periodo||{}).fim||'',HORARIO_SERVICO:rco.horarioServico||'',SCHEMA_VERSION:pkg.schemaVersion||rco.schemaVersion||2,
    GERADO_EM:rco.generatedAt||'',ENVIADO_EM:nowIso_(),RETIFICADO_EM:old?nowIso_():'',STATUS:'ATIVO',
    QUANTIDADE_GUARNICOES:(rco.rcoOrigens||[]).length||'',OBSERVACOES:rco.observacoes||'',ORIGEM:'RCO',
    MODO_CONSOLIDACAO:rco.semGuarnicaoCpu?'SEM_CPU':'CPU',CONSOLIDADOR_MATRICULA:normMat_(cons.matricula||''),CONSOLIDADOR_POSTO_GRAD:cons.postoGrad||'',
    CONSOLIDADOR_NOME:cons.nome||'',CONSOLIDADOR_TURNO:cons.turno||''};
  upsert_(sheet_(P3_SHEET_ID,'RCO'),'REPORT_ID',reportId,obj);
  deleteWhere_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'),'RCO_REPORT_ID',reportId);
  (rco.rcoOrigens||[]).forEach(function(o){append_(sheet_(P3_SHEET_ID,'RCO_ORIGENS'),{REGISTRO_ID:uid_('orig'),RCO_REPORT_ID:reportId,RSD_REPORT_ID:o.rsdReportId||'',
    GUARNICAO:o.guarnicao||'',VERSAO_RSD:o.versao||'',STATUS_ORIGEM:o.status||'INCLUIDO',ADICIONADO_EM:o.adicionadoEm||nowIso_(),ATUALIZADO_EM:nowIso_(),CONSOLIDADOR_MATRICULA:obj.CONSOLIDADOR_MATRICULA});});
  var ops=pkg.operacoesCompletas||rco.operacoes||[];
  ops.forEach(function(o){var id=String(o.reportId||o.id||uid_('op'));var row=findOne_(sheet_(P3_SHEET_ID,'OPERACOES'),'REGISTRO_ID',id)||{};
    row.REGISTRO_ID=id;row.REPORT_ID=reportId;row.RCO_REPORT_ID=reportId;row.RSD_REPORT_ID=row.RSD_REPORT_ID||o.rsdReportId||'';row.DATA=row.DATA||dateText_(obj.DATA_SERVICO);
    row.BATALHAO=batt;row.COMPANHIA=comp;row.GUARNICAO_RESPONSAVEL=row.GUARNICAO_RESPONSAVEL||o.guarnicao||'';row.OPERACAO=row.OPERACAO||((o.operacao||{}).nome)||o.nome||'';
    row.TURNO=row.TURNO||((o.operacao||{}).turno)||o.turno||'';row.LOCAL=row.LOCAL||((o.local||{}).descricao)||o.local||'';row.LATITUDE=row.LATITUDE||((o.local||{}).latitude)||'';
    row.LONGITUDE=row.LONGITUDE||((o.local||{}).longitude)||'';row.STATUS_REGISTRO='CONSOLIDADO';row.VERSAO_ORIGEM=Number(row.VERSAO_ORIGEM||1);row.ENVIADO_EM=nowIso_();
    upsert_(sheet_(P3_SHEET_ID,'OPERACOES'),'REGISTRO_ID',id,row);
  });
  audit_('RCO',reportId,old?2:1,old?'RETIFICADO':'CONSOLIDADO',obj.CONSOLIDADOR_MATRICULA,obj.CONSOLIDADOR_NOME,batt,comp,pkg);
  return {ok:true,message:old?'RCO retificado; origens e operações atualizadas.':'RCO consolidado; origens e operações registradas.',reportId:reportId};
}
function audit_(tipo,id,versao,acao,mat,nome,batt,comp,snapshot) {
  append_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES'),{AUDITORIA_ID:uid_('audit'),TIPO_ENTIDADE:tipo,ENTIDADE_ID:id,VERSAO:versao,DATA_HORA:nowIso_(),ACAO:acao,
    RESPONSAVEL_MATRICULA:normMat_(mat||''),RESPONSAVEL_NOME:nome||'',BATALHAO:batt||'',COMPANHIA:comp||'',SNAPSHOT_JSON:JSON.stringify(snapshot||{}).slice(0,45000),
    HASH:hash_(JSON.stringify(snapshot||{})),ORIGEM:'CENTRAL_V10'});
}
