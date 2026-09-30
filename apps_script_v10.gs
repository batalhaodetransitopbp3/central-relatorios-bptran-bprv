/**
 * CENTRAL DE RELATÓRIOS BPTran/BPRv — Backend complementar v10
 *
 * Implantação:
 * 1. Crie/abra um projeto do Google Apps Script.
 * 2. Cole este arquivo como Code.gs.
 * 3. Em Propriedades do script, defina:
 *      SISTEMA_TOKEN = chave exclusiva da Gestão de Sistema
 *      P3_TOKEN      = chave exclusiva da Gestão P3/Oficial
 *      COORD_TOKEN   = chave exclusiva de CPU/Coordenação
 *      CENTRAL_TOKEN = chave operacional dos módulos
 *      O Controle Geral usa senha exclusiva validada por hash SHA-256 no backend.
 * 4. Implantar > Aplicativo da Web > Executar como proprietário > acesso conforme política institucional.
 * 5. Substitua CENTRAL_CLOUD_ENDPOINT, no front-end, pela URL /exec da implantação.
 *
 * O banco P3 e o banco do Checklist ficam separados por decisão de arquitetura.
 */

var CENTRAL_V10_VERSION = '10.8.30';
var MASTER_ADMIN_PASSWORD_SHA256 = 'd291d40f83f21c0cbaba275b44c8d70fad57bdb5f72894d012f19c4bc952ffaf';
var P3_SHEET_ID = '1fNE2hEz4vYjX6r-KmLowswlejkVpj6CeD_2FdNK_keM';
var CHECKLIST_SHEET_ID = '15KvRMVC8ofELZLXGlllMq7h5SkPV5qDcC1qtOVB6jBs';
var CHECKLIST_PHOTO_FOLDER_ID = '13dEydl5Ej4zCW0Z1TNOLxooizF6lx3ZC';
var RSD_PAYLOAD_FOLDER_ID = '13eMc58sdk2uD_6Np-8fvoUq9Dw3Sk3jn';
var CIRVC_SIGNATURE_FOLDER_ID = '1IonmgIFfbeSvkBtDLOnrWJBnbzJ6AMfa';

