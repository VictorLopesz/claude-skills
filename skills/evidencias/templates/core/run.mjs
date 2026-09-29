#!/usr/bin/env node
/**
 * Grava a evidência de um CT (caso de teste) em vídeo e/ou prints, com qualquer ferramenta
 * que tenha um runner em ./runners/<ferramenta>.mjs.
 *
 * Uso:
 *   node evidencia/run.mjs --spec <arquivo> --ct "Suite > título do CT"
 *
 * Opções:
 *   --spec        arquivo da spec (obrigatório)
 *   --ct          título do CT: caminho "Suite > CT" ou só o título (obrigatório)
 *   --tipo        ambos | video | prints   (padrão: ambos)
 *   --ferramenta  cypress | playwright | ... (padrão: detectada pelos arquivos de config)
 *   --pasta       pasta raiz das evidências (padrão: evidencias)
 *   --pausa       ms que cada destaque fica na tela (padrão: 1200)
 *   --viewport    LxA (padrão: 1280x720)
 *   --browser     navegador (Cypress) ou projeto (Playwright); padrão da ferramenta
 *
 * Saída: <pasta>/<AAAA-MM-DD>/evidencia-<ct>-<HHhMM>.<mp4|webm> e evidencia-<ct>-<HHhMM>-NN-<etapa>.png
 *
 * Contrato de um runner (runners/<ferramenta>.mjs):
 *   export const nome: string
 *   export function detectar(dir): boolean
 *   export async function executar(opcoes): Promise<{
 *     testes: Array<{ titulo: string, estado: 'passed' | 'failed' | 'skipped', erro?: string }>,
 *     videos: string[],   // caminhos dos vídeos gerados
 *     prints: string[],   // prints das etapas (já nomeados com opcoes.nome)
 *     falhas: string[],   // prints automáticos de falha da ferramenta
 *   }>
 *   opcoes = { dir, spec, ct, nome, tipo, pausa, largura, altura, browser, tmp, env }
 *   env = variáveis EVIDENCIA_* que o adaptador dentro do teste lê.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

function lerArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[++i];
  }
  return out;
}

function sair(msg, codigo) {
  console.error(msg);
  process.exit(codigo);
}

const args = lerArgs(process.argv.slice(2));
if (!args.spec || !args.ct) {
  sair('Uso: node evidencia/run.mjs --spec <arquivo> --ct "<título do CT>" [--tipo ambos|video|prints]', 2);
}

const tipo = args.tipo ?? 'ambos';
if (!['ambos', 'video', 'prints'].includes(tipo)) sair(`--tipo inválido: ${tipo} (use ambos, video ou prints)`, 2);

const [largura, altura] = (args.viewport ?? '1280x720').split('x').map(Number);
if (!largura || !altura) sair(`--viewport inválido: ${args.viewport} (use LxA, ex.: 1280x720)`, 2);

// ---- Runner da ferramenta ----
const dirRunners = path.join(aqui, 'runners');
const runners = [];
for (const arquivo of fs.existsSync(dirRunners) ? fs.readdirSync(dirRunners) : []) {
  if (arquivo.endsWith('.mjs')) runners.push(await import(pathToFileURL(path.join(dirRunners, arquivo)).href));
}
const dir = process.cwd();
const runner = args.ferramenta
  ? runners.find((r) => r.nome === args.ferramenta)
  : runners.find((r) => r.detectar(dir));
if (!runner) {
  const disponiveis = runners.map((r) => r.nome).join(', ') || 'nenhum';
  sair(`✖ Nenhum runner ${args.ferramenta ? `"${args.ferramenta}"` : 'compatível com este projeto'}. Disponíveis: ${disponiveis}.`, 1);
}

// ---- Nomes e pastas ----
const pad = (n) => String(n).padStart(2, '0');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const agora = new Date();
const data = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
const hora = `${pad(agora.getHours())}h${pad(agora.getMinutes())}`;
const nome = `evidencia-${slug(args.ct.split(' > ').pop())}-${hora}`;

const raiz = path.resolve(args.pasta ?? 'evidencias');
const destino = path.join(raiz, data);
const tmp = path.join(raiz, '.tmp', `${nome}-${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });

const pausa = Number(args.pausa ?? 1200);
const env = {
  EVIDENCIA: 'true',
  EVIDENCIA_NOME: nome,
  EVIDENCIA_CT: args.ct,
  EVIDENCIA_PAUSA: String(pausa),
  EVIDENCIA_PRINTS: String(tipo !== 'video'),
  EVIDENCIA_DIR_PRINTS: path.join(tmp, 'prints'),
};

function limparTmp() {
  fs.rmSync(tmp, { recursive: true, force: true });
  try { fs.rmdirSync(path.join(raiz, '.tmp')); } catch { /* ainda há outras gravações */ }
}

/** Evita sobrescrever uma evidência gravada no mesmo minuto. */
function mover(origem, arquivo) {
  const ext = path.extname(arquivo);
  const base = path.basename(arquivo, ext);
  let alvo = path.join(destino, arquivo);
  for (let i = 2; fs.existsSync(alvo); i++) alvo = path.join(destino, `${base}-${i}${ext}`);
  fs.renameSync(origem, alvo);
  return alvo;
}

/** Converte o vídeo para .mp4 quando houver ffmpeg (o QuickTime não abre .webm). */
function paraMp4(video) {
  if (path.extname(video) === '.mp4') return video;
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (ffmpeg.status !== 0) return video;
  const saida = video.replace(/\.[^.]+$/, '.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', saida]);
  return r.status === 0 ? saida : video;
}

console.log(`\n▶ Gravando evidência (${runner.nome}): ${args.ct}\n  spec: ${args.spec}\n  tipo: ${tipo}\n`);

let resultado;
try {
  resultado = await runner.executar({
    dir, spec: args.spec, ct: args.ct, nome, tipo, pausa, largura, altura, browser: args.browser, tmp, env,
  });
} catch (e) {
  limparTmp();
  sair(`\n✖ ${runner.nome} não conseguiu executar: ${e.message}`, 1);
}

const executados = resultado.testes.filter((t) => t.estado !== 'skipped');
if (executados.length === 0) {
  limparTmp();
  sair(`\n✖ Nenhum CT executado. Confira se "${args.ct}" existe em ${args.spec}.`, 1);
}

fs.mkdirSync(destino, { recursive: true });
const gerados = [];
for (const p of resultado.prints) gerados.push(mover(p, path.basename(p)));
for (const p of resultado.falhas) gerados.push(mover(p, `${nome}-99-falha${path.extname(p)}`));
for (const v of resultado.videos) {
  if (!fs.existsSync(v)) continue;
  const final = paraMp4(v);
  gerados.push(mover(final, `${nome}${path.extname(final)}`));
}
limparTmp();

const passou = executados.every((t) => t.estado === 'passed');
console.log(`\n${passou ? '✔ CT PASSOU' : '✖ CT FALHOU'} — ${executados.map((t) => t.titulo).join(', ')}`);
for (const t of executados) if (t.erro) console.log(`  erro: ${t.erro.split('\n')[0]}`);
console.log(`\nEvidências salvas em ${destino}:`);
gerados.sort().forEach((g) => console.log(`  • ${path.basename(g)}`));
process.exit(passou ? 0 : 3);
