---
name: d
description: Resume a última explicação (ou um texto enviado) em um número de caracteres e num nível de dificuldade de 0 a 10. Use quando o usuário invocar /d, com ou sem números (ex.: /d, /d 150, /d 150 0.7, /d 200 3 <texto>).
---

# /d — resumir com limite de caracteres e nível de dificuldade

## Argumentos

`/d [caracteres] [nível] [texto]`

| Argumento | Padrão | Significado |
|---|---|---|
| `caracteres` | 150 | Tamanho-alvo do resumo, contando espaços e pontuação |
| `nível` | 5 | Dificuldade de 0 a 10 (aceita decimais: 0.7, 2.5); quanto menor, mais fácil |
| `texto` | sua última resposta | Se o usuário colar um texto depois dos números, resuma esse texto |

Se só um número vier, ele é `caracteres`. Nível fora de 0–10 → use o limite mais próximo (0 ou 10) e avise em uma linha.

## Regra de tamanho

- **Alvo abaixo de 300** (ex.: `/d 150`): escreva em até o número pedido. Se o assunto for complexo demais para caber sem perder o sentido, pode passar do alvo, mas **nunca de 300 caracteres**.
- **Alvo de 300 ou mais** (ex.: `/d 300`, `/d 500`, `/d 600`): o número pedido é o **teto absoluto**. Pode usar até ele, nunca além.
- Não encha o texto para chegar ao número: se a ideia couber em menos, use menos.

## Níveis

| Nível | Público | Como escrever |
|---|---|---|
| 0 a 0.5 | Criança de 5 anos | Palavras curtas e do dia a dia, frases curtas, uma comparação com brinquedos, comida, casa ou escola. Nenhum termo técnico. |
| 0.6 a 3 | Leigo | Linguagem comum, sem jargão; se um termo for inevitável, diga o que ele faz em palavras simples. |
| 3.1 a 6 | Profissional de outra área | Termos básicos permitidos, cada um explicado rapidamente. |
| 6.1 a 8 | Profissional da área | Termos técnicos sem explicação; foco no porquê e no como. |
| 8.1 a 10 | Especialista | Linguagem técnica e precisa, densa, com nomes exatos (comandos, APIs, conceitos). |

Dentro de uma faixa, quanto mais perto do número de baixo, mais simples.

## Passos

1. Identifique o texto de origem: o texto colado ou, se não houver, sua última resposta nesta conversa. Se não existir nenhuma explicação anterior, peça ao usuário o texto.
2. Escolha o essencial: a ideia central primeiro. Mantenha fatos corretos; simplificar não é inventar.
3. Escreva o resumo no nível pedido, em português do Brasil.
4. **Conte os caracteres de verdade**, não estime. Use o Bash:
   ```bash
   cat <<'EOF' | python3 -c "import sys; print(len(sys.stdin.read().rstrip('\n')))"
   <resumo>
   EOF
   ```
   Se passar do limite da regra de tamanho, reescreva mais curto e conte de novo.
5. Responda **só** com o resumo, seguido de uma linha de rodapé:
   `— 148 caracteres · nível 0.7`

Sem introdução ("Aqui está o resumo..."), sem títulos, sem listas, a menos que o texto de origem seja uma sequência de passos e a lista caiba no limite.

## Exemplos

`/d 150 0.5` sobre "cy.session salva o login para reaproveitar entre testes":

> O computador lembra que você já entrou, igual quando a professora já sabe seu nome. Assim ele não precisa perguntar de novo a cada vez.
>
> — 135 caracteres · nível 0.5

`/d 150 8` sobre o mesmo tema:

> cy.session cacheia cookies, localStorage e sessionStorage após o setup e os restaura por teste; o validate evita reusar sessão inválida.
>
> — 136 caracteres · nível 8
