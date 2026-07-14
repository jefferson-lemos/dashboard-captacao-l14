/**
 * Busca os leads da captação L14 no Active Campaign e gera data/data.json
 * com dados AGREGADOS (nunca e-mails ou dados pessoais).
 *
 * Variáveis de ambiente:
 *   AC_BASE_URL  ex.: https://suaconta.api-us1.com
 *   AC_API_KEY   chave de API (Configurações > Desenvolvedor)
 *
 * Sem as variáveis, gera dados de exemplo para pré-visualização.
 */
const fs = require('fs');
const path = require('path');

// A configuração da campanha (datas, meta, tag) NÃO fica no código público:
// vem das Variables do repositório (CI) ou de data/config.local.json (local, fora do git).
function loadLocalConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.local.json'), 'utf8'));
  } catch {
    return {};
  }
}
const LOCAL = loadLocalConfig();
const CONFIG = {
  start: process.env.CAPTACAO_START || LOCAL.start || '2026-01-05',
  end: process.env.CAPTACAO_END || LOCAL.end || '2026-01-26',
  goal: Number(process.env.CAPTACAO_META || LOCAL.goal || 10000),
  tagId: process.env.AC_TAG_ID || LOCAL.tagId || '',
  tagName: process.env.AC_TAG_NAME || LOCAL.tagName || 'captacao',
  timeZone: 'America/Sao_Paulo',
  // Contato criado ANTES desta data = "Lead Quente" (já estava na base);
  // criado a partir dela = "Lead Novo". Referência: início da captação.
  leadNovoDesde: process.env.LEAD_NOVO_DESDE || LOCAL.leadNovoDesde || process.env.CAPTACAO_START || LOCAL.start || '2026-01-05',
};

// IDs dos campos personalizados no Active Campaign
const FIELD = {
  utm_source: '6',
  utm_medium: '7',
  utm_campaign: '8',
  utm_content: '9',
  utm_term: '10',
  dataInscricao: '20',
  objetivo: '38',
  ferramentas: '39',
  experiencia: '41',
  genero: '43',
  idade: '44',
  situacao: '45',
  faixaSalarial: '47',
  area: '49',
};

const OUT_FILE = path.join(__dirname, '..', 'data', 'data.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Converte uma data ISO para o dia (AAAA-MM-DD) no fuso de São Paulo
function dayInSP(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function nowInSPISO() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-03:00`;
}

function listDays(start, end) {
  const days = [];
  const d = new Date(`${start}T12:00:00Z`);
  const stop = new Date(`${end}T12:00:00Z`);
  while (d <= stop) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

function norm(value, { lower = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return '(não informado)';
  return lower ? v.toLowerCase() : v;
}

// Campos checkbox do AC chegam como "||Opção A||Opção B||"
function splitMulti(value) {
  return String(value ?? '')
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
}

function bucketIdade(value) {
  const n = parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 120) return null;
  if (n < 18) return 'Menos de 18';
  if (n <= 24) return '18 a 24';
  if (n <= 34) return '25 a 34';
  if (n <= 44) return '35 a 44';
  if (n <= 54) return '45 a 54';
  return '55 ou mais';
}

const IDADE_ORDER = ['Menos de 18', '18 a 24', '25 a 34', '35 a 44', '45 a 54', '55 ou mais'];
const EXPERIENCIA_ORDER = ['Nunca usei IA antes', 'Básico/Iniciante', 'Intermediário', 'Usuário avançado'];

function count(map, key, inc = 1) {
  map.set(key, (map.get(key) ?? 0) + inc);
}

function topN(map, n, { order = null } = {}) {
  let entries = [...map.entries()];
  if (order) {
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return entries;
  }
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length <= n) return entries;
  const head = entries.slice(0, n);
  const rest = entries.slice(n).reduce((s, [, v]) => s + v, 0);
  head.push(['outros', rest]);
  return head;
}

async function fetchAllContacts(baseUrl, apiKey) {
  const contacts = [];
  const fieldsByContact = new Map();
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const url = `${baseUrl}/api/3/contacts?tagid=${CONFIG.tagId}&limit=100&offset=${offset}&include=fieldValues`;
    const res = await fetch(url, { headers: { 'Api-Token': apiKey } });
    if (!res.ok) {
      throw new Error(`Active Campaign respondeu ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    total = Number(json.meta?.total ?? 0);
    const page = json.contacts ?? [];
    for (const c of page) contacts.push({ id: c.id, cdate: c.cdate });
    for (const fv of json.fieldValues ?? []) {
      const m = fieldsByContact.get(fv.contact) ?? {};
      m[fv.field] = fv.value;
      fieldsByContact.set(fv.contact, m);
    }
    offset += 100;
    // Sem números nos logs: em repositório público os logs do CI são visíveis a todos
    if (page.length === 0) break;
    await sleep(250); // respeita o limite de requisições do AC
  }
  return { contacts, fieldsByContact };
}

