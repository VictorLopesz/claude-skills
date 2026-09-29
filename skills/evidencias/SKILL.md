---
name: evidencias
description: Grava evidências (vídeo e/ou prints) de casos de teste (CTs) automatizados — Cypress, Playwright ou qualquer ferramenta com adaptador — com overlays injetados na própria página da aplicação: placa de apresentação do caso, terminal que narra cada chamada REST, destaques nos elementos e callouts explicativos. Use quando o usuário pedir para gravar, gerar ou tirar evidência de um CT, cenário ou teste, ou invocar /evidencias.
---

# Gravar evidências de CTs

A evidência **não** é uma gravação de tela com narração. Os overlays são injetados na página viva ao longo da execução, então a evidência e a aplicação são a mesma superfície:

- **Placa**: apresenta o caso (suite, título do CT, data/hora, spec, ambiente, navegador) na primeira página do teste.
- **Terminal REST**: canto inferior direito; cada chamada `fetch`/XHR aparece no momento em que dispara e é atualizada com status e duração. Sobrevive a navegações na mesma origem.
- **Caixas + callouts**: antes de cada clique, digitação, marcação ou seleção, o elemento real é destacado e um callout numerado explica a ação (senhas são mascaradas).
- **Resultado**: faixa final "✔ PASSOU" / "✖ FALHOU" com a mensagem de erro.

Cada etapa gera um print; o vídeo cobre a execução inteira.

## Arquitetura: núcleo + adaptadores

```
templates/
├── core/                       # igual para qualquer ferramenta
│   ├── core.js                 # overlays; roda dentro da página (window.__evidencia)
│   ├── core.d.ts               # tipos da API
│   └── run.mjs                 # CLI: nomes, pastas, organiza os arquivos, delega ao runner
└── adapters/
    ├── cypress/
    │   ├── cypress.ts          # dentro do teste: injeta o núcleo e intercepta os comandos
    │   └── runner.mjs          # fora do teste: executa o CT e devolve os artefatos
    └── playwright/
        ├── playwright.ts
        └── runner.mjs
```

No projeto, tudo é instalado numa pasta `evidencia/` na raiz:

```
evidencia/
├── core.js  core.d.ts  run.mjs
├── <ferramenta>.ts             # de adapters/<ferramenta>/<ferramenta>.ts
└── runners/<ferramenta>.mjs    # de adapters/<ferramenta>/runner.mjs
```

Caminho base dos templates: `~/.claude/skills/evidencias/templates`.

## 1. Localizar o projeto e a ferramenta

1. Use o diretório atual, ou o que o usuário indicar.
2. Identifique a ferramenta pelo arquivo de configuração:

| Ferramenta | Arquivo | Adaptador |
|---|---|---|
| Cypress | `cypress.config.{ts,js,mjs,cjs}` | `adapters/cypress` |
| Playwright | `playwright.config.{ts,js,mts,mjs,cjs}` | `adapters/playwright` |

3. Se a ferramenta não tiver adaptador em `templates/adapters/`, diga ao usuário e ofereça criar um (seção **Adicionar outra ferramenta**).
4. Confirme as dependências instaladas (`node_modules/cypress` ou `node_modules/@playwright/test`); se faltarem, rode `npm install` com a confirmação do usuário.

## 2. Instalar o modo evidência (apenas na primeira vez)

Se `evidencia/` não existir, copie `core/*` e os arquivos do adaptador para a estrutura acima. Se existir e os arquivos forem diferentes dos templates, mostre a diferença e **pergunte** antes de atualizar. Depois, ligue o adaptador ao projeto:

**Cypress:** no arquivo de suporte (`cypress/support/e2e.ts` ou `e2e.js`), acrescente:
```ts
import '../../evidencia/cypress';
```

**Playwright:** o adaptador é uma fixture automática. No arquivo de fixtures do projeto (padrão `/playwright-setup`: `fixtures/index.ts`), envolva o `test`:
```ts
import { comEvidencia } from '../evidencia/playwright';
export const test = comEvidencia(base.extend<Fixtures>({ /* ... */ }));
```
Se as specs importam `test` direto de `@playwright/test`, não existe um ponto único para ligar o adaptador: explique e pergunte se pode criar `fixtures/index.ts` e trocar o import nas specs.