function handleApiReadViaGet_(action, p) {
  p = p || {};
  action = String(action || 'version');
  var out;

  if (action === 'version') {
    out = {ok:true, version:CENTRAL_V10_VERSION, schema:'central-v10'};
  } else if (action === 'access-open-services') {
      var openModule=String(p.module||'').toUpperCase();
      if(openModule==='RCO') assertToken_(p.token,'coord');
      else if(openModule==='RSD') assertToken_(p.token,'central');
      else throw new Error('Módulo de acesso inválido.');
      out = {ok:true, items:accessOpenServices_(p)};
    } else if (action === 'access-check') {
      var accessModule=String(p.module||'').toUpperCase();
      if(accessModule==='RCO') assertToken_(p.token,'coord'); else if(accessModule==='RSD') assertToken_(p.token,'central'); else throw new Error('Módulo de acesso inválido.');
      out = {ok:true,module:accessModule};
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
    } else if (action === 'service-event-list') {
      assertToken_(p.token, 'central');
      out = {ok:true, items:serviceEventList_(p)};
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
    } else if (action === 'sistema-feedback-list') {
      assertToken_(p.token, 'comando');
      out = sistemaFeedbackList_(p);
    } else if (action === 'sistema-auth') {
      assertToken_(p.token, 'comando');
      out = sistemaAuth_(p);
    } else if (action === 'rco-retification-list') {
      assertToken_(p.token, 'comando');
      out = rcoRetificationList_(p);
    } else if (action === 'rco-draft-dedupe-diagnose') {
      assertToken_(p.token, 'comando');
      out = rcoDraftDedupeDiagnose_(p);
    } else if (action === 'rsd-service-dedupe-diagnose') {
      assertToken_(p.token, 'comando');
      out = rsdServiceDedupeDiagnose_(p);
    } else if (action === 'master-cadastros') {
      assertToken_(p.token, 'master-session');
      out = cadastroSearch_(p);
  } else {
    throw new Error('Ação de consulta não reconhecida: ' + action);
  }
  return out;
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || 'version');
    var out = handleApiReadViaGet_(action, p);
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
    } else if (action === 'service-event-upsert') {
      assertToken_(token, 'central');
      out = serviceEventUpsert_(payload.event||payload);
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
    } else if (action === 'rsd-force-finalize') {
      assertToken_(token, 'coord');
      out = rsdForceFinalize_(payload);
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
    } else if (action === 'comando-rsd-patch' || action === 'sistema-rsd-patch') {
      assertToken_(token, 'comando');
      out = comandoRsdPatch_(payload);
    } else if (action === 'sistema-feedback-enviar') {
      out = sistemaFeedbackEnviar_(payload);
    } else if (action === 'sistema-feedback-list') {
      assertToken_(token, 'comando');
      out = sistemaFeedbackList_(payload||{});
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
    } else if (action === 'rco-retification-request') {
      assertToken_(token, 'rco');
      out = rcoRetificationRequest_(payload);
    } else if (action === 'rco-retification-decide') {
      assertToken_(token, 'comando');
      out = rcoRetificationDecide_(payload);
    } else if (action === 'rco-draft-dedupe-sanitize') {
      assertToken_(token, 'comando');
      out = rcoDraftDedupeSanitize_(payload);
    } else if (action === 'rsd-service-dedupe-sanitize') {
      assertToken_(token, 'comando');
      out = rsdServiceDedupeSanitize_(payload);
    } else if (action === 'rco-retification-open') {
      // Legado: reabertura direta pelo P3 removida. Somente Gestão de Sistema (comando).
      assertToken_(token, 'comando');
      out = rcoRetificationOpenInternal_({
        reportId:payload.reportId,
        motivo:payload.motivo,
        autorMatricula:payload.autorMatricula||payload.matricula,
        autorNome:payload.autorNome||payload.nome,
        autorPerfil:'COMANDO',
        autorPostoGrad:payload.autorPostoGrad||''
      });
    } else if (action === 'rco-upsert') {
      // O RCO usa a credencial validada no ingresso; não pedir nova Chave P3 durante a consolidação.
      assertToken_(token, 'coord');
      out = rcoSupplementalUpsert_(payload);
    } else if (action === 'rco-consolidate-final') {
      assertToken_(token, 'coord');
      out = rcoConsolidateFinal_(payload);
    } else if (action === 'rco-mark-pdf') {
      assertToken_(token, 'coord');
      out = rcoMarkPdf_(payload);
    } else if (action === 'rco-encerrar') {
      assertToken_(token, 'coord');
      out = rcoEncerrar_(payload);
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
    } else if (action === 'access-open-services' || action === 'access-check' || action === 'cadastros' || action === 'guarnicao-next' || action === 'rsd-list' || action === 'rsd-active' || action === 'rsd-get' || action === 'passagens-pendentes' || action === 'operation-list' || action === 'service-event-list' || action === 'rco-draft-list' || action === 'rco-draft-get' || action === 'reboque-list' || action === 'reboque-get' || action === 'cirvc-list' || action === 'cirvc-pending' || action === 'cirvc-transport-list' || action === 'cirvc-transport-get' || action === 'p3-query' || action === 'p3-analysis' || action === 'p3-analysis-compare' || action === 'p3-config' || action === 'motomecanizacao-list' || action === 'checklist-list' || action === 'master-overview' || action === 'master-cadastros' || action === 'sistema-feedback-list' || action === 'sistema-auth' || action === 'rco-retification-list' || action === 'rco-draft-dedupe-diagnose' || action === 'rsd-service-dedupe-diagnose' || action === 'version') {
      var q=Object.assign({},payload||{});
      q.token=token;
      out = handleApiReadViaGet_(action, q);
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
  var comando = String(props.getProperty('SISTEMA_TOKEN') || props.getProperty('COMANDO_TOKEN') || '');
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
  if (kind === 'comando') {
    if (!comando) throw new Error('Backend não configurado: defina SISTEMA_TOKEN nas Propriedades do script.');
    if (token !== comando) throw new Error('Chave da Gestão de Sistema inválida.');
    return true;
  }
  if (kind === 'coord') {
    if (!coord && !comando) throw new Error('Backend não configurado: defina COORD_TOKEN nas Propriedades do script.');
    if (token !== coord && (!p3 || token !== p3) && (!comando || token !== comando)) throw new Error('Chave de Coordenação inválida.');
    return true;
  }
  if (kind === 'rco') {
    if ((!central)&&(!coord)&&(!p3)&&(!comando)) throw new Error('Backend do RCO sem credenciais configuradas.');
    if (token !== central && token !== coord && token !== p3 && token !== comando) throw new Error('Credencial do RCO inválida.');
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

var SPREADSHEET_EXEC_CACHE_ = {};
function ss_(id) {
  id=String(id||'');
  if(!SPREADSHEET_EXEC_CACHE_[id])SPREADSHEET_EXEC_CACHE_[id]=SpreadsheetApp.openById(id);
  return SPREADSHEET_EXEC_CACHE_[id];
}
function sheet_(id, name) {
  var s = ss_(id).getSheetByName(name);
  if (!s) throw new Error('Aba ausente no banco: ' + name);
  return s;
}
function sheetExists_(id, name) {
  return !!ss_(id).getSheetByName(String(name || ''));
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
function objectsFields_(s, fields) {
  var lastRow=s.getLastRow(),lastCol=s.getLastColumn();if(lastRow<2||lastCol<1)return [];
  var h=headers_(s),wanted=(fields||[]).filter(function(k){return h.indexOf(k)>=0}),cols=wanted.map(function(k){return h.indexOf(k)}).sort(function(a,b){return a-b});
  var out=[];for(var r=0;r<lastRow-1;r++)out.push({_row:r+2});if(!cols.length)return out;
  var groups=[],g=null;cols.forEach(function(i){if(!g||i!==g.end+1){g={start:i,end:i};groups.push(g)}else g.end=i;});
  groups.forEach(function(gr){var vals=s.getRange(2,gr.start+1,lastRow-1,gr.end-gr.start+1).getValues();for(var ri=0;ri<vals.length;ri++){for(var ci=gr.start;ci<=gr.end;ci++){var k=h[ci];if(wanted.indexOf(k)>=0)out[ri][k]=vals[ri][ci-gr.start];}}});
  return out;
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
  var h = headers_(s), idx = h.indexOf(field), last = s.getLastRow();
  if (idx < 0 || last < 2) return null;
  var target = String(value), vals = s.getRange(2, idx + 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) !== target) continue;
    var row = i + 2, rowVals = s.getRange(row, 1, 1, h.length).getValues()[0], o = {_row: row};
    h.forEach(function(k, j){ if (k) o[k] = rowVals[j]; });
    return o;
  }
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
  if (Object.prototype.toString.call(v)==='[object Date]') return Utilities.formatDate(v, scriptTz_(),'yyyy-MM-dd');
  var s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  try{
    var d=new Date(s);
    if(!isNaN(d.getTime()))return Utilities.formatDate(d, scriptTz_(),'yyyy-MM-dd');
  }catch(_){}
  return s.slice(0,10);
}
/** Fuso oficial da Central (Paraíba). */
function scriptTz_(){return Session.getScriptTimeZone()||'America/Fortaleza'}
var SERVICE_WINDOW_HOUR_=7;
function addCalendarDaysYmd_(ymd,delta){
  ymd=dateText_(ymd);if(!ymd)return '';
  var p=ymd.split('-'),d=new Date(Date.UTC(Number(p[0]),Number(p[1])-1,Number(p[2])+Number(delta||0)));
  return Utilities.formatDate(d,'UTC','yyyy-MM-dd');
}
/**
 * Janela operacional 07:00→07:00 (America/Fortaleza).
 * operationalDate = dia civil em que a janela começou às 07:00.
 * Ex.: 01/10 06:30 → operationalDate 30/09; 01/10 07:00 → 01/10.
 */
function getServiceWindow_(when){
  var tz=scriptTz_(),now=when;
  if(now==null||now==='')now=new Date();
  if(typeof now==='string'){
    var s=String(now).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      return {operationalDate:s,windowStart:s+'T07:00:00',windowEnd:addCalendarDaysYmd_(s,1)+'T07:00:00',cutoffHour:SERVICE_WINDOW_HOUR_,tz:tz};
    }
    now=new Date(s);
  }else if(typeof now==='number')now=new Date(now);
  if(Object.prototype.toString.call(now)!=='[object Date]'||isNaN(now.getTime()))now=new Date();
  var ymd=Utilities.formatDate(now,tz,'yyyy-MM-dd');
  var hh=Number(Utilities.formatDate(now,tz,'H'))||0;
  var op=hh<SERVICE_WINDOW_HOUR_?addCalendarDaysYmd_(ymd,-1):ymd;
  return {operationalDate:op,windowStart:op+'T07:00:00',windowEnd:addCalendarDaysYmd_(op,1)+'T07:00:00',cutoffHour:SERVICE_WINDOW_HOUR_,tz:tz};
}
function operationalServiceDate_(when){return getServiceWindow_(when).operationalDate}
/** Resolve DATA_SERVICO canônica: prioriza data explícita yyyy-MM-dd; senão deriva de instante (INICIADO_EM/agora). */
function resolveOperationalServiceDate_(explicitDate, instant){
  var d=dateText_(explicitDate);
  if(d)return d;
  return operationalServiceDate_(instant||new Date());
}
function normVehicleTipo_(v){
  var t=String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  if(!t)return '';
  if(/MOTO|MOTONETA|CICLOMOTOR/.test(t))return 'MOTOCICLETA';
  if(/GUINCHO|REMOCAO|AGRALE|CAMINHAO_GUINCHO/.test(t))return 'GUINCHO';
  if(/\bREBOQUE\b|SEMI[\s_-]?REBOQUE|TRAILER|CARRETA/.test(t)){
    if(/GUINCHO|CAMINH|CAMION|AGRALE|REMOCAO/.test(t))return 'GUINCHO';
    return 'REBOQUE';
  }
  if(/AUTO|CAMION|CAMINH|VTR|VIATURA|UTILIT|SUV|PICK/.test(t))return 'AUTOMOVEL';
  if(t==='GUINCHO'||t==='CAMINHAO_GUINCHO')return 'GUINCHO';
  if(t==='REBOQUE')return 'REBOQUE';
  if(t==='MOTOCICLETA')return 'MOTOCICLETA';
  if(t==='AUTOMOVEL')return 'AUTOMOVEL';
  return t;
}
/** Espelha checklist_profiles.js — material operacional não abre ALTERACAO. */
function checklistItemGeraMotomec_(itemId){
  var id=String(itemId||'');
  var material={'radio':1,'coletes':1,'cones':1,'lombada':1,'bastao':1,'kit_primeiros_socorros':1,'limpeza_interna':1,'limpeza_externa':1};
  if(material[id])return false;
  return true;
}
function checklistShouldOpenAlteracao_(it){
  var sit=String((it&&it.situacao)||'').toUpperCase();
  if(['SIM','OK','NA','N/A'].indexOf(sit)>=0)return false;
  var negatives=['NAO','DEFEITO','AVARIA','BAIXO','BAIXA','AUSENTE'];
  if(negatives.indexOf(sit)<0)return false;
  if(it&&(it.abrirAlteracaoMotomec===false||it.abrirAlteracaoMotomec==='false'||it.geraPendenciaMotomec===false||it.geraPendenciaMotomec==='false'))return false;
  if(it&&(it.abrirAlteracaoMotomec===true||it.abrirAlteracaoMotomec==='true'))return true;
  if(it&&it.geraPendenciaMotomec===true)return negatives.indexOf(sit)>=0;
  return checklistItemGeraMotomec_(it&&it.itemId)&&negatives.indexOf(sit)>=0;
}
function lookupViaturaTipo_(prefixo){
  var p=normVtrPrefix_(prefixo);if(!p)return '';
  var row=findOne_(sheet_(P3_SHEET_ID,'VIATURAS'),'PREFIXO',p)||findOne_(sheet_(CHECKLIST_SHEET_ID,'VIATURAS'),'PREFIXO',p);
  return row?normVehicleTipo_(row.TIPO||row.TIPO_VEICULO||''):'';
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
  var tipo=String(p.tipo||'militar').toLowerCase(), qRaw=String(p.q||'').trim(), q=qRaw.toLowerCase();
  var qMat=normMat_(qRaw), qDigits=String(qRaw).replace(/\D/g,'');
  var name=tipo.indexOf('viat')===0?'VIATURAS':'MILITARES';
  var list=objects_(sheet_(P3_SHEET_ID,name));
  var b=p.batalhao?normBattalion_(p.batalhao):'', comp=p.companhia?String(p.companhia):'';
  list=list.filter(function(x){
    if (b && String(x.BATALHAO)!==b) return false;
    if (comp && x.COMPANHIA && String(x.COMPANHIA)!==comp) return false;
    if (!q) return true;
    if (name==='MILITARES') {
      var mat=normMat_(x.MATRICULA||x.matricula||'');
      if (qMat && mat===qMat) return true;
      if (qDigits.length>=5 && String(x.MATRICULA||'').replace(/\D/g,'').indexOf(qDigits)>=0) return true;
    }
    var hay=Object.keys(x).map(function(k){return String(x[k]||'');}).join(' ').toLowerCase();
    return hay.indexOf(q)>=0 || (qDigits.length>=5 && hay.replace(/\D/g,'').indexOf(qDigits)>=0);
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
   Eventos cronológicos do serviço
   ========================= */
function serviceEventSheet_(){
  return sheetOrCreate_(P3_SHEET_ID,'SERVICE_EVENTOS',[
    'EVENT_ID','SERVICE_ID','RSD_REPORT_ID','SEGMENTO','TIPO','SUBTIPO','DATA_EVENTO','HORA_EVENTO',
    'TITULO','RESUMO','REFERENCIA_ID','NUMERO_DOCUMENTO','BATALHAO','COMPANHIA','GUARNICAO',
    'VTR','COMANDANTE_MATRICULA','STATUS','CRIADO_EM','ATUALIZADO_EM','PAYLOAD_JSON'
  ]);
}
function serviceEventUpsert_(event){
  var e=event||{},sid=String(e.serviceId||''),rid=String(e.rsdReportId||''),tipo=String(e.tipo||'').trim().toUpperCase();
  if(!sid&&!rid)throw new Error('Evento sem vínculo com o serviço.');
  if(!tipo)throw new Error('Informe o tipo do evento.');
  var ref=String(e.referenciaId||e.referenceId||''),eid=String(e.eventId||'');
  if(!eid)eid=[sid||rid,tipo,ref||uid_('evt')].filter(Boolean).join('::');
  var s=serviceEventSheet_(),old=findOne_(s,'EVENT_ID',eid),now=nowIso_(),u=e.unidade||{};
  var batt=normBattalion_(e.batalhao||u.batalhao||old&&old.BATALHAO||''),comp=e.companhia||u.companhia||old&&old.COMPANHIA||'';
  var payload=e.payload||e.dados||{};
  var row={
    EVENT_ID:eid,SERVICE_ID:sid||old&&old.SERVICE_ID||'',RSD_REPORT_ID:rid||old&&old.RSD_REPORT_ID||'',
    SEGMENTO:Number(e.segmento||old&&old.SEGMENTO||0)||'',TIPO:tipo,SUBTIPO:String(e.subtipo||old&&old.SUBTIPO||''),
    DATA_EVENTO:dateText_(e.data||e.dataEvento||old&&old.DATA_EVENTO||new Date()),HORA_EVENTO:String(e.hora||e.horaEvento||old&&old.HORA_EVENTO||''),
    TITULO:String(e.titulo||old&&old.TITULO||tipo),RESUMO:String(e.resumo||old&&old.RESUMO||''),REFERENCIA_ID:ref||old&&old.REFERENCIA_ID||'',
    NUMERO_DOCUMENTO:String(e.numeroDocumento||e.numero||old&&old.NUMERO_DOCUMENTO||''),BATALHAO:batt,COMPANHIA:comp,
    GUARNICAO:String(e.guarnicao||old&&old.GUARNICAO||''),VTR:String(e.vtr||old&&old.VTR||''),
    COMANDANTE_MATRICULA:normMat_(e.comandanteMatricula||old&&old.COMANDANTE_MATRICULA||''),STATUS:String(e.status||old&&old.STATUS||'ATIVO'),
    CRIADO_EM:old&&old.CRIADO_EM||now,ATUALIZADO_EM:now,PAYLOAD_JSON:JSON.stringify(payload||{})
  };
  upsert_(s,'EVENT_ID',eid,row);
  return {ok:true,eventId:eid,message:old?'Evento do serviço atualizado.':'Evento do serviço registrado.',updatedAt:now};
}
function serviceEventList_(p){
  var sid=String(p.serviceId||''),rid=String(p.rsdReportId||''),seg=Number(p.segmento||0)||0;
  return objects_(serviceEventSheet_()).filter(function(x){
    if(sid&&String(x.SERVICE_ID||'')!==sid)return false;
    if(!sid&&rid&&String(x.RSD_REPORT_ID||'')!==rid)return false;
    if(seg&&Number(x.SEGMENTO||0)!==seg)return false;
    if(String(x.STATUS||'').toUpperCase()==='CANCELADO')return false;
    return true;
  }).map(function(x){
    return {eventId:x.EVENT_ID||'',serviceId:x.SERVICE_ID||'',rsdReportId:x.RSD_REPORT_ID||'',segmento:Number(x.SEGMENTO||0)||'',
      tipo:x.TIPO||'',subtipo:x.SUBTIPO||'',data:dateText_(x.DATA_EVENTO),hora:x.HORA_EVENTO||'',titulo:x.TITULO||'',resumo:x.RESUMO||'',
      referenciaId:x.REFERENCIA_ID||'',numeroDocumento:x.NUMERO_DOCUMENTO||'',batalhao:x.BATALHAO||'',companhia:x.COMPANHIA||'',
      guarnicao:x.GUARNICAO||'',vtr:x.VTR||'',comandanteMatricula:x.COMANDANTE_MATRICULA||'',criadoEm:x.CRIADO_EM||'',atualizadoEm:x.ATUALIZADO_EM||'',
      payload:parseJson_(x.PAYLOAD_JSON,{})};
  }).sort(function(a,b){
    var ak=[a.data||'',a.hora||'',a.criadoEm||''].join(' '),bk=[b.data||'',b.hora||'',b.criadoEm||''].join(' ');
    return ak.localeCompare(bk);
  });
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
  var coord=splitCoords_(loc.coordenadas);
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
    STATUS_CUMPRIMENTO:pod.statusCumprimento||'',LOCAL_PREVISTO:pod.localPrevisto||'',
    LOCAL_EXECUTADO:loc.descricao||'',COORDENADAS_EXECUTADAS:loc.coordenadas||'',HORA_INICIO:op.horaInicio||'',HORA_FIM:op.horaFim||'',
    HOUVE_ALTERACAO:changed?'SIM':'NÃO',MOTIVO_ALTERACAO:pod.motivoAlteracao||'',ORIGEM_RELATORIO:'OPERACAO',ORIGEM_REGISTRO_ID:id,ENVIADO_EM:nowIso_()
  });
  audit_('OPERACAO',id,version,old?'RETIFICADA':'FINALIZADA','',op.responsavel||'',batt,comp,p);
  if(row.SERVICE_ID||row.RSD_REPORT_ID){
    var eventTotalAits=Number((p.resumoCpu||{}).totalAits||0)||Number(row.ART_165||0)+Number(row.ART_165_A||0)+Number(row.ART_230_XI||0)+Number(row.OUTROS_AITS_COM_ABORDAGEM||0)+Number(row.AITS_SEM_ABORDAGEM||0);
    serviceEventUpsert_({eventId:(row.SERVICE_ID||row.RSD_REPORT_ID)+'::OPERACAO::'+id,serviceId:row.SERVICE_ID,rsdReportId:row.RSD_REPORT_ID,segmento:row.SEGMENTO,
      tipo:'OPERACAO',subtipo:op.nome||'',data:op.data,hora:op.horaFim||op.horaInicio||'',titulo:op.nome||'Operação',
      resumo:[loc.descricao||'',eventTotalAits?'AITs: '+eventTotalAits:''].filter(Boolean).join(' • '),referenciaId:id,batalhao:batt,companhia:comp,
      guarnicao:op.guarnicoes||'',vtr:op.vtrs||'',comandanteMatricula:row.COMANDANTE_MATRICULA,
      payload:{nome:op.nome||'',turno:op.turno||'',horaInicio:op.horaInicio||'',horaFim:op.horaFim||'',local:loc.descricao||'',resumoCpu:p.resumoCpu||{}}});
  }
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
      pod:{statusCumprimento:d.STATUS_CUMPRIMENTO||'',localPrevisto:d.LOCAL_PREVISTO||'',motivoAlteracao:d.MOTIVO_ALTERACAO||''},
      local:{descricao:d.LOCAL_EXECUTADO||x.LOCAL||'',coordenadas:d.COORDENADAS_EXECUTADAS||[x.LATITUDE,x.LONGITUDE].filter(Boolean).join(', '),latitude:x.LATITUDE||'',longitude:x.LONGITUDE||''},
      resultados:{abordagens:{pessoas:Number(x.PESSOAS_ABORDADAS||0),motocicletas:Number(x.MOTOCICLETAS_ABORDADAS||0),ciclomotores:Number(x.CICLOMOTORES_ABORDADOS||0),automoveis:Number(x.AUTOMOVEIS_ABORDADOS||0),checkpoints:Number(x.CHECKPOINTS||0)},
        notificacoes:{testesEtilometro:Number(x.TESTES_ETILOMETRO||0),art165:Number(x.ART_165||0),art165a:Number(x.ART_165_A||0),art230xi:Number(x.ART_230_XI||0),aitsComAbordagem:Number(x.OUTROS_AITS_COM_ABORDAGEM||0),aitsSemAbordagem:Number(x.AITS_SEM_ABORDAGEM||0)},
        remocoes:{motocicletas:Number(x.REMOCOES_MOTOCICLETAS||0),ciclomotores:Number(x.REMOCOES_CICLOMOTORES||0),automoveis:Number(x.REMOCOES_AUTOMOVEIS||0)},
        criminal:{armas:Number(x.ARMAS_APREENDIDAS||0),prisoes:Number(x.PRISOES||0),drogas:Number(x.DROGAS||0),mandados:Number(x.MANDADOS_PRISAO||0),veiculosRecuperados:Number(x.VEICULOS_RECUPERADOS||0),veiculosAdulterados:Number(x.VEICULOS_ADULTERADOS||0),tcos:Number(x.TCOS||0)}},
      resumoCpu:{nome:x.OPERACAO||'',local:d.LOCAL_EXECUTADO||x.LOCAL||'',turno:x.TURNO||'',
        apreensoesVeiculos:Number(x.REMOCOES_MOTOCICLETAS||0)+Number(x.REMOCOES_CICLOMOTORES||0)+Number(x.REMOCOES_AUTOMOVEIS||0),
        totalAits:Number(x.ART_165||0)+Number(x.ART_165_A||0)+Number(x.ART_230_XI||0)+Number(x.OUTROS_AITS_COM_ABORDAGEM||0)+Number(x.AITS_SEM_ABORDAGEM||0),
        prisoes:Number(x.PRISOES||0),statusCumprimento:d.STATUS_CUMPRIMENTO||'Não informado',localPrevisto:d.LOCAL_PREVISTO||'',motivoAlteracao:d.MOTIVO_ALTERACAO||''}};
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
  var t=m[1],n=Number(m[2]),max=10,expected=normGuarnicaoTipo_(tipo||t);
  if(n<1||n>max||!expected||t!==expected)return '';
  return t+' '+padGuarnicaoOrdem_(n);
}
function serviceKeyRsd_(batt,comp,data,guarnicaoNome,guarnicaoTipo) {
  var gu=normalizeGuarnicaoNome_(guarnicaoNome,guarnicaoTipo||guarnicaoTipoFromNome_(guarnicaoNome));
  return [String(batt||''),String(comp||''),resolveOperationalServiceDate_(data,''),gu].join('|');
}
function rsdOpenEditableStatuses_(){return ['EM_SERVICO','RETIFICACAO_SOLICITADA'];}
function rsdPreferEditableSegment_(a,b){
  var aseg=Number(a.SEGMENTO||1)||1,bseg=Number(b.SEGMENTO||1)||1;
  if(aseg!==bseg)return aseg-bseg;
  return String(a.ULTIMO_RASCUNHO_EM||a.SINCRONIZADO_EM||a.INICIADO_EM||'').localeCompare(String(b.ULTIMO_RASCUNHO_EM||b.SINCRONIZADO_EM||b.INICIADO_EM||''));
}
function rsdCandidateCard_(x,mainVtrMap){
  mainVtrMap=mainVtrMap||{};
  return {reportId:String(x.REPORT_ID||''),serviceId:String(x.SERVICE_ID||''),segmento:Number(x.SEGMENTO||1)||1,status:String(x.STATUS||''),guarnicao:String(x.GUARNICAO||''),vtrPrincipal:normVtrPrefix_(x.VTR_PRINCIPAL||mainVtrMap[String(x.REPORT_ID||'')]||''),responsavel:String(x.RESPONSAVEL_NOME||''),comandante:String(x.RESPONSAVEL_NOME||''),matricula:String(x.RESPONSAVEL_MATRICULA||''),iniciadoEm:String(x.INICIADO_EM||''),finalizadoEm:String(x.FINALIZADO_EM||''),ultimoSyncEm:String(x.ULTIMO_RASCUNHO_EM||x.SINCRONIZADO_EM||'')};
}
function rcoDraftHasValidPayload_(x){
  return !!(String(x.PAYLOAD_FILE_ID||'').trim()||String(x.PAYLOAD_HASH||'').trim()||String(x.PAYLOAD_JSON||'').trim());
}
function rcoDraftUnitDateKey_(x){
  return [String(x.BATALHAO||''),String(x.COMPANHIA||''),dateText_(x.DATA_SERVICO)].join('|');
}
function rcoDraftPreferCanonical_(a,b){
  var av=rcoDraftHasValidPayload_(a)?1:0,bv=rcoDraftHasValidPayload_(b)?1:0;
  if(av!==bv)return av-bv;
  var ar=Number(a.REVISAO||0),br=Number(b.REVISAO||0);
  if(ar!==br)return ar-br;
  return String(a.ULTIMO_SYNC_EM||a.ATUALIZADO_EM||'').localeCompare(String(b.ULTIMO_SYNC_EM||b.ATUALIZADO_EM||''));
}
function rcoDraftDedupeOpenRows_(rows){
  var byRid={},byKey={},out=[];
  (rows||[]).forEach(function(x){
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS||''))<0)return;
    if(String(x.STATUS||'')==='DUPLICADO_LEGADO')return;
    var rid=String(x.RCO_REPORT_ID||'');if(!rid)return;
    if(!byRid[rid]||rcoDraftPreferCanonical_(x,byRid[rid])>0||(rcoDraftPreferCanonical_(x,byRid[rid])===0&&Number(x._row||0)<Number(byRid[rid]._row||0)))byRid[rid]=x;
  });
  Object.keys(byRid).forEach(function(rid){
    var x=byRid[rid],k=rcoDraftUnitDateKey_(x);if(!k||k.split('|').pop()==='')return;
    if(!byKey[k]||rcoDraftPreferCanonical_(x,byKey[k])>0)byKey[k]=x;
  });
  Object.keys(byKey).forEach(function(k){out.push(byKey[k]);});
  return out;
}
function rcoDraftPhysicalDuplicatePlan_(p){
  p=p||{};
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||'');
  var rows=objectsFields_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),['RCO_REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','STATUS','REVISAO','ULTIMO_SYNC_EM','ATUALIZADO_EM']).filter(function(x){
    if(String(x.STATUS||'')==='DUPLICADO_LEGADO')return false;
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS||''))<0)return false;
    if(batt&&String(x.BATALHAO||'')!==batt)return false;
    if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;
    if(data&&dateText_(x.DATA_SERVICO)!==data)return false;
    return !!String(x.RCO_REPORT_ID||'');
  });
  var byRid={},plan=[];
  rows.forEach(function(x){
    var rid=String(x.RCO_REPORT_ID||'');if(!byRid[rid])byRid[rid]=[];byRid[rid].push(x);
  });
  Object.keys(byRid).forEach(function(rid){
    var g=byRid[rid];if(g.length<=1)return;
    var canon=g.slice().sort(function(a,b){return rcoDraftPreferCanonical_(b,a)||Number(a._row||0)-Number(b._row||0);})[0];
    g.forEach(function(x){
      if(Number(x._row||0)===Number(canon._row||0))return;
      plan.push({reportId:rid,row:Number(x._row||0),canonicalRow:Number(canon._row||0),statusAnterior:String(x.STATUS||''),supersededBy:rid,kind:'physical_duplicate'});
    });
  });
  return plan;
}
function writeSheetRowObject_(s,rowNum,obj){
  var h=headers_(s),n=Number(rowNum||0);if(n<2)throw new Error('Linha inválida.');
  s.getRange(n,1,1,h.length).setValues([rowFor_(h,obj)]);
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
      data=resolveOperationalServiceDate_(p.data||'',p.agora||p.now||new Date()),tipo=normGuarnicaoTipo_(p.tipo||'');
  if(!data)throw new Error('Informe a data do serviço.');
  if(!tipo)throw new Error('Selecione BST, BASE, GTTRAN, TOR ou REBOQUE.');
  var ordem=guarnicaoNextOrder_(sheet_(P3_SHEET_ID,'RSD'),batt,comp,data,tipo);
  return {ok:true,tipo:tipo,ordem:ordem,nome:tipo+' '+padGuarnicaoOrdem_(ordem),data:data,operationalDate:data,serviceWindow:getServiceWindow_(data)};
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
function rsdLockedCommander_(old){
  if(!old)return null;
  var mat=normMat_(old.RESPONSAVEL_MATRICULA||'');
  if(!mat)return null;
  return {matricula:mat,nome:String(old.RESPONSAVEL_NOME||'').trim(),postoGrad:String(old.RESPONSAVEL_POSTO_GRAD||'').trim()};
}
function rsdAssertCommanderImmutable_(r, old){
  var locked=rsdLockedCommander_(old);if(!locked)return;
  var incoming=normMat_(((r&&r.guarnicao)||{}).matricula||(r&&r.matriculaResponsavel)||'');
  if(incoming&&incoming!==locked.matricula)throw new Error('O comandante deste segmento já está definido. Para mudança de comandante, realize a passagem de serviço.');
}
function rsdApplyLockedCommanderToPayload_(r, old){
  var locked=rsdLockedCommander_(old);if(!locked||!r)return r;
  r.guarnicao=r.guarnicao||{};
  r.guarnicao.matricula=locked.matricula;
  r.matriculaResponsavel=locked.matricula;
  if(locked.nome)r.guarnicao.responsavel=locked.nome;
  if(locked.postoGrad)r.guarnicao.postoGrad=locked.postoGrad;
  return r;
}
function rsdFilledIdent_(v){return String(v==null?'':v).replace(/\u00a0/g,' ').trim()!=='';}
function rsdIdentYmd_(v){
  var s=String(v==null?'':v).trim();
  var m=s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?m[1]:s.slice(0,10);
}
function rsdIdentPrimaryVtr_(raw){
  var s=String(raw==null?'':raw).split(',')[0].trim().toUpperCase();
  return s.replace(/[^A-Z0-9]/g,'');
}
function rsdExtractIncomingIdentity_(r){
  r=r||{};
  var g=r.guarnicao||{},u=r.unidade||{},s=r.servico||{},vs=r.viaturas||g.viaturas||[],first='';
  if(Object.prototype.toString.call(vs)==='[object Array]'&&vs.length){
    var v0=vs[0];first=typeof v0==='string'?v0:((v0&&(v0.prefixo||v0.viatura))||'');
  }
  return {
    reportId:String(r.reportId||''),
    serviceId:String(r.serviceId||s.serviceId||''),
    segmento:String(r.segmento!=null?r.segmento:(s.segmento!=null?s.segmento:'')),
    data:rsdIdentYmd_(s.operationalDate||s.data||r.data||''),
    batalhao:String(u.batalhao||u.batalhaoSigla||''),
    companhia:String(u.companhia||''),
    nome:String(g.nome||''),
    tipo:String(g.tipo||''),
    vtr:rsdIdentPrimaryVtr_(g.vtrPrincipal||first||g.viatura||''),
    responsavel:String(g.responsavel||''),
    matricula:String(g.matricula||r.matriculaResponsavel||''),
    efetivo:String(g.efetivo||'')
  };
}
function rsdHasHeaderRectificationAuth_(old, payload, r){
  var auth=String((old&&old.HEADER_EDIT_AUTH)||'').toUpperCase();
  var token=String((payload&&payload.headerRectificationAuth)||(r&&r.headerRectificationAuth)||'').toUpperCase();
  return auth==='OPEN'&&token==='OPEN';
}
function rsdSameIdent_(key,a,b){
  if(key==='vtr')return rsdIdentPrimaryVtr_(a)===rsdIdentPrimaryVtr_(b);
  if(key==='data')return rsdIdentYmd_(a)===rsdIdentYmd_(b);
  if(key==='segmento')return String(Number(a||1)||1)===String(Number(b||1)||1);
  return String(a||'').trim().toUpperCase()===String(b||'').trim().toUpperCase();
}
function rsdDetectStructuralRegression_(existingPayload, incomingPayload){
  var existing=rsdExtractIncomingIdentity_(existingPayload||{});
  var incoming=rsdExtractIncomingIdentity_(incomingPayload||{});
  var rigid=['reportId','serviceId','segmento','data','batalhao','companhia','nome','tipo'];
  var filledOnly=['vtr','responsavel','matricula','efetivo'];
  var out=[],i,key,oldVal,newVal;
  for(i=0;i<rigid.length;i++){
    key=rigid[i];oldVal=existing[key];newVal=incoming[key];
    if(!rsdFilledIdent_(oldVal))continue;
    if(!rsdFilledIdent_(newVal)){out.push({field:key,from:String(oldVal),to:'',reason:'EMPTY'});continue;}
    if(!rsdSameIdent_(key,oldVal,newVal))out.push({field:key,from:String(oldVal),to:String(newVal),reason:'IDENTITY_CHANGE'});
  }
  for(i=0;i<filledOnly.length;i++){
    key=filledOnly[i];oldVal=existing[key];newVal=incoming[key];
    if(rsdFilledIdent_(oldVal)&&!rsdFilledIdent_(newVal))out.push({field:key,from:String(oldVal),to:'',reason:'EMPTY'});
  }
  return out;
}
function rsdKnownDraftRevision_(payload, r){
  if(payload&&payload.knownDraftRevision!=null&&payload.knownDraftRevision!=='')return Number(payload.knownDraftRevision)||0;
  if(payload&&payload.draftRevision!=null&&payload.draftRevision!=='')return Number(payload.draftRevision)||0;
  if(r&&r.knownDraftRevision!=null&&r.knownDraftRevision!=='')return Number(r.knownDraftRevision)||0;
  if(r&&r.draftRevision!=null&&r.draftRevision!=='')return Number(r.draftRevision)||0;
  return 0;
}
function rsdAssertDraftRevision_(old, knownRevision){
  var current=Number((old&&old.DRAFT_REVISION)||0)||0;
  var known=Number(knownRevision||0)||0;
  if(current>=1&&known<current)return {ok:false,reason:'STALE_REVISION',current:current,known:known};
  return {ok:true,current:current,known:known};
}
function rsdAuditBlockedDraft_(old, r, payload, reason, extra){
  var g=(r&&r.guarnicao)||{};
  var snap={
    blocked:true,
    action:'rsd-draft-sync',
    reason:reason,
    reportId:String((old&&old.REPORT_ID)||(r&&r.reportId)||''),
    serviceId:String((old&&old.SERVICE_ID)||(r&&r.serviceId)||''),
    receivedRevision:rsdKnownDraftRevision_(payload,r),
    currentRevision:Number((old&&old.DRAFT_REVISION)||0)||0,
    fields:(extra&&extra.fields)||[],
    deviceId:String((payload&&payload.deviceId)||(r&&r.deviceId)||''),
    headerEditAuth:String((old&&old.HEADER_EDIT_AUTH)||'')
  };
  audit_('RSD',snap.reportId,snap.currentRevision,'RASCUNHO_REGRESSAO_BLOQUEADA',
    old&&old.RESPONSAVEL_MATRICULA||g.matricula||'',
    old&&old.RESPONSAVEL_NOME||g.responsavel||'',
    old&&old.BATALHAO||'',
    old&&old.COMPANHIA||'',
    snap);
}
function rsdGuardExistingDraft_(r, old, payload){
  if(!old||!r)return r;
  var known=rsdKnownDraftRevision_(payload,r);
  var rev=rsdAssertDraftRevision_(old,known);
  if(!rev.ok){
    rsdAuditBlockedDraft_(old,r,payload,'STALE_REVISION',{fields:['DRAFT_REVISION']});
    throw new Error('Este rascunho está desatualizado em relação à Central (revisão '+rev.known+' < '+rev.current+'). Recarregue o serviço para continuar sem perder dados.');
  }
  var existing=loadJsonPayload_(old)||{};
  var regressions=rsdDetectStructuralRegression_(existing,r);
  var auth=rsdHasHeaderRectificationAuth_(old,payload||{},r);
  if(auth)regressions=regressions.filter(function(x){return x.reason==='EMPTY';});
  if(regressions.length){
    rsdAuditBlockedDraft_(old,r,payload,'STRUCTURAL_REGRESSION',{fields:regressions});
    throw new Error('A sincronização foi recusada porque o rascunho apagaria dados de identificação do serviço. Recarregue a página para proteger o RSD.');
  }
  return r;
}
function rsdDraftObject_(r,old,deviceId) {
  rsdAssertCommanderImmutable_(r,old);
  r=rsdApplyLockedCommanderToPayload_(r,old)||r||{};
  var reportId=String(r.reportId||''),u=r.unidade||{},g=r.guarnicao||{};
  var version=old?Number(old.VERSAO||1):1, rev=old?Number(old.DRAFT_REVISION||0)+1:1;
  var serviceId=String(r.serviceId||(r.servico||{}).serviceId||(old&&old.SERVICE_ID)||uid_('svc')),seg=Number(r.segmento||(r.servico||{}).segmento||(old&&old.SEGMENTO)||1)||1;
  r.serviceId=serviceId;r.segmento=seg;r.servico=r.servico||{};r.servico.serviceId=serviceId;r.servico.segmento=seg;
  var locked=rsdLockedCommander_(old);
  var mat=locked?locked.matricula:normMat_(g.matricula||r.matriculaResponsavel||'');
  var nome=locked&&locked.nome?locked.nome:(g.responsavel||'');
  var posto=locked&&locked.postoGrad?locked.postoGrad:(g.postoGrad||'');
  var json=JSON.stringify(r),saved=saveJsonPayload_(reportId,'draft-'+rev,json,'RSD_PAYLOAD_FOLDER_ID','Central RSD - Payloads',old&&old.PAYLOAD_FILE_ID||''),batt=normBattalion_(u.batalhao||u.batalhaoSigla||'BPTran'),comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var tipo=normGuarnicaoTipo_(g.tipo||guarnicaoTipoFromNome_(g.nome)||(old&&old.GUARNICAO_TIPO)||''),vtrPrincipal=rsdPrimaryVtr_(r)||normVtrPrefix_(old&&old.VTR_PRINCIPAL||''),ordem=Number(g.ordem||g.numero||old&&old.GUARNICAO_ORDEM||0)||Number((String(g.nome||old&&old.GUARNICAO||'').match(/(\d+)\s*$/)||[])[1]||0)||0;
  // DATA_SERVICO = data operacional (janela 07h→07h). Histórico com DATA_SERVICO já gravada é preservado.
  var dataServico=old&&old.DATA_SERVICO?dateText_(old.DATA_SERVICO):resolveOperationalServiceDate_((r.servico||{}).data,(r.servico||{}).iniciadoEm||r.iniciadoEm||new Date());
  r.servico=r.servico||{};r.servico.data=dataServico;r.servico.operationalDate=dataServico;r.servico.serviceWindow=getServiceWindow_(dataServico);
  return {REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dataServico,BATALHAO:batt,COMPANHIA:comp,GUARNICAO:g.nome||(old&&old.GUARNICAO)||'',GUARNICAO_TIPO:tipo,GUARNICAO_ORDEM:ordem,VTR_PRINCIPAL:vtrPrincipal,TURNO:'',
    STATUS:'EM_SERVICO',RESPONSAVEL_MATRICULA:mat,RESPONSAVEL_POSTO_GRAD:posto,RESPONSAVEL_NOME:nome,
    INICIADO_EM:old&&old.INICIADO_EM||r.iniciadoEm||(r.servico||{}).iniciadoEm||nowIso_(),FINALIZADO_EM:'',RETIFICADO_EM:'',CANCELADO_EM:'',
    RCO_REPORT_ID:old&&old.RCO_REPORT_ID||'',INCLUIDO_RCO_EM:old&&old.INCLUIDO_RCO_EM||'',PAYLOAD_JSON:saved.json,SCHEMA_VERSION:r.schemaVersion||2,SINCRONIZADO_EM:nowIso_(),
    ORIGEM:r.origem||(old&&old.ORIGEM)||'RSD_WEB',OBSERVACOES:r.observacoes||'',PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json),
    SERVICE_ID:serviceId,SEGMENTO:seg,RSD_ANTERIOR_ID:r.rsdAnteriorId||(r.servico||{}).rsdAnteriorId||(old&&old.RSD_ANTERIOR_ID)||'',
    PASSAGEM_ORIGEM_ID:r.passagemOrigemId||(r.servico||{}).passagemOrigemId||(old&&old.PASSAGEM_ORIGEM_ID)||'',ULTIMO_RASCUNHO_EM:nowIso_(),
    EDIT_DEVICE_ID:String(deviceId||old&&old.EDIT_DEVICE_ID||''),EDIT_LEASE_UNTIL:deviceId?isoAfterMinutes_(3):(old&&old.EDIT_LEASE_UNTIL||''),DRAFT_REVISION:rev,
    HEADER_EDIT_AUTH:old&&old.HEADER_EDIT_AUTH||'',HEADER_EDIT_AUTH_EM:old&&old.HEADER_EDIT_AUTH_EM||'',HEADER_EDIT_AUTH_POR:old&&old.HEADER_EDIT_AUTH_POR||''};
}
function rsdStart_(payload) {
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD'),old=findOne_(s,'REPORT_ID',reportId);
  ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','DUPLICATE_OVERRIDE_JUSTIFICATIVA','GUARNICAO_TIPO','GUARNICAO_ORDEM','VTR_PRINCIPAL','HEADER_EDIT_AUTH','HEADER_EDIT_AUTH_EM','HEADER_EDIT_AUTH_POR']);
  if(old&&['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD não está disponível para novo início/registro. Situação atual: '+String(old.STATUS||'').replace(/_/g,' ')+'. Use Continuar serviço para consultar a situação ou a devolutiva.');

  var u0=r.unidade||{},g0=r.guarnicao||{},batt0=normBattalion_(u0.batalhao||u0.batalhaoSigla||'BPTran'),
      comp0=u0.companhia||normCompany_(batt0,u0.companhiaNumero),
      data0=old&&old.DATA_SERVICO?dateText_(old.DATA_SERVICO):resolveOperationalServiceDate_((r.servico||{}).data,(r.servico||{}).iniciadoEm||r.iniciadoEm||new Date()),
      mat0=normMat_(g0.matricula||r.matriculaResponsavel||''),tipo0=normGuarnicaoTipo_(g0.tipo||guarnicaoTipoFromNome_(g0.nome)),vtr0=rsdPrimaryVtr_(r),passagem0=!!(r.passagemOrigemId||(r.servico&&r.servico.passagemOrigemId)),guEscolhida0=normalizeGuarnicaoNome_(g0.nome,tipo0);
  r.servico=r.servico||{};r.servico.data=data0;r.servico.operationalDate=data0;r.servico.serviceWindow=getServiceWindow_(data0);
  if(!tipo0)throw new Error('Selecione o tipo da guarnição: BST, BASE, GTTRAN, TOR ou REBOQUE.');
  if(!vtr0)throw new Error('Informe a VTR principal da guarnição.');
  var mainVtrMap=rsdMainVtrMap_();
  var openStatuses=rsdOpenEditableStatuses_();

  // Identidade dura do serviço: BATALHAO|COMPANHIA|DATA_OPERACIONAL|GUARNICAO_NORMALIZADA (janela 07h→07h).
  // Troca de VTR NÃO cria novo SERVICE_ID — reabre o serviço/segmento editável atual.
  if(!old&&data0&&!passagem0&&guEscolhida0){
    var key0=serviceKeyRsd_(batt0,comp0,data0,guEscolhida0,tipo0);
    var openSameKey=objects_(s).filter(function(x){
      if(openStatuses.indexOf(String(x.STATUS||''))<0)return false;
      if(String(x.REPORT_ID||'')===reportId)return false;
      var xGu=normalizeGuarnicaoNome_(x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
      return serviceKeyRsd_(x.BATALHAO,x.COMPANHIA,x.DATA_SERVICO,xGu||x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO))===key0;
    }).sort(function(a,b){return rsdPreferEditableSegment_(b,a);});
    if(openSameKey.length){
      var best=openSameKey[0],cards=openSameKey.slice(0,8).map(function(x){return rsdCandidateCard_(x,mainVtrMap);});
      return {ok:true,existing:true,message:'A guarnição '+guEscolhida0+' já possui serviço aberto nesta unidade e data. Continuando o segmento atual (SERVICE_ID preservado).',
        candidates:cards,reportId:String(best.REPORT_ID||''),serviceId:String(best.SERVICE_ID||''),segmento:Number(best.SEGMENTO||1)||1,status:String(best.STATUS||''),
        guarnicaoNome:String(best.GUARNICAO||guEscolhida0),vtrPrincipal:normVtrPrefix_(best.VTR_PRINCIPAL||mainVtrMap[String(best.REPORT_ID||'')]||vtr0)};
    }
  }

  // Aviso suave: mesma VTR em outro serviço (outra guarnição) na unidade/data.
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
      return {ok:true,existing:true,possible_duplicate:true,message:'A VTR '+vtr0+' já aparece em outro serviço nesta unidade e data. Confirme se deseja continuar o existente ou se a VTR foi informada por engano.',
        candidates:candidates.slice(0,8).map(function(x){return rsdCandidateCard_(x,mainVtrMap);}),
        reportId:String(candidates[0].REPORT_ID||''),serviceId:String(candidates[0].SERVICE_ID||''),segmento:Number(candidates[0].SEGMENTO||1),status:String(candidates[0].STATUS||'')};
    }
  }
  if(old){
    g0.nome=String(old.GUARNICAO||g0.nome||'');
    g0.tipo=normGuarnicaoTipo_(old.GUARNICAO_TIPO||tipo0)||tipo0;
    g0.ordem=Number(old.GUARNICAO_ORDEM||0)||Number((String(g0.nome).match(/(\d+)\s*$/)||[])[1]||0)||0;
    // VTR pode ser atualizada no mesmo SERVICE_ID; não cria novo serviço.
    g0.vtrPrincipal=vtr0||normVtrPrefix_(old.VTR_PRINCIPAL||'')||vtr0;
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
  rsdAssertCommanderImmutable_(r,old);
  r=rsdApplyLockedCommanderToPayload_(r,old)||r;
  g0=r.guarnicao||g0;r.guarnicao=g0;
  assertLease_(old,deviceId,!!payload.forceTakeover);
  if(old)r=rsdGuardExistingDraft_(r,old,payload)||r;
  var obj=rsdDraftObject_(r,old,deviceId);
  upsert_(s,'REPORT_ID',reportId,obj);syncRsdVehicles_(r,reportId);
  audit_('RSD',reportId,obj.DRAFT_REVISION,old?'RASCUNHO_ATUALIZADO':'INICIADO',obj.RESPONSAVEL_MATRICULA,obj.RESPONSAVEL_NOME,obj.BATALHAO,obj.COMPANHIA,r);
  return {ok:true,message:old?'Serviço em andamento atualizado na nuvem.':'Guarnição '+obj.GUARNICAO+' registrada em serviço e disponível ao coordenador.',reportId:reportId,serviceId:obj.SERVICE_ID,segmento:obj.SEGMENTO,draftRevision:obj.DRAFT_REVISION,status:'EM_SERVICO',guarnicaoNome:obj.GUARNICAO,guarnicaoTipo:obj.GUARNICAO_TIPO,guarnicaoOrdem:Number(obj.GUARNICAO_ORDEM||0),vtrPrincipal:obj.VTR_PRINCIPAL};
  }finally{lock.releaseLock();}
}
function rsdDraftSync_(payload){
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD');
  ensureHeaders_(s,['HEADER_EDIT_AUTH','HEADER_EDIT_AUTH_EM','HEADER_EDIT_AUTH_POR']);
  var old=findOne_(s,'REPORT_ID',reportId);
  if(!old)return rsdStart_(payload);
  var lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try{
  old=findOne_(s,'REPORT_ID',reportId);
  if(!old)throw new Error('RSD não localizado.');
  var incomingTipo=normGuarnicaoTipo_((r.guarnicao||{}).tipo||guarnicaoTipoFromNome_((r.guarnicao||{}).nome)),oldTipo=normGuarnicaoTipo_(old.GUARNICAO_TIPO||guarnicaoTipoFromNome_(old.GUARNICAO));
  if(oldTipo&&incomingTipo&&oldTipo!==incomingTipo)throw new Error('O tipo da guarnição já foi definido para este serviço e não pode ser alterado.');
  if(['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD não está disponível para edição.');
  rsdAssertCommanderImmutable_(r,old);
  r=rsdApplyLockedCommanderToPayload_(r,old)||r;
  assertLease_(old,deviceId,!!payload.forceTakeover);
  r=rsdGuardExistingDraft_(r,old,payload)||r;
  var obj=rsdDraftObject_(r,old,deviceId);obj.STATUS=String(old.STATUS)==='RETIFICACAO_SOLICITADA'?'RETIFICACAO_SOLICITADA':'EM_SERVICO';
  if(old.HEADER_EDIT_AUTH)obj.HEADER_EDIT_AUTH=old.HEADER_EDIT_AUTH;
  if(old.HEADER_EDIT_AUTH_EM)obj.HEADER_EDIT_AUTH_EM=old.HEADER_EDIT_AUTH_EM;
  if(old.HEADER_EDIT_AUTH_POR)obj.HEADER_EDIT_AUTH_POR=old.HEADER_EDIT_AUTH_POR;
  if(old.REVIEW_STATUS)obj.REVIEW_STATUS=old.REVIEW_STATUS;if(old.REVIEW_MOTIVO)obj.REVIEW_MOTIVO=old.REVIEW_MOTIVO;if(old.REVIEW_OBSERVACAO)obj.REVIEW_OBSERVACAO=old.REVIEW_OBSERVACAO;
  upsert_(s,'REPORT_ID',reportId,obj);syncRsdVehicles_(r,reportId);
  return {ok:true,message:'Rascunho sincronizado.',reportId:reportId,serviceId:obj.SERVICE_ID,segmento:obj.SEGMENTO,draftRevision:obj.DRAFT_REVISION,status:obj.STATUS};
  }finally{lock.releaseLock();}
}
function rsdOwnerMat_(row){
  if(!row)return '';
  var direct=normMat_(row.RESPONSAVEL_MATRICULA||'');if(direct)return direct;
  try{
    var p=loadJsonPayload_(row)||{},g=p.guarnicao||{};
    return normMat_(g.matricula||p.matriculaResponsavel||'');
  }catch(_){return ''}
}
function rsdClaim_(payload){
  var reportId=String(payload.reportId||''),deviceId=String(payload.deviceId||'');if(!reportId||!deviceId)throw new Error('Identificação de continuidade incompleta.');
  var s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);if(!row)throw new Error('RSD em andamento não localizado.');
  if(['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(row.STATUS))<0)throw new Error('Este RSD não está disponível para continuidade.');
  var autorMat=normMat_(payload.autorMatricula||'');
  if(autorMat){
    var ownerMat=rsdOwnerMat_(row);
    if(!ownerMat||ownerMat!==autorMat)throw new Error('Este serviço está vinculado a outro comandante. Confira a matrícula ou utilize a passagem de serviço.');
  }
  assertLease_(row,deviceId,!!payload.forceTakeover);row.EDIT_DEVICE_ID=deviceId;row.EDIT_LEASE_UNTIL=isoAfterMinutes_(3);row.SINCRONIZADO_EM=nowIso_();upsert_(s,'REPORT_ID',reportId,row);
  audit_('RSD',reportId,Number(row.VERSAO||1),'ACESSO_CONTINUIDADE',row.RESPONSAVEL_MATRICULA||autorMat,row.RESPONSAVEL_NOME||'',row.BATALHAO,row.COMPANHIA,{deviceId:deviceId,forceTakeover:!!payload.forceTakeover,autorMatricula:autorMat});
  var p=rsdGet_(reportId);p.versao=Number(row.VERSAO||1);p.serviceId=row.SERVICE_ID||p.serviceId||'';p.segmento=Number(row.SEGMENTO||p.segmento||1);
  return {ok:true,message:String(row.STATUS)==='RETIFICACAO_SOLICITADA'?'Relatório devolvido carregado para retificação.':'Serviço assumido neste aparelho.',rsd:p,meta:{reportId:reportId,serviceId:row.SERVICE_ID||'',segmento:Number(row.SEGMENTO||1),draftRevision:Number(row.DRAFT_REVISION||0)}};
}
function rsdUpsert_(payload) {
  var r=payload.rsd||payload||{},reportId=String(r.reportId||''),deviceId=String(payload.deviceId||r.deviceId||'');
  if(!reportId)throw new Error('RSD sem REPORT_ID.');
  var s=sheet_(P3_SHEET_ID,'RSD');ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','GUARNICAO_TIPO','GUARNICAO_ORDEM','VTR_PRINCIPAL']);
  var old=findOne_(s,'REPORT_ID',reportId),newMat=normMat_((r.guarnicao||{}).matricula||r.matriculaResponsavel||''),incomingVtr=rsdPrimaryVtr_(r),oldVtr=old?normVtrPrefix_(old.VTR_PRINCIPAL||rsdMainVtrMap_()[reportId]||''):'',incomingTipo=normGuarnicaoTipo_((r.guarnicao||{}).tipo||guarnicaoTipoFromNome_((r.guarnicao||{}).nome)),oldTipo=old?normGuarnicaoTipo_(old.GUARNICAO_TIPO||guarnicaoTipoFromNome_(old.GUARNICAO)):'';
  if(!old)throw new Error('Registre a guarnição no serviço antes de finalizar o RSD.');
  if(oldTipo&&incomingTipo&&oldTipo!==incomingTipo)throw new Error('O tipo da guarnição já foi definido para este serviço e não pode ser alterado.');
  rsdAssertCommanderImmutable_(r,old);
  r=rsdApplyLockedCommanderToPayload_(r,old)||r;
  if(old&&['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(old.STATUS))<0)throw new Error('Este RSD já não está disponível para finalização. Situação atual: '+String(old.STATUS||'').replace(/_/g,' ')+'. Consulte a devolutiva do Coordenador antes de qualquer nova ação.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  r=rsdGuardExistingDraft_(r,old,payload)||r;
  var wasReturned=!!(old&&String(old.STATUS)==='RETIFICACAO_SOLICITADA'),version=Math.max(Number(r.versao||r.version||0),old?Number(old.VERSAO||0)+1:1);
  var u=r.unidade||{},g=r.guarnicao||{},lockedCmd=rsdLockedCommander_(old);
  var json=JSON.stringify(r),saved=saveJsonPayload_(reportId,version,json),batt=normBattalion_(u.batalhao||u.batalhaoSigla||'BPTran'),comp=u.companhia||normCompany_(batt,u.companhiaNumero);
  var serviceId=String(r.serviceId||(r.servico||{}).serviceId||(old&&old.SERVICE_ID)||uid_('svc')),seg=Number(r.segmento||(r.servico||{}).segmento||(old&&old.SEGMENTO)||1)||1;
  var tipoFinal=normGuarnicaoTipo_(g.tipo||old&&old.GUARNICAO_TIPO||guarnicaoTipoFromNome_(g.nome||old&&old.GUARNICAO)),ordemFinal=Number(g.ordem||old&&old.GUARNICAO_ORDEM||0)||Number((String(g.nome||old&&old.GUARNICAO||'').match(/(\d+)\s*$/)||[])[1]||0)||0,vtrFinal=incomingVtr||oldVtr;
  var matFinal=lockedCmd?lockedCmd.matricula:normMat_(g.matricula||r.matriculaResponsavel||'');
  var nomeFinal=lockedCmd&&lockedCmd.nome?lockedCmd.nome:(g.responsavel||'');
  var postoFinal=lockedCmd&&lockedCmd.postoGrad?lockedCmd.postoGrad:(g.postoGrad||'');
  var dataFinal=old&&old.DATA_SERVICO?dateText_(old.DATA_SERVICO):resolveOperationalServiceDate_((r.servico||{}).data,(r.servico||{}).iniciadoEm||r.iniciadoEm||old&&old.INICIADO_EM||new Date());
  r.servico=r.servico||{};r.servico.data=dataFinal;r.servico.operationalDate=dataFinal;r.servico.serviceWindow=getServiceWindow_(dataFinal);
  var obj={REPORT_ID:reportId,VERSAO:version,DATA_SERVICO:dataFinal,BATALHAO:batt,COMPANHIA:comp,GUARNICAO:g.nome||old&&old.GUARNICAO||'',GUARNICAO_TIPO:tipoFinal,GUARNICAO_ORDEM:ordemFinal,VTR_PRINCIPAL:vtrFinal,TURNO:'',STATUS:'AGUARDANDO_ANALISE',
    RESPONSAVEL_MATRICULA:matFinal,RESPONSAVEL_POSTO_GRAD:postoFinal,RESPONSAVEL_NOME:nomeFinal,
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
/** Conjunto de datas para rsd-list: `data` (exata), `datas` (CSV/JSON) e/ou `dataInicio`+`dataFim` (intervalo inclusivo). */
function rsdListDateSet_(p){
  p=p||{};
  var set={},exact=dateText_(p.data||'');
  if(exact)set[exact]=true;
  var raw=p.datas,parts=[],i,t;
  if(raw!=null&&raw!==''){
    if(Object.prototype.toString.call(raw)==='[object Array]')parts=raw;
    else{
      var s=String(raw).trim();
      if(s.charAt(0)==='['){try{parts=JSON.parse(s)||[];}catch(_){parts=[];}}
      else parts=s.split(/[,;|]/);
    }
    for(i=0;i<parts.length;i++){t=dateText_(parts[i]);if(t)set[t]=true;}
  }
  var di=dateText_(p.dataInicio||''),df=dateText_(p.dataFim||p.dataTermino||'');
  if(di&&df){
    var cur=new Date(di+'T12:00:00'),end=new Date(df+'T12:00:00');
    if(!isNaN(cur.getTime())&&!isNaN(end.getTime())){
      if(cur.getTime()>end.getTime()){var tmp=cur;cur=end;end=tmp;}
      while(cur.getTime()<=end.getTime()){
        set[dateText_(cur)]=true;
        cur.setDate(cur.getDate()+1);
      }
    }else{if(di)set[di]=true;if(df)set[df]=true;}
  }else{if(di)set[di]=true;if(df)set[df]=true;}
  return set;
}
function rsdList_(p) {
  var rs=sheet_(P3_SHEET_ID,'RSD');
  ensureHeaders_(rs,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM','CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL','GUARNICAO_TIPO','GUARNICAO_ORDEM','VTR_PRINCIPAL','FINALIZACAO_FORCADA','FINALIZACAO_FORCADA_MOTIVO','FINALIZACAO_FORCADA_POR_MATRICULA','FINALIZACAO_FORCADA_POR_NOME','FINALIZACAO_FORCADA_POR_PERFIL','FINALIZACAO_FORCADA_EM']);
  var list=objects_(rs),batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',dateSet=rsdListDateSet_(p),hasDateFilter=Object.keys(dateSet).length>0,mat=normMat_(p.matricula||''),showCancelled=String(p.showCancelled||'')==='1',vtrs=objects_(sheet_(P3_SHEET_ID,'RSD_VIATURAS'));
  var allowed=['EM_SERVICO','PASSAGEM_DISPONIVEL','ENCERRADO_PASSAGEM','AGUARDANDO_ANALISE','DEFERIDO','DEFERIDO_COM_RESSALVAS','RETIFICACAO_SOLICITADA','INDEFERIDO','FINALIZADO','INCLUIDO_RCO'];
  if(showCancelled)allowed.push('CANCELADO');
  var filtered=list.filter(function(x){if(allowed.indexOf(String(x.STATUS))<0)return false;if(batt&&String(x.BATALHAO)!==batt)return false;if(comp&&String(x.COMPANHIA)!==String(comp))return false;if(hasDateFilter&&!dateSet[dateText_(x.DATA_SERVICO)])return false;if(mat&&normMat_(x.RESPONSAVEL_MATRICULA)!==mat)return false;return true;});
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
      data:x.DATA_SERVICO,operationalDate:resolveOperationalServiceDate_(x.DATA_SERVICO,x.INICIADO_EM),batalhao:x.BATALHAO,companhia:x.COMPANHIA,guarnicao:x.GUARNICAO,guarnicaoTipo:normGuarnicaoTipo_(x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO)),guarnicaoOrdem:Number(x.GUARNICAO_ORDEM||0)||0,vtrPrincipal:pv,status:x.STATUS,responsavel:x.RESPONSAVEL_NOME,matricula:x.RESPONSAVEL_MATRICULA,
      iniciadoEm:x.INICIADO_EM,finalizadoEm:x.FINALIZADO_EM,ultimoRascunhoEm:x.ULTIMO_RASCUNHO_EM,rcoReportId:x.RCO_REPORT_ID,editDeviceId:x.EDIT_DEVICE_ID||'',editLeaseUntil:x.EDIT_LEASE_UNTIL||'',
      reviewStatus:x.REVIEW_STATUS||'',reviewMotivo:x.REVIEW_MOTIVO||'',reviewObservacao:x.REVIEW_OBSERVACAO||'',reviewAutorNome:x.REVIEW_AUTOR_NOME||'',reviewEm:x.REVIEW_EM||'',
      canceladoMotivo:x.CANCELADO_MOTIVO||'',canceladoPorNome:x.CANCELADO_POR_NOME||'',canceladoPorMatricula:x.CANCELADO_POR_MATRICULA||'',canceladoPorPerfil:x.CANCELADO_POR_PERFIL||'',canceladoEm:x.CANCELADO_EM||'',
      duplicateJustification:x.DUPLICATE_OVERRIDE_JUSTIFICATIVA||'',
      forceFinalized:String(x.FINALIZACAO_FORCADA||'').toUpperCase()==='SIM',forceFinalizedReason:x.FINALIZACAO_FORCADA_MOTIVO||'',forceFinalizedByName:x.FINALIZACAO_FORCADA_POR_NOME||'',forceFinalizedByMatricula:x.FINALIZACAO_FORCADA_POR_MATRICULA||'',forceFinalizedByPerfil:x.FINALIZACAO_FORCADA_POR_PERFIL||'',forceFinalizedAt:x.FINALIZACAO_FORCADA_EM||'',
      possibleDuplicate:(function(){var svc=servicesByKey[key]||{},ids=Object.keys(svc);if(ids.length<=1)return false;var justified=ids.filter(function(id){return !!svc[id].justified;}).length;return justified<ids.length-1;})(),
      duplicateCount:Math.max(1,Object.keys(servicesByKey[key]||{}).length),
      viaturas:rv.map(function(v){return {prefixo:v.PREFIXO,placa:v.PLACA,marcaModelo:v.MARCA_MODELO,tipo:v.TIPO};})};
  });
}
function rsdLogicalKeyFromRow_(x){
  var gu=normalizeGuarnicaoNome_(x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
  if(gu)return serviceKeyRsd_(x.BATALHAO,x.COMPANHIA,x.DATA_SERVICO,gu,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
  var sid=String(x.SERVICE_ID||x.REPORT_ID||'');
  return sid?('SERVICE|'+sid):'';
}
function accessRsdOpen_(p,mode){
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',stReceive=String(mode||'').toLowerCase()==='receive';
  if(stReceive){
    var recvRaw=passagensPendentes_({batalhao:batt,companhia:comp}).map(function(x){
      var vs=parseJson_(x.VTRS_JSON,[]),v=vs.map(function(y){return typeof y==='string'?y:(y.prefixo||y.PREFIXO||'')}).filter(Boolean);
      var gu=normalizeGuarnicaoNome_(x.GUARNICAO,guarnicaoTipoFromNome_(x.GUARNICAO));
      var logicalKey=gu?serviceKeyRsd_(x.BATALHAO,x.COMPANHIA,x.DATA_SERVICO,gu,guarnicaoTipoFromNome_(x.GUARNICAO)):(String(x.SERVICE_ID||'')?('SERVICE|'+String(x.SERVICE_ID)):'PASSAGEM|'+String(x.PASSAGEM_ID||x.RSD_ORIGEM_ID||''));
      return {module:'RSD',mode:'receive',reportId:String(x.RSD_ORIGEM_ID||''),passagemId:String(x.PASSAGEM_ID||''),serviceId:String(x.SERVICE_ID||''),segmento:Number(x.SEGMENTO_ORIGEM||1)||1,
        data:dateText_(x.DATA_SERVICO),batalhao:String(x.BATALHAO||''),companhia:String(x.COMPANHIA||''),guarnicao:String(x.GUARNICAO||''),vtr:String(v[0]||''),vtrPrincipal:String(v[0]||''),viaturas:v,
        comandante:String(x.ENTREGUE_POR_NOME||''),responsavel:String(x.ENTREGUE_POR_NOME||''),lastSync:String(x.DISPONIBILIZADA_EM||''),
        status:'PASSAGEM_DISPONIVEL',passagemPendente:true,passagemEm:String(x.DISPONIBILIZADA_EM||''),logicalKey:logicalKey,legacyDuplicates:[],duplicadoLegadoHint:false};
    });
    // Receber: um item lógico por chave de guarnição (ou SERVICE_ID), passagem mais recente.
    var byRecvKey={},recvCards=[];
    recvRaw.forEach(function(x){
      var k=String(x.logicalKey||x.serviceId||x.passagemId||x.reportId||'');if(!k)return;
      if(!byRecvKey[k])byRecvKey[k]=[];
      byRecvKey[k].push(x);
    });
    Object.keys(byRecvKey).forEach(function(k){
      var g=byRecvKey[k].slice().sort(function(a,b){return String(b.passagemEm||'').localeCompare(String(a.passagemEm||''));});
      var best=g[0],legacy=[],seenSid={};
      seenSid[String(best.serviceId||best.passagemId||'')]=true;
      g.slice(1).forEach(function(x){
        var sid=String(x.serviceId||x.passagemId||'');
        if(!sid||seenSid[sid])return;seenSid[sid]=true;
        legacy.push({reportId:String(x.reportId||''),serviceId:String(x.serviceId||''),status:String(x.status||'PASSAGEM_DISPONIVEL')});
      });
      best.legacyDuplicates=legacy;best.duplicadoLegadoHint=legacy.length>0;recvCards.push(best);
    });
    return recvCards.sort(function(a,b){var d=String(b.data||'').localeCompare(String(a.data||''));return d||String(b.passagemEm||'').localeCompare(String(a.passagemEm||''));});
  }
  var rows=objectsFields_(sheet_(P3_SHEET_ID,'RSD'),['REPORT_ID','SERVICE_ID','SEGMENTO','DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','GUARNICAO_TIPO','VTR_PRINCIPAL','STATUS','RESPONSAVEL_NOME','RESPONSAVEL_MATRICULA','ULTIMO_RASCUNHO_EM','SINCRONIZADO_EM','INICIADO_EM']),allowed=rsdOpenEditableStatuses_();
  var closed=['FINALIZADO','CANCELADO','DUPLICADO_LEGADO','INCLUIDO_RCO','ENCERRADO_PASSAGEM','AGUARDANDO_ANALISE','DEFERIDO','DEFERIDO_COM_RESSALVAS','INDEFERIDO'];
  var open=rows.filter(function(x){
    var st=String(x.STATUS||'');
    if(allowed.indexOf(st)<0)return false;
    if(closed.indexOf(st)>=0)return false;
    if(batt&&String(x.BATALHAO||'')!==batt)return false;
    if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;
    return true;
  });
  // Continuar: um card por chave lógica de guarnição; SERVICE_ID canônico + segmento editável atual.
  var openByKey={};
  open.forEach(function(x){
    var k=rsdLogicalKeyFromRow_(x);if(!k)return;
    if(!openByKey[k])openByKey[k]=[];
    openByKey[k].push(x);
  });
  var cards=[];
  Object.keys(openByKey).forEach(function(k){
    var groupRows=openByKey[k],canonSid=rsdServicePreferCanonicalId_(groupRows);
    if(!canonSid&&groupRows.length)canonSid=String(groupRows[0].SERVICE_ID||groupRows[0].REPORT_ID||'');
    var canonRows=groupRows.filter(function(x){return String(x.SERVICE_ID||x.REPORT_ID||'')===canonSid;});
    if(!canonRows.length)canonRows=groupRows.slice();
    var x=canonRows[0];
    canonRows.forEach(function(r){if(rsdPreferEditableSegment_(r,x)>0)x=r;});
    var sid=String(x.SERVICE_ID||x.REPORT_ID||''),legacy=[],legacySid={};
    groupRows.forEach(function(r){
      var other=String(r.SERVICE_ID||r.REPORT_ID||'');
      if(!other||other===sid||legacySid[other])return;
      legacySid[other]=true;
      var bestOther=r;
      groupRows.forEach(function(y){
        if(String(y.SERVICE_ID||y.REPORT_ID||'')!==other)return;
        if(rsdPreferEditableSegment_(y,bestOther)>0)bestOther=y;
      });
      legacy.push({reportId:String(bestOther.REPORT_ID||''),serviceId:other,status:String(bestOther.STATUS||'')});
    });
    var vtr=normVtrPrefix_(x.VTR_PRINCIPAL||''),sync=String(x.ULTIMO_RASCUNHO_EM||x.SINCRONIZADO_EM||x.INICIADO_EM||''),cmt=String(x.RESPONSAVEL_NOME||'');
    cards.push({module:'RSD',mode:'continue',reportId:String(x.REPORT_ID||''),serviceId:sid,segmento:Number(x.SEGMENTO||1)||1,
      data:dateText_(x.DATA_SERVICO),batalhao:String(x.BATALHAO||''),companhia:String(x.COMPANHIA||''),guarnicao:String(x.GUARNICAO||''),
      vtr:vtr,vtrPrincipal:vtr,comandante:cmt,responsavel:cmt,matricula:String(x.RESPONSAVEL_MATRICULA||''),
      status:String(x.STATUS||''),lastSync:sync,ultimoSyncEm:sync,passagemPendente:false,
      logicalKey:k,legacyDuplicates:legacy,duplicadoLegadoHint:legacy.length>0});
  });
  return cards.sort(function(a,b){var d=String(b.data||'').localeCompare(String(a.data||''));return d||String(b.ultimoSyncEm||'').localeCompare(String(a.ultimoSyncEm||''));});
}
function accessRcoOpen_(p,mode){
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',receive=String(mode||'').toLowerCase()==='receive',list=[];
  if(receive){
    list=rcoDraftList_({batalhao:batt,companhia:comp}).filter(function(x){return !!x.passagemPendente}).map(function(x){
      var k=rcoDraftUnitDateKey_({BATALHAO:x.batalhao,COMPANHIA:x.companhia,DATA_SERVICO:x.data});
      return Object.assign({},x,{logicalKey:k,legacyDuplicates:x.legacyDuplicates||[],duplicadoLegadoHint:!!(x.legacyDuplicates&&x.legacyDuplicates.length)});
    });
  }else{
    var openRows=objectsFields_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),['RCO_REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','STATUS','RESPONSAVEL_NOME','RESPONSAVEL_MATRICULA','REVISAO','ULTIMO_SYNC_EM','ATUALIZADO_EM','PASSAGEM_PENDENTE','PASSAGEM_ID','PASSAGEM_EM']).filter(function(x){
      if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS||''))<0)return false;
      if(String(x.STATUS||'')==='DUPLICADO_LEGADO')return false;
      if(String(x.PASSAGEM_PENDENTE||'').toUpperCase()==='SIM')return false;
      if(batt&&String(x.BATALHAO||'')!==batt)return false;if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;return true;
    });
    var byKey={};
    openRows.forEach(function(x){
      var rid=String(x.RCO_REPORT_ID||'');if(!rid)return;
      var k=rcoDraftUnitDateKey_(x);if(!k||k.split('|').pop()==='')return;
      if(!byKey[k])byKey[k]={byRid:{}};
      var prev=byKey[k].byRid[rid];
      if(!prev||rcoDraftPreferCanonical_(x,prev)>0||(rcoDraftPreferCanonical_(x,prev)===0&&Number(x._row||0)<Number(prev._row||0)))byKey[k].byRid[rid]=x;
    });
    Object.keys(byKey).forEach(function(k){
      var uniq=Object.keys(byKey[k].byRid).map(function(rid){return byKey[k].byRid[rid];});
      if(!uniq.length)return;
      var canon=uniq.slice().sort(function(a,b){return rcoDraftPreferCanonical_(b,a)||Number(a._row||0)-Number(b._row||0);})[0];
      var legacy=[];
      uniq.forEach(function(x){
        if(String(x.RCO_REPORT_ID||'')===String(canon.RCO_REPORT_ID||''))return;
        legacy.push({reportId:String(x.RCO_REPORT_ID||''),serviceId:'',status:String(x.STATUS||'')});
      });
      list.push({reportId:canon.RCO_REPORT_ID,data:canon.DATA_SERVICO,batalhao:canon.BATALHAO,companhia:canon.COMPANHIA,status:canon.STATUS,revision:Number(canon.REVISAO||0),ultimoSyncEm:canon.ULTIMO_SYNC_EM||'',passagemPendente:false,passagemId:canon.PASSAGEM_ID||'',passagemEm:canon.PASSAGEM_EM||'',responsavel:String(canon.RESPONSAVEL_NOME||''),matricula:String(canon.RESPONSAVEL_MATRICULA||''),logicalKey:k,legacyDuplicates:legacy,duplicadoLegadoHint:legacy.length>0});
    });
  }
  return list.map(function(x){return {module:'RCO',mode:receive?'receive':'continue',reportId:String(x.reportId||''),data:dateText_(x.data),batalhao:String(x.batalhao||''),companhia:String(x.companhia||''),status:String(x.status||''),revision:Number(x.revision||0),ultimoSyncEm:String(x.ultimoSyncEm||''),lastSync:String(x.ultimoSyncEm||''),passagemPendente:!!x.passagemPendente,passagemId:String(x.passagemId||''),passagemEm:String(x.passagemEm||''),responsavel:String(x.responsavel||''),comandante:String(x.responsavel||x.passagemDe||''),matricula:String(x.matricula||''),logicalKey:String(x.logicalKey||rcoDraftUnitDateKey_({BATALHAO:x.batalhao,COMPANHIA:x.companhia,DATA_SERVICO:x.data})),legacyDuplicates:Array.isArray(x.legacyDuplicates)?x.legacyDuplicates:[],duplicadoLegadoHint:!!x.duplicadoLegadoHint||!!(x.legacyDuplicates&&x.legacyDuplicates.length)};})
    .sort(function(a,b){var d=String(b.data||'').localeCompare(String(a.data||''));return d||String(b.ultimoSyncEm||'').localeCompare(String(a.ultimoSyncEm||''));});
}
function accessOpenServices_(p){
  var module=String(p.module||'RSD').toUpperCase(),mode=String(p.mode||'continue').toLowerCase();
  if(['continue','receive'].indexOf(mode)<0)throw new Error('Modo de acesso inválido.');
  if(module==='RSD')return accessRsdOpen_(p,mode);
  if(module==='RCO')return accessRcoOpen_(p,mode);
  throw new Error('Módulo de acesso inválido.');
}

