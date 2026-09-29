/// <reference types="cypress" />
/**
 * Adaptador Cypress das evidências: liga o núcleo visual (core.js) aos comandos do Cypress.
 *
 * Só é ativado quando EVIDENCIA=true é exposto (ver evidencia/run.mjs).
 * Fora desse modo, apenas registra o comando cy.destacar(), que não faz nada.
 */
import { instalarEvidencia, type EvidenciaApi } from './core.js';

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

let janela: Window | null = null;
let passo = 0;
let prints = 0;
let placaPendente = false;
let placaMostrada = false;
let primeiraCarga = true;

const pad = (n: number) => String(n).padStart(2, '0');
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const api = (): EvidenciaApi | undefined => janela?.__evidencia;

function dadosPlaca() {
  const t = Cypress.currentTest;
  const d = new Date();
  return {
    suite: t.titlePath.slice(0, -1).join(' › '),
    ct: t.title,
    meta: [
      ['Data', `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`],
      ['Arquivo', Cypress.spec.relative],
      ['Ambiente', janela?.location.origin ?? ''],
      ['Navegador', `${Cypress.browser.displayName} ${Cypress.browser.majorVersion} · Cypress ${Cypress.version}`],
    ] as Array<[string, string]>,
  };
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
  cy.wrap(null, { log: false }).then(() => api()?.removerPlaca());
}

/** Enfileira: placa pendente → destaque + callout → pausa → print → remove destaque. */
function etapa(el: Element, texto: () => string, nomePrint: string) {
  cy.wrap(null, { log: false }).then(() => consumirPlaca());
  cy.wrap(null, { log: false }).then(() => { api()?.destacar(el, texto(), ++passo); });
  cy.wait(PAUSA, { log: false });
  cy.wrap(null, { log: false }).then(() => capturar(nomePrint));
  cy.wrap(null, { log: false }).then(() => api()?.limparDestaques());
}

Cypress.Commands.add('destacar', { prevSubject: 'element' }, (subject: JQuery<HTMLElement>, texto: string) => {
  if (!ATIVO || !janela) return cy.wrap(subject, { log: false });
  etapa(subject[0], () => texto, texto);
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

  // Comando do Cypress → ação do núcleo (define o texto do callout).
  const acoes: Record<string, string> = {
    click: 'click', dblclick: 'dblclick', check: 'check', uncheck: 'uncheck', select: 'select', type: 'type',
  };

  Object.entries(acoes).forEach(([nome, acao]) => {
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
      const opts = (args[1] ?? {}) as { log?: boolean };
      const valor = nome === 'type' && opts.log === false ? '••••••••' : String(args[0] ?? '');
      // Enfileira o overlay e reenfileira a mesma ação sobre o elemento; a segunda chamada executa direto.
      etapa(el, () => api()?.rotulo(el, acao, valor) ?? nome, nome);
      cy.wrap(null, { log: false }).then(() => { diretos.add(el); });
      return (cy.wrap(subject, { log: false }) as unknown as Record<string, (...a: unknown[]) => unknown>)[nome](...args);
    });
  });

  // clear() não recebe destaque, mas marca a execução para que o type() interno dele também não receba.
  (Cypress.Commands.overwrite as unknown as (n: string, fn: (...a: any[]) => unknown) => void)(
    'clear', (original: (...a: unknown[]) => unknown, subject: unknown, ...args: unknown[]) => executar(original, subject, args),
  );

  Cypress.on('window:before:load', (w) => {
    janela = w;
    const ev = instalarEvidencia(w);
    if (primeiraCarga) {
      primeiraCarga = false;
      ev.reiniciar();
    }
  });

  Cypress.on('window:load', (w) => {
    janela = w;
    api()?.montar();
    // Placa na primeira página do teste; reaparece se houver navegação antes de ser capturada.
    if (!placaMostrada || placaPendente) {
      placaMostrada = true;
      placaPendente = true;
      api()?.placa(dadosPlaca());
    }
  });

  beforeEach(function () {
    const t = Cypress.currentTest;
    if (CT && CT !== t.titlePath.join(' > ') && CT !== t.title) this.skip();
    passo = 0;
    prints = 0;
    placaPendente = false;
    placaMostrada = false;
    primeiraCarga = true;
  });

  afterEach(function () {
    const t = this.currentTest;
    if (!t || !['passed', 'failed'].includes(String(t.state)) || !janela) return;
    consumirPlaca();
    cy.wrap(null, { log: false }).then(() => {
      api()?.resultado(t.state === 'passed', t.title, t.err?.message ?? '');
    });
    cy.wait(PAUSA * 1.5, { log: false });
    capturar('resultado');
  });
}

export {};