Em ambos:
- Projeto em JavaScript sem `typescript` instalado: pergunte se pode instalar `typescript` como devDependency (o adaptador é `.ts`).
- Acrescente ao `.gitignore`: `evidencias/.tmp/` e `.evidencia-*.config.ts`. Pergunte se o usuário quer ignorar a pasta `evidencias/` inteira (vídeos são pesados).
- Valide a tipagem: `npx tsc --noEmit -p cypress` (Cypress) ou `npx tsc --noEmit` (Playwright), quando houver tsconfig.

Fora do modo evidência o adaptador não altera nenhum teste (no Playwright, `comEvidencia()` devolve o mesmo `test`).

## 3. Ler os CTs

1. Liste os CTs:
   - **Playwright**: `npx playwright test --list` (confiável; mostra `arquivo › Suite › CT`).
   - **Cypress**: leia as specs do `specPattern` (padrão `cypress/e2e/**/*.cy.{ts,js}`) e extraia a árvore de `describe`/`context`/`it`.
   - Outras: use o comando de listagem da ferramenta, se houver; senão leia as specs.
2. Ignore CTs pulados (`it.skip`, `test.skip`, `xit`) e avise se houver `.only`.
3. Monte o título de cada CT como `Suite > Subsuite > título` (formato de `--ct`).
4. Se o usuário já disse qual CT gravar, encontre o correspondente (aceite nomes aproximados; confirme se houver ambiguidade). Se não, apresente a lista numerada por spec e pergunte quais gravar (um, vários ou todos).
5. Pergunte o tipo se o usuário não disse: **vídeo e prints** (padrão), só vídeo ou só prints.

## 4. Preparar a execução

1. Descubra a URL base (`baseUrl` no Cypress; `use.baseURL` ou `BASE_URL` no `.env` no Playwright) e teste se responde (`curl -s -o /dev/null -w "%{http_code}" <url>`). Se não responder, avise e pergunte se o usuário vai subir a aplicação. Não suba servidores do projeto sem pedir.
2. Se os CTs dependem de credenciais (`cypress.env.json`, `.env`), confira se o arquivo existe; nunca exiba o conteúdo.

## 5. Gravar

Para cada CT escolhido, **um por vez** (cada execução gera um vídeo próprio):

```bash
node evidencia/run.mjs --spec <arquivo da spec> --ct "<Suite > título do CT>" --tipo ambos
```

Opções: `--tipo ambos|video|prints`, `--ferramenta <nome>` (quando o projeto tiver mais de uma), `--pasta evidencias`, `--pausa 1200` (ms de cada destaque), `--viewport 1280x720`, `--browser <navegador do Cypress | projeto do Playwright>`.

Use `timeout` alto no Bash (de 20 s a alguns minutos). Códigos de saída: `0` passou; `3` falhou (a evidência da falha é salva mesmo assim); `1` erro de execução ou CT não encontrado; `2` argumentos inválidos.

## 6. Saída e nomes

```
evidencias/
└── AAAA-MM-DD/
    ├── evidencia-<ct>-<HHhMM>.mp4 | .webm
    ├── evidencia-<ct>-<HHhMM>-01-placa.png
    ├── evidencia-<ct>-<HHhMM>-02-<ação>.png
    ├── ...
    ├── evidencia-<ct>-<HHhMM>-NN-resultado.png
    └── evidencia-<ct>-<HHhMM>-99-falha.png      (só se o CT falhar)
```

- `<ct>` é o título do CT sem acentos, em minúsculas e com hífens. Ex.: `evidencia-login-com-sucesso-10h33.mp4`.
- A hora usa `10h33`, não `10:33`: dois-pontos em nome de arquivo aparece como `/` no Finder e é inválido no Windows, no Jira, em anexos e no Git.
- Uma nova gravação no mesmo minuto recebe o sufixo `-2`, `-3`...
- Vídeo: o Cypress gera `.mp4`; o Playwright gera `.webm`. Se houver `ffmpeg` no PATH, o `.webm` é convertido para `.mp4` automaticamente. Sem ele, avise que o QuickTime não abre `.webm` (Chrome, VLC e IINA abrem).

## 7. Verificar e entregar

