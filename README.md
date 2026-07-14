# Dashboard de Captação

Dashboard web que acompanha uma captação de leads, com dados agregados
do Active Campaign, atualizado automaticamente e publicado com senha.

## Como funciona

```
Active Campaign  ──►  fetch-data.js  ──►  data.json (só números agregados)
                                             │
                              build.js  ◄────┘
                                 │
                        dist/index.html  ──►  StatiCrypt (senha)  ──►  GitHub Pages
```

1. O GitHub Actions roda nos horários agendados no workflow.
2. `scripts/fetch-data.js` busca no Active Campaign os contatos da tag da
   campanha e gera **apenas dados agregados** (totais por dia, por UTM,
   respostas de pesquisa). **Nenhum e-mail, nome ou dado pessoal sai do
   Active Campaign.**
3. `scripts/build.js` injeta os dados no template e gera um HTML único.
4. O StatiCrypt criptografa a página com a senha do secret `DASHBOARD_PASSWORD`.
5. O GitHub Pages publica o link fixo.

Sem a chave da API configurada, o script gera **dados de exemplo**
(marcados com um selo na página).

## Configuração

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | O que é |
|---|---|
| `AC_BASE_URL` | URL da API do Active Campaign |
| `AC_API_KEY` | Chave de API |
| `DASHBOARD_PASSWORD` | Senha de acesso ao dashboard |

**Variables** (Settings → Secrets and variables → Actions → Variables) —
os parâmetros da campanha não ficam no código:

| Variable | O que é |
|---|---|
| `CAPTACAO_START` / `CAPTACAO_END` | Período da captação (AAAA-MM-DD) |
| `CAPTACAO_META` | Meta de leads |
| `AC_TAG_ID` / `AC_TAG_NAME` | Tag que identifica os leads da campanha |
| `LEAD_NOVO_DESDE` | Contatos criados a partir desta data contam como "lead novo" |

Para rodar localmente, crie `data/config.local.json` (fora do git) com os
mesmos parâmetros em minúsculas: `start`, `end`, `goal`, `tagId`, `tagName`,
`leadNovoDesde`. Depois:

```
node scripts/fetch-data.js
node scripts/build.js
```

## Ajustes comuns

- **Meta ou datas mudaram?** Atualize as Variables no repositório.
- **Trocar a senha?** Atualize o secret `DASHBOARD_PASSWORD` e rode o workflow.
- **Atualizar fora do horário?** Aba Actions → "Atualizar dashboard" → Run workflow.
