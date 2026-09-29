/**
 * Núcleo visual das evidências: independente de ferramenta de teste.
 *
 * Roda DENTRO da página da aplicação e instala `window.__evidencia` com a API de overlays
 * (placa, terminal REST, destaques, callouts e resultado).
 *
 * Precisa ser uma função autocontida (sem referências a nada fora dela): o Playwright a
 * serializa com toString() via page.addInitScript(), e o Cypress a chama passando a janela
 * da aplicação. Por isso: sem imports, sem async, sem parâmetros com valor padrão.
 *
 * @param {Window} [janela] janela da aplicação (padrão: window)
 */
export function instalarEvidencia(janela) {
  var w = janela || window;
  if (w.__evidencia) return w.__evidencia;

  var CHAVE = 'evidencia:rest';
  var CANCELADA = 'cancelada (troca de página)';
  var CSS = [
    ':host { all: initial; }',
    '* { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }',
    '.placa { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(10,14,26,.88); }',
    '.placa .cartao { max-width: 720px; width: calc(100% - 48px); padding: 32px 36px; border-radius: 14px; background: #111827; border: 1px solid #334155; color: #e5e7eb; box-shadow: 0 20px 60px rgba(0,0,0,.5); }',
    '.placa .rotulo { font-size: 12px; letter-spacing: .14em; color: #38bdf8; font-weight: 700; }',
    '.placa .suite { margin-top: 14px; font-size: 14px; color: #94a3b8; }',
    '.placa .ct { margin-top: 6px; font-size: 26px; font-weight: 700; line-height: 1.25; }',
    '.placa .meta { margin-top: 20px; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13px; }',
    '.placa .meta b { color: #94a3b8; font-weight: 500; }',
    '.terminal { position: fixed; right: 16px; bottom: 16px; width: min(520px, calc(100% - 32px)); border-radius: 10px; overflow: hidden; background: rgba(2,6,23,.92); border: 1px solid #1e293b; box-shadow: 0 10px 30px rgba(0,0,0,.4); }',
    '.terminal .barra { padding: 6px 12px; font-size: 11px; color: #94a3b8; background: #0f172a; border-bottom: 1px solid #1e293b; letter-spacing: .08em; }',
    '.terminal .linhas { padding: 8px 12px; max-height: 190px; overflow: hidden; }',
    '.terminal .l { font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.terminal .vazio { color: #475569; }',
    '.m { color: #38bdf8; font-weight: 700; } .canc { color: #94a3b8; font-style: italic; }',
    '.ok { color: #4ade80; } .erro { color: #f87171; } .pend { color: #fbbf24; } .t { color: #64748b; }',
    '.caixa { position: fixed; border: 3px solid #f43f5e; border-radius: 6px; box-shadow: 0 0 0 4px rgba(244,63,94,.25); }',
    '.callout { position: fixed; max-width: 360px; padding: 8px 12px; border-radius: 8px; background: #f43f5e; color: #fff; font-size: 14px; font-weight: 600; box-shadow: 0 6px 18px rgba(0,0,0,.3); }',
    '.callout .n { display: inline-block; min-width: 20px; margin-right: 8px; padding: 0 6px; border-radius: 10px; background: rgba(255,255,255,.25); text-align: center; }',
    '.resultado { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); padding: 12px 20px; border-radius: 10px; color: #fff; font-size: 16px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,.35); max-width: calc(100% - 32px); }',
    '.resultado.passou { background: #16a34a; } .resultado.falhou { background: #dc2626; }',
    '.resultado small { display: block; margin-top: 4px; font-weight: 400; font-size: 13px; }',
  ].join('\n');

  function pad(n) { return String(n).padStart(2, '0'); }
  function hora() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- Estado do terminal REST: sobrevive a navegações na mesma origem (sessionStorage) ----
  var linhas = [];
  var seq = 0;
  try {
    var salvo = JSON.parse(w.sessionStorage.getItem(CHAVE) || '[]');
    if (Array.isArray(salvo)) linhas = salvo;
    seq = linhas.reduce(function (m, l) { return Math.max(m, l.id); }, 0);
  } catch (e) { /* página sem storage (about:blank, sandbox) */ }
  function salvar() {
    try { w.sessionStorage.setItem(CHAVE, JSON.stringify(linhas.slice(-50))); } catch (e) { /* idem */ }
  }

  // ---- Raiz dos overlays: Shadow DOM, para o CSS da aplicação não interferir ----
  function raiz() {
    var doc = w.document;
    if (!doc || !doc.body) return null;
    var host = doc.getElementById('ev-host');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'ev-host';
      host.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;');
      var sr = host.attachShadow({ mode: 'open' });
      sr.innerHTML = '<style>' + CSS + '</style>' +
        '<div class="terminal"><div class="barra">● ● ●&nbsp;&nbsp;CHAMADAS REST</div><div class="linhas"></div></div>';
      doc.body.appendChild(host);
    }
    return host.shadowRoot;
  }

  function renderTerminal() {
    var sr = raiz();
    var alvo = sr && sr.querySelector('.linhas');
    if (!alvo) return;
    var origem = w.location.origin;
    var visiveis = linhas.slice(-10);
    alvo.innerHTML = visiveis.length ? visiveis.map(function (l) {
      var url = l.url.indexOf(origem) === 0 ? l.url.slice(origem.length) : l.url;
      var st;
      if (l.status === undefined || l.status === null) st = '<span class="pend">…aguardando</span>';
      else if (l.status === CANCELADA) st = '<span class="canc">' + CANCELADA + '</span>';
      else st = '<span class="' + (typeof l.status === 'number' && l.status < 400 ? 'ok' : 'erro') + '">' +
        esc(l.status) + '</span> <span class="t">' + l.ms + 'ms</span>';
      return '<div class="l"><span class="t">' + l.hora + '</span>  <span class="m">' + esc(l.metodo) +
        '</span> ' + esc(url) + ' → ' + st + '</div>';
    }).join('') : '<div class="l vazio">$ aguardando chamadas…</div>';
  }

  function registrar(metodo, url) {
    var id = ++seq;
    linhas.push({ id: id, hora: hora(), metodo: String(metodo).toUpperCase(), url: url });
    salvar();
    renderTerminal();
    return id;
  }

  function concluir(id, status, inicio) {
    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      if (l.id === id && (l.status === undefined || l.status === null)) {
        l.status = status;
        l.ms = Math.round(w.performance.now() - inicio);
      }
    }
    salvar();
    renderTerminal();
  }

  // ---- Instrumentação de rede: fetch e XHR feitos pela página ----
  function ignorar(url) { return url.indexOf('/__cypress/') >= 0 || url.indexOf('/__/') >= 0; }
  function absoluta(url) { try { return new w.URL(String(url), w.location.href).href; } catch (e) { return String(url); } }

  var origFetch = w.fetch && w.fetch.bind(w);
  if (origFetch) {
    w.fetch = function (input, init) {
      var req = input instanceof w.Request ? input : null;
      var url = absoluta(typeof input === 'string' ? input : req ? req.url : String(input));
      if (ignorar(url)) return origFetch(input, init);
      var id = registrar((init && init.method) || (req && req.method) || 'GET', url);
      var inicio = w.performance.now();
      return origFetch(input, init).then(function (res) {
        concluir(id, res.status, inicio);
        return res;
      }, function (err) {
        concluir(id, 'ERRO', inicio);
        throw err;
      });
    };
  }
  var proto = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
  if (proto) {
    var open = proto.open;
    var send = proto.send;
    proto.open = function (metodo, url) {
      this.__ev = { m: String(metodo), u: absoluta(url) };
      return open.apply(this, arguments);
    };
    proto.send = function () {
      var xhr = this;
      var info = xhr.__ev;
      if (info && !ignorar(info.u)) {
        var id = registrar(info.m, info.u);
        var inicio = w.performance.now();
        xhr.addEventListener('loadend', function () { concluir(id, xhr.status || 'ERRO', inicio); });
      }
      return send.apply(this, arguments);
    };
  }

  // Chamadas pendentes quando a página é trocada não são erros da API.
  w.addEventListener('pagehide', function () {
    linhas.forEach(function (l) { if (l.status === undefined || l.status === null) l.status = CANCELADA; });
    salvar();
  });

  // ---- Overlays ----
  function descrever(el) {
    var txt = el.getAttribute('aria-label') || (el.innerText || '').trim() || el.getAttribute('placeholder') ||
      el.getAttribute('name') || el.getAttribute('data-cy') || el.getAttribute('data-testid') || el.tagName.toLowerCase();
    return txt.replace(/\s+/g, ' ').slice(0, 40);
  }

  var api = {
    /** Texto padrão do callout para uma ação. acao: click | dblclick | type | check | uncheck | select */
    rotulo: function (el, acao, valor) {
      var alvo = '"' + descrever(el) + '"';
      var senha = el.type === 'password';
      switch (acao) {
        case 'click': return 'Clique em ' + alvo;
        case 'dblclick': return 'Duplo clique em ' + alvo;
        case 'check': return 'Marcar ' + alvo;
        case 'uncheck': return 'Desmarcar ' + alvo;
        case 'select': return 'Selecionar "' + valor + '" em ' + alvo;
        case 'type': return 'Digitar "' + (senha ? '••••••••' : valor) + '" em ' + alvo;
        default: return acao + ' em ' + alvo;
      }
    },

    /** Placa de apresentação. dados: { suite, ct, meta: [[rótulo, valor], ...] } */
    placa: function (dados) {
      var sr = raiz();
      if (!sr) return false;
      var el = w.document.createElement('div');
      el.className = 'placa';
      el.innerHTML = '<div class="cartao"><div class="rotulo">EVIDÊNCIA DE TESTE</div>' +
        (dados.suite ? '<div class="suite">' + esc(dados.suite) + '</div>' : '') +
        '<div class="ct">' + esc(dados.ct) + '</div><div class="meta">' +
        (dados.meta || []).map(function (m) { return '<b>' + esc(m[0]) + '</b><span>' + esc(m[1]) + '</span>'; }).join('') +
        '</div></div>';
      sr.appendChild(el);
      return true;
    },

    removerPlaca: function () { api.remover('.placa'); },

    /** Caixa sobre o elemento real + callout numerado. */
    destacar: function (el, texto, numero) {
      var sr = raiz();
      if (!sr) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      var r = el.getBoundingClientRect();
      var doc = w.document;
      var caixa = doc.createElement('div');
      caixa.className = 'caixa';
      caixa.style.left = (r.left - 6) + 'px';
      caixa.style.top = (r.top - 6) + 'px';
      caixa.style.width = (r.width + 12) + 'px';
      caixa.style.height = (r.height + 12) + 'px';
      var callout = doc.createElement('div');
      callout.className = 'callout';
      callout.innerHTML = '<span class="n">' + numero + '</span>' + esc(texto);
      sr.appendChild(caixa);
      sr.appendChild(callout);
      var ch = callout.offsetHeight;
      var top = r.top - ch - 14 > 8 ? r.top - ch - 14 : Math.min(r.bottom + 14, w.innerHeight - ch - 8);
      var left = Math.max(8, Math.min(r.left - 6, w.innerWidth - callout.offsetWidth - 8));
      callout.style.top = top + 'px';
      callout.style.left = left + 'px';
      return true;
    },

    limparDestaques: function () { api.remover('.caixa, .callout'); },

    /** Faixa final de resultado. */
    resultado: function (passou, titulo, mensagem) {
      var sr = raiz();
      if (!sr) return false;
      var el = w.document.createElement('div');
      el.className = 'resultado ' + (passou ? 'passou' : 'falhou');
      el.innerHTML = passou
        ? '✔ PASSOU — ' + esc(titulo)
        : '✖ FALHOU — ' + esc(titulo) + '<small>' + esc(String(mensagem || '').slice(0, 180)) + '</small>';
      sr.appendChild(el);
      return true;
    },

    remover: function (seletor) {
      var sr = raiz();
      if (sr) sr.querySelectorAll(seletor).forEach(function (e) { e.remove(); });
    },

    /** Zera o terminal REST (início de um novo CT, quando o storage não é limpo entre testes). */
    reiniciar: function () {
      linhas = [];
      seq = 0;
      salvar();
      renderTerminal();
    },

    /** Garante que o terminal está montado (chamar após a página carregar). */
    montar: function () { renderTerminal(); return !!raiz(); },
  };

  w.__evidencia = api;
  if (w.document && w.document.body) renderTerminal();
  else w.addEventListener('DOMContentLoaded', renderTerminal);
  return api;
}
