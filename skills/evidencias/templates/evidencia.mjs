#!/usr/bin/env node
/**
 * Grava a evidência de um CT (caso de teste) Cypress em vídeo e/ou prints.
 *
 * Uso:
 *   node scripts/evidencia.mjs --spec cypress/e2e/login.cy.ts --ct "Login > deve fazer login com sucesso"
 *
 * Opções:
 *   --spec   arquivo da spec (obrigatório)
 *   --ct     título do CT: caminho completo "Suite > CT" ou apenas o título do it() (obrigatório)
 *   --tipo   ambos | video | prints   (padrão: ambos)
 *   --pasta  pasta raiz das evidências (padrão: evidencias)
 *   --pausa  ms que cada destaque fica na tela (padrão: 1200)
 *   --browser navegador do Cypress (padrão: electron)
 *   --viewport tamanho da tela gravada, LxA (padrão: 1280x720, o tamanho da janela headless)
 *
 * Saída: <pasta>/<AAAA-MM-DD>/evidencia-<ct>-<HHhMM>.mp4 e evidencia-<ct>-<HHhMM>-NN-<etapa>.png
 */
import cypress from 'cypress';
import fs from 'node:fs';
import path from 'node:path';

function lerArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[++i];
  }
  return out;
}

const args = lerArgs(process.argv.slice(2));
if (!args.spec || !args.ct) {
  console.error('Uso: node scripts/evidencia.mjs --spec <arquivo.cy.ts> --ct "<título do CT>" [--tipo ambos|video|prints]');
  process.exit(2);
}

const tipo = args.tipo ?? 'ambos';
if (!['ambos', 'video', 'prints'].includes(tipo)) {
  console.error(`--tipo inválido: ${tipo} (use ambos, video ou prints)`);
  process.exit(2);
}

const [largura, altura] = (args.viewport ?? '1280x720').split('x').map(Number);
if (!largura || !altura) {
  console.error(`--viewport inválido: ${args.viewport} (use LxA, ex.: 1280x720)`);
  process.exit(2);
}

const pad = (n) => String(n).padStart(2, '0');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const agora = new Date();
const data = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
const hora = `${pad(agora.getHours())}h${pad(agora.getMinutes())}`;
const tituloCt = args.ct.split(' > ').pop();
const nome = `evidencia-${slug(tituloCt)}-${hora}`;

const raiz = path.resolve(args.pasta ?? 'evidencias');
const destino = path.join(raiz, data);
const tmp = path.join(raiz, '.tmp', `${nome}-${process.pid}`);

/** Evita sobrescrever uma evidência gravada no mesmo minuto. */
function caminhoLivre(dir, arquivo) {
  const ext = path.extname(arquivo);
  const base = path.basename(arquivo, ext);
  let alvo = path.join(dir, arquivo);
  for (let i = 2; fs.existsSync(alvo); i++) alvo = path.join(dir, `${base}-${i}${ext}`);
  return alvo;
}

function mover(origem, dir, arquivo) {
  const alvo = caminhoLivre(dir, arquivo);
  fs.renameSync(origem, alvo);
  return alvo;
}

const expose = {
  EVIDENCIA: 'true',
  EVIDENCIA_NOME: nome,
  EVIDENCIA_CT: args.ct,
  EVIDENCIA_PAUSA: args.pausa ?? '1200',
  EVIDENCIA_PRINTS: String(tipo !== 'video'),
};

console.log(`\n▶ Gravando evidência: ${args.ct}\n  spec: ${args.spec}\n  tipo: ${tipo}\n`);

const resultado = await cypress.run({
  spec: args.spec,
  browser: args.browser ?? 'electron',
  expose,
  // Dentro de e2e: o bloco e2e do cypress.config.ts tem prioridade sobre opções no nível raiz.
  config: {
    e2e: {
      video: tipo !== 'prints',
      // Viewport maior que a janela headless gera prints cortados e barra de rolagem.
      viewportWidth: largura,
      viewportHeight: altura,
      videosFolder: path.join(tmp, 'videos'),
      screenshotsFolder: path.join(tmp, 'screenshots'),
      trashAssetsBeforeRuns: true,
      screenshotOnRunFailure: true,
      retries: 0, // novas tentativas duplicariam prints e vídeo
    },
  },
});

if (resultado.status === 'failed') {
  console.error(`\n✖ O Cypress não conseguiu executar: ${resultado.message}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const run = resultado.runs?.[0];
const testes = (run?.tests ?? []).filter((t) => t.state !== 'pending');
if (!run || testes.length === 0) {
  console.error(`\n✖ Nenhum CT executado. Confira se "${args.ct}" existe em ${args.spec}.`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

fs.mkdirSync(destino, { recursive: true });
const gerados = [];

for (const shot of run.screenshots ?? []) {
  const arquivo = path.basename(shot.path);
  // Print automático de falha do Cypress recebe o padrão de nome da evidência.
  const final = arquivo.startsWith(nome) ? arquivo : `${nome}-99-falha.png`;
  gerados.push(mover(shot.path, destino, final));
}

if (run.video && fs.existsSync(run.video)) {
  gerados.push(mover(run.video, destino, `${nome}${path.extname(run.video)}`));
}

fs.rmSync(tmp, { recursive: true, force: true });
try { fs.rmdirSync(path.join(raiz, '.tmp')); } catch { /* ainda há outras gravações */ }

const passou = testes.every((t) => t.state === 'passed');
console.log(`\n${passou ? '✔ CT PASSOU' : '✖ CT FALHOU'} — ${testes.map((t) => t.title.join(' > ')).join(', ')}`);
console.log(`\nEvidências salvas em ${destino}:`);
gerados.sort().forEach((g) => console.log(`  • ${path.basename(g)}`));
process.exit(passou ? 0 : 3);
