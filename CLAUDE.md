# Instruções globais

Estas instruções valem para todas as sessões do Claude Code nesta máquina.

## Idioma e comunicação

- Responder em português do Brasil.
- Ser claro e objetivo.

## Preferências de trabalho

- Confirmar antes de ações difíceis de reverter (apagar arquivos, sobrescrever configurações, push, deploy).
- Não commitar nem enviar nada para serviços externos sem pedido explícito.

## Automação de testes

- Toda automação de testes web deve usar **Cypress**.
- Linguagem padrão: **TypeScript**. Usar **JavaScript** apenas quando o projeto já estiver em JS.
- Não sugerir outros frameworks (Playwright, Selenium, Puppeteer etc.), a menos que eu peça.

### Organização do código

Manter o código sempre bem organizado e separado por responsabilidade:

- **Page Objects** (`cypress/pages/`): seletores e ações de cada página; os testes não devem conter seletores soltos.
- **Custom Commands** (`cypress/support/commands.ts`): ações reutilizáveis entre páginas (ex.: login), com tipagem declarada em `cypress/support/index.d.ts`.
- **Fixtures** (`cypress/fixtures/`): massa de dados e respostas mockadas; não deixar dados fixos dentro dos testes.
- **Specs** (`cypress/e2e/`): apenas o fluxo e as validações do teste, usando Page Objects, Commands e Fixtures.
- Preferir seletores estáveis (`data-cy`, `data-testid`) a classes CSS ou XPath.
- Evitar `cy.wait()` com tempo fixo; usar esperas por elemento ou `cy.intercept()`.
- Credenciais e URLs de ambiente em variáveis de ambiente (`cypress.env.json` fora do git), nunca no código.

## Ambiente

- macOS, shell zsh, Terminal padrão da Apple.
