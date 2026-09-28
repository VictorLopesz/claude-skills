---
name: cypress-setup
description: Monta a estrutura de um projeto de automação de testes web com Cypress + TypeScript, organizado com Page Objects, Custom Commands e Fixtures. Use quando o usuário pedir para criar, iniciar, montar ou estruturar um projeto Cypress (ou "projeto de automação de testes web"), ou para adicionar Cypress a um projeto existente.
---

# Montar projeto Cypress

Cria um projeto Cypress em TypeScript seguindo o padrão de organização do usuário: Page Objects, Custom Commands, Fixtures e Specs separados por responsabilidade.

## 1. Antes de começar

1. Pergunte, se não estiver claro:
   - **Pasta do projeto**: criar uma pasta nova ou usar o diretório atual?
   - **URL base** da aplicação a ser testada (usar `https://example.com` como placeholder se não houver).
2. Verifique a pasta de destino:
   - Se já houver `package.json`, **não sobrescreva**; apenas adicione as dependências.
   - Se já houver `cypress/` ou `cypress.config.*`, **pare e pergunte** antes de alterar qualquer coisa.
   - Se o projeto existente estiver em JavaScript (sem `tsconfig.json` e com `.js`), pergunte se deve usar JS; nesse caso, adapte os arquivos abaixo para `.js` sem tipagens.
3. Confirme que `node` e `npm` estão instalados (`node -v`, `npm -v`).

## 2. Instalação

```bash
npm init -y            # somente se não existir package.json
npm install -D cypress typescript @types/node
```

Não fixe versões; use as mais recentes estáveis que o npm resolver.

**npm 11+:** o npm pode bloquear o `postinstall` do Cypress (aviso `install-scripts ... not yet covered by allowScripts`), e esse script é o que baixa o binário. Se `npx cypress verify` falhar por binário ausente, informe o usuário e, com a confirmação dele, rode `npm install-scripts approve cypress` seguido de `npx cypress install`.

**Cypress 16+:** `Cypress.env()` síncrono não existe mais; use `cy.env(['CHAVE'])` (assíncrono, com `.then`).

## 3. Estrutura de pastas

```
<projeto>/
├── cypress/
│   ├── e2e/                  # Specs: apenas fluxo e validações
│   │   └── login.cy.ts
│   ├── pages/                # Page Objects: seletores e ações por página
│   │   └── LoginPage.ts
│   ├── fixtures/             # Massa de dados e mocks
│   │   └── users.json
│   ├── support/
│   │   ├── commands.ts       # Custom Commands
│   │   ├── e2e.ts            # Carregado antes de cada spec
│   │   └── index.d.ts        # Tipagem dos Custom Commands
│   └── tsconfig.json
├── cypress.config.ts
├── cypress.env.example.json  # Modelo de variáveis (versionado)
├── .gitignore
└── package.json
```

## 4. Arquivos

### `cypress.config.ts`

```ts
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'https://example.com',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1366,
    viewportHeight: 768,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    retries: { runMode: 1, openMode: 0 },
  },
});
```

### `cypress/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "types": ["cypress", "node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

### `cypress/support/e2e.ts`

```ts
import './commands';
```

### `cypress/support/commands.ts`

```ts
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-cy=email]').type(email);
    cy.get('[data-cy=password]').type(password, { log: false });
    cy.get('[data-cy=submit]').click();
    // Só salva a sessão depois que o login concluir (senão ela é gravada sem o cookie/token).
    cy.location('pathname').should('not.include', '/login');
  });
});

Cypress.Commands.add('getByDataCy', (value: string) => {
  return cy.get(`[data-cy=${value}]`);
});
```

### `cypress/support/index.d.ts`

```ts
declare namespace Cypress {
  interface Chainable {
    /** Faz login e reaproveita a sessão entre testes. */
    login(email: string, password: string): Chainable<void>;
    /** Busca elemento pelo atributo data-cy. */
    getByDataCy(value: string): Chainable<JQuery<HTMLElement>>;
  }
}
```

### `cypress/pages/LoginPage.ts`

```ts
class LoginPage {
  private selectors = {
    email: '[data-cy=email]',
    password: '[data-cy=password]',
    submit: '[data-cy=submit]',
    errorMessage: '[data-cy=error-message]',
  };

  visit() {
    cy.visit('/login');
    return this;
  }

  fillEmail(email: string) {
    cy.get(this.selectors.email).clear().type(email);
    return this;
  }

  fillPassword(password: string) {
    cy.get(this.selectors.password).clear().type(password, { log: false });
    return this;
  }

  submit() {
    cy.get(this.selectors.submit).click();
    return this;
  }

  errorMessage() {
    return cy.get(this.selectors.errorMessage);
  }
}

export default new LoginPage();
```

### `cypress/fixtures/users.json`

```json
{
  "invalid": {
    "email": "usuario.invalido@example.com",
    "password": "senha-errada"
  }
}
```

### `cypress/e2e/login.cy.ts`

```ts
import loginPage from '../pages/LoginPage';

describe('Login', () => {
  beforeEach(() => {
    loginPage.visit();
  });

  it('deve exibir erro com credenciais inválidas', () => {
    cy.fixture('users').then((users) => {
      loginPage
        .fillEmail(users.invalid.email)
        .fillPassword(users.invalid.password)
        .submit();
    });

    loginPage.errorMessage().should('be.visible');
  });

  it('deve fazer login com credenciais válidas', () => {
    cy.env<{ USER_EMAIL: string; USER_PASSWORD: string }>(['USER_EMAIL', 'USER_PASSWORD']).then(
      ({ USER_EMAIL, USER_PASSWORD }) => {
        cy.login(USER_EMAIL, USER_PASSWORD);
      },
    );
    cy.visit('/');
    cy.url().should('not.include', '/login');
  });
});
```

### `cypress.env.example.json`

```json
{
  "USER_EMAIL": "seu.usuario@example.com",
  "USER_PASSWORD": "sua-senha"
}
```

### `.gitignore` (acrescentar, sem apagar o que já existir)

```
node_modules/
cypress.env.json
cypress/screenshots/
cypress/videos/
cypress/downloads/
```

### Scripts no `package.json`

Adicione em `"scripts"` (sem remover scripts existentes):

```json
"cy:open": "cypress open",
"cy:run": "cypress run",
"cy:run:chrome": "cypress run --browser chrome"
```

## 5. Verificação

1. Rode `npx tsc --noEmit -p cypress` para validar a tipagem.
2. Rode `npx cypress verify` para confirmar a instalação do binário.
3. Não execute `cypress run` contra a URL placeholder; informe o usuário que os testes de exemplo dependem da aplicação real e dos seletores `data-cy`.

## 6. Resumo final para o usuário

Informe:
- A estrutura criada e o papel de cada pasta.
- Que deve copiar `cypress.env.example.json` para `cypress.env.json` e preencher as credenciais (esse arquivo não vai para o git).
- Que os seletores `data-cy` do exemplo precisam ser ajustados à aplicação real.
- Como rodar: `npm run cy:open` (interativo) ou `npm run cy:run` (headless).

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

## Regras

- Testes nunca contêm seletores soltos: seletores ficam nos Page Objects.
- Dados de teste ficam em Fixtures; credenciais e URLs sensíveis em variáveis de ambiente.
- Preferir `data-cy` / `data-testid` a classes CSS ou XPath.
- Não usar `cy.wait(<ms>)` fixo; usar asserções ou `cy.intercept()` + `cy.wait('@alias')`.
- Não sobrescrever arquivos existentes sem confirmação.