function rsdActive_(p) {
  p=p||{};
  var mat=normMat_(p.matricula||'');if(!mat)return [];
  var reportHint=String(p.reportId||''),serviceHint=String(p.serviceId||''),vtrHint=normVtrPrefix_(p.vtrPrincipal||p.vtr||''),guHint=String(p.guarnicao||'').trim().toLowerCase();
  var q=Object.assign({},p);q.matricula='';q.batalhao='';q.companhia='';q.data='';q.guarnicao='';
  var items=rsdList_(q),rs=sheet_(P3_SHEET_ID,'RSD'),rows=objects_(rs),rowMap={};
  rows.forEach(function(r){rowMap[String(r.REPORT_ID||'')]=r});
  var active=['EM_SERVICO','RETIFICACAO_SOLICITADA','PASSAGEM_DISPONIVEL'],out=[];
  items.forEach(function(x){
    if(active.indexOf(String(x.status||''))<0)return;
    var row=rowMap[String(x.reportId||'')]||null,owner=rsdOwnerMat_(row);
    if(owner!==mat)return;
    var score=100;
    if(reportHint&&String(x.reportId||'')===reportHint)score+=100;
    if(serviceHint&&String(x.serviceId||'')===serviceHint)score+=80;
    if(vtrHint&&normVtrPrefix_(x.vtrPrincipal||'')===vtrHint)score+=50;
    if(guHint&&String(x.guarnicao||'').trim().toLowerCase()===guHint)score+=20;
    x.ownerVerified=true;x.matchScore=score;out.push(x);
  });
  return out.sort(function(a,b){
    if(Number(b.matchScore||0)!==Number(a.matchScore||0))return Number(b.matchScore||0)-Number(a.matchScore||0);
    return String(b.ultimoRascunhoEm||b.iniciadoEm||'').localeCompare(String(a.ultimoRascunhoEm||a.iniciadoEm||''));
  });
}
function rsdGet_(reportId) {
  var row=findOne_(sheet_(P3_SHEET_ID,'RSD'),'REPORT_ID',reportId);if(!row)throw new Error('RSD não localizado.');
  var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('Conteúdo do RSD indisponível.');
  p.versao=Number(row.VERSAO||1);p.serviceId=row.SERVICE_ID||p.serviceId||'';p.segmento=Number(row.SEGMENTO||p.segmento||1);p.rsdAnteriorId=row.RSD_ANTERIOR_ID||p.rsdAnteriorId||'';p.passagemOrigemId=row.PASSAGEM_ORIGEM_ID||p.passagemOrigemId||'';
  p.draftRevision=Number(row.DRAFT_REVISION||0)||0;p.headerEditAuth=String(row.HEADER_EDIT_AUTH||'');
  if(['EM_SERVICO','RETIFICACAO_SOLICITADA'].indexOf(String(row.STATUS||''))>=0)p.cloudRegistered=true;
  p.centralStatus=String(row.STATUS||'');p.revisaoCoordenador={status:row.REVIEW_STATUS||'',motivo:row.REVIEW_MOTIVO||'',observacao:row.REVIEW_OBSERVACAO||'',autorNome:row.REVIEW_AUTOR_NOME||'',autorMatricula:row.REVIEW_AUTOR_MATRICULA||'',em:row.REVIEW_EM||''};
  p.cancelamento={motivo:row.CANCELADO_MOTIVO||'',autorNome:row.CANCELADO_POR_NOME||'',autorMatricula:row.CANCELADO_POR_MATRICULA||'',perfil:row.CANCELADO_POR_PERFIL||'',em:row.CANCELADO_EM||''};
  p.finalizacaoCoordenador={forcada:String(row.FINALIZACAO_FORCADA||'').toUpperCase()==='SIM',motivo:row.FINALIZACAO_FORCADA_MOTIVO||'',autorNome:row.FINALIZACAO_FORCADA_POR_NOME||'',autorMatricula:row.FINALIZACAO_FORCADA_POR_MATRICULA||'',perfil:row.FINALIZACAO_FORCADA_POR_PERFIL||'',em:row.FINALIZACAO_FORCADA_EM||''};
  // Fonte oficial do responsável do segmento: colunas da planilha RSD (não o payload local).
  p.guarnicao=p.guarnicao||{};
  if(String(row.RESPONSAVEL_MATRICULA||'').trim()){
    p.guarnicao.matricula=normMat_(row.RESPONSAVEL_MATRICULA);
    p.matriculaResponsavel=p.guarnicao.matricula;
    if(String(row.RESPONSAVEL_NOME||'').trim())p.guarnicao.responsavel=String(row.RESPONSAVEL_NOME||'');
    if(String(row.RESPONSAVEL_POSTO_GRAD||'').trim())p.guarnicao.postoGrad=String(row.RESPONSAVEL_POSTO_GRAD||'');
  }
  return p;
}
function comandoRsdPatch_(payload){
  var reportId=String(payload.reportId||'');if(!reportId)throw new Error('Informe o RSD.');
  var s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);if(!row)throw new Error('RSD não localizado.');
  var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('Conteúdo do RSD indisponível.');
  p.guarnicao=p.guarnicao||{};
  if(payload.equipe!==undefined){
    var equipe=Array.isArray(payload.equipe)?payload.equipe:[];
    p.guarnicao.equipe=equipe.map(function(m){
      return {matricula:normMat_(m.matricula||''),nome:String(m.nome||'').trim(),postoGrad:String(m.postoGrad||'').trim(),papel:String(m.papel||'EFETIVO').trim()};
    }).filter(function(m){return m.matricula||m.nome;});
    p.guarnicao.efetivo=String(payload.efetivoTexto||(p.guarnicao.equipe.length?('0'+p.guarnicao.equipe.length).slice(-2)+' PMs':p.guarnicao.efetivo||''));
  }
  if(payload.viaturas!==undefined){
    var vs=Array.isArray(payload.viaturas)?payload.viaturas:[];
    p.viaturas=vs.map(function(v,i){
      if(typeof v==='string')v={prefixo:v};
      return {prefixo:normVtrPrefix_(v.prefixo||v.viatura||''),placa:String(v.placa||'').toUpperCase(),marcaModelo:String(v.marcaModelo||'').trim(),tipo:normVehicleTipo_(v.tipo||''),ordem:i+1,origem:v.origem||'GESTAO_SISTEMA'};
    }).filter(function(v){return v.prefixo;});
    p.guarnicao.viaturas=p.viaturas;
    p.guarnicao.vtrPrincipal=p.viaturas[0]?p.viaturas[0].prefixo:'';
    p.guarnicao.viatura=p.viaturas.map(function(v){return v.prefixo;}).join(', ');
  }
  p.auditoriaSistema=p.auditoriaSistema||[];
  p.auditoriaSistema.push({em:nowIso_(),autorMatricula:normMat_(payload.autorMatricula||''),autorNome:String(payload.autorNome||''),acao:String(payload.acao||'PATCH'),motivo:String(payload.motivo||'')});
  var json=JSON.stringify(p),saved=saveJsonPayload_(reportId,Number(row.VERSAO||1),json,'RSD_PAYLOAD_FOLDER_ID','Central RSD - Payloads',row.PAYLOAD_FILE_ID||'');
  row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);
  if(p.guarnicao.vtrPrincipal)row.VTR_PRINCIPAL=p.guarnicao.vtrPrincipal;
  row.SINCRONIZADO_EM=nowIso_();
  upsert_(s,'REPORT_ID',reportId,row);
  syncRsdVehicles_(p,reportId);
  return {ok:true,message:'RSD atualizado pela Gestão de Sistema.',rsd:rsdGet_(reportId)};
}
function sistemaAuth_(p){
  p=p||{};
  var mat=normMat_(p.matricula||'');
  if(!mat||mat.replace(/\D/g,'').length!==7)throw new Error('Informe a matrícula completa (000.000-0).');
  var dig=mat.replace(/\D/g,''), mil=null, list=objects_(sheet_(P3_SHEET_ID,'MILITARES'));
  for(var i=0;i<list.length;i++){
    var rowMat=normMat_(list[i].MATRICULA||list[i].matricula||'');
    var rowDig=String(list[i].MATRICULA||list[i].matricula||'').replace(/\D/g,'');
    if(rowMat===mat||rowDig===dig){mil=list[i];break;}
  }
  if(!mil)throw new Error('Matrícula '+mat+' não encontrada no Cadastro Mestre (aba MILITARES). Cadastre o militar ou confira a matrícula.');
  return {
    ok:true,
    message:'Acesso autorizado.',
    militar:{
      matricula:normMat_(mil.MATRICULA||mat),
      nome:String(mil.NOME||mil.nome||'').trim(),
      postoGrad:String(mil.POSTO_GRAD||mil.postoGrad||'').trim(),
      batalhao:String(mil.BATALHAO||''),
      companhia:String(mil.COMPANHIA||'')
    }
  };
}
/** Uso interno via clasp run — não expor em doGet/doPost. */
function adminSetSistemaToken(token){
  token=String(token||'').trim();
  if(!token)throw new Error('Informe a senha.');
  PropertiesService.getScriptProperties().setProperty('SISTEMA_TOKEN',token);
  return {ok:true,message:'SISTEMA_TOKEN atualizado.'};
}
function sistemaFeedbackSheet_(){
  return sheetOrCreate_(P3_SHEET_ID,'SISTEMA_FEEDBACK',['FEEDBACK_ID','CRIADO_EM','MATRICULA','NOME','TIPO','MENSAGEM','USER_AGENT','ORIGEM','STATUS','LIDO_EM','LIDO_POR_MATRICULA']);
}
function sistemaFeedbackEnviar_(payload){
  payload=payload||{};
  var mat=normMat_(payload.matricula||'');
  var msg=String(payload.mensagem||payload.message||'').trim();
  var tipo=String(payload.tipo||'SUGESTAO').toUpperCase();
  if(['SUGESTAO','DIFICULDADE','CRITICA','OUTRO'].indexOf(tipo)<0)tipo='SUGESTAO';
  if(!mat||mat.replace(/\D/g,'').length!==7)throw new Error('Informe a matrícula completa (000.000-0).');
  if(msg.length<8)throw new Error('Escreva uma mensagem com pelo menos algumas palavras.');
  if(msg.length>4000)throw new Error('Mensagem muito longa. Resuma em até 4000 caracteres.');
  var mil=findOne_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat);
  var nome=String(payload.nome||(mil&&mil.NOME)||'').trim();
  var id=uid_('fb');
  append_(sistemaFeedbackSheet_(),{
    FEEDBACK_ID:id,CRIADO_EM:nowIso_(),MATRICULA:mat,NOME:nome,TIPO:tipo,MENSAGEM:msg,
    USER_AGENT:String(payload.userAgent||'').slice(0,240),ORIGEM:'INDEX_CENTRAL',STATUS:'NOVO',LIDO_EM:'',LIDO_POR_MATRICULA:''
  });
  return {ok:true,message:'Mensagem enviada à Gestão de Sistema. Obrigado pelo retorno.',feedbackId:id};
}
function sistemaFeedbackList_(p){
  p=p||{};
  var list=objects_(sistemaFeedbackSheet_()).slice().reverse();
  if(p.status)list=list.filter(function(x){return String(x.STATUS||'')===String(p.status)});
  return {ok:true,items:list.slice(0,300)};
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
      LOCAL_PREVISTO:o.localPrevisto||po.LOCAL_PREVISTO||'',
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

function rsdForceFinalize_(payload){
  var reportId=String(payload.reportId||''),motivo=String(payload.motivo||payload.observacao||'').trim(),s=sheet_(P3_SHEET_ID,'RSD'),row=findOne_(s,'REPORT_ID',reportId);
  if(!row)throw new Error('RSD não localizado.');
  if(String(row.STATUS)!=='EM_SERVICO')throw new Error('A finalização excepcional só pode ser aplicada a RSD que ainda esteja EM SERVIÇO. Situação atual: '+String(row.STATUS||'').replace(/_/g,' ')+'.');
  if(!motivo)throw new Error('Informe o motivo da finalização excepcional.');
  var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('O último rascunho do RSD está indisponível para finalização pelo Coordenador.');
  var autorMatricula=normMat_(payload.autorMatricula||''),autorNome=String(payload.autorNome||''),perfil=String(payload.perfil||'CPU'),agora=nowIso_();
  var version=Math.max(Number(row.VERSAO||1)+1,Number(p.versao||p.version||0)+1),batt=String(row.BATALHAO||''),comp=String(row.COMPANHIA||''),serviceId=String(row.SERVICE_ID||p.serviceId||(p.servico||{}).serviceId||''),seg=Number(row.SEGMENTO||p.segmento||(p.servico||{}).segmento||1)||1;
  p.versao=version;p.version=version;p.centralStatus='AGUARDANDO_ANALISE';p.finalizadoEm=agora;
  if(p.servico&&typeof p.servico==='object')p.servico.finalizadoEm=agora;
  p.finalizacaoCoordenador={forcada:true,motivo:motivo,autorMatricula:autorMatricula,autorNome:autorNome,perfil:perfil,em:agora};
  var json=JSON.stringify(p),saved=saveJsonPayload_(reportId,version,json);
  ensureHeaders_(s,['FINALIZACAO_FORCADA','FINALIZACAO_FORCADA_MOTIVO','FINALIZACAO_FORCADA_POR_MATRICULA','FINALIZACAO_FORCADA_POR_NOME','FINALIZACAO_FORCADA_POR_PERFIL','FINALIZACAO_FORCADA_EM','REVIEW_STATUS']);
  row.VERSAO=version;row.STATUS='AGUARDANDO_ANALISE';row.FINALIZADO_EM=agora;row.ULTIMO_RASCUNHO_EM=agora;row.SINCRONIZADO_EM=agora;row.EDIT_LEASE_UNTIL='';
  row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);row.REVIEW_STATUS='AGUARDANDO_ANALISE';
  row.FINALIZACAO_FORCADA='SIM';row.FINALIZACAO_FORCADA_MOTIVO=motivo;row.FINALIZACAO_FORCADA_POR_MATRICULA=autorMatricula;row.FINALIZACAO_FORCADA_POR_NOME=autorNome;row.FINALIZACAO_FORCADA_POR_PERFIL=perfil;row.FINALIZACAO_FORCADA_EM=agora;
  upsert_(s,'REPORT_ID',reportId,row);
  syncRsdVehicles_(p,reportId);syncRsdOperations_(p,reportId,batt,comp,version);syncRsdOccurrences_(p,reportId,batt,comp);syncRsdCirvcs_(p,reportId,batt,comp,serviceId,seg);
  audit_('RSD',reportId,version,'FINALIZACAO_FORCADA_COORDENADOR',autorMatricula,autorNome,batt,comp,{motivo:motivo,perfil:perfil,statusAnterior:'EM_SERVICO',statusNovo:'AGUARDANDO_ANALISE'});
  return {ok:true,message:'RSD finalizado excepcionalmente pelo Coordenador e encaminhado para análise.',reportId:reportId,version:version,status:'AGUARDANDO_ANALISE',forced:true};
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
  var perfil=String(payload.perfil||'').toUpperCase(),autorMat=normMat_(payload.autorMatricula||'');
  if(perfil==='GUARNICAO'){
    if(!/^\d{3}\.\d{3}-\d$/.test(autorMat))throw new Error('Informe a matrícula do comandante para excluir/cancelar o próprio relatório.');
    var ownerMat=rsdOwnerMat_(row);
    if(!ownerMat||ownerMat!==autorMat)throw new Error('Este relatório pertence a outro comandante. Somente o próprio responsável pode excluí-lo; em caso de necessidade, solicite ao Coordenador.');
  }
  if(String(row.STATUS)==='PASSAGEM_DISPONIVEL')throw new Error('Há uma passagem de serviço aguardando recebimento. Cancele primeiro a passagem e, se necessário, cancele depois o registro.');
  if(String(row.STATUS)==='INCLUIDO_RCO'){
    if(perfil==='GUARNICAO')throw new Error('Este RSD já foi incorporado ao RCO e não pode ser cancelado pela guarnição.');
    if(!linkedRcoInRetification_(row))throw new Error('Este RSD já foi incorporado a um RCO consolidado. O P3 deve reabrir formalmente o RCO para retificação antes do cancelamento.');
  }
  if(!String(payload.motivo||'').trim())throw new Error('Informe o motivo do cancelamento.');
  ensureHeaders_(s,['CANCELADO_MOTIVO','CANCELADO_POR_MATRICULA','CANCELADO_POR_NOME','CANCELADO_POR_PERFIL']);
  row.STATUS='CANCELADO';row.CANCELADO_EM=nowIso_();row.CANCELADO_MOTIVO=String(payload.motivo||'');row.CANCELADO_POR_MATRICULA=autorMat;row.CANCELADO_POR_NOME=String(payload.autorNome||'');row.CANCELADO_POR_PERFIL=String(payload.perfil||'');row.EDIT_LEASE_UNTIL='';row.EDIT_DEVICE_ID='';row.SINCRONIZADO_EM=nowIso_();
  upsert_(s,'REPORT_ID',reportId,row);audit_('RSD',reportId,Number(row.VERSAO||1),'CANCELADO',row.CANCELADO_POR_MATRICULA,row.CANCELADO_POR_NOME,row.BATALHAO,row.COMPANHIA,payload);
  return {ok:true,message:'Relatório excluído do serviço ativo e preservado apenas para auditoria.',status:'CANCELADO'};
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
  // A credencial do RCO é validada uma única vez no ingresso. COORD_TOKEN e P3_TOKEN são aceitos por assertToken_('coord').
  assertToken_(token,'coord');

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
    if(obj.SERVICE_ID||obj.RSD_REPORT_ID){
      serviceEventUpsert_({eventId:(obj.SERVICE_ID||obj.RSD_REPORT_ID)+'::CIRVC::'+id,serviceId:obj.SERVICE_ID,rsdReportId:obj.RSD_REPORT_ID,segmento:obj.SEGMENTO,
        tipo:'CIRVC',subtipo:obj.MOTIVO||'',data:obj.DATA_CADASTRO,hora:obj.HORA_CADASTRO,titulo:'CIRVC — '+(obj.PLACA||obj.NUMERO_TERMO||'veículo'),
        resumo:[obj.NUMERO_TERMO?'Termo '+obj.NUMERO_TERMO:'',obj.MARCA_MODELO||'',obj.LOCAL_CUSTODIA?'Destino: '+obj.LOCAL_CUSTODIA:''].filter(Boolean).join(' • '),
        referenciaId:id,numeroDocumento:obj.NUMERO_TERMO||'',batalhao:obj.BATALHAO,companhia:obj.COMPANHIA,guarnicao:obj.GUARNICAO,vtr:obj.PREFIXO_ORIGEM,
        comandanteMatricula:obj.CADASTRADO_POR_MATRICULA,payload:{placa:obj.PLACA||'',tipo:obj.TIPO||'',marcaModelo:obj.MARCA_MODELO||'',local:obj.LOCAL_CUSTODIA||'',localApreensao:obj.LOCAL_APREENSAO||'',motivo:obj.MOTIVO||''}});
    }
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
  var alter=items.filter(function(x){return checklistShouldOpenAlteracao_(x);});
  var dt=String(c.dataHora||now),parts=dt.split('T');
  var sig=saveDataUrl_(c.assinaturaDataUrl,'assinatura-checklist-'+id+'.png','CHECKLIST_PHOTO_FOLDER_ID','Central Checklist - Fotos');
  var obj={CHECKLIST_ID:id,DATA_SERVICO:dateText_(parts[0]),HORA_INICIO:(parts[1]||'').slice(0,5),BATALHAO:batt,COMPANHIA:comp,
    VIATURA_ID:v.viaturaId||c.viaturaId||'',PREFIXO:v.prefixo||c.prefixo||'',PLACA:v.placa||c.placa||'',MARCA_MODELO:v.marcaModelo||c.marcaModelo||'',
    TIPO:normVehicleTipo_(v.tipo||c.tipo||lookupViaturaTipo_(v.prefixo||c.prefixo||'')||''),
    CONDUTOR_MATRICULA:normMat_(c.condutorMatricula||''),CONDUTOR_NOME:c.condutorNome||'',TURNO:c.turno||'',LOCAL_INSPECAO:c.local||'',
    KM_INICIAL:c.km||'',STATUS_GERAL:alter.length?'COM_ALTERACAO':'SEM_ALTERACAO',QTD_ALTERACOES:alter.length,CRIADO_EM:c.criadoEm||now,
    FINALIZADO_EM:now,VERSAO:c.versao||1,ORIGEM:'CENTRAL_RELATORIOS',ASSINATURA_URL:sig.fileUrl||'',OBSERVACOES:c.observacoes||''};
  upsert_(sheet_(CHECKLIST_SHEET_ID,'CHECKLISTS'),'CHECKLIST_ID',id,obj);
  deleteWhere_(sheet_(CHECKLIST_SHEET_ID,'CHECKLIST_ITENS'),'CHECKLIST_ID',id);
  var si=sheet_(CHECKLIST_SHEET_ID,'CHECKLIST_ITENS'), sa=sheet_(CHECKLIST_SHEET_ID,'ALTERACOES');
  items.forEach(function(it){
    var iid=it.itemId||uid_('item'), irregular=checklistShouldOpenAlteracao_(it), altId='';
    if(irregular){
      altId=it.pendenciaId||('alt-'+id+'-'+String(iid).replace(/[^A-Za-z0-9_-]/g,'-'));
      var old=findOne_(sa,'ALTERACAO_ID',altId);
      upsert_(sa,'ALTERACAO_ID',altId,{ALTERACAO_ID:altId,CHECKLIST_ID:id,VIATURA_ID:obj.VIATURA_ID,PREFIXO:obj.PREFIXO,PLACA:obj.PLACA||'',TIPO:obj.TIPO||'',DATA_CONSTACAO:obj.DATA_SERVICO,
        BATALHAO:batt,COMPANHIA:comp,ITEM_CODIGO:iid,ITEM_NOME:it.item||'',SECAO:it.grupo||'',DESCRICAO:it.descricao||'',STATUS:old&&old.STATUS||'ABERTA',
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
  var fields=['ALTERACAO_ID','CHECKLIST_ID','VIATURA_ID','PREFIXO','PLACA','TIPO','BATALHAO','COMPANHIA','ITEM_CODIGO','ITEM_NOME','SECAO','DESCRICAO','STATUS','DATA_CONSTACAO','ABERTO_EM','EM_ANALISE_EM','EM_MANUTENCAO_EM','RESOLVIDO_EM','RESPONSAVEL_MATRICULA','RESPONSAVEL_NOME','FOTO_FINAL_URL','ATUALIZADO_EM','SOLUCAO'];
  var pend=objectsFields_(sheet_(CHECKLIST_SHEET_ID,'ALTERACOES'),fields).map(function(x){
    return Object.assign({},x,{
      ITEM:String(x.ITEM_NOME||x.ITEM||''),
      GRUPO:String(x.SECAO||x.GRUPO||''),
      ABERTA_EM:String(x.ABERTO_EM||x.ABERTA_EM||''),
      DATA_PENDENCIA:dateText_(x.DATA_CONSTACAO||x.ABERTO_EM||x.ABERTA_EM||'')
    });
  });
  pend=filterCommon_(pend,p);
  if(p.status) pend=pend.filter(function(x){return String(x.STATUS)===String(p.status);});
  return {ok:true,pendencias:pend.slice(-1000).reverse()};
}
function motomecanizacaoUpdate_(payload) {
  var id=String(payload.pendenciaId||payload.alteracaoId||''), s=sheet_(CHECKLIST_SHEET_ID,'ALTERACOES'), row=findOne_(s,'ALTERACAO_ID',id);
  if(!row) throw new Error('Alteração não localizada.');
  var old=String(row.STATUS||''), novo=String(payload.status||old), now=nowIso_();
  var mat=normMat_(payload.responsavelMatricula||row.RESPONSAVEL_MATRICULA||'');
  var nome=String(payload.responsavelNome||row.RESPONSAVEL_NOME||'').trim();
  if(mat){
    var mil=findOne_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat);
    if(mil){
      if(!nome) nome=String(mil.NOME||'').trim();
      row.RESPONSAVEL_POSTO_GRAD=String(mil.POSTO_GRAD||row.RESPONSAVEL_POSTO_GRAD||'');
    } else if(!nome) {
      throw new Error('Matrícula '+mat+' não localizada no Cadastro Mestre de militares. Cadastre o militar ou informe o nome.');
    }
  }
  if(!mat) throw new Error('Informe a matrícula do responsável pela atualização.');
  if(!nome) throw new Error('Informe o nome do responsável pela atualização.');
  row.STATUS=novo;row.RESPONSAVEL_MATRICULA=mat;row.RESPONSAVEL_NOME=nome;row.RESPONSAVEL_SETOR=payload.responsavelSetor||row.RESPONSAVEL_SETOR||'Motomecanização';
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
    var d=dateText_(x.DATA_CONSTACAO||x.DATA_PENDENCIA||x.DATA_SERVICO||x.DATA||x.DATA_HORA||x.ABERTA_EM||x.ABERTO_EM||x.DATA_CADASTRO||'');
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
function p3ObjectsForRowsFields_(s,h,rows,limit,fields){
  var chosen=(rows||[]).slice().sort(function(a,b){return a-b});
  if(limit&&chosen.length>limit)chosen=chosen.slice(chosen.length-limit);
  var wanted={},cols=[];(fields||[]).forEach(function(k){var i=h.indexOf(k);if(i>=0&&!wanted[k]){wanted[k]=1;cols.push(i)}});
  if(!chosen.length||!cols.length)return [];
  cols.sort(function(a,b){return a-b});var groups=[],g=null;
  cols.forEach(function(i){if(!g||i-g.end>2||i-g.start>24){g={start:i,end:i};groups.push(g)}else g.end=i});
  var byRow={};chosen.forEach(function(r){byRow[String(r)]={_row:r}});
  p3RowChunks_(chosen).forEach(function(ch){
    groups.forEach(function(gr){
      var vals=s.getRange(ch.start,gr.start+1,ch.end-ch.start+1,gr.end-gr.start+1).getValues();
      for(var ri=0;ri<vals.length;ri++){
        var rowNo=ch.start+ri,o=byRow[String(rowNo)];if(!o)continue;
        for(var ci=gr.start;ci<=gr.end;ci++){var k=h[ci];if(k&&wanted[k])o[k]=vals[ri][ci-gr.start]}
      }
    });
  });
  return chosen.map(function(r){return byRow[String(r)]}).filter(Boolean);
}
function p3FastFields_(sheetName,p,limit,dateCandidates,fields){
  var s=ss_(P3_SHEET_ID).getSheetByName(sheetName);if(!s)return [];
  var idx=p3IndexedRows_(s,p||{},dateCandidates);return p3ObjectsForRowsFields_(s,idx.headers,idx.rows,limit,fields);
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
  var di=dateText_(p.dataInicio||p.inicio||''),df=dateText_(p.dataFim||p.fim||'');
  var scan=p3ProductionFastEffective_(p,di,df),list=scan.items||[],byCompany={},byDate={},total=0;
  list.forEach(function(x){
    var q=p3MetricContribution_(x,code);if(!q)return;
    var co=String(x.COMPANHIA||'Não informada'),d=dateText_(x.DATA_SERVICO||'');
    total+=q;byCompany[co]=(byCompany[co]||0)+q;if(d)byDate[d]=(byDate[d]||0)+q;
  });
  return {ok:true,indicadores:catalog.map(function(x){return x.nome}),catalogo:catalog,indicador:meta,total:total,sourceStats:scan.sourceStats,fast:true,
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
  var t0=new Date().getTime();
  function done_(out){out=out||{};out.queryMs=new Date().getTime()-t0;out.fastQuery=true;return out}
  var view=String(p.view||'controle-diario'),list;
  if(view==='controle-diario'){
    var rsdFields=['DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','STATUS','RESPONSAVEL_NOME','VERSAO','RCO_REPORT_ID'];
    var rsd=p3FastFields_('RSD',p,1000,null,rsdFields),rco=p3FastFields_('RCO',p,500,null,['REPORT_ID']);
    return done_({ok:true,rsd:rsd.reverse(),rco:rco.reverse()});
  }
  if(view==='produtividade-matriz')return done_(p3ProductivityMatrix_(p));
  if(view==='produtividade'){
    var prod=p3ProductionFacts_(p,'effective',5000);
    return done_({ok:true,items:prod.items.reverse(),total:prod.total,sourceStats:prod.sourceStats});
  }
  if(view==='historico'){
    var hist=p3ProductionFacts_(p,'historico',5000);
    return done_({ok:true,items:hist.items.reverse(),totalHistorico:hist.totalHistorico,totalDigital:hist.totalDigital,sourceStats:hist.sourceStats});
  }
  if(view==='rco'){
    var draftFields=['RCO_REPORT_ID','STATUS','RETIFICACAO_MOTIVO','RETIFICACAO_ABERTA_EM','RETIFICACAO_ABERTA_POR'];
    var rcoFields=['DATA_SERVICO','BATALHAO','COMPANHIA','VERSAO','STATUS','MODO_CONSOLIDACAO','CONSOLIDADOR_POSTO_GRAD','CONSOLIDADOR_NOME','CONSOLIDADOR_MATRICULA','QUANTIDADE_GUARNICOES','ENVIADO_EM','RETIFICADO_EM','REPORT_ID'];
    var drafts=p3FastFields_('RCO_RASCUNHOS',p,2000,null,draftFields),draftMap={};drafts.forEach(function(d){draftMap[String(d.RCO_REPORT_ID||'')]=d});
    list=p3FastFields_('RCO',p,2000,null,rcoFields).map(function(x){
      var d=draftMap[String(x.REPORT_ID||'')]||{};x.DRAFT_STATUS=d.STATUS||'';x.RETIFICACAO_MOTIVO=d.RETIFICACAO_MOTIVO||'';x.RETIFICACAO_ABERTA_EM=d.RETIFICACAO_ABERTA_EM||'';x.RETIFICACAO_ABERTA_POR=d.RETIFICACAO_ABERTA_POR||'';return x;
    });
  }
  else if(view==='rco-origens'){
    list=p3FastFields_('RCO_ORIGENS',p,2000,['DATA_SERVICO','DATA'],['RCO_REPORT_ID','RSD_REPORT_ID','SERVICE_ID','SEGMENTO','GUARNICAO','STATUS','VERSAO','DATA_SERVICO','BATALHAO','COMPANHIA','INCLUIDO_EM']);
    if(p.rcoReportId)list=list.filter(function(x){return String(x.RCO_REPORT_ID||'')===String(p.rcoReportId)});
  }
  else if(view==='operacoes'){
    var opFields=['REGISTRO_ID','DATA','COMPANHIA','GUARNICAO_RESPONSAVEL','OPERACAO','TURNO','LOCAL','LATITUDE','LONGITUDE','PESSOAS_ABORDADAS','MOTOCICLETAS_ABORDADAS','AUTOMOVEIS_ABORDADOS','CICLOMOTORES_ABORDADOS','ART_165','ART_165_A','ART_230_XI','OUTROS_AITS_COM_ABORDAGEM','AITS_SEM_ABORDAGEM','PRISOES','STATUS_REGISTRO'];
    var podFields=['REGISTRO_ID','STATUS_CUMPRIMENTO','LOCAL_PREVISTO','LOCAL_EXECUTADO','COORDENADAS_EXECUTADAS'];
    var ops=p3FastFields_('OPERACOES',p,2000,['DATA'],opFields),pods=p3FastFields_('POD_EXECUCAO',p,4000,['DATA'],podFields),pm={};pods.forEach(function(x){pm[String(x.REGISTRO_ID||'')]=x});
    list=ops.map(function(x){var d=pm[String(x.REGISTRO_ID||'')]||{};x.POD_STATUS=d.STATUS_CUMPRIMENTO||'';x.LOCAL_PREVISTO=d.LOCAL_PREVISTO||'';x.LOCAL_EXECUTADO=d.LOCAL_EXECUTADO||x.LOCAL||'';x.COORDENADAS_EXECUTADAS=d.COORDENADAS_EXECUTADAS||[x.LATITUDE,x.LONGITUDE].filter(Boolean).join(', ');return x});
  }
  else if(view==='pod')list=p3FastObjects_('POD_EXECUCAO',p,2000,['DATA']);
  else if(view==='ocorrencias')list=p3FastObjects_('OCORRENCIAS',p,2000,['DATA']);
  else if(view==='prisoes')list=p3FastFields_('PRISOES',p,2000,['DATA','DATA_SERVICO'],['DATA','DATA_SERVICO','COMPANHIA','GUARNICAO','SITUACAO','TIPIFICACAO_PRINCIPAL','TIPIFICACOES_RELACIONADAS','QUANTIDADE','OCORRENCIA_ID','ORIGEM_RELATORIO']);
  else if(view==='cirvc'){
    var cirvcFields=['CIRVC_ID','REGISTRO_ID','DATA_CADASTRO','DATA_SERVICO','DATA','COMPANHIA','GUARNICAO','PLACA','TIPO','MARCA_MODELO','LOCAL_CUSTODIA','LOCAL_DEIXADO','STATUS_CUSTODIA','DESTINO_FINAL','BAIXADO_EM','ORIGEM'];
    var newer=p3FastFields_('CIRVC_CUSTODIA',p,2000,['DATA_CADASTRO','DATA_SERVICO','DATA'],cirvcFields),legacy=p3FastFields_('CIRVC',p,2000,['DATA'],cirvcFields).map(p3LegacyCirvcMap_);
    list=p3MergeById_(newer,legacy,['CIRVC_ID','REGISTRO_ID']);
  }
  else if(view==='auditoria')list=p3FastFields_('AUDITORIA_VERSOES',p,2000,['DATA_HORA'],['DATA_HORA','TIPO_ENTIDADE','ENTIDADE_ID','VERSAO','ACAO','RESPONSAVEL_MATRICULA','RESPONSAVEL_NOME','COMPANHIA','ORIGEM']);
  else if(view==='fisco')list=p3FastFields_('FISCO',p,2000,['DATA'],['DATA','BATALHAO','COMPANHIA','GUARNICAO','EFETIVO','VIATURA','QUANTIDADE_OCORRENCIAS','ALTERACOES_EFETIVO','ALTERACOES_VIATURA','MATERIAL_CARGA','ORIGEM_RELATORIO']);
  else if(view==='nace-cicc'){
    var pn=Object.assign({},p);pn.batalhao='';pn.companhia='';pn.guarnicao='';pn.turno='';
    list=p3FastFields_('NACE_CICC',pn,2000,['DATA'],['DATA','HORA','TIPO_OCORRENCIA','NATUREZA','COM_VITIMAS','QUANTIDADE_VITIMAS','OBITOS','MUNICIPIO','RODOVIA','KM','BAIRRO_LOCALIDADE','FONTE','NUMERO_CICC','OBSERVACOES']);
  }
  else if(view==='veiculos-operacionais'){
    var ss=ss_(P3_SHEET_ID),newSheet=ss.getSheetByName('VEICULOS_OPERACIONAIS'),oldSheet=ss.getSheetByName('VEICULOS_RECUPERADOS');
    var vehicleFields=['REGISTRO_ID','DATA','COMPANHIA','GUARNICAO','PLACA_UF','TIPO','MARCA_MODELO','SITUACAO','TIPO_RECUPERACAO_DETALHADA','CLASSIFICACAO_P3','CONTA_COMO_RECUPERADO','PLACA_ORIGINAL_IDENTIFICADA','PLACA_ORIGINAL_UF','RESTRICAO_ORIGINAL','LOCAL','QUANTIDADE_CONDUZIDOS','VALOR_FIPE'];
    var newRows=newSheet?p3FastFields_('VEICULOS_OPERACIONAIS',p,2000,['DATA'],vehicleFields):[],oldRows=oldSheet?p3FastFields_('VEICULOS_RECUPERADOS',p,2000,['DATA'],vehicleFields):[];
    list=p3MergeById_(newRows,oldRows,['REGISTRO_ID']);
  }
  else if(view==='viaturas'){
    list=filterCommon_(objectsFields_(sheet_(P3_SHEET_ID,'VIATURAS'),['PREFIXO','MODELO','MARCA','BATALHAO','COMPANHIA','STATUS','PLACA','TIPO','UNIDADE']),p);
  }
  else if(view==='militares'){
    list=objectsFields_(sheet_(P3_SHEET_ID,'MILITARES'),['MATRICULA','NOME','POSTO_GRAD','BATALHAO','COMPANHIA','UNIDADE','SITUACAO']);
    var mq=String(p.q||p.matricula||'').trim().toLowerCase();
    if(mq)list=list.filter(function(x){return [x.MATRICULA,x.NOME,x.POSTO_GRAD,x.UNIDADE,x.COMPANHIA].join(' ').toLowerCase().indexOf(mq)>=0});
  }
  else throw new Error('Visão P3 desconhecida.');
  return done_({ok:true,items:(list||[]).slice(-2000).reverse()});
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
  p=p||{};
  var rsdFields=['REPORT_ID','SERVICE_ID','SEGMENTO','DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','GUARNICAO_TIPO','VTR_PRINCIPAL','STATUS','RESPONSAVEL_NOME','RESPONSAVEL_POSTO_GRAD','RESPONSAVEL_MATRICULA','INICIADO_EM','FINALIZADO_EM','ULTIMO_RASCUNHO_EM','SINCRONIZADO_EM','RCO_REPORT_ID','EDIT_DEVICE_ID','EDIT_LEASE_UNTIL','CANCELADO_MOTIVO','CANCELADO_EM','CANCELADO_POR_NOME','REVIEW_STATUS'];
  var rcoFields=['RCO_REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','STATUS','RESPONSAVEL_NOME','RESPONSAVEL_MATRICULA','REVISAO','ULTIMO_SYNC_EM','ATUALIZADO_EM','EDIT_DEVICE_ID','EDIT_LEASE_UNTIL','ORIGEM'];
  var passFields=['PASSAGEM_ID','SERVICE_ID','DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','STATUS','ENTREGUE_POR_NOME','ENTREGUE_POR_MATRICULA','DISPONIBILIZADA_EM','RECEBIDA_POR_NOME','RECEBIDA_POR_MATRICULA','RECEBIDA_EM','OBSERVACOES','ATUALIZADO_EM'];
  var audFields=['AUDITORIA_ID','TIPO_ENTIDADE','ENTIDADE_ID','ACAO','DATA_HORA','RESPONSAVEL_NOME','RESPONSAVEL_MATRICULA','BATALHAO','COMPANHIA'];
  var rsd=objectsFields_(sheet_(P3_SHEET_ID,'RSD'),rsdFields).filter(function(x){return masterFilter_(x,p,['DATA_SERVICO']);}),
      rco=objectsFields_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),rcoFields).filter(function(x){return masterFilter_(x,p,['DATA_SERVICO']);}),
      pass=objectsFields_(sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO'),passFields).filter(function(x){return masterFilter_(x,p,['DATA_SERVICO']);}),
      aud=objectsFields_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES'),audFields).filter(function(x){
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
  if(!old&&!data)throw new Error('Informe a data do serviço para iniciar o RCO.');

  // Um único RCO em andamento por unidade/data. Em colisão, devolve o canônico (idempotente).
  if(!old&&data){
    var openPeers=objects_(s).filter(function(x){
      return ['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS||''))>=0 &&
        String(x.STATUS||'')!=='DUPLICADO_LEGADO' &&
        dateText_(x.DATA_SERVICO)===data &&
        String(x.BATALHAO||'')===String(batt) &&
        String(x.COMPANHIA||'')===String(comp) &&
        String(x.RCO_REPORT_ID||'')!==reportId;
    });
    var existing=rcoDraftDedupeOpenRows_(openPeers)[0]||null;
    if(!existing&&openPeers.length)existing=openPeers.slice().sort(function(a,b){return rcoDraftPreferCanonical_(b,a);})[0];
    if(existing){
      return {ok:true,existing:true,message:String(existing.STATUS)==='EM_RETIFICACAO'?'Já existe um RCO desta unidade/data aberto para retificação. Abrindo o relatório canônico.':'Já existe RCO em andamento para esta unidade e data. Abrindo o relatório canônico.',
        reportId:String(existing.RCO_REPORT_ID||''),revision:Number(existing.REVISAO||0),status:String(existing.STATUS||''),
        data:dateText_(existing.DATA_SERVICO),batalhao:String(existing.BATALHAO||''),companhia:String(existing.COMPANHIA||''),ultimoSyncEm:String(existing.ULTIMO_SYNC_EM||'')};
    }
  }

  if(old&&['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(old.STATUS||''))<0)throw new Error('Este RCO já foi finalizado. Para alterar dados consolidados, solicite retificação e aguarde autorização da Gestão de Sistema.');
  assertLease_(old,deviceId,!!payload.forceTakeover);
  var draftStatus=old&&String(old.STATUS)==='EM_RETIFICACAO'?'EM_RETIFICACAO':'EM_ANDAMENTO';
  var respRco=r.responsavelRco||{},cons=r.consolidacaoResponsavel||{},cpus=r.cpu||[],audit=r.auditoria||{},slot=Number(audit.activeSlot||1)||1,cpu=cpus[Math.max(0,slot-1)]||cpus[0]||{};
  var passes=Array.isArray(audit.passagens)?audit.passagens:[],lastPass=passes.length?passes[passes.length-1]:null,passStatus=lastPass?String(lastPass.status||'AGUARDANDO_RECEBIMENTO'):'',passSlot=lastPass?Number(lastPass.slot||0)||0:0,passPending=!!(lastPass&&passStatus==='AGUARDANDO_RECEBIMENTO'&&slot<=passSlot);
  ensureHeaders_(s,['RESPONSAVEL_POSTO_GRAD','PASSAGEM_PENDENTE','PASSAGEM_ID','PASSAGEM_DE','PASSAGEM_EM','PASSAGEM_OBSERVACAO'].concat(RCO_CLOSURE_HEADERS_));
  var closure=rcoMergeClosureFromClient_(old,r);
  r=rcoApplyClosureFlagsToPayload_(r,closure);
  var rev=old?Number(old.REVISAO||0)+1:1,json=JSON.stringify(r),saved=saveJsonPayload_(reportId,'draft-'+rev,json,'RCO_DRAFT_FOLDER_ID','Central RCO - Rascunhos',old&&old.PAYLOAD_FILE_ID||'');
  var obj={RCO_REPORT_ID:reportId,DATA_SERVICO:data,BATALHAO:batt,COMPANHIA:comp,STATUS:draftStatus,
    RESPONSAVEL_MATRICULA:normMat_(respRco.matricula||cons.matricula||cpu.matricula||''),RESPONSAVEL_NOME:respRco.nome||cons.nome||cpu.nome||'',RESPONSAVEL_POSTO_GRAD:respRco.postoGrad||cons.postoGrad||cpu.graduacao||cpu.postoGrad||'',REVISAO:rev,ULTIMO_SYNC_EM:nowIso_(),
    EDIT_DEVICE_ID:deviceId||old&&old.EDIT_DEVICE_ID||'',EDIT_LEASE_UNTIL:deviceId?isoAfterMinutes_(3):(old&&old.EDIT_LEASE_UNTIL||''),
    PASSAGEM_PENDENTE:passPending?'SIM':'NAO',PASSAGEM_ID:lastPass&&lastPass.id||'',PASSAGEM_DE:lastPass&&lastPass.de||'',PASSAGEM_EM:lastPass&&lastPass.em||'',PASSAGEM_OBSERVACAO:lastPass&&lastPass.observacao||'',
    PDF_GERADO:closure.pdfGerado?'SIM':'NAO',PDF_GERADO_EM:closure.pdfGeradoEm||'',
    P3_CONSOLIDADO:closure.p3Consolidado?'SIM':'NAO',P3_CONSOLIDADO_EM:closure.p3ConsolidadoEm||'',
    ENCERRADO:closure.encerrado?'SIM':'NAO',ENCERRADO_EM:closure.encerradoEm||'',
    PAYLOAD_JSON:saved.json,PAYLOAD_FILE_ID:saved.fileId,PAYLOAD_FILE_URL:saved.fileUrl,PAYLOAD_HASH:hash_(json),ATUALIZADO_EM:nowIso_(),ORIGEM:'RCO_WEB'};
  upsert_(s,'RCO_REPORT_ID',reportId,obj);return {ok:true,message:'RCO sincronizado na nuvem.',reportId:reportId,revision:rev,status:draftStatus,pdfGerado:!!closure.pdfGerado,p3Consolidado:!!closure.p3Consolidado,encerrado:!!closure.encerrado};
  }finally{if(createLock)createLock.releaseLock();}
}
function rcoDraftList_(p){
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||''),s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');
  var rows=objectsFields_(s,['RCO_REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','STATUS','RESPONSAVEL_NOME','RESPONSAVEL_MATRICULA','REVISAO','ULTIMO_SYNC_EM','ATUALIZADO_EM','EDIT_DEVICE_ID','EDIT_LEASE_UNTIL','RETIFICACAO_MOTIVO','RETIFICACAO_ABERTA_EM','RETIFICACAO_ABERTA_POR','PASSAGEM_PENDENTE','PASSAGEM_ID','PASSAGEM_DE','PASSAGEM_EM','PASSAGEM_OBSERVACAO','PAYLOAD_JSON','PAYLOAD_FILE_ID','PAYLOAD_FILE_URL','PAYLOAD_HASH']).filter(function(x){
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS))<0)return false;
    if(batt&&String(x.BATALHAO)!==batt)return false;if(comp&&String(x.COMPANHIA)!==String(comp))return false;if(data&&dateText_(x.DATA_SERVICO)!==data)return false;return true;
  });
  return rcoDraftDedupeOpenRows_(rows).map(function(x){
    var pendingText=String(x.PASSAGEM_PENDENTE||'').toUpperCase(),pending=pendingText==='SIM',pid=x.PASSAGEM_ID||'',pde=x.PASSAGEM_DE||'',pem=x.PASSAGEM_EM||'',pobs=x.PASSAGEM_OBSERVACAO||'';
    if(!pendingText){
      try{var pld=loadJsonPayload_(x)||{},a=pld.auditoria||{},passes=Array.isArray(a.passagens)?a.passagens:[],last=passes.length?passes[passes.length-1]:null,slot=Number(a.activeSlot||1)||1,ps=last?String(last.status||'AGUARDANDO_RECEBIMENTO'):'',sl=last?Number(last.slot||0)||0:0;pending=!!(last&&ps==='AGUARDANDO_RECEBIMENTO'&&slot<=sl);pid=last&&last.id||'';pde=last&&last.de||'';pem=last&&last.em||'';pobs=last&&last.observacao||'';}catch(_){}
    }
    return {reportId:x.RCO_REPORT_ID,data:x.DATA_SERVICO,batalhao:x.BATALHAO,companhia:x.COMPANHIA,status:String(x.STATUS||''),responsavel:x.RESPONSAVEL_NOME,matricula:x.RESPONSAVEL_MATRICULA,revision:Number(x.REVISAO||0),ultimoSyncEm:x.ULTIMO_SYNC_EM,editDeviceId:x.EDIT_DEVICE_ID||'',editLeaseUntil:x.EDIT_LEASE_UNTIL||'',retificacaoMotivo:x.RETIFICACAO_MOTIVO||'',retificacaoAbertaEm:x.RETIFICACAO_ABERTA_EM||'',retificacaoAbertaPor:x.RETIFICACAO_ABERTA_POR||'',passagemPendente:pending,passagemId:pid,passagemDe:pde,passagemEm:pem,passagemObservacao:pobs};
  }).sort(function(a,b){return String(b.ultimoSyncEm||'').localeCompare(String(a.ultimoSyncEm||''));});
}
function rcoDraftGet_(reportId){
  var row=findOne_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),'RCO_REPORT_ID',String(reportId||''));
  if(!row)throw new Error('RCO em andamento não localizado.');
  var p=loadJsonPayload_(row);if(!p||!Object.keys(p).length)throw new Error('Rascunho do RCO indisponível.');
  return rcoApplyClosureFlagsToPayload_(p,rcoClosureFlagsFrom_(row,p));
}
function rcoDraftClaim_(payload){
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    var reportId=String(payload.reportId||''),deviceId=String(payload.deviceId||'');if(!reportId||!deviceId)throw new Error('Identificação de continuidade do RCO incompleta.');
    var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=findOne_(s,'RCO_REPORT_ID',reportId);if(!row||['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(row.STATUS))<0)throw new Error('RCO em andamento/retificação não localizado.');
    assertLease_(row,deviceId,!!payload.forceTakeover);row.EDIT_DEVICE_ID=deviceId;row.EDIT_LEASE_UNTIL=isoAfterMinutes_(3);row.ATUALIZADO_EM=nowIso_();upsert_(s,'RCO_REPORT_ID',reportId,row);
    audit_('RCO',reportId,Number(row.REVISAO||1),'ACESSO_CONTINUIDADE',row.RESPONSAVEL_MATRICULA||'',row.RESPONSAVEL_NOME||'',row.BATALHAO,row.COMPANHIA,{deviceId:deviceId,forceTakeover:!!payload.forceTakeover});
    var rco=rcoDraftGet_(reportId),resp=rco&&rco.responsavelRco||{};
    var mat=normMat_(resp.matricula||row.RESPONSAVEL_MATRICULA||'');
    var responsavel={perfil:String(resp.perfil||'CPU'),matricula:mat,nome:String(resp.nome||row.RESPONSAVEL_NOME||''),postoGrad:String(resp.postoGrad||row.RESPONSAVEL_POSTO_GRAD||''),turno:String(resp.turno||'')};
    return {ok:true,message:String(row.STATUS)==='EM_RETIFICACAO'?'RCO em retificação assumido neste aparelho.':'RCO assumido neste aparelho.',rco:rco,revision:Number(row.REVISAO||0),status:String(row.STATUS||''),retificacaoMotivo:row.RETIFICACAO_MOTIVO||'',retificacaoAbertaEm:row.RETIFICACAO_ABERTA_EM||'',retificacaoAbertaPor:row.RETIFICACAO_ABERTA_POR||'',responsavelRegistrado:!!mat,responsavel:responsavel};
  }finally{lock.releaseLock();}
}
var RCO_RETIFICACOES_HEADERS_=['SOLICITACAO_ID','RCO_REPORT_ID','BATALHAO','COMPANHIA','DATA_SERVICO','SOLICITANTE_MATRICULA','SOLICITANTE_NOME','MOTIVO','STATUS','SOLICITADO_EM','DECIDIDO_EM','DECIDIDO_POR_MATRICULA','DECIDIDO_POR_NOME','DECISAO','OBSERVACAO_GESTOR'];
function rcoRetificacoesSheet_(){
  return sheetOrCreate_(P3_SHEET_ID,'RCO_RETIFICACOES',RCO_RETIFICACOES_HEADERS_);
}
/** Reabre rascunho FINALIZADO → EM_RETIFICACAO. Uso interno após aprovação na Gestão de Sistema (sem checagem de perfil P3). */
function rcoRetificationOpenInternal_(opts){
  opts=opts||{};
  var reportId=String(opts.reportId||'').trim(),motivo=String(opts.motivo||'').trim();
  var mat=normMat_(opts.autorMatricula||''),nome=String(opts.autorNome||'').trim(),perfil=String(opts.autorPerfil||'COMANDO').toUpperCase();
  var posto=String(opts.autorPostoGrad||'').trim();
  if(!reportId)throw new Error('Informe o REPORT_ID do RCO.');
  if(!motivo)throw new Error('Informe o motivo da retificação.');
  var autorTexto=[posto,nome,mat].filter(Boolean).join(' — ');
  if(!autorTexto)autorTexto='Gestão de Sistema';
  var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');
  ensureHeaders_(s,['RETIFICACAO_MOTIVO','RETIFICACAO_ABERTA_EM','RETIFICACAO_ABERTA_POR','RETIFICACAO_ABERTA_POR_MATRICULA','RETIFICACAO_ABERTA_POR_PERFIL'].concat(RCO_CLOSURE_HEADERS_));
  var row=findOne_(s,'RCO_REPORT_ID',reportId);if(!row)throw new Error('Rascunho original do RCO não localizado.');
  if(String(row.STATUS)==='EM_RETIFICACAO')return {ok:true,alreadyOpen:true,message:'Este RCO já está aberto para retificação.',reportId:reportId,status:'EM_RETIFICACAO',autor:{perfil:perfil,matricula:mat,nome:nome,postoGrad:posto}};
  if(String(row.STATUS)!=='FINALIZADO')throw new Error('O RCO só pode ser reaberto para retificação após a consolidação/finalização.');
  row.STATUS='EM_RETIFICACAO';row.RETIFICACAO_MOTIVO=motivo;row.RETIFICACAO_ABERTA_EM=nowIso_();row.RETIFICACAO_ABERTA_POR=autorTexto;row.RETIFICACAO_ABERTA_POR_MATRICULA=mat;row.RETIFICACAO_ABERTA_POR_PERFIL=perfil;
  row.EDIT_DEVICE_ID='';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();
  // Nova versão de trabalho: PDF/P3 precisam ser refeitos; histórico anterior permanece nas estatísticas (VERSAO++).
  row.PDF_GERADO='NAO';row.PDF_GERADO_EM='';row.P3_CONSOLIDADO='NAO';row.P3_CONSOLIDADO_EM='';row.ENCERRADO='NAO';row.ENCERRADO_EM='';
  try{
    var p=loadJsonPayload_(row)||{};
    p=rcoApplyClosureFlagsToPayload_(p,{pdfGerado:false,pdfGeradoEm:'',p3Consolidado:false,p3ConsolidadoEm:'',encerrado:false,encerradoEm:''});
    var json=JSON.stringify(p),saved=saveJsonPayload_(reportId,'retif-'+Number(row.REVISAO||1),json,'RCO_DRAFT_FOLDER_ID','Central RCO - Rascunhos',row.PAYLOAD_FILE_ID||'');
    row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);
  }catch(_){}
  upsert_(s,'RCO_REPORT_ID',reportId,row);
  audit_('RCO',reportId,Number(row.REVISAO||1),'RETIFICACAO_ABERTA',mat,nome,row.BATALHAO,row.COMPANHIA,{motivo:motivo,perfil:perfil,via:'GESTAO_SISTEMA'});
  return {ok:true,message:'RCO reaberto para retificação. O Coordenador poderá carregá-lo em “Continuar serviço”.',reportId:reportId,status:'EM_RETIFICACAO',autor:{perfil:perfil,matricula:mat,nome:nome,postoGrad:posto}};
}
function rcoRetificationRequest_(payload){
  payload=payload||{};
  var motivo=String(payload.motivo||'').trim();
  if(!motivo)throw new Error('Informe o motivo da solicitação de retificação.');
  var mat=normMat_(payload.solicitanteMatricula||payload.matricula||'');
  var nome=String(payload.solicitanteNome||payload.nome||'').trim();
  if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Identifique o solicitante com matrícula válida.');
  if(!nome){
    var mil=findOne_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat);
    nome=String((mil&&mil.NOME)||'').trim();
  }
  var reportId=String(payload.reportId||payload.rcoReportId||'').trim();
  var batt=payload.batalhao?normBattalion_(payload.batalhao):'';
  var comp=String(payload.companhia||'').trim();
  var data=dateText_(payload.data||payload.dataServico||'');
  var drafts=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),row=null;
  if(reportId){
    row=findOne_(drafts,'RCO_REPORT_ID',reportId);
  }else{
    if(!batt||!comp||!data)throw new Error('Informe o REPORT_ID ou batalhão, companhia e data do serviço.');
    var candidates=objectsFields_(drafts,['RCO_REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','STATUS','ATUALIZADO_EM']).filter(function(x){
      return String(x.STATUS||'')==='FINALIZADO' && String(x.BATALHAO||'')===batt && String(x.COMPANHIA||'')===comp && dateText_(x.DATA_SERVICO)===data;
    }).sort(function(a,b){return String(b.ATUALIZADO_EM||'').localeCompare(String(a.ATUALIZADO_EM||''));});
    row=candidates[0]||null;
  }
  if(!row)throw new Error('RCO consolidado/finalizado não localizado.');
  if(String(row.STATUS||'')!=='FINALIZADO')throw new Error('Somente RCO consolidado (FINALIZADO) pode receber solicitação de retificação. Situação atual: '+String(row.STATUS||'').replace(/_/g,' ')+'.');
  reportId=String(row.RCO_REPORT_ID||'');
  batt=String(row.BATALHAO||batt);comp=String(row.COMPANHIA||comp);data=dateText_(row.DATA_SERVICO||data);
  var s=rcoRetificacoesSheet_();
  ensureHeaders_(s,RCO_RETIFICACOES_HEADERS_);
  var pending=objects_(s).filter(function(x){return String(x.RCO_REPORT_ID||'')===reportId && String(x.STATUS||'')==='PENDENTE';});
  if(pending.length)throw new Error('Já existe solicitação PENDENTE de retificação para este RCO. Aguarde a decisão da Gestão de Sistema.');
  var id=uid_('rco-ret');
  append_(s,{
    SOLICITACAO_ID:id,RCO_REPORT_ID:reportId,BATALHAO:batt,COMPANHIA:comp,DATA_SERVICO:data,
    SOLICITANTE_MATRICULA:mat,SOLICITANTE_NOME:nome,MOTIVO:motivo,
    STATUS:'PENDENTE',SOLICITADO_EM:nowIso_(),DECIDIDO_EM:'',DECIDIDO_POR_MATRICULA:'',DECIDIDO_POR_NOME:'',DECISAO:'',OBSERVACAO_GESTOR:''
  });
  audit_('RCO',reportId,Number(row.REVISAO||1),'RETIFICACAO_SOLICITADA',mat,nome,batt,comp,{solicitacaoId:id,motivo:motivo});
  return {ok:true,message:'Solicitação de retificação enviada à Gestão de Sistema. O RCO permanece consolidado e bloqueado até a autorização.',solicitacaoId:id,reportId:reportId,status:'PENDENTE'};
}
function rcoRetificationList_(p){
  p=p||{};
  var status=String(p.status||'').toUpperCase().trim();
  var batt=p.batalhao?normBattalion_(p.batalhao):'';
  var comp=String(p.companhia||'').trim();
  var data=dateText_(p.data||p.dataServico||'');
  var list=objects_(rcoRetificacoesSheet_()).slice().reverse();
  if(status)list=list.filter(function(x){return String(x.STATUS||'').toUpperCase()===status;});
  if(batt)list=list.filter(function(x){return String(x.BATALHAO||'')===batt;});
  if(comp)list=list.filter(function(x){return String(x.COMPANHIA||'')===comp;});
  if(data)list=list.filter(function(x){return dateText_(x.DATA_SERVICO)===data;});
  return {ok:true,items:list.slice(0,300)};
}
function rcoRetificationDecide_(payload){
  payload=payload||{};
  var id=String(payload.solicitacaoId||payload.id||'').trim();
  var decision=String(payload.decisao||payload.decision||'').toUpperCase().trim();
  if(decision==='AUTORIZAR'||decision==='APROVAR'||decision==='APROVADA')decision='AUTORIZAR';
  if(decision==='NEGAR'||decision==='NEGADA'||decision==='INDEFERIR')decision='NEGAR';
  if(['AUTORIZAR','NEGAR'].indexOf(decision)<0)throw new Error('Informe a decisão: AUTORIZAR ou NEGAR.');
  var mat=normMat_(payload.decididoPorMatricula||payload.autorMatricula||payload.matricula||'');
  var nome=String(payload.decididoPorNome||payload.autorNome||payload.nome||'').trim();
  var obs=String(payload.observacao||payload.observacaoGestor||'').trim();
  if(!id)throw new Error('Informe o SOLICITACAO_ID.');
  if(!/^\d{3}\.\d{3}-\d$/.test(mat))throw new Error('Identifique o gestor com matrícula válida.');
  if(!nome){
    var mil=findOne_(sheet_(P3_SHEET_ID,'MILITARES'),'MATRICULA',mat);
    nome=String((mil&&mil.NOME)||'').trim();
  }
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    var s=rcoRetificacoesSheet_();
    ensureHeaders_(s,RCO_RETIFICACOES_HEADERS_);
    var row=findOne_(s,'SOLICITACAO_ID',id);if(!row)throw new Error('Solicitação de retificação não localizada.');
    if(String(row.STATUS||'')!=='PENDENTE')throw new Error('Esta solicitação já foi decidida (status: '+String(row.STATUS||'')+').');
    var reportId=String(row.RCO_REPORT_ID||'');
    var motivo=String(row.MOTIVO||'').trim();
    if(decision==='AUTORIZAR'){
      var open=rcoRetificationOpenInternal_({
        reportId:reportId,motivo:motivo,
        autorMatricula:mat,autorNome:nome,autorPerfil:'COMANDO',
        autorPostoGrad:payload.autorPostoGrad||payload.decididoPorPostoGrad||''
      });
      row.STATUS='APROVADA';row.DECISAO='AUTORIZAR';
      row.DECIDIDO_EM=nowIso_();row.DECIDIDO_POR_MATRICULA=mat;row.DECIDIDO_POR_NOME=nome;row.OBSERVACAO_GESTOR=obs;
      upsert_(s,'SOLICITACAO_ID',id,row);
      return {ok:true,message:open.message||'Retificação autorizada. RCO em EM_RETIFICACAO.',solicitacaoId:id,reportId:reportId,status:'APROVADA',rcoStatus:'EM_RETIFICACAO'};
    }
    if(!obs)throw new Error('Informe a observação ao negar a solicitação.');
    row.STATUS='NEGADA';row.DECISAO='NEGAR';
    row.DECIDIDO_EM=nowIso_();row.DECIDIDO_POR_MATRICULA=mat;row.DECIDIDO_POR_NOME=nome;row.OBSERVACAO_GESTOR=obs;
    upsert_(s,'SOLICITACAO_ID',id,row);
    audit_('RCO',reportId,1,'RETIFICACAO_NEGADA',mat,nome,row.BATALHAO,row.COMPANHIA,{solicitacaoId:id,observacao:obs});
    return {ok:true,message:'Solicitação de retificação negada. O RCO permanece consolidado.',solicitacaoId:id,reportId:reportId,status:'NEGADA'};
  }finally{lock.releaseLock();}
}
function rcoRetificationMarkConcluida_(reportId){
  reportId=String(reportId||'');
  if(!reportId)return;
  if(!sheetExists_(P3_SHEET_ID,'RCO_RETIFICACOES'))return;
  try{
    var s=sheet_(P3_SHEET_ID,'RCO_RETIFICACOES');
    objects_(s).forEach(function(row){
      if(String(row.RCO_REPORT_ID||'')!==reportId)return;
      if(['APROVADA','PENDENTE'].indexOf(String(row.STATUS||'').toUpperCase())<0)return;
      row.STATUS='CONCLUIDA';
      upsert_(s,'SOLICITACAO_ID',String(row.SOLICITACAO_ID),row);
    });
  }catch(_){}
}
/** @deprecated Use rcoRetificationOpenInternal_ via rco-retification-decide (Gestão de Sistema). */
function rcoRetificationOpen_(payload){
  payload=payload||{};
  return rcoRetificationOpenInternal_({
    reportId:payload.reportId,motivo:payload.motivo,
    autorMatricula:payload.autorMatricula||payload.matricula,
    autorNome:payload.autorNome||payload.nome,
    autorPerfil:payload.autorPerfil||payload.perfil||'COMANDO',
    autorPostoGrad:payload.autorPostoGrad||''
  });
}