1. Confira a lista de arquivos gerados pelo script.
2. Abra com Read a placa e o print de resultado de pelo menos um CT, para confirmar que os overlays apareceram e que nada está cortado.
3. Abra a pasta do dia no Finder: `open evidencias/<AAAA-MM-DD>`.
4. Informe, por CT: passou ou falhou (com a mensagem de erro), quantidade de prints, formato do vídeo e o caminho da pasta.

## Destaques extras nos testes (opcional)

Ações já recebem destaque automático. Para evidenciar um **resultado** (mensagem, valor na tela), a spec pode destacar o elemento a partir do Page Object:

```ts
// Cypress
loginPage.errorMessage().should('be.visible').destacar('Mensagem de erro exibida ao usuário');

// Playwright
import { destacar } from '../evidencia/playwright';
await expect(loginPage.errorMessage).toBeVisible();
await destacar(loginPage.errorMessage, 'Mensagem de erro exibida ao usuário');
```

Sugira isso quando o CT terminar em uma validação importante; não altere specs sem pedir.

## Adicionar outra ferramenta

Para suportar uma nova ferramenta (WebdriverIO, Puppeteer, TestCafe...), crie `templates/adapters/<ferramenta>/` com dois arquivos. O núcleo e o `run.mjs` não mudam.

**1. `<ferramenta>.ts` (roda junto com os testes)** precisa:
- Ativar-se só quando `EVIDENCIA=true` (lido do ambiente ou do mecanismo de config da ferramenta), sem alterar os testes fora desse modo.
- Instalar o núcleo em **toda página antes dos scripts da aplicação**: chamar `instalarEvidencia(janela)` (quando o código do teste acessa a janela, como no Cypress) ou injetar a função serializada (`instalarEvidencia.toString()`, como no `addInitScript` do Playwright).
- Pular os CTs cujo título não bata com `EVIDENCIA_CT` (caminho `Suite > CT` ou só o título).
- Na primeira ação do CT: `placa(dados)` → pausa de `EVIDENCIA_PAUSA × 2` → print `placa` → `removerPlaca()`.
- Antes de cada ação do usuário: `destacar(el, rotulo(el, acao, valor), n)` → pausa → print → `limparDestaques()`; ignorar chamadas internas da própria ferramenta; nunca deixar um erro de overlay quebrar o teste.
- No fim do CT: `resultado(passou, titulo, mensagem)` → pausa → print `resultado`.
- Prints em viewport, nomeados `${EVIDENCIA_NOME}-NN-<etapa>.png`, gravados em `EVIDENCIA_DIR_PRINTS` (ou na pasta da ferramenta, desde que o runner os devolva); só quando `EVIDENCIA_PRINTS` não for `false`.

**2. `runner.mjs` (roda fora dos testes)** exporta o contrato descrito no topo de `core/run.mjs`:
- `nome`, `detectar(dir)` e `executar(opcoes)`.
- `executar` roda só o CT pedido, com 1 worker, sem retries, vídeo ligado conforme `opcoes.tipo`, viewport `opcoes.largura × opcoes.altura`, artefatos em `opcoes.tmp`, e repassa `opcoes.env` aos testes.
- Devolve `{ testes, videos, prints, falhas }`.

Depois, acrescente a ferramenta às tabelas das seções 1 e 2, grave um CT passando e um falhando numa aplicação de teste e confira os prints antes de dar como pronto.

## Limitações conhecidas

- O terminal mostra só `fetch` e XHR feitos pela página (não mostra `cy.request()`, `request` do Playwright, WebSocket nem recursos estáticos). Chamadas interrompidas por troca de página aparecem como "cancelada (troca de página)".
- Páginas de outra origem (`cy.origin`, redirecionamento para SSO) e conteúdo dentro de iframes podem não receber overlays; o terminal recomeça numa origem nova.
- Playwright: só ações via **Locator** recebem destaque automático (`page.getByRole(...).click()`); os métodos antigos `page.click(seletor)`/`page.fill(seletor)` não.
- Cypress: o Electron está obsoleto no Cypress 16; se houver Chrome, prefira `--browser chrome`.
- As pausas de exibição existem só no modo evidência; a execução normal dos testes não fica mais lenta.
