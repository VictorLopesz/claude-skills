/**
 * Runner Cypress das evidências: executa um CT com a Module API e devolve os artefatos
 * no formato esperado por evidencia/run.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

export const nome = 'cypress';

export function detectar(dir) {
  return ['ts', 'js', 'mjs', 'cjs'].some((ext) => fs.existsSync(path.join(dir, `cypress.config.${ext}`)));
}

export async function executar(o) {
  const { default: cypress } = await import('cypress');
  const resultado = await cypress.run({
    spec: o.spec,
    browser: o.browser ?? 'electron',
    expose: o.env,
    // Dentro de e2e: o bloco e2e do cypress.config.* tem prioridade sobre opções no nível raiz.
    config: {
      e2e: {
        video: o.tipo !== 'prints',
        videosFolder: path.join(o.tmp, 'videos'),
        screenshotsFolder: path.join(o.tmp, 'screenshots'),
        trashAssetsBeforeRuns: true,
        screenshotOnRunFailure: true,
        retries: 0, // novas tentativas duplicariam prints e vídeo
        // Viewport maior que a janela headless gera prints cortados e barra de rolagem.
        viewportWidth: o.largura,
        viewportHeight: o.altura,
      },
    },
  });

  if (resultado.status === 'failed') throw new Error(resultado.message);

  const run = resultado.runs?.[0];
  const estado = { passed: 'passed', failed: 'failed' };
  const testes = (run?.tests ?? []).map((t) => ({
    titulo: t.title.join(' > '),
    estado: estado[t.state] ?? 'skipped',
    erro: t.displayError ?? undefined,
  }));

  const shots = (run?.screenshots ?? []).map((s) => s.path);
  return {
    testes,
    videos: run?.video ? [run.video] : [],
    prints: shots.filter((p) => path.basename(p).startsWith(o.nome)),
    falhas: shots.filter((p) => !path.basename(p).startsWith(o.nome)),
  };
}
