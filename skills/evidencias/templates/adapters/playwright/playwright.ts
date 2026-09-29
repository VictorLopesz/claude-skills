/**
 * Adaptador Playwright das evidências: liga o núcleo visual (core.js) às ações dos Locators.
 *
 * Uso (em fixtures/index.ts):
 *   export const test = comEvidencia(base.extend<Fixtures>({ ... }));
 *
 * Só é ativado quando EVIDENCIA=true (ver evidencia/run.mjs). Fora desse modo,
 * comEvidencia() devolve o mesmo `test` e destacar() não faz nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, TestInfo, TestType } from '@playwright/test';
import { instalarEvidencia } from './core.js';

const ATIVO = process.env.EVIDENCIA === 'true';
const NOME = process.env.EVIDENCIA_NOME ?? 'evidencia';
const CT = process.env.EVIDENCIA_CT ?? '';
const PAUSA = Number(process.env.EVIDENCIA_PAUSA ?? 1200);
const PRINTS = process.env.EVIDENCIA_PRINTS !== 'false';
const DIR_PRINTS = process.env.EVIDENCIA_DIR_PRINTS ?? path.resolve('evidencias/.tmp/prints');

type Contexto = { page: Page; info: TestInfo; passo: number; prints: number; placaPendente: boolean };
let atual: Contexto | null = null;
let instrumentado = false;

const pad = (n: number) => String(n).padStart(2, '0');
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const semAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

async function capturar(ctx: Contexto, etapa: string) {
  if (!PRINTS) return;
  ctx.prints += 1;
  fs.mkdirSync(DIR_PRINTS, { recursive: true });
  await ctx.page.screenshot({ path: path.join(DIR_PRINTS, `${NOME}-${pad(ctx.prints)}-${slug(etapa)}.png`) });
}

function dadosPlaca(ctx: Contexto) {
  const d = new Date();
  const browser = ctx.page.context().browser();
  let origem = '';
  try { origem = new URL(ctx.page.url()).origin; } catch { /* página sem URL http */ }
  return {
    suite: ctx.info.titlePath.slice(1, -1).join(' › '),
    ct: ctx.info.title,
    meta: [
      ['Data', `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`],
      ['Arquivo', path.relative(process.cwd(), ctx.info.file)],
      ['Ambiente', origem],
      ['Navegador', `${browser?.browserType().name() ?? ctx.info.project.name} ${browser?.version() ?? ''} · Playwright ${ctx.info.config.version}`],
    ] as Array<[string, string]>,
  };
}

/** Na primeira etapa do teste: mostra a placa, captura o print e a remove. */
async function garantirPlaca(ctx: Contexto) {
  if (!ctx.placaPendente || !/^https?:/.test(ctx.page.url())) return;
  ctx.placaPendente = false;
  const ok = await ctx.page.evaluate((d) => window.__evidencia?.placa(d) ?? false, dadosPlaca(ctx));
  if (!ok) return;
  await ctx.page.waitForTimeout(PAUSA * 2); // pausa de exibição: existe só no modo evidência
  await capturar(ctx, 'placa');
  await ctx.page.evaluate(() => window.__evidencia?.removerPlaca());
}

/** Destaque + callout → pausa → print → remove destaque. Nunca quebra o teste. */
async function etapa(ctx: Contexto, loc: Locator, acao: string, valor: string, texto: string | null, nomePrint: string) {
  try {
    await garantirPlaca(ctx);
    const numero = ctx.passo + 1;
    const ok = await loc.evaluate((el, [a, v, t, n]) => {
      const ev = window.__evidencia;
      if (!ev) return false;
      return ev.destacar(el, t ?? ev.rotulo(el, a as string, v as string), n as number);
    }, [acao, valor, texto, numero] as const, { timeout: 5000 });
    if (!ok) return;
    ctx.passo = numero;
    await ctx.page.waitForTimeout(PAUSA); // pausa de exibição: existe só no modo evidência
    await capturar(ctx, nomePrint);
    await ctx.page.evaluate(() => window.__evidencia?.limparDestaques());
  } catch {
    // Elemento ainda não disponível ou página trocando: segue sem overlay; a ação real reporta o erro.
  }
}

function valorDe(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(valorDe).join(', ');
  if (typeof v === 'object') return String((v as { label?: string; value?: string }).label ?? (v as { value?: string }).value ?? JSON.stringify(v));
  return String(v);
}

/** Intercepta as ações dos Locators (uma vez por worker). */
function instrumentar(page: Page) {
  if (instrumentado) return;
  instrumentado = true;
  const proto = Object.getPrototypeOf(page.locator('body')) as Record<string, (...a: unknown[]) => Promise<unknown>>;
  // Método do Locator → ação do núcleo (define o texto do callout).
  const acoes: Record<string, string> = {
    click: 'click', dblclick: 'dblclick', check: 'check', uncheck: 'uncheck',
    fill: 'type', pressSequentially: 'type', selectOption: 'select',
  };
  for (const [metodo, acao] of Object.entries(acoes)) {
    const original = proto[metodo];
    if (typeof original !== 'function') continue;
    proto[metodo] = async function (this: Locator, ...args: unknown[]) {
      if (atual) await etapa(atual, this, acao, valorDe(args[0]), null, metodo);
      return original.apply(this, args);
    };
  }
}

/** No modo evidência, destaca o elemento com um callout e captura um print. */
export async function destacar(loc: Locator, texto: string) {
  if (atual) await etapa(atual, loc, '', '', texto, texto);
}

/** Acrescenta a gravação de evidências ao `test` do projeto (fixture automática). */
export function comEvidencia<T extends TestType<any, any>>(test: T): T {
  if (!ATIVO) return test;
  return test.extend<{ _evidencia: void }>({
    _evidencia: [async ({ page }: { page: Page }, use: () => Promise<void>, info: TestInfo) => {
      // titlePath: [arquivo, ...describes, título]
      const caminho = info.titlePath.slice(1).join(' > ');
      info.skip(Boolean(CT) && CT !== caminho && CT !== info.title, 'fora do CT da evidência');

      // Serializada e executada em cada página/frame antes dos scripts da aplicação (janela = window).
      await page.addInitScript(instalarEvidencia as unknown as () => void);
      instrumentar(page);
      const ctx: Contexto = { page, info, passo: 0, prints: 0, placaPendente: true };
      atual = ctx;
      try {
        await use();
      } finally {
        atual = null;
      }

      if (page.isClosed()) return;
      try {
        await garantirPlaca(ctx);
        const passou = info.status === info.expectedStatus;
        const ok = await page.evaluate(([p, t, m]: readonly [boolean, string, string]) => window.__evidencia?.resultado(p, t, m) ?? false,
          [passou, info.title, semAnsi(info.error?.message ?? '')] as const);
        if (ok) {
          await page.waitForTimeout(PAUSA * 1.5);
          await capturar(ctx, 'resultado');
        }
      } catch {
        // Página fechada ou em navegação no fim do teste: evidência fica sem o print de resultado.
      }
    }, { auto: true }],
  }) as unknown as T;
}