function rcoDraftPayloadSize_(x){
  var n=0;
  try{n=Math.max(n,String(x.PAYLOAD_JSON||'').length);}catch(_){}
  try{n=Math.max(n,String(x.PAYLOAD_HASH||'').length?Number(String(x.PAYLOAD_JSON||'').length||0):0);}catch(_){}
  return Number(n||0);
}
function rcoDraftDedupeDiagnose_(p){
  p=p||{};
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||'');
  var rows=objectsFields_(sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),['RCO_REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','STATUS','REVISAO','ULTIMO_SYNC_EM','ATUALIZADO_EM','PAYLOAD_JSON','PAYLOAD_FILE_ID','PAYLOAD_HASH','SUPERSEDED_BY']).filter(function(x){
    if(String(x.STATUS||'')==='DUPLICADO_LEGADO')return false;
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(x.STATUS||''))<0)return false;
    if(batt&&String(x.BATALHAO||'')!==batt)return false;
    if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;
    if(data&&dateText_(x.DATA_SERVICO)!==data)return false;
    return !!dateText_(x.DATA_SERVICO);
  });
  var groups={},out=[];
  rows.forEach(function(x){
    var k=rcoDraftUnitDateKey_(x);if(!groups[k])groups[k]=[];groups[k].push(x);
  });
  Object.keys(groups).forEach(function(k){
    var g=groups[k];if(g.length<=1)return;
    var canon=g.slice().sort(function(a,b){return rcoDraftPreferCanonical_(b,a)||Number(a._row||0)-Number(b._row||0);})[0];
    var uniqueIds={},physicalDup=0;
    g.forEach(function(x){var rid=String(x.RCO_REPORT_ID||'');if(rid){uniqueIds[rid]=true;if(g.filter(function(y){return String(y.RCO_REPORT_ID||'')===rid;}).length>1)physicalDup++;}});
    out.push({key:k,count:g.length,uniqueReportIds:Object.keys(uniqueIds).length,physicalDuplicateRows:physicalDup>0,canonicalReportId:String(canon.RCO_REPORT_ID||''),
      drafts:g.map(function(x){return {reportId:String(x.RCO_REPORT_ID||''),row:Number(x._row||0),status:String(x.STATUS||''),revisao:Number(x.REVISAO||0),ultimoSyncEm:String(x.ULTIMO_SYNC_EM||x.ATUALIZADO_EM||''),payloadSize:rcoDraftPayloadSize_(x),hasPayload:rcoDraftHasValidPayload_(x)};})
        .sort(function(a,b){return Number(b.revisao||0)-Number(a.revisao||0)||String(b.ultimoSyncEm||'').localeCompare(String(a.ultimoSyncEm||''));})});
  });
  var physicalPlan=rcoDraftPhysicalDuplicatePlan_(p);
  return {ok:true,action:'rco-draft-dedupe-diagnose',groups:out.sort(function(a,b){return b.count-a.count||String(a.key).localeCompare(String(b.key));}),totalGroups:out.length,physicalDuplicateRows:physicalPlan.length,physicalDuplicates:physicalPlan};
}
/** Saneamento auditável de rascunhos RCO duplicados: marca STATUS=DUPLICADO_LEGADO + SUPERSEDED_BY (nunca apaga linhas). dryRun default true. */
function rcoDraftDedupeSanitize_(p){
  p=p||{};
  var dryRun=!(String(p.dryRun)==='false'||p.dryRun===false);
  var diag=rcoDraftDedupeDiagnose_(p),plan=[],physicalPlan=rcoDraftPhysicalDuplicatePlan_(p),wouldMark=0;
  (diag.groups||[]).forEach(function(g){
    var canonId=String(g.canonicalReportId||''),marks=[];
    (g.drafts||[]).forEach(function(d){
      var rid=String(d.reportId||'');
      if(!rid||rid===canonId)return;
      marks.push({reportId:rid,row:Number(d.row||0),statusAnterior:String(d.status||''),supersededBy:canonId,revisao:Number(d.revisao||0),ultimoSyncEm:String(d.ultimoSyncEm||''),kind:'report_id'});
    });
    if(!marks.length)return;
    wouldMark+=marks.length;
    plan.push({key:g.key,count:g.count,canonicalReportId:canonId,marks:marks});
  });
  wouldMark+=physicalPlan.length;
  var result={ok:true,action:'rco-draft-dedupe-sanitize',dryRun:dryRun,totalGroups:plan.length,wouldMark:wouldMark,wouldMarkPhysical:physicalPlan.length,marked:0,markedPhysical:0,groups:plan,physicalDuplicates:physicalPlan,
    message:dryRun?('Plano: '+wouldMark+' linha(s) em '+plan.length+' grupo(s) de reportId + '+physicalPlan.length+' linha(s) física(s) repetida(s) seriam marcadas como DUPLICADO_LEGADO.'):(wouldMark?'Saneamento RCO aplicado.':'Nenhum duplicado RCO a marcar.')};
  if(dryRun||!wouldMark)return result;
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS'),h=headers_(s);
    ensureHeaders_(s,['SUPERSEDED_BY']);
    var marked=0,markedPhysical=0,mat=normMat_(p.autorMatricula||p.matricula||''),nome=String(p.autorNome||p.nome||'');
    plan.forEach(function(g){
      g.marks.forEach(function(m){
        var row=findOne_(s,'RCO_REPORT_ID',m.reportId);if(!row)return;
        if(String(row.STATUS||'')==='DUPLICADO_LEGADO')return;
        if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(String(row.STATUS||''))<0)return;
        var prev=String(row.STATUS||'');
        row.STATUS='DUPLICADO_LEGADO';row.SUPERSEDED_BY=String(g.canonicalReportId||'');row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();
        if(m.row&&Number(m.row)!==Number(row._row||0))writeSheetRowObject_(s,m.row,row);else upsert_(s,'RCO_REPORT_ID',m.reportId,row);
        audit_('RCO',m.reportId,Number(row.REVISAO||1),'DUPLICADO_LEGADO_MARCADO',mat,nome,row.BATALHAO,row.COMPANHIA,{
          statusAnterior:prev,statusResultante:'DUPLICADO_LEGADO',supersededBy:g.canonicalReportId,key:g.key,via:'rco-draft-dedupe-sanitize',kind:m.kind||'report_id'});
        marked++;
      });
    });
    physicalPlan.forEach(function(m){
      if(!m.row||m.row<2)return;
      var vals=s.getRange(m.row,1,1,h.length).getValues()[0],row={_row:m.row};
      h.forEach(function(k,j){if(k)row[k]=vals[j];});
      if(String(row.STATUS||'')==='DUPLICADO_LEGADO')return;
      var prev=String(row.STATUS||'');
      row.STATUS='DUPLICADO_LEGADO';row.SUPERSEDED_BY=String(m.supersededBy||m.reportId||'');row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=nowIso_();
      writeSheetRowObject_(s,m.row,row);
      audit_('RCO',m.reportId,Number(row.REVISAO||1),'DUPLICADO_LEGADO_MARCADO',mat,nome,row.BATALHAO,row.COMPANHIA,{
        statusAnterior:prev,statusResultante:'DUPLICADO_LEGADO',supersededBy:m.supersededBy,row:m.row,canonicalRow:m.canonicalRow,via:'rco-draft-dedupe-sanitize',kind:'physical_duplicate'});
      markedPhysical++;
    });
    result.dryRun=false;result.marked=marked;result.markedPhysical=markedPhysical;result.wouldMark=marked+markedPhysical;
    result.message=(marked+markedPhysical)?('Saneamento RCO: '+marked+' reportId(s) + '+markedPhysical+' linha(s) física(s) marcadas como DUPLICADO_LEGADO (sem exclusão).'):'Nenhum rascunho RCO elegível para marcar.';
    return result;
  }finally{lock.releaseLock();}
}
function rsdServiceDedupeDiagnose_(p){
  p=p||{};
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||'');
  var rows=objectsFields_(sheet_(P3_SHEET_ID,'RSD'),['REPORT_ID','SERVICE_ID','SEGMENTO','DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','GUARNICAO_TIPO','VTR_PRINCIPAL','STATUS','RESPONSAVEL_NOME','ULTIMO_RASCUNHO_EM','SINCRONIZADO_EM','INICIADO_EM','PAYLOAD_JSON','PAYLOAD_FILE_ID','PAYLOAD_HASH','VERSAO','SUPERSEDED_BY']).filter(function(x){
    if(['CANCELADO','INDEFERIDO','DUPLICADO_LEGADO'].indexOf(String(x.STATUS||''))>=0)return false;
    if(batt&&String(x.BATALHAO||'')!==batt)return false;
    if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;
    if(data&&dateText_(x.DATA_SERVICO)!==data)return false;
    return true;
  });
  var groups={},out=[];
  rows.forEach(function(x){
    var gu=normalizeGuarnicaoNome_(x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
    if(!gu)return;
    var k=serviceKeyRsd_(x.BATALHAO,x.COMPANHIA,x.DATA_SERVICO,gu,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
    if(!groups[k])groups[k]={serviceIds:{},rows:[]};
    groups[k].rows.push(x);
    var sid=String(x.SERVICE_ID||x.REPORT_ID||'');
    if(sid)groups[k].serviceIds[sid]=true;
  });
  Object.keys(groups).forEach(function(k){
    var g=groups[k],sids=Object.keys(g.serviceIds);if(sids.length<=1)return;
    out.push({key:k,serviceIdCount:sids.length,serviceIds:sids,rows:g.rows.map(function(x){return {reportId:String(x.REPORT_ID||''),serviceId:String(x.SERVICE_ID||x.REPORT_ID||''),segmento:Number(x.SEGMENTO||1)||1,status:String(x.STATUS||''),guarnicao:String(x.GUARNICAO||''),vtrPrincipal:normVtrPrefix_(x.VTR_PRINCIPAL||''),comandante:String(x.RESPONSAVEL_NOME||''),ultimoSyncEm:String(x.ULTIMO_RASCUNHO_EM||x.SINCRONIZADO_EM||x.INICIADO_EM||'')};})
      .sort(function(a,b){return String(a.serviceId).localeCompare(String(b.serviceId))||Number(b.segmento||0)-Number(a.segmento||0);})});
  });
  return {ok:true,action:'rsd-service-dedupe-diagnose',groups:out.sort(function(a,b){return b.serviceIdCount-a.serviceIdCount||String(a.key).localeCompare(String(b.key));}),totalGroups:out.length};
}
/** Escolhe SERVICE_ID canônico: EM_SERVICO → payload → maior SEGMENTO → sync mais recente. */
function rsdServicePreferCanonicalId_(rows){
  var bySid={};
  (rows||[]).forEach(function(x){
    var sid=String(x.SERVICE_ID||x.REPORT_ID||'');if(!sid)return;
    if(!bySid[sid])bySid[sid]=[];
    bySid[sid].push(x);
  });
  var bestSid='',best=null;
  Object.keys(bySid).forEach(function(sid){
    var list=bySid[sid],hasOpen=0,hasPayload=0,maxSeg=0,latest='';
    list.forEach(function(x){
      if(String(x.STATUS||'')==='EM_SERVICO')hasOpen=1;
      if(rsdHasUsablePayload_(x))hasPayload=1;
      var seg=Number(x.SEGMENTO||1)||1;if(seg>maxSeg)maxSeg=seg;
      var sync=String(x.ULTIMO_RASCUNHO_EM||x.SINCRONIZADO_EM||x.INICIADO_EM||'');
      if(sync.localeCompare(latest)>0)latest=sync;
    });
    var score={sid:sid,hasOpen:hasOpen,hasPayload:hasPayload,maxSeg:maxSeg,latest:latest,rowCount:list.length};
    if(!best){best=score;bestSid=sid;return;}
    if(score.hasOpen!==best.hasOpen){if(score.hasOpen>best.hasOpen){best=score;bestSid=sid;}return;}
    if(score.hasPayload!==best.hasPayload){if(score.hasPayload>best.hasPayload){best=score;bestSid=sid;}return;}
    if(score.maxSeg!==best.maxSeg){if(score.maxSeg>best.maxSeg){best=score;bestSid=sid;}return;}
    if(score.latest!==best.latest){if(score.latest.localeCompare(best.latest)>0){best=score;bestSid=sid;}return;}
    if(sid.localeCompare(bestSid)<0){best=score;bestSid=sid;}
  });
  return bestSid;
}
/** Saneamento auditável de SERVICE_IDs RSD concorrentes na mesma chave. Marca só linhas de SERVICE_IDs não canônicos (passagens do mesmo SERVICE_ID permanecem). dryRun default true. */
function rsdServiceDedupeSanitize_(p){
  p=p||{};
  var dryRun=!(String(p.dryRun)==='false'||p.dryRun===false);
  var batt=p.batalhao?normBattalion_(p.batalhao):'',comp=p.companhia||'',data=dateText_(p.data||'');
  var s=sheet_(P3_SHEET_ID,'RSD');
  var rows=objects_(s).filter(function(x){
    if(['CANCELADO','INDEFERIDO','DUPLICADO_LEGADO'].indexOf(String(x.STATUS||''))>=0)return false;
    if(batt&&String(x.BATALHAO||'')!==batt)return false;
    if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;
    if(data&&dateText_(x.DATA_SERVICO)!==data)return false;
    return true;
  });
  var groups={},plan=[],wouldMark=0,wouldMarkServiceIds=0;
  rows.forEach(function(x){
    var gu=normalizeGuarnicaoNome_(x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
    if(!gu)return;
    var k=serviceKeyRsd_(x.BATALHAO,x.COMPANHIA,x.DATA_SERVICO,gu,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
    if(!groups[k])groups[k]=[];
    groups[k].push(x);
  });
  Object.keys(groups).forEach(function(k){
    var g=groups[k],bySid={};
    g.forEach(function(x){var sid=String(x.SERVICE_ID||x.REPORT_ID||'');if(!sid)return;if(!bySid[sid])bySid[sid]=[];bySid[sid].push(x);});
    var sids=Object.keys(bySid);if(sids.length<=1)return;
    var canonSid=rsdServicePreferCanonicalId_(g),marks=[],dupSids=[];
    sids.forEach(function(sid){
      if(sid===canonSid)return;
      dupSids.push(sid);
      bySid[sid].forEach(function(x){
        marks.push({reportId:String(x.REPORT_ID||''),serviceId:sid,segmento:Number(x.SEGMENTO||1)||1,statusAnterior:String(x.STATUS||''),supersededBy:canonSid});
      });
    });
    if(!marks.length)return;
    wouldMark+=marks.length;wouldMarkServiceIds+=dupSids.length;
    plan.push({key:k,serviceIdCount:sids.length,canonicalServiceId:canonSid,duplicateServiceIds:dupSids,marks:marks});
  });
  plan.sort(function(a,b){return b.marks.length-a.marks.length||String(a.key).localeCompare(String(b.key));});
  var result={ok:true,action:'rsd-service-dedupe-sanitize',dryRun:dryRun,totalGroups:plan.length,wouldMark:wouldMark,wouldMarkServiceIds:wouldMarkServiceIds,marked:0,groups:plan,
    message:dryRun?('Plano: '+wouldMark+' linha(s) / '+wouldMarkServiceIds+' SERVICE_ID(s) em '+plan.length+' grupo(s) seriam marcados como DUPLICADO_LEGADO.'):(wouldMark?'Saneamento RSD aplicado.':'Nenhum duplicado RSD a marcar.')};
  if(dryRun||!plan.length)return result;
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    ensureHeaders_(s,['SUPERSEDED_BY']);
    var marked=0,mat=normMat_(p.autorMatricula||p.matricula||''),nome=String(p.autorNome||p.nome||'');
    plan.forEach(function(g){
      g.marks.forEach(function(m){
        var row=findOne_(s,'REPORT_ID',m.reportId);if(!row)return;
        if(String(row.STATUS||'')==='DUPLICADO_LEGADO')return;
        var rowSid=String(row.SERVICE_ID||row.REPORT_ID||'');
        if(rowSid===String(g.canonicalServiceId||''))return;
        var prev=String(row.STATUS||'');
        row.STATUS='DUPLICADO_LEGADO';row.SUPERSEDED_BY=String(g.canonicalServiceId||'');row.EDIT_LEASE_UNTIL='';row.SINCRONIZADO_EM=nowIso_();
        upsert_(s,'REPORT_ID',m.reportId,row);
        audit_('RSD',m.reportId,Number(row.VERSAO||1),'DUPLICADO_LEGADO_MARCADO',mat,nome,row.BATALHAO,row.COMPANHIA,{
          statusAnterior:prev,statusResultante:'DUPLICADO_LEGADO',supersededBy:g.canonicalServiceId,serviceId:rowSid,key:g.key,via:'rsd-service-dedupe-sanitize'});
        marked++;
      });
    });
    result.dryRun=false;result.marked=marked;result.wouldMark=marked;
    result.message=marked?'Saneamento RSD: '+marked+' linha(s) de SERVICE_ID(s) não canônicos marcadas como DUPLICADO_LEGADO (sem exclusão física).':'Nenhuma linha RSD elegível para marcar.';
    return result;
  }finally{lock.releaseLock();}
}
function closeRcoDraft_(reportId){
  var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');
  ensureHeaders_(s,RCO_CLOSURE_HEADERS_);
  var row=findOne_(s,'RCO_REPORT_ID',String(reportId||''));
  if(row){
    var wasRetificacao=String(row.STATUS||'')==='EM_RETIFICACAO';
    var agora=nowIso_();
    row.STATUS='FINALIZADO';row.EDIT_LEASE_UNTIL='';row.ATUALIZADO_EM=agora;
    row.ENCERRADO='SIM';row.ENCERRADO_EM=agora;
    try{
      var p=loadJsonPayload_(row)||{};
      var flags=rcoClosureFlagsFrom_(row,p);
      flags.encerrado=true;flags.encerradoEm=agora;
      p=rcoApplyClosureFlagsToPayload_(p,flags);
      var json=JSON.stringify(p),saved=saveJsonPayload_(String(reportId),'close-'+Number(row.REVISAO||1),json,'RCO_DRAFT_FOLDER_ID','Central RCO - Rascunhos',row.PAYLOAD_FILE_ID||'');
      row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);
    }catch(_){}
    upsert_(s,'RCO_REPORT_ID',String(reportId),row);
    if(wasRetificacao)rcoRetificationMarkConcluida_(reportId);
  }
}

/* Flags de encerramento do RCO: PDF + P3 + confirmação do usuário. */
var RCO_CLOSURE_HEADERS_=['PDF_GERADO','PDF_GERADO_EM','P3_CONSOLIDADO','P3_CONSOLIDADO_EM','ENCERRADO','ENCERRADO_EM'];
function rcoTruthyFlag_(v){
  if(v===true||v===1)return true;
  var s=String(v==null?'':v).trim().toUpperCase();
  return s==='SIM'||s==='TRUE'||s==='1'||s==='S'||s==='YES';
}
function rcoHasOwnClosure_(obj,key){
  return !!(obj&&Object.prototype.hasOwnProperty.call(obj,key)&&obj[key]!=null&&String(obj[key]).trim()!=='');
}
function rcoClosureFlagsFrom_(draftRow,payload){
  draftRow=draftRow||{};payload=payload||{};
  var status=String(draftRow.STATUS||payload.centralStatus||payload.status||'').toUpperCase();
  var pdf=rcoTruthyFlag_(draftRow.PDF_GERADO);if(!rcoHasOwnClosure_(draftRow,'PDF_GERADO'))pdf=rcoTruthyFlag_(payload.pdfGerado);
  var p3=rcoTruthyFlag_(draftRow.P3_CONSOLIDADO);if(!rcoHasOwnClosure_(draftRow,'P3_CONSOLIDADO'))p3=rcoTruthyFlag_(payload.p3Consolidado);
  var enc=rcoTruthyFlag_(draftRow.ENCERRADO);if(!rcoHasOwnClosure_(draftRow,'ENCERRADO'))enc=rcoTruthyFlag_(payload.encerrado);
  // Legado: FINALIZADO sem colunas novas → encerrado; preferir p3Consolidado true.
  if(status==='FINALIZADO'){
    enc=true;
    if(String(draftRow.P3_CONSOLIDADO||'').toUpperCase()!=='NAO')p3=true;
  }
  return {
    pdfGerado:!!pdf,
    pdfGeradoEm:String(draftRow.PDF_GERADO_EM||payload.pdfGeradoEm||''),
    p3Consolidado:!!p3,
    p3ConsolidadoEm:String(draftRow.P3_CONSOLIDADO_EM||payload.p3ConsolidadoEm||''),
    encerrado:!!enc,
    encerradoEm:String(draftRow.ENCERRADO_EM||payload.encerradoEm||'')
  };
}
function rcoApplyClosureFlagsToPayload_(payload,flags){
  payload=payload||{};flags=flags||{};
  payload.pdfGerado=!!flags.pdfGerado;payload.pdfGeradoEm=flags.pdfGeradoEm||'';
  payload.p3Consolidado=!!flags.p3Consolidado;payload.p3ConsolidadoEm=flags.p3ConsolidadoEm||'';
  payload.encerrado=!!flags.encerrado;payload.encerradoEm=flags.encerradoEm||'';
  return payload;
}
function rcoMergeClosureFromClient_(draftRow,clientPayload){
  var stored={};try{if(draftRow)stored=loadJsonPayload_(draftRow)||{};}catch(_){}
  var base=rcoClosureFlagsFrom_(draftRow,stored);
  var c=clientPayload||{};
  var st=String((draftRow&&draftRow.STATUS)||'').toUpperCase();
  var opened=String((draftRow&&draftRow.RETIFICACAO_ABERTA_EM)||'');
  function acceptClientStamp_(em){
    if(st!=='EM_RETIFICACAO'||!opened)return true;
    return String(em||'')>=opened;
  }
  // Promove apenas (cliente não limpa verdades do servidor; retificação zera no open).
  if(rcoTruthyFlag_(c.pdfGerado)&&acceptClientStamp_(c.pdfGeradoEm)){
    base.pdfGerado=true;base.pdfGeradoEm=String(c.pdfGeradoEm||base.pdfGeradoEm||nowIso_());
  }
  if(rcoTruthyFlag_(c.p3Consolidado)&&acceptClientStamp_(c.p3ConsolidadoEm)){
    base.p3Consolidado=true;base.p3ConsolidadoEm=String(c.p3ConsolidadoEm||base.p3ConsolidadoEm||nowIso_());
  }
  // encerrado só via rco-encerrar / closeRcoDraft_ — draft upsert não promove nem limpa.
  return base;
}
function rcoWriteClosureFlags_(reportId,flags,opts){
  opts=opts||{};flags=flags||{};
  var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');
  ensureHeaders_(s,RCO_CLOSURE_HEADERS_);
  var row=findOne_(s,'RCO_REPORT_ID',String(reportId||''));
  if(!row)throw new Error('Rascunho do RCO não localizado.');
  row.PDF_GERADO=flags.pdfGerado?'SIM':'NAO';row.PDF_GERADO_EM=flags.pdfGeradoEm||'';
  row.P3_CONSOLIDADO=flags.p3Consolidado?'SIM':'NAO';row.P3_CONSOLIDADO_EM=flags.p3ConsolidadoEm||'';
  row.ENCERRADO=flags.encerrado?'SIM':'NAO';row.ENCERRADO_EM=flags.encerradoEm||'';
  row.ATUALIZADO_EM=nowIso_();
  if(opts.updatePayload!==false){
    try{
      var p=loadJsonPayload_(row)||{};
      p=rcoApplyClosureFlagsToPayload_(p,flags);
      var json=JSON.stringify(p),saved=saveJsonPayload_(String(reportId),'flags-'+Number(row.REVISAO||1),json,'RCO_DRAFT_FOLDER_ID','Central RCO - Rascunhos',row.PAYLOAD_FILE_ID||'');
      row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);
    }catch(_){}
  }
  upsert_(s,'RCO_REPORT_ID',String(reportId),row);
  return flags;
}
function rcoMarkPdf_(payload){
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    payload=payload||{};
    var reportId=String(payload.reportId||payload.rcoReportId||(payload.rco&&(payload.rco.reportId||(payload.rco.state&&payload.rco.state.reportId)))||'');
    if(!reportId)throw new Error('RCO sem REPORT_ID.');
    var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');ensureHeaders_(s,RCO_CLOSURE_HEADERS_);
    var row=findOne_(s,'RCO_REPORT_ID',reportId);
    if(!row)throw new Error('Rascunho do RCO não localizado.');
    var st=String(row.STATUS||'');
    var flags=rcoClosureFlagsFrom_(row,loadJsonPayload_(row)||{});
    if(st==='FINALIZADO'){
      return {ok:true,idempotent:true,message:'RCO já encerrado.',reportId:reportId,status:'FINALIZADO',pdfGerado:!!flags.pdfGerado,pdfGeradoEm:flags.pdfGeradoEm||'',p3Consolidado:!!flags.p3Consolidado,p3ConsolidadoEm:flags.p3ConsolidadoEm||'',encerrado:true,readyToClose:false};
    }
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(st)<0)throw new Error('Somente RCO em andamento ou em retificação pode marcar PDF gerado. Situação atual: '+st.replace(/_/g,' ')+'.');
    var already=!!flags.pdfGerado;
    flags.pdfGerado=true;flags.pdfGeradoEm=flags.pdfGeradoEm||nowIso_();
    flags.encerrado=false; // mark-pdf NUNCA encerra
    rcoWriteClosureFlags_(reportId,flags);
    if(!already)audit_('RCO',reportId,Number(row.REVISAO||1),'PDF_GERADO',normMat_(payload.matricula||''),String(payload.nome||''),row.BATALHAO,row.COMPANHIA,{pdfGeradoEm:flags.pdfGeradoEm});
    var ready=!!(flags.pdfGerado&&flags.p3Consolidado);
    var msg=ready?(already?'PDF já estava marcado. PDF e Consolidação P3 concluídos. Confirme o encerramento quando desejar.':'PDF gerado. PDF e Consolidação P3 concluídos. Confirme o encerramento quando desejar.'):(already?'PDF já estava marcado. Ainda falta Consolidar P3.':'PDF gerado. Ainda falta Consolidar P3.');
    return {ok:true,idempotent:already,message:msg,reportId:reportId,status:st,pdfGerado:true,pdfGeradoEm:flags.pdfGeradoEm,p3Consolidado:!!flags.p3Consolidado,p3ConsolidadoEm:flags.p3ConsolidadoEm||'',encerrado:false,readyToClose:ready};
  }finally{lock.releaseLock();}
}
function rcoEncerrar_(payload){
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    payload=payload||{};
    var reportId=String(payload.reportId||payload.rcoReportId||(payload.rco&&(payload.rco.reportId||(payload.rco.state&&payload.rco.state.reportId)))||'');
    if(!reportId)throw new Error('RCO sem REPORT_ID.');
    var s=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');ensureHeaders_(s,RCO_CLOSURE_HEADERS_);
    var row=findOne_(s,'RCO_REPORT_ID',reportId);
    if(!row)throw new Error('Rascunho do RCO não localizado.');
    var st=String(row.STATUS||'');
    var flags=rcoClosureFlagsFrom_(row,loadJsonPayload_(row)||{});
    if(st==='FINALIZADO')return {ok:true,idempotent:true,message:'RCO já estava encerrado.',reportId:reportId,status:'FINALIZADO',encerrado:true,encerradoEm:flags.encerradoEm||'',pdfGerado:!!flags.pdfGerado,p3Consolidado:!!flags.p3Consolidado,readyToClose:false};
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(st)<0)throw new Error('Somente RCO em andamento ou em retificação pode ser encerrado. Situação atual: '+st.replace(/_/g,' ')+'.');
    if(!flags.pdfGerado||!flags.p3Consolidado){
      var missing=[];
      if(!flags.pdfGerado)missing.push('Gerar PDF do RCO');
      if(!flags.p3Consolidado)missing.push('Consolidar P3');
      throw new Error('Para encerrar o RCO é necessário concluir: '+missing.join(' e ')+'.');
    }
    closeRcoDraft_(reportId);
    audit_('RCO',reportId,Number(row.REVISAO||1),'ENCERRAMENTO',normMat_(payload.matricula||(payload.coordenador&&payload.coordenador.matricula)||''),String(payload.nome||(payload.coordenador&&payload.coordenador.nome)||''),row.BATALHAO,row.COMPANHIA,{via:'CONFIRMACAO_USUARIO',pdfGerado:true,p3Consolidado:true});
    return {ok:true,message:'RCO encerrado com sucesso.',reportId:reportId,status:'FINALIZADO',encerrado:true,pdfGerado:true,p3Consolidado:true,readyToClose:false};
  }finally{lock.releaseLock();}
}