function aggregate(contacts, fieldsByContact) {
  const days = listDays(CONFIG.start, CONFIG.end);
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const byDayTotal = new Array(days.length).fill(0);
  const byDayNovos = new Array(days.length).fill(0);
  let novos = 0;
  let quentes = 0;
  const sourceCounts = new Map();
  const mediumCounts = new Map();
  const campaignCounts = new Map();
  const contentCounts = new Map();
  const termCounts = new Map();
  const perDaySource = days.map(() => new Map());

  const survey = {
    genero: new Map(),
    idade: new Map(),
    faixaSalarial: new Map(),
    situacao: new Map(),
    area: new Map(),
    objetivo: new Map(),
    ferramentas: new Map(),
    experiencia: new Map(),
  };
  let respondents = 0;
  let foraPeriodo = 0;

  for (const c of contacts) {
    const f = fieldsByContact.get(c.id) ?? {};

    // Lead Novo = contato criado a partir do início da captação; antes disso = Lead Quente
    const criadoEm = dayInSP(c.cdate) ?? '';
    const isNovo = criadoEm >= CONFIG.leadNovoDesde;
    if (isNovo) novos += 1; else quentes += 1;

    // Dia do lead: campo "Data de Inscrição" se válido; senão, data de criação do contato
    let day = null;
    const insc = String(f[FIELD.dataInscricao] ?? '').slice(0, 10);
    if (dayIndex.has(insc)) day = insc;
    else day = dayInSP(c.cdate);

    if (day && dayIndex.has(day)) {
      const i = dayIndex.get(day);
      byDayTotal[i] += 1;
      if (isNovo) byDayNovos[i] += 1;
      count(perDaySource[i], norm(f[FIELD.utm_source], { lower: true }));
    } else {
      foraPeriodo += 1;
    }

    count(sourceCounts, norm(f[FIELD.utm_source], { lower: true }));
    count(mediumCounts, norm(f[FIELD.utm_medium], { lower: true }));
    count(campaignCounts, norm(f[FIELD.utm_campaign], { lower: true }));
    count(contentCounts, norm(f[FIELD.utm_content], { lower: true }));
    count(termCounts, norm(f[FIELD.utm_term], { lower: true }));

    const hasSurvey = [FIELD.genero, FIELD.idade, FIELD.faixaSalarial, FIELD.situacao, FIELD.area, FIELD.objetivo, FIELD.experiencia]
      .some((id) => String(f[id] ?? '').trim());
    if (hasSurvey) respondents += 1;

    const genero = String(f[FIELD.genero] ?? '').trim();
    if (genero) count(survey.genero, genero);
    const idade = bucketIdade(f[FIELD.idade]);
    if (idade) count(survey.idade, idade);
    const faixa = String(f[FIELD.faixaSalarial] ?? '').trim();
    if (faixa) count(survey.faixaSalarial, faixa);
    const situacao = String(f[FIELD.situacao] ?? '').trim();
    if (situacao) count(survey.situacao, situacao);
    const area = String(f[FIELD.area] ?? '').trim();
    if (area) count(survey.area, area);
    const objetivo = String(f[FIELD.objetivo] ?? '').trim();
    if (objetivo) count(survey.objetivo, objetivo);
    for (const tool of splitMulti(f[FIELD.ferramentas])) count(survey.ferramentas, tool);
    const exp = String(f[FIELD.experiencia] ?? '').trim();
    if (exp) count(survey.experiencia, exp);
  }

  // Fontes principais para o gráfico diário empilhado (top 5 + outros)
  const topSources = topN(sourceCounts, 5).map(([name]) => name).filter((n) => n !== 'outros');
  const byDay = days.map((date, i) => {
    const bySource = {};
    let outros = 0;
    for (const [src, n] of perDaySource[i]) {
      if (topSources.includes(src)) bySource[src] = (bySource[src] ?? 0) + n;
      else outros += n;
    }
    if (outros > 0) bySource.outros = outros;
    return { date, total: byDayTotal[i], novos: byDayNovos[i], quentes: byDayTotal[i] - byDayNovos[i], bySource };
  });

  return {
    updatedAt: nowInSPISO(),
    sampleData: false,
    config: CONFIG,
    total: contacts.length,
    novos,
    quentes,
    foraPeriodo,
    stackSeries: [...topSources, 'outros'],
    byDay,
    utm: {
      source: topN(sourceCounts, 10),
      medium: topN(mediumCounts, 10),
      campaign: topN(campaignCounts, 10),
      content: topN(contentCounts, 10),
      term: topN(termCounts, 10),
    },
    survey: {
      respondents,
      genero: topN(survey.genero, 6),
      idade: topN(survey.idade, 10, { order: IDADE_ORDER }),
      faixaSalarial: topN(survey.faixaSalarial, 8),
      situacao: topN(survey.situacao, 8),
      area: topN(survey.area, 8),
      objetivo: topN(survey.objetivo, 10),
      ferramentas: topN(survey.ferramentas, 10),
      experiencia: topN(survey.experiencia, 4, { order: EXPERIENCIA_ORDER }),
    },
  };
}

