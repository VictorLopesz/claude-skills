# Claude Code — configuração pessoal

Instruções globais e skills pessoais do Claude Code.

## Conteúdo

| Caminho | O que é |
|---|---|
| `CLAUDE.md` | Instruções globais (idioma, preferências, padrão de automação com Cypress) |
| `skills/cypress-setup/` | `/cypress-setup`: monta um projeto Cypress + TypeScript com Page Objects, Custom Commands e Fixtures |
| `skills/evidencias/` | `/evidencias`: grava evidências (vídeo/prints) de CTs Cypress com overlays na página: placa do caso, terminal REST, destaques e callouts |
| `skills/d/` | `/d [caracteres] [nível]`: resume a última explicação com limite de caracteres e nível de dificuldade (0–10) |

## Instalação em outra máquina

O repositório é a própria pasta `~/.claude`. O `.gitignore` ignora tudo por padrão e libera só os arquivos acima, então histórico, sessões e credenciais nunca são versionados.

```bash
# ~/.claude ainda não existe
git clone <url-do-repositorio> ~/.claude

# ~/.claude já existe (Claude Code já instalado)
cd ~/.claude
git init -b main
git remote add origin <url-do-repositorio>
git fetch origin
git checkout -f main   # sobrescreve CLAUDE.md e skills locais de mesmo nome
```

## Requisitos das skills

- `/cypress-setup` e `/evidencias`: Node.js e npm; testado com Cypress 16.1.0.
- `/d`: Python 3 (usado para contar caracteres).
