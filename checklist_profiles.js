/**
 * Fonte única dos perfis de checklist por tipo de veículo.
 * Usado por checklist_viatura.html, checklist_viatura_ios.html e checklist_cloud.js.
 * Backend espelha geraPendenciaMotomec em checklistItemGeraMotomec_().
 */
(function (global) {
  'use strict';

  const IRREGULAR = Object.freeze(['nao', 'defeito', 'avaria', 'baixo', 'baixa', 'ausente']);

  /** @type {Record<string, {label:string, section:string, choices:Record<string,string>, detailRule:string, geraPendenciaMotomec:boolean, categoria:string}>} */
  const ITEMS = {
    crlv: { label: 'CRLV / CRLV-e', section: 'Documentação', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'doc-negative', geraPendenciaMotomec: true, categoria: 'documento' },
    cartao_abastecimento: { label: 'Cartão de abastecimento', section: 'Documentação', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'doc-negative', geraPendenciaMotomec: true, categoria: 'documento' },
    estepe_obrigatorio: { label: 'Estepe', section: 'Equipamentos Obrigatórios', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: true, categoria: 'equipamento_viatura' },
    macaco: { label: 'Macaco', section: 'Equipamentos Obrigatórios', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: true, categoria: 'equipamento_viatura' },
    chave_roda: { label: 'Chave de roda', section: 'Equipamentos Obrigatórios', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: true, categoria: 'equipamento_viatura' },
    triangulo: { label: 'Triângulo', section: 'Equipamentos Obrigatórios', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: true, categoria: 'equipamento_viatura' },
    extintor: { label: 'Extintor (quando aplicável)', section: 'Equipamentos Obrigatórios', choices: { sim: 'Sim', nao: 'Não', na: 'N/A' }, detailRule: 'optional', geraPendenciaMotomec: true, categoria: 'equipamento_viatura' },
    farois: { label: 'Faróis / farol dianteiro', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    lanternas: { label: 'Lanternas / lanterna traseira', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    luz_freio: { label: 'Luz de freio', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    setas: { label: 'Indicadores de direção', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    iluminacao_placa: { label: 'Iluminação da placa', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    giroflex: { label: 'Giroflex / sinalizador', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    sirene: { label: 'Sirene', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    buzina: { label: 'Buzina', section: 'Sistema Elétrico', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    freios: { label: 'Freios', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    direcao: { label: 'Direção / guidão', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    embreagem: { label: 'Embreagem / transmissão', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    motor: { label: 'Motor', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    oleo_motor: { label: 'Óleo do motor', section: 'Condições Mecânicas', choices: { ok: 'OK', baixo: 'Baixo', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    agua_radiador: { label: 'Líquido de arrefecimento', section: 'Condições Mecânicas', choices: { ok: 'OK', baixo: 'Baixo', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    bateria: { label: 'Bateria', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    painel: { label: 'Velocímetro / painel', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    escapamento: { label: 'Sistema de escapamento', section: 'Condições Mecânicas', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_dd: { label: 'Pneu dianteiro direito', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_de: { label: 'Pneu dianteiro esquerdo', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_td: { label: 'Pneu traseiro direito', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_te: { label: 'Pneu traseiro esquerdo', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_estepe: { label: 'Pneu estepe', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_dianteiro: { label: 'Pneu dianteiro', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    pneu_traseiro: { label: 'Pneu traseiro', section: 'Pneus', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    lataria: { label: 'Lataria', section: 'Conservação', choices: { ok: 'OK', avaria: 'Avaria' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    carenagem: { label: 'Carenagem / tanque / partes externas', section: 'Conservação', choices: { ok: 'OK', avaria: 'Avaria' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    vidros: { label: 'Vidros', section: 'Conservação', choices: { ok: 'OK', avaria: 'Avaria' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    retrovisores: { label: 'Retrovisores', section: 'Conservação', choices: { ok: 'OK', defeito: 'Defeito' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    bancos: { label: 'Bancos', section: 'Conservação', choices: { ok: 'OK', avaria: 'Avaria' }, detailRule: 'negative', geraPendenciaMotomec: true, categoria: 'mecanico' },
    limpeza_interna: { label: 'Limpeza interna', section: 'Conservação', choices: { ok: 'OK', nao: 'Não' }, detailRule: 'cleaning', geraPendenciaMotomec: false, categoria: 'limpeza' },
    limpeza_externa: { label: 'Limpeza externa', section: 'Conservação', choices: { ok: 'OK', nao: 'Não' }, detailRule: 'cleaning', geraPendenciaMotomec: false, categoria: 'limpeza' },
    radio: { label: 'Rádio', section: 'Equipamentos Policiais', choices: { ok: 'OK', defeito: 'Defeito', nao: 'Não' }, detailRule: 'negative', geraPendenciaMotomec: false, categoria: 'material_operacional' },
    coletes: { label: 'Coletes refletivos', section: 'Equipamentos Policiais', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: false, categoria: 'material_operacional' },
    cones: { label: 'Cones', section: 'Equipamentos Policiais', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: false, categoria: 'material_operacional' },
    lombada: { label: 'Lombada móvel', section: 'Equipamentos Policiais', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: false, categoria: 'material_operacional' },
    bastao: { label: 'Bastão luminoso', section: 'Equipamentos Policiais', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: false, categoria: 'material_operacional' },
    kit_primeiros_socorros: { label: 'Kit de primeiros socorros', section: 'Equipamentos Policiais', choices: { sim: 'Sim', nao: 'Não' }, detailRule: 'optional', geraPendenciaMotomec: false, categoria: 'material_operacional' }
  };

  /** Labels específicas por tipo (sobrescrevem ITEMS.label no DOM/PDF). */
  const LABEL_BY_TIPO = {
    MOTOCICLETA: {
      farois: 'Farol dianteiro',
      lanternas: 'Lanterna traseira',
      direcao: 'Direção / guidão'
    },
    AUTOMOVEL: {
      farois: 'Faróis',
      lanternas: 'Lanternas',
      direcao: 'Direção'
    },
    GUINCHO: {
      farois: 'Faróis',
      lanternas: 'Lanternas',
      direcao: 'Direção'
    },
    REBOQUE: {
      farois: 'Faróis / luzes dianteiras',
      lanternas: 'Lanternas',
      direcao: 'Sistema de engate / direção auxiliar'
    }
  };

  /**
   * Perfis: somente IDs listados ficam visíveis.
   * GUINCHO = veículo automotor de remoção (tem motor).
   * REBOQUE = reboque/semirreboque verdadeiro (sem motor próprio).
   */
  const PROFILES = {
    AUTOMOVEL: [
      'crlv', 'cartao_abastecimento',
      'estepe_obrigatorio', 'macaco', 'chave_roda', 'triangulo', 'extintor',
      'farois', 'lanternas', 'luz_freio', 'setas', 'iluminacao_placa', 'giroflex', 'sirene', 'buzina',
      'freios', 'direcao', 'embreagem', 'motor', 'oleo_motor', 'agua_radiador', 'bateria', 'painel',
      'pneu_dd', 'pneu_de', 'pneu_td', 'pneu_te', 'pneu_estepe',
      'lataria', 'vidros', 'retrovisores', 'bancos', 'limpeza_interna', 'limpeza_externa',
      'radio', 'coletes', 'cones', 'lombada', 'bastao', 'kit_primeiros_socorros'
    ],
    MOTOCICLETA: [
      'crlv', 'cartao_abastecimento',
      'farois', 'lanternas', 'luz_freio', 'setas', 'iluminacao_placa', 'giroflex', 'sirene', 'buzina',
      'freios', 'direcao', 'motor', 'oleo_motor', 'bateria', 'painel', 'escapamento',
      'pneu_dianteiro', 'pneu_traseiro',
      'carenagem', 'retrovisores', 'limpeza_externa'
      /* sem extintor, lataria, estepe, macaco, materiais operacionais, embreagem/água (modelo-específicos ocultos) */
    ],
    GUINCHO: [
      'crlv', 'cartao_abastecimento',
      'estepe_obrigatorio', 'macaco', 'chave_roda', 'triangulo', 'extintor',
      'farois', 'lanternas', 'luz_freio', 'setas', 'iluminacao_placa', 'giroflex', 'sirene', 'buzina',
      'freios', 'direcao', 'embreagem', 'motor', 'oleo_motor', 'agua_radiador', 'bateria', 'painel',
      'pneu_dd', 'pneu_de', 'pneu_td', 'pneu_te', 'pneu_estepe',
      'lataria', 'vidros', 'retrovisores', 'bancos', 'limpeza_interna', 'limpeza_externa',
      'radio', 'coletes', 'cones', 'lombada', 'bastao', 'kit_primeiros_socorros'
    ],
    REBOQUE: [
      'crlv',
      'farois', 'lanternas', 'luz_freio', 'setas', 'iluminacao_placa', 'buzina',
      'freios',
      'pneu_dd', 'pneu_de', 'pneu_td', 'pneu_te', 'pneu_estepe',
      'lataria', 'limpeza_externa', 'triangulo', 'extintor'
      /* sem motor, óleo, radiador, direção, bateria — reboque verdadeiro */
    ]
  };

  const SECTION_ORDER = [
    'Documentação',
    'Equipamentos Obrigatórios',
    'Sistema Elétrico',
    'Condições Mecânicas',
    'Pneus',
    'Conservação',
    'Equipamentos Policiais'
  ];

  function normalizeVehicleTipo(v) {
    const t = String(v || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!t) return 'AUTOMOVEL';
    if (/MOTO|MOTONETA|CICLOMOTOR/.test(t)) return 'MOTOCICLETA';
    if (/GUINCHO|REMOCAO|AGRALE/.test(t)) return 'GUINCHO';
    if (/SEMI[\s_-]?REBOQUE|^REBOQUE$|TRAILER|CARRETA/.test(t) || (/\bREBOQUE\b/.test(t) && !/GUINCHO|AGRALE|REMOCAO/.test(t))) {
      // "AGRALE/A8700 REBOQUE" is operational name for tow truck → already caught by AGRALE above
      if (/GUINCHO|CAMINH|CAMION|AGRALE|REMOCAO/.test(t)) return 'GUINCHO';
      return 'REBOQUE';
    }
    if (/AUTO|CAMION|CAMINH|UTILIT|VTR|VIATURA|SUV|PICK/.test(t)) return 'AUTOMOVEL';
    if (t === 'GUINCHO' || t === 'CAMINHAO_GUINCHO') return 'GUINCHO';
    if (t === 'REBOQUE') return 'REBOQUE';
    if (t === 'MOTOCICLETA') return 'MOTOCICLETA';
    if (t === 'AUTOMOVEL') return 'AUTOMOVEL';
    return 'AUTOMOVEL';
  }

  function allowedSet(tipo) {
    const t = normalizeVehicleTipo(tipo);
    const list = PROFILES[t] || PROFILES.AUTOMOVEL;
    return new Set(list);
  }

  function itemMeta(id) {
    return ITEMS[id] || null;
  }

  function labelFor(id, tipo) {
    const t = normalizeVehicleTipo(tipo);
    return (LABEL_BY_TIPO[t] && LABEL_BY_TIPO[t][id]) || (ITEMS[id] && ITEMS[id].label) || id;
  }

  function isIrregularSituacao(v) {
    return IRREGULAR.indexOf(String(v || '').toLowerCase()) >= 0;
  }

  /**
   * Alteração Motomecanização ≠ pendência de preenchimento do formulário.
   * N/A nunca gera alteração. Material operacional (geraPendenciaMotomec=false) também não.
   */
  function shouldGeraAlteracaoMotomec(itemId, situacao, clientFlag) {
    const sit = String(situacao || '').toLowerCase();
    if (sit === 'na' || sit === 'n/a' || sit === 'ok' || sit === 'sim') return false;
    if (!isIrregularSituacao(sit)) return false;
    if (clientFlag === false || clientFlag === 'false' || clientFlag === 0 || clientFlag === '0') return false;
    const meta = ITEMS[itemId];
    if (meta) return meta.geraPendenciaMotomec === true;
    // Itens desconhecidos: só DEFEITO/AVARIA/nível geram alteração; "nao" puro não
    return ['defeito', 'avaria', 'baixo', 'baixa', 'ausente'].indexOf(sit) >= 0;
  }

  function buildItemConfigMap() {
    const out = {};
    Object.keys(ITEMS).forEach((id) => {
      const m = ITEMS[id];
      out[id] = {
        label: m.label,
        choices: m.choices,
        detail_rule: m.detailRule,
        section: m.section,
        geraPendenciaMotomec: m.geraPendenciaMotomec,
        categoria: m.categoria
      };
    });
    return out;
  }

  function buildSectionConfig(tipo) {
    const allowed = allowedSet(tipo);
    const out = {};
    SECTION_ORDER.forEach((sec) => {
      const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].section === sec && allowed.has(id));
      if (ids.length) out[sec] = ids;
    });
    return out;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderCheckItemHtml(id) {
    const m = ITEMS[id];
    if (!m) return '';
    const choices = Object.entries(m.choices).map(([value, text]) =>
      `<label class="choice"><input type="radio" name="${id}" value="${value}"><span>${escapeHtml(text)}</span></label>`
    ).join('');
    return `<div class="check-item" id="item_${id}" data-item="${id}" data-detail-rule="${m.detailRule}" data-gera-motomec="${m.geraPendenciaMotomec ? '1' : '0'}" data-categoria="${m.categoria}">
      <div class="item-main">
        <div class="item-name">${escapeHtml(m.label)}</div>
        <div class="choices" role="radiogroup" aria-label="${escapeHtml(m.label)}">${choices}</div>
        <button class="detail-toggle no-print" type="button" aria-expanded="false" aria-controls="${id}_details">Detalhar</button>
      </div>
      <div class="detail-panel" id="${id}_details" hidden>
        <label for="${id}_obs">Justificativa/descrição</label>
        <textarea id="${id}_obs" name="${id}_obs" rows="2" placeholder="Descreva o defeito, avaria, nível baixo, ausência ou outra informação relevante."></textarea>
      </div>
    </div>`;
  }

  function ensureDomItems() {
    SECTION_ORDER.forEach((secName) => {
      let section = document.querySelector(`.checklist-section[data-section="${secName}"] .checklist-grid`);
      if (!section) {
        const secEl = [...document.querySelectorAll('.checklist-section')].find((s) =>
          (s.querySelector('h2')?.textContent || '').trim() === secName
        );
        section = secEl?.querySelector('.checklist-grid');
        if (secEl && !secEl.dataset.section) secEl.dataset.section = secName;
      }
      if (!section) return;
      Object.keys(ITEMS).forEach((id) => {
        if (ITEMS[id].section !== secName) return;
        if (document.getElementById('item_' + id)) {
          const el = document.getElementById('item_' + id);
          el.dataset.geraMotomec = ITEMS[id].geraPendenciaMotomec ? '1' : '0';
          el.dataset.categoria = ITEMS[id].categoria;
          return;
        }
        section.insertAdjacentHTML('beforeend', renderCheckItemHtml(id));
      });
    });
  }

  function bindNewItemInteractions(root) {
    (root || document).querySelectorAll('.check-item .detail-toggle').forEach((btn) => {
      if (btn.dataset.profileBound) return;
      btn.dataset.profileBound = '1';
      btn.addEventListener('click', () => {
        const item = btn.closest('.check-item');
        const panel = item.querySelector('.detail-panel');
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Ocultar' : 'Detalhar';
      });
    });
    (root || document).querySelectorAll('.check-item input[type="radio"]').forEach((r) => {
      if (r.dataset.profileBound) return;
      r.dataset.profileBound = '1';
      r.addEventListener('change', () => {
        if (typeof global.updatePendingCount === 'function') global.updatePendingCount();
      });
    });
  }

  function applyTipoFilter(tipoRaw) {
    const tipo = normalizeVehicleTipo(tipoRaw || 'AUTOMOVEL');
    global.CENTRAL_CHECKLIST_VEHICLE_TIPO = tipo;
    ensureDomItems();
    bindNewItemInteractions();
    const allowed = allowedSet(tipo);
    document.querySelectorAll('.check-item').forEach((item) => {
      const id = item.dataset.item;
      const show = allowed.has(id);
      item.classList.toggle('tipo-hidden', !show);
      const nameEl = item.querySelector('.item-name');
      if (nameEl && ITEMS[id]) nameEl.textContent = labelFor(id, tipo);
      const meta = ITEMS[id];
      if (meta) {
        item.dataset.geraMotomec = meta.geraPendenciaMotomec ? '1' : '0';
        item.dataset.categoria = meta.categoria;
        item.dataset.detailRule = meta.detailRule;
      }
      if (!show) {
        item.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = false; });
        const ta = item.querySelector('textarea');
        if (ta) ta.value = '';
      }
    });
    document.querySelectorAll('.checklist-section').forEach((sec) => {
      const visible = [...sec.querySelectorAll('.check-item')].some((i) => !i.classList.contains('tipo-hidden'));
      sec.classList.toggle('tipo-empty', !visible);
    });
    return tipo;
  }

  global.ChecklistProfiles = {
    ITEMS,
    PROFILES,
    IRREGULAR,
    normalizeVehicleTipo,
    allowedSet,
    itemMeta,
    labelFor,
    isIrregularSituacao,
    shouldGeraAlteracaoMotomec,
    buildItemConfigMap,
    buildSectionConfig,
    ensureDomItems,
    applyTipoFilter,
    bindNewItemInteractions,
    SECTION_ORDER
  };
})(typeof window !== 'undefined' ? window : globalThis);