// ---------- Dados de exemplo (usados enquanto não há chave de API) ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleData() {
  const rnd = mulberry32(20260713);
  const days = listDays(CONFIG.start, CONFIG.end);
  const sources = ['instagram', 'facebook', 'youtube', 'google', 'email'];
  const weights = [0.38, 0.22, 0.16, 0.12, 0.07];

  const simulatedDays = 13; // simula uma captação no meio do caminho
  const byDay = days.map((date, i) => {
    if (i >= simulatedDays) return { date, total: 0, novos: 0, quentes: 0, bySource: {} };
    // Curva típica de lançamento: forte no início, vale no meio, pico no fim
    const t = i / (days.length - 1);
    const shape = 1.5 - 1.1 * t + 2.2 * t * t + (i === 0 ? 0.8 : 0) + (t > 0.9 ? 1.2 : 0);
    const total = Math.round(shape * (900 + rnd() * 450));
    // Base quente responde mais no início; tráfego frio (novos) domina depois
    const novoShare = Math.min(0.9, 0.5 + 0.45 * (i / simulatedDays)) * (0.92 + rnd() * 0.16);
    const novos = Math.min(total, Math.round(total * novoShare));
    const bySource = {};
    let rest = total;
    sources.forEach((s, k) => {
      const n = k === sources.length - 1 ? Math.max(0, Math.round(rest * 0.6)) : Math.round(total * weights[k] * (0.8 + rnd() * 0.4));
      bySource[s] = Math.min(n, rest);
      rest -= bySource[s];
    });
    if (rest > 0) bySource.outros = rest;
    return { date, total, novos, quentes: total - novos, bySource };
  });

  const total = byDay.reduce((s, d) => s + d.total, 0);
  const novos = byDay.reduce((s, d) => s + d.novos, 0);
  const share = (frac) => Math.round(total * frac);

  return {
    updatedAt: nowInSPISO(),
    sampleData: true,
    config: CONFIG,
    total,
    novos,
    quentes: total - novos,
    foraPeriodo: 0,
    stackSeries: [...sources, 'outros'],
    byDay,
    utm: {
      source: [['instagram', share(0.38)], ['facebook', share(0.22)], ['youtube', share(0.16)], ['google', share(0.12)], ['email', share(0.07)], ['outros', share(0.05)]],
      medium: [['paid-social', share(0.45)], ['cpc', share(0.2)], ['organic-social', share(0.15)], ['email', share(0.1)], ['(não informado)', share(0.1)]],
      campaign: [['l14-captacao-frio', share(0.4)], ['l14-captacao-remarketing', share(0.25)], ['l14-lista-quente', share(0.2)], ['l14-influencers', share(0.15)]],
      content: [['video-01-dor', share(0.3)], ['video-02-prova', share(0.25)], ['estatico-01', share(0.2)], ['reels-cortes', share(0.15)], ['(não informado)', share(0.1)]],
      term: [['(não informado)', share(0.85)], ['ia-para-iniciantes', share(0.15)]],
    },
    survey: {
      respondents: share(0.62),
      genero: [['Feminino', share(0.33)], ['Masculino', share(0.27)], ['Outro', share(0.02)]],
      idade: [['18 a 24', share(0.08)], ['25 a 34', share(0.22)], ['35 a 44', share(0.18)], ['45 a 54', share(0.1)], ['55 ou mais', share(0.04)]],
      faixaSalarial: [['Até R$ 2.000', share(0.1)], ['R$ 2.001 a R$ 4.000', share(0.18)], ['R$ 4.001 a R$ 7.000', share(0.16)], ['R$ 7.001 a R$ 12.000', share(0.12)], ['Acima de R$ 12.000', share(0.06)]],
      situacao: [['CLT', share(0.34)], ['Autônomo(a)', share(0.12)], ['Servidor público', share(0.08)], ['Desempregado(a)', share(0.05)], ['Estudante', share(0.03)]],
      area: [['Dados (Analista de dados, BI, cientista de dados, engenheiro de dados, etc)', share(0.14)], ['Finanças (controladoria, financeiro, contas a pagar/receber, custos, etc)', share(0.12)], ['Marketing/Comercial (Vendas, analista de marketing, comunicação, publicidade)', share(0.11)], ['Supply Chain (Logística, compras, planejamento, comércio exterior)', share(0.09)], ['TI (analista de sistemas, desenvolvedor, UI/UX designer, etc)', share(0.08)], ['Engenharia (Produção, civil, qualidade, ambiental, química)', share(0.05)], ['Administrativo geral (RH, atendimento, CS)', share(0.03)]],
      objetivo: [['Ser mais produtivo no emprego atual', share(0.2)], ['Mudar de carreira para área de dados/tecnologia', share(0.14)], ['Usar IA para análise de dados e automações', share(0.12)], ['Me manter atualizado sobre as tendências do mercado', share(0.08)], ['Aprender do zero', share(0.05)], ['Conseguir um emprego', share(0.03)]],
      ferramentas: [['ChatGPT', share(0.55)], ['Gemini', share(0.25)], ['Copilot', share(0.15)], ['Claude', share(0.12)], ['Deepseek', share(0.08)], ['NotebookLM', share(0.06)]],
      experiencia: [['Nunca usei IA antes', share(0.08)], ['Básico/Iniciante', share(0.3)], ['Intermediário', share(0.2)], ['Usuário avançado', share(0.04)]],
    },
  };
}

async function main() {
  const baseUrl = (process.env.AC_BASE_URL ?? '').replace(/\/+$/, '');
  const apiKey = process.env.AC_API_KEY ?? '';

  let data;
  if (baseUrl && apiKey) {
    if (!CONFIG.tagId || !process.env.CAPTACAO_START || !process.env.CAPTACAO_META) {
      throw new Error('Configuração da campanha ausente no CI: defina as Variables CAPTACAO_START, CAPTACAO_END, CAPTACAO_META, AC_TAG_ID e AC_TAG_NAME no repositório.');
    }
    console.log('Buscando dados no Active Campaign...');
    const { contacts, fieldsByContact } = await fetchAllContacts(baseUrl, apiKey);
    console.log('Download concluído. Agregando...');
    data = aggregate(contacts, fieldsByContact);
  } else {
    console.log('AC_BASE_URL / AC_API_KEY não definidos — gerando DADOS DE EXEMPLO.');
    data = sampleData();
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));
  console.log(`OK: dados agregados gravados${data.sampleData ? ' (dados de exemplo)' : ''}.`);
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
