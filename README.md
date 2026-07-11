# Dashboard de Captação — L14 (Etek Academy)

Dashboard web que acompanha a captação de leads do lançamento L14
(Imersão IA, ago/2026), com dados do Active Campaign.

**Período:** 13/07/2026 a 03/08/2026 · **Meta:** 38.000 leads

## Como funciona

```
Active Campaign  ──►  fetch-data.js  ──►  data.json (só números agregados)
                                             │
                              build.js  ◄────┘
                                 │
                        dist/index.html  ──►  StatiCrypt (senha)  ──►  GitHub Pages
```

1. Todo dia às **07:00 (Brasília)** o GitHub Actions roda sozinho.
2. `scripts/fetch-data.js` busca no Active Campaign todos os contatos com a tag
   `l14-imersao-ia-ago26-inscricao` e gera **apenas dados agregados**
   (totais por dia, por UTM, respostas da pesquisa). **Nenhum e-mail, nome ou
   dado pessoal sai do Active Campaign.**
3. `scripts/build.js` injeta os dados no template e gera um HTML único.
4. O StatiCrypt criptografa a página com a senha do secret `DASHBOARD_PASSWORD` —
   sem a senha, o conteúdo é ilegível (criptografia AES-256 no navegador).
5. O GitHub Pages publica o link fixo para os gestores.

Sem a chave da API configurada, o script gera **dados de exemplo**
(marcados com o selo "DADOS DE EXEMPLO" no topo da página).

## Secrets (Settings → Secrets and variables → Actions)

| Secret | O que é |
|---|---|
| `AC_BASE_URL` | URL da API do Active Campaign (ex.: `https://suaconta.api-us1.com`) |
| `AC_API_KEY` | Chave de API (Active Campaign → Configurações → Desenvolvedor) |
| `DASHBOARD_PASSWORD` | Senha que os gestores usam para abrir o dashboard |

## Rodar no computador (opcional)

```
node scripts/fetch-data.js   # gera data/data.json (exemplo, sem a chave)
node scripts/build.js        # gera dist/index.html
```

Abra `dist/index.html` no navegador.

## Ajustes comuns

- **Meta ou datas mudaram?** Edite `CONFIG` no topo de `scripts/fetch-data.js`.
- **Trocar a senha?** Atualize o secret `DASHBOARD_PASSWORD` e rode o workflow
  manualmente (aba Actions → "Atualizar dashboard" → Run workflow).
- **Atualizar fora do horário?** Aba Actions → "Atualizar dashboard" → Run workflow.
