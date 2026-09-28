/// <reference types="cypress" />
/**
 * Modo evidência: injeta overlays na própria página da aplicação durante a execução
 * (placa do caso, terminal REST, destaques e callouts) e captura prints de cada etapa.
 *
 * Só é ativado quando EVIDENCIA=true é exposto (ver scripts/evidencia.mjs).
 * Fora desse modo, apenas registra o comando cy.destacar(), que não faz nada.
 */

type LinhaRest = {
  id: number;
  hora: string;
  metodo: string;
  url: string;
  status?: number | string;
  ms?: number;
};

declare global {
  namespace Cypress {
    interface Chainable {
      /** No modo evidência, destaca o elemento com um callout e captura um print. */
      destacar(texto: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

function ler(chave: string): unknown {
  const c = Cypress as unknown as Record<string, unknown>;
  if (typeof c.expose === 'function') return (c.expose as (k: string) => unknown)(chave);
  if (typeof c.env === 'function') return (c.env as (k: string) => unknown)(chave);
  return undefined;
}

const ATIVO = String(ler('EVIDENCIA')) === 'true';
const NOME = String(ler('EVIDENCIA_NOME') ?? 'evidencia');
const CT = String(ler('EVIDENCIA_CT') ?? '');
const PAUSA = Number(ler('EVIDENCIA_PAUSA') ?? 1200);
const PRINTS = String(ler('EVIDENCIA_PRINTS') ?? 'true') !== 'false';

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  .placa { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(10, 14, 26, .88); transition: opacity .4s; }
  .placa .cartao { max-width: 720px; width: calc(100% - 48px); padding: 32px 36px; border-radius: 14px;
    background: #111827; border: 1px solid #334155; color: #e5e7eb; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  .placa .rotulo { font-size: 12px; letter-spacing: .14em; color: #38bdf8; font-weight: 700; }
  .placa .suite { margin-top: 14px; font-size: 14px; color: #94a3b8; }
  .placa .ct { margin-top: 6px; font-size: 26px; font-weight: 700; line-height: 1.25; }
  .placa .meta { margin-top: 20px; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13px; }
  .placa .meta b { color: #94a3b8; font-weight: 500; }
  .terminal { position: fixed; right: 16px; bottom: 16px; width: min(520px, calc(100% - 32px));
    border-radius: 10px; overflow: hidden; background: rgba(2, 6, 23, .92); border: 1px solid #1e293b;
    box-shadow: 0 10px 30px rgba(0,0,0,.4); }
  .terminal .barra { padding: 6px 12px; font-size: 11px; color: #94a3b8; background: #0f172a;
    border-bottom: 1px solid #1e293b; letter-spacing: .08em; }
  .terminal .linhas { padding: 8px 12px; max-height: 190px; overflow: hidden; }
  .terminal .l { font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color: #cbd5e1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .terminal .vazio { color: #475569; }
  .m { color: #38bdf8; font-weight: 700; }
  .canc { color: #94a3b8; font-style: italic; }
  .ok { color: #4ade80; } .erro { color: #f87171; } .pend { color: #fbbf24; } .t { color: #64748b; }
  .caixa { position: fixed; border: 3px solid #f43f5e; border-radius: 6px;
    box-shadow: 0 0 0 4px rgba(244, 63, 94, .25); }
  .callout { position: fixed; max-width: 360px; padding: 8px 12px; border-radius: 8px; background: #f43f5e;
    color: #fff; font-size: 14px; font-weight: 600; box-shadow: 0 6px 18px rgba(0,0,0,.3); }
  .callout .n { display: inline-block; min-width: 20px; margin-right: 8px; padding: 0 6px; border-radius: 10px;
    background: rgba(255,255,255,.25); text-align: center; }
  .resultado { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); padding: 12px 20px;
    border-radius: 10px; color: #fff; font-size: 16px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,.35);
    max-width: calc(100% - 32px); }
  .resultado.passou { background: #16a34a; } .resultado.falhou { background: #dc2626; }
  .resultado small { display: block; margin-top: 4px; font-weight: 400; font-size: 13px; }
`;

let janela: Window | null = null;
let linhas: LinhaRest[] = [];
let seq = 0;
let passo = 0;
let prints = 0;
let placaPendente = false;
let placaMostrada = false;

const pad = (n: number) => String(n).padStart(2, '0');
const horaAgora = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function raiz(): ShadowRoot | null {
  const doc = janela?.document;
  if (!doc || !doc.body) return null;
  let host = doc.getElementById('ev-host');
  if (!host) {
    host = doc.createElement('div');
    host.id = 'ev-host';
    host.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${CSS}</style>
      <div class="terminal"><div class="barra">● ● ●&nbsp;&nbsp;CHAMADAS REST</div><div class="linhas"></div></div>`;
    doc.body.appendChild(host);
  }
  return host.shadowRoot;
}

function renderTerminal() {
  const sr = raiz();
  const alvo = sr?.querySelector('.linhas');
  if (!alvo) return;
  const origem = janela?.location.origin ?? '';
  const visiveis = linhas.slice(-10);
  alvo.innerHTML = visiveis.length
    ? visiveis.map((l) => {
        const url = l.url.startsWith(origem) ? l.url.slice(origem.length) : l.url;
        const st = l.status === undefined
          ? '<span class="pend">…aguardando</span>'
          : l.status === CANCELADA
            ? `<span class="canc">${CANCELADA}</span>`
            : `<span class="${typeof l.status === 'number' && l.status < 400 ? 'ok' : 'erro'}">${l.status}</span> <span class="t">${l.ms}ms</span>`;
        return `<div class="l"><span class="t">${l.hora}</span>  <span class="m">${esc(l.metodo)}</span> ${esc(url)} → ${st}</div>`;
      }).join('')
    : '<div class="l vazio">$ aguardando chamadas…</div>';
}

function registrar(metodo: string, url: string): number {
  const id = ++seq;
  linhas.push({ id, hora: horaAgora(), metodo: metodo.toUpperCase(), url });
  renderTerminal();
  return id;
}

/** Chamadas interrompidas porque a página foi trocada (navegação, cy.session) não são erros da API. */
const CANCELADA = 'cancelada (troca de página)';
let saindo = false;

function concluir(id: number, status: number | string, inicio: number) {
  const l = linhas.find((x) => x.id === id);
  if (l && l.status === undefined) {
    if (saindo && (status === 'ERRO' || status === 0)) status = CANCELADA;
    l.status = status;
    l.ms = Math.round(performance.now() - inicio);
  }
  renderTerminal();
}

function instrumentarRede(w: Window) {
  const ignorar = (url: string) => url.includes('/__cypress/') || url.includes('/__/');
  const origFetch = w.fetch?.bind(w);
  if (origFetch) {
    w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof (w as typeof window).Request ? input : null;
      const url = typeof input === 'string' ? input : req ? req.url : String(input);
      if (ignorar(url)) return origFetch(input, init);
      const id = registrar(init?.method ?? req?.method ?? 'GET', new URL(url, w.location.href).href);
      const inicio = performance.now();
      try {
        const res = await origFetch(input, init);
        concluir(id, res.status, inicio);
        return res;
      } catch (e) {
        concluir(id, 'ERRO', inicio);
        throw e;
      }
    };
  }
  const proto = (w as typeof window).XMLHttpRequest?.prototype;
  if (proto) {
    const open = proto.open;
    const send = proto.send;
    proto.open = function (this: XMLHttpRequest & { __ev?: { m: string; u: string } }, ...a: unknown[]) {
      this.__ev = { m: String(a[0]), u: new URL(String(a[1]), w.location.href).href };
      return (open as (...x: unknown[]) => void).apply(this, a);
    } as typeof proto.open;
    proto.send = function (this: XMLHttpRequest & { __ev?: { m: string; u: string } }, body?: Document | XMLHttpRequestBodyInit | null) {
      const info = this.__ev;
      if (info && !ignorar(info.u)) {
        const id = registrar(info.m, info.u);
        const inicio = performance.now();
        this.addEventListener('loadend', () => concluir(id, this.status || 'ERRO', inicio));
      }
      return send.call(this, body);
    };
  }
}

function mostrarPlaca() {
  const sr = raiz();
  if (!sr) return;
  const t = Cypress.currentTest;
  const suite = t.titlePath.slice(0, -1).join(' › ');
  const d = new Date();
  const el = janela!.document.createElement('div');
  el.className = 'placa';
  el.innerHTML = `<div class="cartao">
      <div class="rotulo">EVIDÊNCIA DE TESTE</div>
      ${suite ? `<div class="suite">${esc(suite)}</div>` : ''}
      <div class="ct">${esc(t.title)}</div>
      <div class="meta">
        <b>Data</b><span>${d.toLocaleDateString('pt-BR')} ${horaAgora()}</span>
        <b>Arquivo</b><span>${esc(Cypress.spec.relative)}</span>
        <b>Ambiente</b><span>${esc(janela!.location.origin)}</span>
        <b>Navegador</b><span>${esc(`${Cypress.browser.displayName} ${Cypress.browser.majorVersion}`)} · Cypress ${esc(Cypress.version)}</span>
      </div></div>`;
  sr.appendChild(el);
}

function removerOverlays(seletor: string) {
  raiz()?.querySelectorAll(seletor).forEach((e) => e.remove());
}

function descrever(el: Element): string {
  const h = el as HTMLElement;
  const txt = el.getAttribute('aria-label') || (h.innerText ?? '').trim() || el.getAttribute('placeholder')
    || el.getAttribute('name') || el.getAttribute('data-cy') || el.getAttribute('data-testid') || el.tagName.toLowerCase();
  return txt.replace(/\s+/g, ' ').slice(0, 40);
}

function desenharDestaque(el: Element, texto: string) {
  const sr = raiz();
  if (!sr) return;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const doc = janela!.document;
  const caixa = doc.createElement('div');
  caixa.className = 'caixa';
  Object.assign(caixa.style, {
    left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
  });
  const callout = doc.createElement('div');
  callout.className = 'callout';
  callout.innerHTML = `<span class="n">${++passo}</span>${esc(texto)}`;
  sr.appendChild(caixa);
  sr.appendChild(callout);
  const alturaJanela = janela!.innerHeight;
  const larguraJanela = janela!.innerWidth;
  const ch = callout.offsetHeight;
  const top = r.top - ch - 14 > 8 ? r.top - ch - 14 : Math.min(r.bottom + 14, alturaJanela - ch - 8);
  const left = Math.max(8, Math.min(r.left - 6, larguraJanela - callout.offsetWidth - 8));
  Object.assign(callout.style, { top: `${top}px`, left: `${left}px` });
}

function capturar(etapa: string) {
  if (!PRINTS) return;
  prints += 1;
  cy.screenshot(`${NOME}-${pad(prints)}-${slug(etapa)}`, { capture: 'viewport', overwrite: true, log: false });
}

/** Mantém a placa na tela, captura o print e a remove (só na primeira etapa do teste). */
function consumirPlaca() {
  if (!placaPendente) return;
  placaPendente = false;
  cy.wait(PAUSA * 2, { log: false });
  capturar('placa');
  cy.wrap(null, { log: false }).then(() => removerOverlays('.placa'));
}

/** Enfileira: placa pendente → destaque + callout → pausa → print → remove destaque. */
function etapa(el: Element, texto: string, nomePrint: string) {
  cy.wrap(null, { log: false }).then(() => consumirPlaca());
  cy.wrap(null, { log: false }).then(() => desenharDestaque(el, texto));
  cy.wait(PAUSA, { log: false });
  cy.wrap(null, { log: false }).then(() => capturar(nomePrint));
  cy.wrap(null, { log: false }).then(() => removerOverlays('.caixa, .callout'));
}

Cypress.Commands.add('destacar', { prevSubject: 'element' }, (subject: JQuery<HTMLElement>, texto: string) => {
  if (!ATIVO || !janela) return cy.wrap(subject, { log: false });
  etapa(subject[0], texto, texto);
  return cy.wrap(subject, { log: false });
});

if (ATIVO) {
  // Ações do Cypress chamam outras internamente (type → click para focar, clear → type).
  // Enquanto uma ação executa, as chamadas internas passam direto, sem overlay.
  let emAcao = 0;
  const diretos = new WeakSet<Element>();
  const executar = (original: (...a: unknown[]) => unknown, subject: unknown, args: unknown[]) => {
    emAcao += 1;
    let r: unknown;
    try {
      r = original(subject, ...args);
    } catch (e) {
      emAcao -= 1;
      throw e;
    }
    const p = r as { finally?: (fn: () => void) => unknown } | undefined;
    if (p && typeof p.finally === 'function') return p.finally(() => { emAcao -= 1; });
    emAcao -= 1;
    return r;
  };

  const isSenha = (el: Element) => (el as HTMLInputElement).type === 'password';
  const acoes: Record<string, (el: Element, args: unknown[]) => string> = {
    click: (el) => `Clique em "${descrever(el)}"`,
    dblclick: (el) => `Duplo clique em "${descrever(el)}"`,
    check: (el) => `Marcar "${descrever(el)}"`,
    uncheck: (el) => `Desmarcar "${descrever(el)}"`,
    select: (el, a) => `Selecionar "${String(a[0])}" em "${descrever(el)}"`,
    type: (el, a) => {
      const opts = (a[1] ?? {}) as { log?: boolean };
      const texto = opts.log === false || isSenha(el) ? '••••••••' : String(a[0]);
      return `Digitar "${texto}" em "${descrever(el)}"`;
    },
  };

  Object.entries(acoes).forEach(([nome, rotulo]) => {
    // Tipagem genérica: a mesma função sobrescreve comandos com assinaturas diferentes.
    const sobrescrever = Cypress.Commands.overwrite as unknown as (
      n: string, fn: (original: (...a: unknown[]) => unknown, subject: JQuery<HTMLElement>, ...args: unknown[]) => unknown,
    ) => void;
    sobrescrever(nome, (original, subject, ...args) => {
      const el = subject?.[0];
      if (!el || !janela || emAcao > 0 || diretos.has(el)) {
        if (el) diretos.delete(el);
        return executar(original, subject, args);
      }
      // Enfileira o overlay e reenfileira a mesma ação sobre o elemento; a segunda chamada executa direto.
      etapa(el, rotulo(el, args), nome);
      cy.wrap(null, { log: false }).then(() => { diretos.add(el); });
      return (cy.wrap(subject, { log: false }) as unknown as Record<string, (...a: unknown[]) => unknown>)[nome](...args);
    });
  });

  // clear() não recebe destaque, mas marca a execução para que o type() interno dele também não receba.
  (Cypress.Commands.overwrite as unknown as (n: string, fn: (...a: any[]) => unknown) => void)(
    'clear', (original: (...a: unknown[]) => unknown, subject: unknown, ...args: unknown[]) => executar(original, subject, args),
  );

  Cypress.on('window:before:unload', () => {
    saindo = true;
    linhas.forEach((l) => { if (l.status === undefined) l.status = CANCELADA; });
  });

  Cypress.on('window:before:load', (w) => {
    saindo = false;
    janela = w;
    instrumentarRede(w);
  });

  Cypress.on('window:load', (w) => {
    janela = w;
    renderTerminal();
    // Placa na primeira página do teste; reaparece se houver navegação antes de ser capturada.
    if (!placaMostrada || placaPendente) {
      placaMostrada = true;
      placaPendente = true;
      mostrarPlaca();
    }
  });

  beforeEach(function () {
    const t = Cypress.currentTest;
    if (CT && CT !== t.titlePath.join(' > ') && CT !== t.title) this.skip();
    linhas = [];
    seq = 0;
    passo = 0;
    prints = 0;
    placaPendente = false;
    placaMostrada = false;
  });

  afterEach(function () {
    const t = this.currentTest;
    if (!t || !['passed', 'failed'].includes(String(t.state)) || !janela) return;
    consumirPlaca();
    cy.wrap(null, { log: false }).then(() => {
      const sr = raiz();
      if (!sr) return;
      const passou = t.state === 'passed';
      const el = janela!.document.createElement('div');
      el.className = `resultado ${passou ? 'passou' : 'falhou'}`;
      el.innerHTML = passou
        ? `✔ PASSOU — ${esc(t.title)}`
        : `✖ FALHOU — ${esc(t.title)}<small>${esc((t.err?.message ?? '').slice(0, 180))}</small>`;
      sr.appendChild(el);
    });
    cy.wait(PAUSA * 1.5, { log: false });
    capturar('resultado');
  });
}

export {};
