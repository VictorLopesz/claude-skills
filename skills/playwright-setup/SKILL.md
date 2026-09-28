---
name: playwright-setup
description: Monta a estrutura de um projeto de automação de testes web com Playwright + TypeScript, organizado com Page Objects, fixtures customizadas e massa de dados separada. Use quando o usuário pedir para criar, iniciar, montar ou estruturar um projeto Playwright, ou para adicionar Playwright a um projeto existente.
---

# Montar projeto Playwright

Cria um projeto Playwright em TypeScript seguindo o padrão de organização do usuário: Page Objects, fixtures customizadas, massa de dados e specs separados por responsabilidade.

Equivalência com o padrão Cypress do usuário:

| Cypress | Playwright (este projeto) |
|---|---|
| Page Objects (`cypress/pages/`) | Page Objects com `Locator` (`pages/`) |
| Custom Commands (`support/commands.ts`) | Fixtures customizadas com `test.extend` (`fixtures/`) |
| Fixtures de dados (`cypress/fixtures/`) | Massa de dados JSON (`data/`) |
| `cypress.env.json` | `.env` (via `dotenv`) |
| `cy.session` | Fixture de login (ou `storageState`, se o projeto crescer) |

## 1. Antes de começar

1. Pergunte, se não estiver claro:
   - **Pasta do projeto**: criar uma pasta nova ou usar o diretório atual?
   - **URL base** da aplicação a ser testada (usar `https://example.com` como placeholder se não houver).
2. Verifique a pasta de destino:
   - Se já houver `package.json`, **não sobrescreva**; apenas adicione as dependências.
   - Se já houver `playwright.config.*`, `tests/` ou `pages/`, **pare e pergunte** antes de alterar qualquer coisa.
   - Se o projeto existente estiver em JavaScript (sem `tsconfig.json` e com `.js`), pergunte se deve usar JS; nesse caso, adapte os arquivos abaixo para `.js` sem tipagens.
3. Confirme que `node` e `npm` estão instalados (`node -v`, `npm -v`).

## 2. Instalação

```bash
npm init -y            # somente se não existir package.json
npm install -D @playwright/test typescript @types/node dotenv
npx playwright install chromium
```

- Não fixe versões; use as mais recentes estáveis que o npm resolver.
- Não use `npm init playwright@latest`: ele é interativo e cria uma estrutura diferente da deste padrão.
- `playwright install chromium` baixa o navegador (algumas centenas de MB). Para Firefox/WebKit, pergunte antes: `npx playwright install firefox webkit`.

## 3. Estrutura de pastas

```
<projeto>/
├── tests/                    # Specs: apenas fluxo e validações
│   └── login.spec.ts
├── pages/                    # Page Objects: locators e ações por página
│   └── LoginPage.ts
├── fixtures/                 # Fixtures customizadas (equivalente aos Custom Commands)
│   └── index.ts
├── data/                     # Massa de dados e mocks
│   └── users.json
├── playwright.config.ts
├── tsconfig.json
├── .env.example              # Modelo de variáveis (versionado)
├── .gitignore
└── package.json
```

## 4. Arquivos

### `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://example.com',
    testIdAttribute: 'data-testid',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

### `pages/LoginPage.ts`

```ts
import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByTestId('email');
    this.password = page.getByTestId('password');
    this.submit = page.getByTestId('submit');
    this.errorMessage = page.getByTestId('error-message');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
```

### `fixtures/index.ts`

```ts
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

type Usuario = { email: string; password: string };

type Fixtures = {
  loginPage: LoginPage;
  /** Credenciais válidas lidas do .env. */
  usuario: Usuario;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  // eslint-disable-next-line no-empty-pattern
  usuario: async ({}, use) => {
    const email = process.env.USER_EMAIL;
    const password = process.env.USER_PASSWORD;
    if (!email || !password) throw new Error('Defina USER_EMAIL e USER_PASSWORD no arquivo .env');
    await use({ email, password });
  },
});

export { expect };
```

### `data/users.json`

```json
{
  "invalid": {
    "email": "usuario.invalido@example.com",
    "password": "senha-errada"
  }
}
```

### `tests/login.spec.ts`

```ts
import { test, expect } from '../fixtures';
import users from '../data/users.json';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('deve exibir erro com credenciais inválidas', async ({ loginPage }) => {
    await loginPage.login(users.invalid.email, users.invalid.password);

    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('deve fazer login com credenciais válidas', async ({ page, loginPage, usuario }) => {
    await loginPage.login(usuario.email, usuario.password);

    await expect(page).not.toHaveURL(/\/login/);
  });
});
```

### `.env.example`

```
BASE_URL=https://example.com
USER_EMAIL=seu.usuario@example.com
USER_PASSWORD=sua-senha
```

### `.gitignore` (acrescentar, sem apagar o que já existir)

```
node_modules/
.env
test-results/
playwright-report/
blob-report/
playwright/.cache/
.auth/
```

### Scripts no `package.json`

Adicione em `"scripts"` (sem remover scripts existentes):

```json
"test": "playwright test",
"test:headed": "playwright test --headed",
"test:ui": "playwright test --ui",
"test:debug": "playwright test --debug",
"report": "playwright show-report"
```

Se já existir um script `test` que não seja o placeholder do `npm init` (`echo "Error: no test specified" && exit 1`), não o substitua; use `"test:e2e"` no lugar.

## 5. Verificação

1. Rode `npx tsc --noEmit` para validar a tipagem.
2. Rode `npx playwright test --list` para confirmar que a configuração carrega e os testes são encontrados.
3. Não execute os testes contra a URL placeholder; informe o usuário que os testes de exemplo dependem da aplicação real e dos atributos `data-testid`.

## 6. Resumo final para o usuário

Informe:
- A estrutura criada e o papel de cada pasta.
- Que deve copiar `.env.example` para `.env` e preencher URL e credenciais (esse arquivo não vai para o git).
- Que os `data-testid` do exemplo precisam ser ajustados à aplicação real (ou trocar `testIdAttribute` no config se a aplicação usar `data-cy`, `data-test` etc.).
- Como rodar: `npm test` (headless), `npm run test:ui` (modo interativo) e `npm run report` (relatório HTML).

## 7. Abrir no VS Code

Após a verificação e o resumo, abra a pasta do projeto no VS Code:

```bash
if command -v code >/dev/null 2>&1; then
  code "<pasta-do-projeto>"
else
  open -a "Visual Studio Code" "<pasta-do-projeto>"
fi
```

- Use o caminho absoluto da pasta do projeto.
- Se o VS Code não estiver instalado (o comando falhar), apenas informe o usuário; não tente instalá-lo.
- Sugira a extensão oficial **Playwright Test for VS Code** (`ms-playwright.playwright`), sem instalá-la automaticamente.

## Regras

- Specs nunca contêm seletores soltos: locators ficam nos Page Objects.
- Ações reutilizáveis entre páginas viram fixtures em `fixtures/` (não funções soltas nos specs).
- Dados de teste ficam em `data/`; credenciais e URLs de ambiente no `.env`.
- Preferir locators por papel e teste: `getByRole`, `getByLabel`, `getByTestId`; evitar CSS frágil e XPath.
- Nunca usar `page.waitForTimeout()` com tempo fixo; usar asserções web-first (`await expect(locator).toBeVisible()`) ou `page.waitForResponse()`.
- Sempre usar `await` nas ações e asserções.
- Não sobrescrever arquivos existentes sem confirmação.