/* Helpers + consolidação final do RCO (auto-resolve + estatística compartilhada). */
var RCO_CONSOLIDATE_AUTO_REASON_='ENCERRAMENTO AUTOMÁTICO NA CONSOLIDAÇÃO DO RCO';

function rsdHasUsablePayload_(row){
  return !!(String((row||{}).PAYLOAD_FILE_ID||'').trim()||String((row||{}).PAYLOAD_HASH||'').trim()||String((row||{}).PAYLOAD_JSON||'').trim());
}
function rsdPreferCanonicalConsolidate_(a,b){
  var aseg=Number(a.SEGMENTO||1)||1,bseg=Number(b.SEGMENTO||1)||1;
  if(aseg!==bseg)return aseg-bseg;
  var ap=rsdHasUsablePayload_(a)?1:0,bp=rsdHasUsablePayload_(b)?1:0;
  if(ap!==bp)return ap-bp;
  var av=Number(a.VERSAO||0),bv=Number(b.VERSAO||0);
  if(av!==bv)return av-bv;
  return String(a.ULTIMO_RASCUNHO_EM||a.SINCRONIZADO_EM||a.INICIADO_EM||'').localeCompare(String(b.ULTIMO_RASCUNHO_EM||b.SINCRONIZADO_EM||b.INICIADO_EM||''));
}
function rcoConsolidateCancelPendingPassagens_(rsdRow,autor,rcoReportId){
  var reportId=String((rsdRow||{}).REPORT_ID||''),serviceId=String((rsdRow||{}).SERVICE_ID||'');
  if(!reportId)return [];
  var ps=sheet_(P3_SHEET_ID,'PASSAGENS_SERVICO');
  ensureHeaders_(ps,['CANCELADA_EM','CANCELADA_MOTIVO','CANCELADA_POR_MATRICULA','CANCELADA_POR_NOME']);
  var closed=[],agora=nowIso_(),mat=normMat_((autor||{}).matricula||''),nome=String((autor||{}).nome||'');
  objects_(ps).forEach(function(row){
    if(String(row.STATUS||'')!=='AGUARDANDO_RECEBIMENTO')return;
    var sameOrigem=String(row.RSD_ORIGEM_ID||'')===reportId;
    var sameService=!!serviceId&&String(row.SERVICE_ID||'')===serviceId&&dateText_(row.DATA_SERVICO)===dateText_(rsdRow.DATA_SERVICO);
    if(!sameOrigem&&!sameService)return;
    row.STATUS='CANCELADA';row.CANCELADA_EM=agora;row.CANCELADA_MOTIVO=RCO_CONSOLIDATE_AUTO_REASON_;
    row.CANCELADA_POR_MATRICULA=mat;row.CANCELADA_POR_NOME=nome;row.ATUALIZADO_EM=agora;
    upsert_(ps,'PASSAGEM_ID',String(row.PASSAGEM_ID),row);
    audit_('PASSAGEM',String(row.PASSAGEM_ID),1,'PASSAGEM_CANCELADA_CONSOLIDACAO_RCO',mat,nome,row.BATALHAO,row.COMPANHIA,{rcoReportId:rcoReportId,motivo:RCO_CONSOLIDATE_AUTO_REASON_,rsdOrigemId:reportId,statusAnterior:'AGUARDANDO_RECEBIMENTO',statusResultante:'CANCELADA'});
    closed.push(String(row.PASSAGEM_ID));
  });
  return closed;
}
function rcoConsolidateForceFinalizeRow_(row,autor,rcoReportId,statusAnterior){
  var reportId=String(row.REPORT_ID||''),s=sheet_(P3_SHEET_ID,'RSD');
  var p=loadJsonPayload_(row)||{};
  var autorMatricula=normMat_((autor||{}).matricula||''),autorNome=String((autor||{}).nome||''),perfil=String((autor||{}).perfil||'CPU'),agora=nowIso_();
  var version=Math.max(Number(row.VERSAO||1)+1,Number(p.versao||p.version||0)+1);
  var batt=String(row.BATALHAO||''),comp=String(row.COMPANHIA||''),serviceId=String(row.SERVICE_ID||p.serviceId||(p.servico||{}).serviceId||''),seg=Number(row.SEGMENTO||p.segmento||(p.servico||{}).segmento||1)||1;
  if(p&&typeof p==='object'){
    p.versao=version;p.version=version;p.centralStatus='AGUARDANDO_ANALISE';p.finalizadoEm=agora;
    if(p.servico&&typeof p.servico==='object')p.servico.finalizadoEm=agora;
    p.finalizacaoCoordenador={forcada:true,motivo:RCO_CONSOLIDATE_AUTO_REASON_,autorMatricula:autorMatricula,autorNome:autorNome,perfil:perfil,em:agora,rcoReportId:rcoReportId,automaticoConsolidacao:true};
  }
  var json=JSON.stringify(p||{}),saved=saveJsonPayload_(reportId,version,json);
  ensureHeaders_(s,['FINALIZACAO_FORCADA','FINALIZACAO_FORCADA_MOTIVO','FINALIZACAO_FORCADA_POR_MATRICULA','FINALIZACAO_FORCADA_POR_NOME','FINALIZACAO_FORCADA_POR_PERFIL','FINALIZACAO_FORCADA_EM','REVIEW_STATUS']);
  row.VERSAO=version;row.STATUS='AGUARDANDO_ANALISE';row.FINALIZADO_EM=agora;row.ULTIMO_RASCUNHO_EM=agora;row.SINCRONIZADO_EM=agora;row.EDIT_LEASE_UNTIL='';
  row.PAYLOAD_JSON=saved.json;row.PAYLOAD_FILE_ID=saved.fileId;row.PAYLOAD_FILE_URL=saved.fileUrl;row.PAYLOAD_HASH=hash_(json);row.REVIEW_STATUS='AGUARDANDO_ANALISE';
  row.FINALIZACAO_FORCADA='SIM';row.FINALIZACAO_FORCADA_MOTIVO=RCO_CONSOLIDATE_AUTO_REASON_;row.FINALIZACAO_FORCADA_POR_MATRICULA=autorMatricula;row.FINALIZACAO_FORCADA_POR_NOME=autorNome;row.FINALIZACAO_FORCADA_POR_PERFIL=perfil;row.FINALIZACAO_FORCADA_EM=agora;
  upsert_(s,'REPORT_ID',reportId,row);
  try{syncRsdVehicles_(p,reportId);syncRsdOperations_(p,reportId,batt,comp,version);syncRsdOccurrences_(p,reportId,batt,comp);syncRsdCirvcs_(p,reportId,batt,comp,serviceId,seg);}catch(_){}
  audit_('RSD',reportId,version,'ENCERRAMENTO_AUTOMATICO_CONSOLIDACAO_RCO',autorMatricula,autorNome,batt,comp,{motivo:RCO_CONSOLIDATE_AUTO_REASON_,rcoReportId:rcoReportId,statusAnterior:statusAnterior||'EM_SERVICO',statusResultante:'AGUARDANDO_ANALISE'});
  return row;
}
function rcoConsolidateMarkReviewed_(row,autor,rcoReportId,statusAnterior){
  var reportId=String(row.REPORT_ID||''),s=sheet_(P3_SHEET_ID,'RSD'),agora=nowIso_();
  var mat=normMat_((autor||{}).matricula||''),nome=String((autor||{}).nome||'');
  ensureHeaders_(s,['REVIEW_STATUS','REVIEW_MOTIVO','REVIEW_OBSERVACAO','REVIEW_AUTOR_MATRICULA','REVIEW_AUTOR_NOME','REVIEW_EM']);
  row.STATUS='DEFERIDO';row.REVIEW_STATUS='DEFERIDO';row.REVIEW_MOTIVO=RCO_CONSOLIDATE_AUTO_REASON_;row.REVIEW_OBSERVACAO=RCO_CONSOLIDATE_AUTO_REASON_;
  row.REVIEW_AUTOR_MATRICULA=mat;row.REVIEW_AUTOR_NOME=nome;row.REVIEW_EM=agora;row.SINCRONIZADO_EM=agora;
  upsert_(s,'REPORT_ID',reportId,row);
  audit_('RSD',reportId,Number(row.VERSAO||1),'ENCERRAMENTO_AUTOMATICO_CONSOLIDACAO_RCO',mat,nome,row.BATALHAO,row.COMPANHIA,{motivo:RCO_CONSOLIDATE_AUTO_REASON_,rcoReportId:rcoReportId,statusAnterior:statusAnterior,statusResultante:'DEFERIDO'});
  return row;
}
function rcoConsolidateResolveRsdStatuses_(payload,reportId,autor){
  var pkg=payload||{},rco=pkg.rco||pkg,u=pkg.unidade||rco.unidade||{};
  var batt=normBattalion_(u.batalhao||pkg.batalhao),comp=u.companhia||pkg.companhia||normCompany_(batt,u.companhiaNumero);
  var periodo=rco.periodo||{},data=resolveOperationalServiceDate_(periodo.inicio||rco.data||pkg.data||'',periodo.inicio||rco.data||pkg.data||'');
  var originIds=(rco.rcoOrigens||[]).map(function(o){return String(o.rsdReportId||'')}).filter(Boolean);
  var listedIds=[].concat(pkg.rsdReportIds||[],pkg.reportIds||[]).map(function(x){return String(x||'')}).filter(Boolean);
  var listedServices={};(pkg.serviceIds||[]).forEach(function(sid){if(sid)listedServices[String(sid)]=true;});
  (rco.rcoOrigens||[]).forEach(function(o){if(o&&o.serviceId)listedServices[String(o.serviceId)]=true;});
  var includeSet={};originIds.concat(listedIds).forEach(function(id){includeSet[id]=true;});
  var rsdSheet=sheet_(P3_SHEET_ID,'RSD');
  // Somente RSDs da MESMA data operacional do RCO (janela 07h→07h). Não incluir ±1 dia.
  var unitRows=objects_(rsdSheet).filter(function(x){
    if(String(x.STATUS||'')==='CANCELADO')return false;
    if(String(x.STATUS||'')==='DUPLICADO_LEGADO')return false;
    if(batt&&String(x.BATALHAO||'')!==batt)return false;
    if(comp&&String(x.COMPANHIA||'')!==String(comp))return false;
    if(data&&resolveOperationalServiceDate_(x.DATA_SERVICO,x.INICIADO_EM)!==data)return false;
    return true;
  });
  var byKey={},resolutions=[];
  unitRows.forEach(function(x){
    var k=serviceKeyRsd_(x.BATALHAO,x.COMPANHIA,x.DATA_SERVICO,x.GUARNICAO,x.GUARNICAO_TIPO||guarnicaoTipoFromNome_(x.GUARNICAO));
    if(!byKey[k])byKey[k]=[];
    byKey[k].push(x);
  });
  Object.keys(byKey).forEach(function(k){
    var rows=byKey[k].slice().sort(function(a,b){return rsdPreferCanonicalConsolidate_(b,a);});
    var canonical=rows[0],canonicalId=String(canonical.REPORT_ID||'');
    rows.forEach(function(row,idx){
      var rid=String(row.REPORT_ID||''),st=String(row.STATUS||'').toUpperCase(),isCanonical=idx===0;
      var openBlock=['EM_SERVICO','PASSAGEM_DISPONIVEL','AGUARDANDO_ANALISE','RETIFICACAO_SOLICITADA'].indexOf(st)>=0;
      var shouldResolve=!!includeSet[rid]||!!listedServices[String(row.SERVICE_ID||'')]||openBlock||(st==='INDEFERIDO'&&!!includeSet[rid]);
      if(!shouldResolve)return;
      if(!isCanonical&&!includeSet[rid]&&['EM_SERVICO','PASSAGEM_DISPONIVEL'].indexOf(st)<0)return;
      var before=st,after=st;
      if(st==='PASSAGEM_DISPONIVEL'){
        rcoConsolidateCancelPendingPassagens_(row,autor,reportId);
        row.STATUS='EM_SERVICO';row.SINCRONIZADO_EM=nowIso_();
        upsert_(rsdSheet,'REPORT_ID',rid,row);
        row=rcoConsolidateForceFinalizeRow_(row,autor,reportId,'PASSAGEM_DISPONIVEL');
        row=rcoConsolidateMarkReviewed_(row,autor,reportId,'AGUARDANDO_ANALISE');
        after=String(row.STATUS||'');
      }else if(st==='EM_SERVICO'){
        row=rcoConsolidateForceFinalizeRow_(row,autor,reportId,'EM_SERVICO');
        row=rcoConsolidateMarkReviewed_(row,autor,reportId,'AGUARDANDO_ANALISE');
        after=String(row.STATUS||'');
      }else if(st==='AGUARDANDO_ANALISE'||st==='RETIFICACAO_SOLICITADA'||st==='INDEFERIDO'){
        row=rcoConsolidateMarkReviewed_(row,autor,reportId,st);
        after=String(row.STATUS||'');
      }
      if(isCanonical&&listedServices[String(row.SERVICE_ID||'')]&&!includeSet[rid])includeSet[rid]=true;
      resolutions.push({reportId:rid,serviceId:String(row.SERVICE_ID||''),canonical:isCanonical,statusAnterior:before,statusResultante:after,incluido:!!includeSet[rid]});
    });
    if(!includeSet[canonicalId]){
      rows.forEach(function(row){
        var rid=String(row.REPORT_ID||'');
        if(includeSet[rid]&&rid!==canonicalId)includeSet[canonicalId]=true;
      });
    }
  });
  if(rco.rcoOrigens&&Array.isArray(rco.rcoOrigens)){
    rco.rcoOrigens.forEach(function(o){
      var rid=String(o.rsdReportId||'');
      if(!rid)return;
      var live=findOne_(rsdSheet,'REPORT_ID',rid);
      if(live)o.status=String(live.STATUS||o.status||'');
    });
  }
  return {includeIds:Object.keys(includeSet).filter(Boolean),resolutions:resolutions,batt:batt,comp:comp,data:data};
}

