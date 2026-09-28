---
name: evidencias
description: Grava evidências (vídeo e/ou prints) de casos de teste (CTs) Cypress, com overlays injetados na própria página da aplicação — placa de apresentação do caso, terminal que narra cada chamada REST, destaques nos elementos e callouts explicativos. Use quando o usuário pedir para gravar, gerar ou tirar evidência de um CT, cenário ou teste Cypress, ou invocar /evidencias.
---

# Gravar evidências de CTs Cypress

A evidência **não** é uma gravação de tela com narração. Os overlays são injetados na página viva ao longo da execução, então a evidência e a aplicação são a mesma superfície:

- **Placa**: apresenta o caso (suite, título do CT, data/hora, spec, ambiente, navegador) na primeira página do teste.
- **Terminal REST**: canto inferior direito; cada chamada `fetch`/XHR aparece no momento em que dispara e é atualizada com status e duração.
- **Caixas + callouts**: antes de cada `click`, `dblclick`, `type`, `check`, `uncheck` e `select`, o elemento real é destacado e um callout numerado explica a ação (senhas são mascaradas).
- **Resultado**: faixa final "✔ PASSOU" / "✖ FALHOU" com a mensagem de erro.

Cada etapa gera um print; o vídeo cobre a execução inteira.

## Arquivos desta skill

- `templates/evidencia.ts` → vai para `cypress/support/evidencia.ts` (overlays; inativo fora do modo evidência).
- `templates/evidencia.mjs` → vai para `scripts/evidencia.mjs` (executa o CT e organiza os arquivos).

Caminho base: o diretório desta skill (`~/.claude/skills/evidencias`).

## 1. Localizar o projeto

1. Use o diretório atual, ou o que o usuário indicar. Ele precisa ter `cypress.config.ts` (ou `.js`/`.mjs`/`.cjs`); se não tiver, pergunte qual é o projeto.
2. Confirme `node_modules/cypress` instalado; se não, rode `npm install` (com a confirmação do usuário).

## 2. Instalar o modo evidência (apenas na primeira vez)

1. Se `cypress/support/evidencia.ts` e `scripts/evidencia.mjs` não existirem, copie os templates. Se existirem e forem diferentes do template, mostre a diferença e **pergunte** antes de atualizar.
2. No arquivo de suporte (`cypress/support/e2e.ts` ou `e2e.js`), acrescente `import './evidencia';` se ainda não houver.
3. Projeto em JavaScript sem `typescript` instalado: o arquivo `.ts` precisa do TypeScript para ser compilado pelo Cypress. Pergunte se pode instalar `typescript` como devDependency.
4. Acrescente `evidencias/.tmp/` ao `.gitignore`. Pergunte se o usuário quer ignorar a pasta `evidencias/` inteira (vídeos são pesados).
5. Rode `npx tsc --noEmit -p cypress` quando houver `cypress/tsconfig.json` para validar a tipagem.

Fora do modo evidência o arquivo não altera nenhum teste; ele só registra `cy.destacar()`, que nesse caso não faz nada.

## 3. Ler os CTs

1. Descubra as specs pelo `specPattern` do config (padrão: `cypress/e2e/**/*.cy.{ts,js}`).
2. Leia cada spec e extraia a árvore de `describe`/`context` e `it`, incluindo aninhamentos. Ignore `it.skip`/`xit` e avise se houver `.only`, pois ele impede a execução dos demais CTs.
3. Monte o título de cada CT como `Suite > Subsuite > título do it` (é o formato que o script aceita em `--ct`).
4. Se o usuário já disse qual CT gravar, encontre o correspondente (aceite nomes aproximados e confirme se houver ambiguidade). Se não, apresente a lista numerada por spec e pergunte quais gravar (um, vários ou todos).
5. Pergunte o tipo de evidência se o usuário não disse: **vídeo e prints** (padrão), só vídeo ou só prints.

## 4. Preparar a execução

1. Leia o `baseUrl` do config e teste se a aplicação responde (`curl -s -o /dev/null -w "%{http_code}" <baseUrl>`). Se não responder, avise o usuário e pergunte se ele vai subir a aplicação ou se deve usar outra URL. Não suba servidores do projeto sem pedir.
2. Se os CTs dependem de credenciais (`cy.env(...)`, `cypress.env.json`), confira se o arquivo existe; nunca exiba o conteúdo dele.

## 5. Gravar

Para cada CT escolhido, **um por vez** (cada execução gera um vídeo próprio):

```bash
node scripts/evidencia.mjs --spec <arquivo da spec> --ct "<Suite > título do CT>" --tipo ambos
```

Opções: `--tipo ambos|video|prints`, `--pasta evidencias`, `--pausa 1200` (ms que cada destaque fica na tela), `--browser electron|chrome|...`, `--viewport 1280x720`.

Use `timeout` alto no Bash (a gravação leva de 20 s a alguns minutos). Códigos de saída: `0` CT passou; `3` CT falhou (a evidência da falha é salva mesmo assim); `1` erro de execução ou CT não encontrado; `2` argumentos inválidos.

## 6. Saída e nomes

```
evidencias/
└── AAAA-MM-DD/
    ├── evidencia-<ct>-<HHhMM>.mp4
    ├── evidencia-<ct>-<HHhMM>-01-placa.png
    ├── evidencia-<ct>-<HHhMM>-02-type.png
    ├── ...
    ├── evidencia-<ct>-<HHhMM>-NN-resultado.png
    └── evidencia-<ct>-<HHhMM>-99-falha.png      (só se o CT falhar)
```

- `<ct>` é o título do `it()` sem acentos, em minúsculas e com hífens. Ex.: `evidencia-login-com-sucesso-10h33.mp4`.
- A hora usa `10h33`, e não `10:33`: dois-pontos em nome de arquivo aparece como `/` no Finder e é inválido no Windows, no Jira, em anexos e no Git.
- Uma nova gravação no mesmo minuto não sobrescreve a anterior; recebe o sufixo `-2`, `-3`...

## 7. Verificar e entregar

1. Confira a lista de arquivos gerados pelo script.
2. Abra com Read a placa e o print de resultado de pelo menos um CT, para confirmar que os overlays apareceram e que nada está cortado.
3. Abra a pasta do dia no Finder: `open evidencias/<AAAA-MM-DD>`.
4. Informe ao usuário, por CT: passou ou falhou (com a mensagem de erro, se falhou), a quantidade de prints, se há vídeo e o caminho da pasta.

## Destaques extras nos testes (opcional)

Ações já recebem destaque automático. Para evidenciar um **resultado** (uma mensagem, um valor na tela), a spec pode encadear `cy.destacar()` no elemento, a partir do Page Object:

```ts
loginPage.errorMessage().should('be.visible').destacar('Mensagem de erro exibida ao usuário');
```

Sugira isso ao usuário quando o CT terminar em uma validação importante; não altere specs sem pedir.

## Limitações conhecidas

- O terminal mostra apenas `fetch` e XHR feitos pela página (não mostra `cy.request()`, WebSocket nem recursos estáticos). Chamadas interrompidas por troca de página aparecem como "cancelada (troca de página)".
- Páginas de outra origem (`cy.origin`) e conteúdo dentro de iframes não recebem overlays.
- Com `testIsolation`, cada CT começa numa página em branco; a placa aparece na primeira página carregada pelo teste.
- O Electron está marcado como obsoleto no Cypress 16; se houver Chrome instalado, prefira `--browser chrome`.
- As pausas de exibição (`--pausa`) só existem no modo evidência; a execução normal dos testes não fica mais lenta.
