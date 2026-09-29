/**
 * Runner Playwright das evidências: executa um CT com a CLI do Playwright e devolve os
 * artefatos no formato esperado por evidencia/run.mjs.
 *
 * Gera um config temporário na raiz do projeto que herda o config do usuário e só troca
 * o necessário para a gravação (vídeo, viewport, 1 worker, sem retries, relatório JSON).
 * Ele fica na raiz porque caminhos relativos do config (testDir etc.) são resolvidos a
 * partir da pasta do arquivo de config. O arquivo é apagado ao final.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const nome = 'playwright';

const CONFIGS = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts', 'playwright.config.mjs', 'playwright.config.cjs'];

export function detectar(dir) {
  return CONFIGS.some((c) => fs.existsSync(path.join(dir, c)));
}

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function coletar(suite, titulos, saida) {
  const aqui = suite.title && !/\.(spec|test)\.[cm]?[jt]sx?$/.test(suite.title) ? [...titulos, suite.title] : titulos;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const r = t.results?.[t.results.length - 1];
      const estado = !r || r.status === 'skipped' ? 'skipped'
        : r.status === t.expectedStatus ? 'passed' : 'failed';
      saida.push({
        titulo: [...aqui, spec.title].join(' > '),
        estado,
        erro: r?.error?.message?.replace(/\u001b\[[0-9;]*m/g, ''),
        anexos: r?.attachments ?? [],
      });
    }
  }
  for (const s of suite.suites ?? []) coletar(s, aqui, saida);
  return saida;
}

export async function executar(o) {
  const base = CONFIGS.find((c) => fs.existsSync(path.join(o.dir, c)));
  const importar = /\.(ts|js)$/.test(base) ? `./${base.replace(/\.(ts|js)$/, '')}` : `./${base}`;
  const relatorio = path.join(o.tmp, 'resultado.json');
  const video = o.tipo !== 'prints'
    ? `{ mode: 'on', size: { width: ${o.largura}, height: ${o.altura} } }`
    : `'off'`;
  const uso = `viewport: { width: ${o.largura}, height: ${o.altura} }, video: ${video}, screenshot: 'only-on-failure', trace: 'off'`;

  const wrapper = path.join(o.dir, `.evidencia-${process.pid}.config.ts`);
  fs.writeFileSync(wrapper, `// Gerado por evidencia/run.mjs — temporário, pode apagar.
import base from '${importar}';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: ${JSON.stringify(relatorio)} }]],
  outputDir: ${JSON.stringify(path.join(o.tmp, 'resultados'))},
  use: { ...base.use, ${uso} },
  projects: base.projects?.map((p) => ({ ...p, use: { ...p.use, ${uso} } })),
});
`);

  try {
    const args = ['playwright', 'test', o.spec, '--config', wrapper, '--grep', escaparRegex(o.ct.split(' > ').pop())];
    // Um projeto só (o primeiro do config, ou o informado em --browser), para gerar um vídeo por CT.
    const projetos = spawnSync('npx', ['playwright', 'test', '--config', wrapper, '--list', '--reporter', 'json'], {
      cwd: o.dir, env: { ...process.env, ...o.env, EVIDENCIA: 'false' }, encoding: 'utf8',
    });
    let projeto = o.browser;
    if (!projeto) {
      try { projeto = JSON.parse(projetos.stdout).config.projects?.[0]?.name; } catch { /* sem projetos */ }
    }
    if (projeto) args.push('--project', projeto);

    const r = spawnSync('npx', args, { cwd: o.dir, env: { ...process.env, ...o.env }, stdio: 'inherit' });
    if (!fs.existsSync(relatorio)) throw new Error(`Playwright terminou com código ${r.status} sem gerar relatório`);

    const json = JSON.parse(fs.readFileSync(relatorio, 'utf8'));
    const testes = (json.suites ?? []).flatMap((s) => coletar(s, [], []));
    const executados = testes.filter((t) => t.estado !== 'skipped');
    const anexos = executados.flatMap((t) => t.anexos).filter((a) => a.path && fs.existsSync(a.path));

    const dirPrints = o.env.EVIDENCIA_DIR_PRINTS;
    return {
      testes: testes.map(({ anexos: _, ...t }) => t),
      videos: anexos.filter((a) => a.name === 'video').map((a) => a.path),
      prints: fs.existsSync(dirPrints) ? fs.readdirSync(dirPrints).map((f) => path.join(dirPrints, f)) : [],
      falhas: anexos.filter((a) => a.name === 'screenshot').map((a) => a.path),
    };
  } finally {
    fs.rmSync(wrapper, { force: true });
  }
}
