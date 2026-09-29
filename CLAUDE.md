# Instruções globais

Estas instruções valem para todas as sessões do Claude Code nesta máquina.

## Idioma e comunicação

- Responder em português do Brasil.
- Ser claro e objetivo.

## Preferências de trabalho

- Confirmar antes de ações difíceis de reverter (apagar arquivos, sobrescrever configurações, push, deploy).
- Não commitar nem enviar nada para serviços externos sem pedido explícito.

## Automação de testes

- Frameworks aceitos para testes web: **Cypress** ou **Playwright**.
  - Projeto existente: usar o framework que ele já usa; nunca misturar os dois no mesmo projeto.
  - Projeto novo: perguntar qual usar (skills `/cypress-setup` e `/playwright-setup`).
- Linguagem padrão: **TypeScript**. Usar **JavaScript** apenas quando o projeto já estiver em JS.
- Não sugerir outros frameworks (Selenium, Puppeteer, WebdriverIO etc.), a menos que eu peça.
- Evidências de CTs: skill `/evidencias` (funciona com qualquer framework que tenha adaptador).

### Organização do código

Manter o código sempre bem organizado e separado por responsabilidade:

| Responsabilidade | Cypress | Playwright |
|---|---|---|
| Page Objects: seletores/locators e ações de cada página | `cypress/pages/` | `pages/` |
| Ações reutilizáveis entre páginas (ex.: login) | Custom Commands em `cypress/support/commands.ts`, tipados em `index.d.ts` | Fixtures customizadas (`test.extend`) em `fixtures/` |
| Massa de dados e mocks | `cypress/fixtures/` | `data/` |
| Specs: apenas fluxo e validações | `cypress/e2e/` | `tests/` |
| Credenciais e URLs de ambiente (fora do git) | `cypress.env.json` | `.env` |

- Os testes não contêm seletores soltos.
- Preferir seletores estáveis (`data-cy`, `data-testid`, `getByRole`) a classes CSS ou XPath.
- Nunca usar espera com tempo fixo (`cy.wait(ms)`, `page.waitForTimeout(ms)`); esperar por elemento, asserção ou resposta de rede (`cy.intercept`, `page.waitForResponse`).
- Credenciais nunca no código.

## Ambiente

- macOS, shell zsh, Terminal padrão da Apple.