/* O backend estatístico principal já recebe o pacote completo do RCO.
   Esta ação complementar preserva origens, auditoria e garante que cada
   operação continue individualizada após a consolidação. */
function rcoSupplementalUpsert_(payload) {
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return rcoSupplementalUpsertBody_(payload,{});}
  finally{lock.releaseLock();}
}
function rcoConsolidateFinal_(payload) {
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var pkg=payload||{},rco=pkg.rco||pkg,stat=pkg.estatisticaP3||rco.estatisticaP3||{};
    var reportId=String((rco||{}).reportId||(rco.state||{}).reportId||pkg.reportId||pkg.rcoReportId||stat.reportId||'');
    if(!reportId)throw new Error('RCO sem REPORT_ID.');
    var draftSheet=sheet_(P3_SHEET_ID,'RCO_RASCUNHOS');ensureHeaders_(draftSheet,RCO_CLOSURE_HEADERS_);
    var draft=findOne_(draftSheet,'RCO_REPORT_ID',reportId);
    if(!draft)throw new Error('Rascunho do RCO não localizado para consolidação.');
    var draftStatus=String(draft.STATUS||'');
    var rcoSheet=sheet_(P3_SHEET_ID,'RCO');ensureHeaders_(rcoSheet,['VERSAO']);
    var existing=findOne_(rcoSheet,'REPORT_ID',reportId);
    var flags=rcoMergeClosureFromClient_(draft,Object.assign({},loadJsonPayload_(draft)||{},rco||{},pkg||{}));
    if(draftStatus==='FINALIZADO'&&existing){
      var prodHas=objects_(sheet_(P3_SHEET_ID,'PRODUCAO')).some(function(x){return String(x.REPORT_ID||'')===reportId;});
      if(prodHas){
        return {ok:true,idempotent:true,message:'RCO já consolidado anteriormente. Nenhuma linha de PRODUCAO adicional foi gravada.',reportId:reportId,version:Number(existing.VERSAO||1),resolutions:[],pdfGerado:!!flags.pdfGerado,p3Consolidado:true,encerrado:true,readyToClose:false,status:'FINALIZADO'};
      }
    }
    if(['EM_ANDAMENTO','EM_RETIFICACAO'].indexOf(draftStatus)<0)throw new Error('Somente RCO em andamento ou em retificação pode ser consolidado. Situação atual: '+draftStatus.replace(/_/g,' ')+'.');
    var cons=rco.consolidacaoResponsavel||pkg.coordenador||pkg.consolidador||{};
    if(!cons.matricula&&pkg.coordenadorMatricula)cons={matricula:pkg.coordenadorMatricula,nome:pkg.coordenadorNome||'',postoGrad:pkg.coordenadorPostoGrad||'',turno:pkg.coordenadorTurno||'',perfil:pkg.coordenadorPerfil||'CPU'};
    if(!rco.consolidacaoResponsavel)rco.consolidacaoResponsavel=cons;
    var resolved=rcoConsolidateResolveRsdStatuses_(pkg,reportId,cons);
    var wantEncerrar=!!(pkg.encerrar||payload.encerrar);
    var out=rcoSupplementalUpsertBody_(pkg,{fromConsolidate:true,wasRetificacao:draftStatus==='EM_RETIFICACAO',resolutions:resolved.resolutions||[],closeDraft:false});
    flags.p3Consolidado=true;flags.p3ConsolidadoEm=nowIso_();
    // Mantém STATUS em andamento/retificação; encerramento só com PDF + confirmação.
    rcoWriteClosureFlags_(reportId,flags);
    var ready=!!(flags.pdfGerado&&flags.p3Consolidado);
    var closed=false;
    if(wantEncerrar&&ready){
      closeRcoDraft_(reportId);
      closed=true;flags.encerrado=true;
    }
    out.resolutions=resolved.resolutions||[];
    out.action='rco-consolidate-final';
    out.pdfGerado=!!flags.pdfGerado;out.pdfGeradoEm=flags.pdfGeradoEm||'';
    out.p3Consolidado=true;out.p3ConsolidadoEm=flags.p3ConsolidadoEm||'';
    out.encerrado=!!closed;out.readyToClose=ready&&!closed;
    out.status=closed?'FINALIZADO':draftStatus;
    if(closed)out.message=(out.message||'RCO consolidado.')+' Serviço encerrado.';
    else if(!flags.pdfGerado)out.message='Dados consolidados. Ainda falta Gerar PDF do RCO.';
    else out.message=(out.message||'Dados consolidados.')+' PDF e Consolidação P3 concluídos. Confirme o encerramento quando desejar.';
    return out;
  }finally{lock.releaseLock();}
}
function rcoSupplementalUpsertBody_(payload,opts) {
  opts=opts||{};
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
    }else if(current&&['DEFERIDO','DEFERIDO_COM_RESSALVAS','INCLUIDO_RCO','FINALIZADO'].indexOf(String(rr.STATUS||''))>=0){
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
        LOCAL_PREVISTO:x.localPrevisto||x.LOCAL_PREVISTO||oldPod.LOCAL_PREVISTO||'',
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
  audit_('RCO',reportId,version,old?'RETIFICADO':'CONSOLIDADO',obj.CONSOLIDADOR_MATRICULA,obj.CONSOLIDADOR_NOME,batt,comp,Object.assign({},pkg,{resolutions:opts.resolutions||[],fromConsolidate:!!opts.fromConsolidate}));
  // Encerramento do rascunho NÃO ocorre automaticamente: exige PDF + P3 + confirmação (rco-encerrar / encerrar:true).
  if(opts.closeDraft===true)closeRcoDraft_(reportId);
  return {ok:true,message:old?'RCO retificado; origens e operações atualizadas.':'RCO consolidado; origens e operações registradas.',reportId:reportId,version:version};
}
function audit_(tipo,id,versao,acao,mat,nome,batt,comp,snapshot) {
  append_(sheet_(P3_SHEET_ID,'AUDITORIA_VERSOES'),{AUDITORIA_ID:uid_('audit'),TIPO_ENTIDADE:tipo,ENTIDADE_ID:id,VERSAO:versao,DATA_HORA:nowIso_(),ACAO:acao,
    RESPONSAVEL_MATRICULA:normMat_(mat||''),RESPONSAVEL_NOME:nome||'',BATALHAO:batt||'',COMPANHIA:comp||'',SNAPSHOT_JSON:JSON.stringify(snapshot||{}).slice(0,45000),
    HASH:hash_(JSON.stringify(snapshot||{})),ORIGEM:'CENTRAL_V10'});
}
