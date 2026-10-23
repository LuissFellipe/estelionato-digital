// Golpe em Registro. Lê window.DADOS e window.ESTADOS (dados.js, gerado por
// painel/gerar.py) e desenha os gráficos com ECharts.

const D = window.DADOS;
const FA = D.falso_advogado;

// ------------------------------------------------------------ formatação
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = (v) => (v == null ? "–" : nf.format(v));
const pct = (v, sinal) => (v == null ? "–" : (sinal && v > 0 ? "+" : "") + n1.format(v) + "%");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MESES = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const hoje = new Date();
const ACESSO = `Acesso em: ${hoje.getDate()} ${MESES[hoje.getMonth()]} ${hoje.getFullYear()}.`;
const dataBR = (iso) => { const [a, m, d] = iso.split("-"); return `${+d} ${MESES[+m - 1]} ${a}`; };
const AUTOR = "FÓRUM BRASILEIRO DE SEGURANÇA PÚBLICA";
const CRIME_NOME = { total: "estelionato", eletronico: "estelionato por meio eletrônico" };
const PREP = {
  "Acre": "no", "Amapá": "no", "Amazonas": "no", "Bahia": "na", "Ceará": "no", "Distrito Federal": "no",
  "Espírito Santo": "no", "Maranhão": "no", "Pará": "no", "Paraíba": "na", "Paraná": "no", "Piauí": "no",
  "Rio de Janeiro": "no", "Rio Grande do Norte": "no", "Rio Grande do Sul": "no", "Tocantins": "no",
};
const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
// Tema escuro: a escolha explícita (data-theme) vale mais que a do sistema.
const temaEscuro = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; };

// ---------------------------------------------------------------- índices
const ANOS = [...new Set(D.registros.map((r) => r.ano))].sort();
const ULTIMO = ANOS[ANOS.length - 1];
const UFS = [...new Map(D.registros.map((r) => [r.uf, r])).values()]
  .sort((a, b) => (a.uf === "Brasil" ? -1 : b.uf === "Brasil" ? 1 : a.uf.localeCompare(b.uf, "pt-BR")));
const ESTADOS = UFS.filter((u) => u.uf !== "Brasil");
const NOME = Object.fromEntries(ESTADOS.map((u) => [u.sigla, u.uf]));
const versoes = (uf, ano, crime) => D.registros.filter((r) => r.uf === uf && r.ano === ano && r.crime === crime).sort((a, b) => a.edicao - b.edicao);
const ultima = (uf, ano, crime) => { const v = versoes(uf, ano, crime); return v[v.length - 1]; };
const quebra = (sigla) => D.quebras.find((q) => q.sigla === sigla);
const edicao = (e) => D.edicoes[String(e)];
// População que o próprio Anuário usa na taxa do total de 2025.
const POP = Object.fromEntries(ESTADOS.map((u) => { const t = ultima(u.uf, ULTIMO, "total"); return [u.sigla, t.registros / t.taxa * 1e5]; }));

// ------------------------------------------------------------------ copiar
function copiar(botao, texto) {
  const feito = () => {
    const antes = botao.textContent;
    botao.textContent = "Copiado";
    botao.classList.add("feito");
    setTimeout(() => { botao.textContent = antes; botao.classList.remove("feito"); }, 1600);
  };
  const selecionar = () => {
    const alvo = botao.closest(".bloco-citar, .trecho, .materia")?.querySelector(".texto-citar, blockquote, a");
    if (!alvo) return;
    const r = document.createRange();
    r.selectNodeContents(alvo);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    botao.textContent = "Selecionado: use Ctrl+C";
  };
  try { navigator.clipboard.writeText(texto).then(feito, selecionar); } catch (e) { selecionar(); }
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-copiar]");
  if (b) copiar(b, b.dataset.copiar);
});

// -------------------------------------------------------------------- abas
const PAINEIS = ["estados", "comparativos", "falso", "materias", "consultar", "trechos", "cuidados"];
let abaAtual = null;
function abrir(id, rolar) {
  if (!PAINEIS.includes(id)) id = "estados";
  abaAtual = id;
  for (const p of PAINEIS) {
    document.getElementById("painel-" + p).hidden = p !== id;
    document.getElementById("aba-" + p).setAttribute("aria-selected", String(p === id));
  }
  try { history.replaceState(null, "", "#" + id); } catch (e) {}
  if (rolar) window.scrollTo({ top: 0 });
  desenharAba(id);
}
document.querySelectorAll(".aba").forEach((b) => b.addEventListener("click", () => abrir(b.dataset.alvo, true)));

// ---------------------------------------------------------- base do ECharts
const graficos = {};
function grafico(id) {
  const el = document.getElementById(id);
  if (!graficos[id]) graficos[id] = echarts.init(el, null, { renderer: "svg" });
  return graficos[id];
}
function base() {
  return {
    animationDuration: 400,
    textStyle: { fontFamily: "Archivo, system-ui, sans-serif", color: cor("--tinta-2") },
    tooltip: {
      backgroundColor: cor("--folha"), borderColor: cor("--fio-forte"), borderWidth: 1,
      textStyle: { color: cor("--tinta"), fontSize: 13 }, extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:8px;max-width:300px;white-space:normal;",
    },
  };
}
const eixoValor = (extra = {}) => ({
  type: "value",
  axisLine: { show: false }, axisTick: { show: false },
  splitLine: { lineStyle: { color: cor("--grade") } },
  axisLabel: { color: cor("--tinta-3"), fontFamily: "IBM Plex Mono, monospace", fontSize: 11, formatter: (v) => nf.format(v) },
  nameTextStyle: { color: cor("--tinta-3"), fontSize: 12 },
  ...extra,
});
const eixoCategoria = (dados, extra = {}) => ({
  type: "category", data: dados,
  axisLine: { lineStyle: { color: cor("--fio-forte") } }, axisTick: { show: false },
  axisLabel: { color: cor("--tinta-2"), fontSize: 12 },
  ...extra,
});
const rampa = () => [cor("--seq-1"), cor("--seq-2"), cor("--seq-3"), cor("--seq-4"), cor("--seq-5")];
const estreito = () => window.innerWidth < 640;

let mapaRegistrado = false;
function registrarMapa() {
  if (mapaRegistrado) return;
  const geo = JSON.parse(JSON.stringify(window.ESTADOS));
  geo.features.forEach((f) => { f.properties.name = f.properties.uf; });
  echarts.registerMap("BR", geo);
  mapaRegistrado = true;
}

// ================================================================ ESTADOS
const est = { ano: ULTIMO, crime: "total", medida: "taxa", sel: null };

function valoresEstados(ano = est.ano, crime = est.crime, medida = est.medida) {
  return ESTADOS.map((u) => {
    const r = ultima(u.uf, ano, crime);
    const ok = r && r.situacao === "informado";
    return { sigla: u.sigla, uf: u.uf, valor: ok ? r[medida] : null, registros: ok ? r.registros : null, taxa: ok ? r.taxa : null, situacao: r?.situacao };
  });
}
const rotuloMedida = () => (est.medida === "taxa" ? "por 100 mil hab." : "registros");
const fmtMedida = (v) => (v == null ? "não informado" : est.medida === "taxa" ? n1.format(v) : fmt(v));

function montarControlesEstados() {
  const caixa = document.getElementById("controles-estados");
  caixa.querySelector('[data-grupo="ano"]').innerHTML = ANOS.map((a) => `<button type="button" class="seg" data-valor="${a}">${a}</button>`).join("");
  caixa.addEventListener("click", (ev) => {
    const b = ev.target.closest(".seg"); if (!b) return;
    const g = b.parentElement.dataset.grupo;
    est[g] = g === "ano" ? +b.dataset.valor : b.dataset.valor;
    desenharEstados();
  });
}
function marcarControlesEstados() {
  document.querySelectorAll("#controles-estados [data-grupo]").forEach((g) => {
    g.querySelectorAll(".seg").forEach((b) => b.setAttribute("aria-pressed", String(String(est[g.dataset.grupo]) === b.dataset.valor)));
  });
}

function tooltipEstado(sigla) {
  const v = valoresEstados().find((x) => x.sigla === sigla);
  if (!v) return "";
  const ordenados = valoresEstados().filter((x) => x.valor != null).sort((a, b) => b.valor - a.valor);
  const pos = ordenados.findIndex((x) => x.sigla === sigla) + 1;
  let h = `<b>${esc(v.uf)}</b><br>`;
  if (v.valor == null) return h + "Não informa o eletrônico ao Anuário.";
  h += `${fmt(v.registros)} registros · ${n1.format(v.taxa)} por 100 mil<br>`;
  h += `<span style="color:${cor("--tinta-3")}">${pos}º de ${ordenados.length} em ${est.medida === "taxa" ? "taxa" : "número absoluto"}</span>`;
  if (est.crime === "eletronico" && quebra(sigla)) h += `<br><span style="color:${cor("--carimbo")}">Quebra de série em ${quebra(sigla).ano}</span>`;
  return h;
}

function desenharEstados() {
  marcarControlesEstados();
  registrarMapa();
  const vals = valoresEstados();
  const max = Math.max(...vals.map((v) => v.valor ?? 0));
  const nomeTipo = est.crime === "total" ? "Estelionato" : "Estelionato por meio eletrônico";
  document.getElementById("tit-mapa").textContent = `${nomeTipo}, ${est.ano}, ${rotuloMedida()}`;
  document.getElementById("tit-ranking").textContent = `Ranking dos estados, ${est.ano}`;
  const alerta = document.getElementById("alerta-eletronico");
  const cob = D.cobertura.find((c) => c.ano === est.ano);
  alerta.hidden = est.crime !== "eletronico";
  if (cob) alerta.innerHTML = `<b>${cob.ufs_sem_dado.map((s) => NOME[s]).join(", ")}</b> não informam o estelionato eletrônico em ${est.ano}. Eles somam ${pct(100 - cob.pct_total_coberto)} de todo o estelionato do país, por isso aparecem vazios.`;

  // Mapa
  const mapa = grafico("g-mapa");
  mapa.setOption({
    ...base(),
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => tooltipEstado(p.name) },
    visualMap: {
      type: "continuous", min: 0, max, calculable: false, orient: "horizontal", left: 8, bottom: 4, itemWidth: 12, itemHeight: 160,
      text: [fmtMedida(max), "0"], textStyle: { color: cor("--tinta-3"), fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
      inRange: { color: rampa() }, seriesIndex: 0,
    },
    series: [{
      type: "map", map: "BR", roam: false, aspectScale: 0.95, layoutCenter: ["50%", "46%"], layoutSize: "96%",
      selectedMode: "single",
      itemStyle: { areaColor: cor("--vazio"), borderColor: cor("--folha"), borderWidth: 1 },
      emphasis: { label: { show: true, color: cor("--tinta"), fontWeight: 700, fontFamily: "IBM Plex Mono, monospace" }, itemStyle: { borderColor: cor("--tinta"), borderWidth: 2, areaColor: null } },
      select: { label: { show: true, color: cor("--tinta"), fontWeight: 700 }, itemStyle: { borderColor: cor("--carimbo"), borderWidth: 2.5, areaColor: null } },
      label: { show: false },
      data: vals.map((v) => ({ name: v.sigla, value: v.valor ?? undefined, selected: v.sigla === est.sel })),
    }],
  }, true);

  // Ranking
  const ord = [...vals].sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1));
  const rank = grafico("g-ranking");
  const cat = ord.map((v) => (estreito() ? v.sigla : v.uf));
  rank.setOption({
    ...base(),
    grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => tooltipEstado(ord[p.dataIndex].sigla) },
    xAxis: eixoValor({ show: false, max: max * 1.02 }),
    yAxis: eixoCategoria(cat, { inverse: true, axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0 } }),
    series: [{
      type: "bar", barWidth: "64%",
      data: ord.map((v) => ({
        value: v.valor ?? 0,
        itemStyle: { color: v.sigla === est.sel ? cor("--carimbo") : cor("--serie-1"), borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: v.valor == null ? cor("--tinta-3") : cor("--tinta"), fontFamily: "IBM Plex Mono, monospace", fontSize: 11, formatter: () => (v.valor == null ? "não informa" : fmtMedida(v.valor)) },
      })),
      emphasis: { itemStyle: { color: cor("--seq-5") } },
    }],
  }, true);

  // Ligação mapa ↔ ranking
  mapa.off("mouseover"); mapa.off("mouseout"); mapa.off("click");
  rank.off("mouseover"); rank.off("mouseout"); rank.off("click");
  const idx = (sigla) => ord.findIndex((v) => v.sigla === sigla);
  mapa.on("mouseover", (p) => { if (idx(p.name) >= 0) rank.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: idx(p.name) }); });
  mapa.on("mouseout", (p) => { if (idx(p.name) >= 0) rank.dispatchAction({ type: "downplay", seriesIndex: 0, dataIndex: idx(p.name) }); });
  rank.on("mouseover", (p) => mapa.dispatchAction({ type: "highlight", seriesIndex: 0, name: ord[p.dataIndex].sigla }));
  rank.on("mouseout", (p) => mapa.dispatchAction({ type: "downplay", seriesIndex: 0, name: ord[p.dataIndex].sigla }));
  mapa.on("click", (p) => selecionarEstado(p.name));
  rank.on("click", (p) => selecionarEstado(ord[p.dataIndex].sigla));

  desenharCalor();
  fichaEstado();
}

function selecionarEstado(sigla) {
  est.sel = est.sel === sigla ? null : sigla;
  desenharEstados();
  if (est.sel) document.getElementById("ficha-estado").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Desenho do estado: projeção equirretangular com correção do cosseno da latitude.
function silhueta(sigla) {
  const f = window.ESTADOS.features.find((x) => x.properties.uf === sigla);
  if (!f) return "";
  const polis = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const pts = polis.flat(2);
  const lats = pts.map((p) => p[1]);
  const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180);
  const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => -p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const L = 200, esc_ = L / Math.max(x1 - x0, y1 - y0);
  const w = (x1 - x0) * esc_, h = (y1 - y0) * esc_;
  const d = polis.map((pol) => pol.map((anel) => anel.map((p, i) => `${i ? "L" : "M"}${((p[0] * k - x0) * esc_).toFixed(1)},${((-p[1] - y0) * esc_).toFixed(1)}`).join("") + "Z").join("")).join("");
  return `<svg viewBox="-4 -4 ${w + 8} ${h + 8}" role="img" aria-label="Contorno de ${esc(NOME[sigla])}"><path d="${d}"/></svg>`;
}

function fichaEstado() {
  const el = document.getElementById("ficha-estado");
  if (!est.sel) { el.innerHTML = ""; return; }
  const s = est.sel, uf = NOME[s];
  const vals = valoresEstados().filter((v) => v.valor != null).sort((a, b) => b.valor - a.valor);
  const pos = vals.findIndex((v) => v.sigla === s) + 1;
  const t = ultima(uf, est.ano, "total"), e = ultima(uf, est.ano, "eletronico");
  const atual = est.crime === "total" ? t : e;
  const ok = atual && atual.situacao === "informado";
  const tj = FA.vieira.tribunais.find((x) => x.sigla === s);
  const oab = FA.denuncias_oab.find((x) => x.sigla === s);
  const q = quebra(s);
  const serie = ANOS.map((a) => { const r = ultima(uf, a, est.crime); return r && r.situacao === "informado" ? r.registros : null; });
  const maxS = Math.max(...serie.filter((v) => v != null), 1);
  const barras = `<svg viewBox="0 0 250 90" role="img" aria-label="Série 2021 a 2025">${serie.map((v, i) => {
    const x = 10 + i * 48;
    const sel = ANOS[i] === est.ano;
    if (v == null) return `<rect x="${x}" y="58" width="30" height="16" rx="3" fill="none" stroke="${cor("--fio-forte")}" stroke-dasharray="3 3"/><text x="${x + 15}" y="88" text-anchor="middle" font-size="10" fill="${cor("--tinta-3")}" font-family="IBM Plex Mono">${ANOS[i]}</text>`;
    const h = (v / maxS) * 62;
    return `<rect x="${x}" y="${74 - h}" width="30" height="${h}" rx="3" fill="${sel ? cor("--serie-1") : cor("--seq-2")}"><title>${ANOS[i]}: ${fmt(v)}</title></rect><text x="${x + 15}" y="88" text-anchor="middle" font-size="10" fill="${sel ? cor("--tinta") : cor("--tinta-3")}" font-family="IBM Plex Mono">${ANOS[i]}</text>`;
  }).join("")}</svg>`;
  el.innerHTML = `
    <div class="silhueta">${silhueta(s)}<div class="sigla">${s}</div></div>
    <div>
      <h3>${esc(uf)}</h3>
      <div class="carimbos">${ok ? `<span class="carimbo c-neutro">${pos}º de ${vals.length} · ${est.medida === "taxa" ? "taxa" : "absoluto"}</span>` : `<span class="carimbo c-alerta">Não informa o eletrônico</span>`}${est.crime === "eletronico" && q ? `<span class="carimbo c-alerta">Quebra de série em ${q.ano}</span>` : ""}</div>
      <div class="linha-num"><span class="num">${ok ? fmt(atual.registros) : "–"}</span><span class="det">${ok ? n1.format(atual.taxa) + " por 100 mil" : ""}</span></div>
      <p class="dica">${CRIME_NOME[est.crime]}, ${est.ano}. Série do mesmo tipo:</p>
      ${barras}
    </div>
    <div>
      <p class="rot-bloco">Comparações</p>
      <dl>
        <dt>Estelionato total</dt><dd>${fmt(t?.registros)}</dd>
        <dt>Eletrônico</dt><dd>${e && e.situacao === "informado" ? fmt(e.registros) : "não informa"}</dd>
        <dt>Parte eletrônica</dt><dd>${e && e.situacao === "informado" ? pct(100 * e.registros / t.registros) : "–"}</dd>
        <dt>Acórdãos do falso advogado (2023–25)</dt><dd>${tj ? fmt(tj.total) : "fora do top 10"}</dd>
        <dt>Denúncias à OAB</dt><dd>${oab ? (oab.mais_de ? "mais de " : "") + fmt(oab.valor) : "sem dado público"}</dd>
      </dl>
      ${q && est.crime === "eletronico" ? `<p class="dica" style="margin-top:10px">${esc(q.motivo)}.</p>` : ""}
      <div class="acoes">
        <button type="button" class="botao" id="ir-consulta">Abrir ficha de citação</button>
        <button type="button" class="botao" id="fechar-ficha">Fechar</button>
      </div>
    </div>`;
  el.querySelector("#ir-consulta").addEventListener("click", () => { con.uf = uf; con.ano = est.ano; con.crime = est.crime; abrir("consultar", true); });
  el.querySelector("#fechar-ficha").addEventListener("click", () => { est.sel = null; desenharEstados(); });
}

function desenharCalor() {
  const ordem = valoresEstados(ULTIMO).sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1)).map((v) => v.sigla);
  const dados = [];
  let max = 0;
  ordem.forEach((s, y) => ANOS.forEach((a, x) => {
    const r = ultima(NOME[s], a, est.crime);
    const v = r && r.situacao === "informado" ? r[est.medida] : -1;
    if (v > max) max = v;
    dados.push({ value: [x, y, v] });
  }));
  // Texto claro nas células escuras: a rampa escurece com o valor no tema claro e clareia no escuro.
  const escuroNoAlto = !temaEscuro();
  // Célula clara recebe tinta escura fixa; célula escura, branco. No tema escuro a rampa se inverte.
  dados.forEach((d) => { const alto = d.value[2] > max * 0.55; d.label = { color: d.value[2] < 0 ? cor("--tinta-3") : (alto === escuroNoAlto ? "#ffffff" : "#14202b") }; });
  document.getElementById("sub-calor").textContent = `${est.crime === "total" ? "Estelionato total" : "Estelionato eletrônico"}, ${rotuloMedida().replace(/\.$/, "")}. Estados ordenados pelo valor de ${ULTIMO}. Cinza: não informado.`;
  const g = grafico("g-calor");
  g.setOption({
    ...base(),
    grid: { left: 8, right: 16, top: 8, bottom: 60, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => `<b>${esc(NOME[ordem[p.value[1]]])}</b>, ${ANOS[p.value[0]]}<br>${p.value[2] < 0 ? "não informado" : fmtMedida(p.value[2]) + " " + rotuloMedida()}` },
    xAxis: eixoCategoria(ANOS.map(String), { position: "top", splitArea: { show: false } }),
    yAxis: eixoCategoria(ordem.map((s) => (estreito() ? s : NOME[s])), { inverse: true, axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0 } }),
    visualMap: {
      min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemWidth: 12, itemHeight: 200,
      text: [fmtMedida(max), "0"], textStyle: { color: cor("--tinta-3"), fontSize: 11 },
      inRange: { color: rampa() }, outOfRange: { color: cor("--vazio") },
    },
    series: [{
      type: "heatmap", data: dados,
      itemStyle: { borderColor: cor("--folha"), borderWidth: 2, borderRadius: 3 },
      label: { show: !estreito(), fontSize: 10, fontFamily: "IBM Plex Mono, monospace", formatter: (p) => (p.value[2] < 0 ? "n/i" : est.medida === "taxa" ? nf.format(p.value[2]) : (p.value[2] / 1000).toFixed(p.value[2] < 10000 ? 1 : 0).replace(".", ",") + " mil") },
      emphasis: { itemStyle: { borderColor: cor("--tinta"), borderWidth: 2 } },
    }],
  }, true);
}

// ============================================================ COMPARATIVOS
function desenharComparativos() {
  const cob = D.cobertura.find((c) => c.ano === ULTIMO);
  const part = ESTADOS.map((u) => {
    const t = ultima(u.uf, ULTIMO, "total"), e = ultima(u.uf, ULTIMO, "eletronico");
    const inf = e && e.situacao === "informado";
    return { sigla: u.sigla, uf: u.uf, total: t.registros, taxa: t.taxa, eletr: inf ? e.registros : null, taxaE: inf ? e.taxa : null, pctE: inf ? 100 * e.registros / t.registros : null };
  });
  const comE = part.filter((p) => p.pctE != null);
  const maiorE = comE.reduce((a, b) => (b.pctE > a.pctE ? b : a)), menorE = comE.reduce((a, b) => (b.pctE < a.pctE ? b : a));
  document.getElementById("destaques-comp").innerHTML = [
    [pct(cob.pct_eletronico_entre_informantes), `do estelionato é eletrônico nos ${cob.ufs_que_informam} estados que informam (${ULTIMO})`, `Dividindo pelo total do país daria ${pct(cob.pct_eletronico_ingenuo)}, porque SP, RJ e CE não separam o eletrônico.`],
    [pct(100 - cob.pct_total_coberto), "do estelionato do país está em estados que não informam o eletrônico", cob.ufs_sem_dado.join(", ")],
    [`${n1.format(maiorE.pctE / menorE.pctE)}×`, `é a diferença entre ${maiorE.uf} (${pct(maiorE.pctE)}) e ${menorE.uf} (${pct(menorE.pctE)}) na parte eletrônica`, "Uma variação dessas é também o jeito de cada polícia classificar o boletim."],
  ].map(([v, r, d]) => `<div class="destaque"><div class="valor">${v}</div><div class="rot">${esc(r)}</div><div class="det">${esc(d)}</div></div>`).join("");

  // Empilhado total × eletrônico (taxa)
  const ord = [...part].sort((a, b) => (b.pctE ?? -1) - (a.pctE ?? -1));
  document.getElementById("tit-empilhado").textContent = `Estelionato por 100 mil hab., ${ULTIMO}: parte eletrônica e o restante`;
  const emp = grafico("g-empilhado");
  emp.setOption({
    ...base(),
    legend: { top: 0, left: 0, textStyle: { color: cor("--tinta-2") }, itemWidth: 12, itemHeight: 12, data: ["Eletrônico", "Demais estelionatos", "Total (não separa)"] },
    grid: { left: 8, right: 64, top: 36, bottom: 30, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => {
      const p = ord[ps[0].dataIndex];
      return `<b>${esc(p.uf)}</b><br>Total: ${n1.format(p.taxa)} por 100 mil (${fmt(p.total)})<br>` + (p.pctE == null ? "Não separa o eletrônico" : `Eletrônico: ${n1.format(p.taxaE)} por 100 mil (${fmt(p.eletr)}), ${pct(p.pctE)}`);
    } },
    xAxis: eixoValor({ name: "estelionatos por 100 mil hab.", nameLocation: "middle", nameGap: 26 }),
    yAxis: eixoCategoria(ord.map((p) => (estreito() ? p.sigla : p.uf)), { inverse: true, axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0 } }),
    series: [
      { name: "Eletrônico", type: "bar", stack: "t", barWidth: "62%", itemStyle: { color: cor("--serie-1") }, data: ord.map((p) => p.taxaE) },
      { name: "Demais estelionatos", type: "bar", stack: "t", itemStyle: { color: cor("--serie-2"), borderRadius: [0, 4, 4, 0] },
        data: ord.map((p) => (p.pctE == null ? null : p.taxa - p.taxaE)),
        label: { show: true, position: "right", fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: cor("--tinta"), formatter: (x) => pct(ord[x.dataIndex].pctE) } },
      { name: "Total (não separa)", type: "bar", stack: "t", itemStyle: { color: cor("--vazio"), borderColor: cor("--tinta-3"), borderType: "dashed", borderWidth: 1, borderRadius: [0, 4, 4, 0] },
        data: ord.map((p) => (p.pctE == null ? p.taxa : null)),
        label: { show: true, position: "right", fontSize: 11, color: cor("--tinta-3"), formatter: "não separa" } },
    ],
  }, true);

  // Dispersão
  document.getElementById("tit-dispersao").textContent = `Taxa de estelionato × parte eletrônica, ${ULTIMO}`;
  const maxReg = Math.max(...comE.map((p) => p.total));
  const disp = grafico("g-dispersao");
  disp.setOption({
    ...base(),
    grid: { left: 24, right: 24, top: 16, bottom: 36, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => { const d = comE[p.dataIndex]; return `<b>${esc(d.uf)}</b><br>${n1.format(d.taxa)} estelionatos por 100 mil<br>${pct(d.pctE)} registrados como eletrônicos<br>${fmt(d.total)} registros`; } },
    xAxis: eixoValor({ name: "estelionatos por 100 mil hab.", nameLocation: "middle", nameGap: 28, scale: true }),
    yAxis: eixoValor({ name: "% eletrônico", nameLocation: "middle", nameGap: 40, nameRotate: 90, min: 0, max: 80, axisLabel: { formatter: (v) => v + "%", color: cor("--tinta-3"), fontSize: 11 } }),
    series: [{
      type: "scatter",
      data: comE.map((p) => [p.taxa, p.pctE]),
      symbolSize: (v, p) => 8 + 30 * Math.sqrt(comE[p.dataIndex].total / maxReg),
      itemStyle: { color: cor("--serie-1"), opacity: 0.8, borderColor: cor("--folha"), borderWidth: 1.5 },
      label: { show: true, position: "right", fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: cor("--tinta-2"), formatter: (p) => comE[p.dataIndex].sigla },
      labelLayout: { hideOverlap: true },
      emphasis: { itemStyle: { color: cor("--seq-5"), opacity: 1 } },
    }],
  }, true);

  // Crescimento publicado × base fixa
  const bf = D.base_fixa.filter((b) => b.cresc_publicado_pct != null);
  document.getElementById("sub-cresc").textContent = `Base fixa: os ${bf[0].ufs_na_base} estados que informam desde ${D.base_fixa[0].ano}, sem quebra de série (${bf[0].ufs.join(", ")}).`;
  const cr = grafico("g-cresc");
  cr.setOption({
    ...base(),
    legend: { top: 0, left: 0, textStyle: { color: cor("--tinta-2") }, itemWidth: 12, itemHeight: 12 },
    grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => `<b>${bf[ps[0].dataIndex].ano - 1} → ${bf[ps[0].dataIndex].ano}</b><br>` + ps.map((p) => `${p.marker}${p.seriesName}: ${pct(p.value, true)}`).join("<br>") },
    xAxis: eixoCategoria(bf.map((b) => `${b.ano - 1}→${b.ano}`)),
    yAxis: eixoValor({ axisLabel: { formatter: (v) => v + "%", color: cor("--tinta-3"), fontSize: 11 } }),
    series: [
      { name: "Total publicado", type: "bar", barGap: "8%", itemStyle: { color: cor("--serie-2"), borderRadius: [4, 4, 0, 0] }, data: bf.map((b) => b.cresc_publicado_pct),
        label: { show: true, position: "top", fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: cor("--tinta"), formatter: (p) => pct(p.value, true) } },
      { name: "Mesma base de estados", type: "bar", itemStyle: { color: cor("--serie-1"), borderRadius: [4, 4, 0, 0] }, data: bf.map((b) => b.cresc_base_fixa_pct),
        label: { show: true, position: "top", fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: cor("--tinta"), formatter: (p) => pct(p.value, true) } },
    ],
  }, true);

  // Série nacional
  const sn = D.serie_nacional;
  const se = grafico("g-serie");
  se.setOption({
    ...base(),
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const s = sn[ps[0].dataIndex]; return `<b>${s.ano}</b><br>${fmt(s.registros)} registros` + (s.primeira_publicacao !== s.registros ? `<br><span style="color:${cor("--tinta-3")}">Primeira publicação: ${fmt(s.primeira_publicacao)} (ed. ${s.primeira_edicao})</span>` : ""); } },
    xAxis: eixoCategoria(sn.map((s) => String(s.ano))),
    yAxis: eixoValor({ axisLabel: { formatter: (v) => (v / 1e6).toFixed(1).replace(".", ",") + " mi", color: cor("--tinta-3"), fontSize: 11 } }),
    series: [{ type: "bar", barWidth: "56%", itemStyle: { color: cor("--serie-1"), borderRadius: [4, 4, 0, 0] }, data: sn.map((s) => s.registros),
      label: { show: true, position: "top", fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: cor("--tinta"), formatter: (p) => (p.dataIndex === 0 || p.dataIndex === sn.length - 1 ? (p.value / 1e6).toFixed(2).replace(".", ",") + " mi" : "") } }],
  }, true);

  // Funil
  const f = D.funil[D.funil.length - 1];
  document.getElementById("funil").innerHTML = [
    [fmt(f.boletins), `boletins de ocorrência de estelionato, ${f.ano}`, "Anuário 2026, Quadro 04 (p. 125)"],
    [fmt(f.processos), "processos penais por estelionato", `${n1.format(f.processos_por_100_boletins)} para cada 100 boletins`],
    [fmt(f.presos), "presos por estelionato", `${n1.format(f.presos_por_100_boletins)} para cada 100 boletins`],
  ].map(([v, r, d]) => `<div class="destaque"><div class="valor">${v}</div><div class="rot">${r}</div><div class="det">${d}</div></div>`).join("");
}

// ========================================================== FALSO ADVOGADO
const disp = { crime: "total" };
function desenharFalso() {
  const V = FA.vieira;
  const totalAc = V.anuais.reduce((s, a) => s + a.acordaos, 0);
  document.getElementById("destaques-falso").innerHTML =
    [{ valor: totalAc, rotulo: "acórdãos sobre o golpe nos Tribunais de Justiça, 2023–2025", detalhe: `${V.anuais.map((a) => `${a.ano}: ${a.acordaos}`).join(" · ")}. Cresceu ${pct(100 * (V.anuais[2].acordaos / V.anuais[1].acordaos - 1), true)} de 2024 para 2025.`, fonte: "Vieira (2026), p. 545-546", url: null },
     ...FA.indicadores]
      .map((i) => {
        const v = i.unidade === "bi" ? `R$ ${n1.format(i.valor)} bi` : i.unidade === "%" ? pct(i.valor) : fmt(i.valor);
        return `<div class="destaque"><div class="valor">${v}</div><div class="rot">${esc(i.rotulo)}</div><div class="det">${esc(i.detalhe)}</div><div class="fonte">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.fonte)}</a>` : esc(i.fonte)}</div></div>`;
      }).join("");

  // Mapa dos acórdãos
  registrarMapa();
  const porSigla = Object.fromEntries(V.tribunais.map((t) => [t.sigla, t]));
  const mapa = grafico("g-mapa-falso");
  mapa.setOption({
    ...base(),
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => {
      const t = porSigla[p.name];
      return `<b>${esc(NOME[p.name])}</b><br>` + (t ? `${t.tj}: ${t.total} acórdãos<br>2023: ${t.a2023} · 2024: ${t.a2024} · 2025: ${t.a2025}<br>${n1.format(t.total / POP[p.name] * 1e6)} por milhão de hab.` : "Fora dos 10 tribunais listados no artigo");
    } },
    visualMap: { type: "continuous", min: 0, max: 175, orient: "horizontal", left: 8, bottom: 4, itemWidth: 12, itemHeight: 140, text: ["175", "0"], textStyle: { color: cor("--tinta-3"), fontSize: 11 }, inRange: { color: rampa() }, seriesIndex: 0 },
    series: [{
      type: "map", map: "BR", roam: false, aspectScale: 0.95, layoutCenter: ["50%", "46%"], layoutSize: "96%",
      itemStyle: { areaColor: cor("--vazio"), borderColor: cor("--folha"), borderWidth: 1 },
      emphasis: { label: { show: true, color: cor("--tinta"), fontWeight: 700 }, itemStyle: { borderColor: cor("--tinta"), borderWidth: 2, areaColor: null } },
      label: { show: false },
      data: ESTADOS.map((u) => ({ name: u.sigla, value: porSigla[u.sigla]?.total })),
    }],
  }, true);

  // Barras empilhadas por tribunal
  const anosV = ["a2023", "a2024", "a2025"];
  const coresAno = [cor("--seq-2"), cor("--seq-3"), cor("--seq-5")];
  document.getElementById("leg-tj").innerHTML = ["2023", "2024", "2025"].map((a, i) => `<span><i style="background:${coresAno[i]}"></i>${a}</span>`).join("");
  const tj = grafico("g-tj");
  tj.setOption({
    ...base(),
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const t = V.tribunais[ps[0].dataIndex]; return `<b>${t.tj}</b> (${t.regiao})<br>2023: ${t.a2023} · 2024: ${t.a2024} · 2025: ${t.a2025}<br>Total no artigo: <b>${t.total}</b>` + (t.a2023 + t.a2024 + t.a2025 !== t.total ? `<br><span style="color:${cor("--carimbo")}">A soma dos anos dá ${t.a2023 + t.a2024 + t.a2025}</span>` : ""); } },
    xAxis: eixoCategoria(V.tribunais.map((t) => t.tj), { axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0, rotate: estreito() ? 45 : 0 } }),
    yAxis: eixoValor(),
    series: anosV.map((k, i) => ({
      name: ["2023", "2024", "2025"][i], type: "bar", stack: "a", barWidth: "58%",
      itemStyle: { color: coresAno[i], borderColor: cor("--folha"), borderWidth: 1, borderRadius: i === 2 ? [4, 4, 0, 0] : 0 },
      data: V.tribunais.map((t) => t[k]),
      label: i === 2 ? { show: true, position: "top", fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: cor("--tinta"), formatter: (p) => V.tribunais[p.dataIndex].total } : undefined,
    })),
  }, true);

  // Dispersão estado: estelionato × acórdãos por milhão
  document.querySelectorAll("#seg-disp-falso .seg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === disp.crime)));
  const pts = V.tribunais.map((t) => {
    const r = ultima(NOME[t.sigla], ULTIMO, disp.crime);
    return { ...t, x: r && r.situacao === "informado" ? r.taxa : null, y: t.total / POP[t.sigla] * 1e6 };
  });
  const validos = pts.filter((p) => p.x != null), fora = pts.filter((p) => p.x == null);
  const dg = grafico("g-disp-falso");
  dg.setOption({
    ...base(),
    grid: { left: 24, right: 32, top: 28, bottom: 40, containLabel: true },
    title: fora.length ? { text: `${fora.map((p) => p.tj).join(", ")} fora: o estado não informa o eletrônico`, right: 0, top: 0, textStyle: { fontSize: 12, fontWeight: 400, color: cor("--tinta-3") } } : undefined,
    tooltip: { ...base().tooltip, formatter: (p) => { const d = validos[p.dataIndex]; return `<b>${esc(NOME[d.sigla])}</b> (${d.tj})<br>${n1.format(d.x)} estelionatos${disp.crime === "eletronico" ? " eletrônicos" : ""} por 100 mil (${ULTIMO})<br>${d.total} acórdãos, ${n1.format(d.y)} por milhão de hab.`; } },
    xAxis: eixoValor({ name: `estelionato${disp.crime === "eletronico" ? " eletrônico" : ""} por 100 mil hab., ${ULTIMO}`, nameLocation: "middle", nameGap: 28, scale: true }),
    yAxis: eixoValor({ name: "acórdãos por milhão de hab.", nameLocation: "middle", nameGap: 40, nameRotate: 90, axisLabel: { formatter: (v) => n1.format(v), color: cor("--tinta-3"), fontSize: 11 } }),
    series: [{
      type: "scatter", data: validos.map((p) => [p.x, p.y]), symbolSize: 14,
      itemStyle: { color: cor("--serie-2"), borderColor: cor("--folha"), borderWidth: 1.5 },
      label: { show: true, position: "right", fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: cor("--tinta-2"), formatter: (p) => validos[p.dataIndex].sigla },
    }],
  }, true);

  // Denúncias à OAB
  const oab = [...FA.denuncias_oab].sort((a, b) => b.valor - a.valor);
  const og = grafico("g-oab");
  og.setOption({
    ...base(),
    grid: { left: 8, right: estreito() ? 120 : 300, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => { const o = oab[p.dataIndex]; return `<b>${o.seccional}</b><br>${o.mais_de ? "mais de " : ""}${fmt(o.valor)} denúncias<br>${esc(o.periodo)}<br><span style="color:${cor("--tinta-3")}">${esc(o.fonte)}</span>`; } },
    xAxis: eixoValor({ show: false }),
    yAxis: eixoCategoria(oab.map((o) => o.seccional), { inverse: true }),
    series: [{ type: "bar", barWidth: "56%", itemStyle: { color: cor("--serie-2"), borderRadius: [0, 4, 4, 0] }, data: oab.map((o) => o.valor),
      label: { show: true, position: "right", fontSize: 11, color: cor("--tinta"), formatter: (p) => { const o = oab[p.dataIndex]; return `{n|${o.mais_de ? "+" : ""}${fmt(o.valor)}}  {p|${estreito() ? "" : o.periodo}}`; },
        rich: { n: { fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: cor("--tinta") }, p: { color: cor("--tinta-3"), fontSize: 11 } } } }],
  }, true);
  og.off("click");
  og.on("click", (p) => window.open(oab[p.dataIndex].url, "_blank", "noopener"));

  // Índice 2023 = 100
  const anosI = [2023, 2024, 2025];
  const totBR = anosI.map((a) => D.serie_nacional.find((s) => s.ano === a).registros);
  const elet = anosI.map((a) => D.base_fixa.find((b) => b.ano === a).base_fixa);
  const ac = V.anuais.map((a) => a.acordaos);
  const idx = (arr) => arr.map((v) => 100 * v / arr[0]);
  const seriesI = [
    ["Estelionato no Brasil (Anuário)", totBR, cor("--serie-1")],
    ["Estelionato eletrônico, mesma base de estados (Anuário)", elet, cor("--serie-3")],
    ["Acórdãos do falso advogado (Vieira)", ac, cor("--serie-2")],
  ];
  document.getElementById("leg-indice").innerHTML = seriesI.map(([n, , c]) => `<span><i class="linha" style="background:${c}"></i>${n}</span>`).join("");
  const ig = grafico("g-indice");
  ig.setOption({
    ...base(),
    grid: { left: 8, right: 56, top: 16, bottom: 8, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", formatter: (ps) => `<b>${anosI[ps[0].dataIndex]}</b><br>` + ps.map((p) => `${p.marker}${p.seriesName}: ${n1.format(p.value)} (${fmt(seriesI[p.seriesIndex][1][p.dataIndex])})`).join("<br>") },
    xAxis: eixoCategoria(anosI.map(String), { boundaryGap: false }),
    yAxis: eixoValor({ min: 80, axisLabel: { formatter: (v) => nf.format(v), color: cor("--tinta-3"), fontSize: 11 } }),
    series: seriesI.map(([n, arr, c]) => ({
      name: n, type: "line", data: idx(arr), symbol: "circle", symbolSize: 8, lineStyle: { width: 2, color: c }, itemStyle: { color: c, borderColor: cor("--folha"), borderWidth: 2 },
      endLabel: { show: true, formatter: (p) => n1.format(p.value), color: cor("--tinta"), fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
    })),
  }, true);

  // Região × ano
  const regs = V.regioes;
  const dadosR = [];
  const escR = !temaEscuro();
  regs.forEach((r, y) => ["a2023", "a2024", "a2025"].forEach((k, x) => dadosR.push({ value: [x, y, r[k]], label: { color: (r[k] > 100) === escR ? "#ffffff" : "#14202b" } })));
  const rg = grafico("g-regiao");
  rg.setOption({
    ...base(),
    grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => `<b>${regs[p.value[1]].regiao}</b>, ${2023 + p.value[0]}<br>${p.value[2]} acórdãos` },
    xAxis: eixoCategoria(["2023", "2024", "2025"], { position: "top" }),
    yAxis: eixoCategoria(regs.map((r) => r.regiao), { inverse: true }),
    visualMap: { min: 0, max: 190, orient: "horizontal", left: "center", bottom: 4, itemWidth: 12, itemHeight: 160, text: ["190", "0"], textStyle: { color: cor("--tinta-3"), fontSize: 11 }, inRange: { color: rampa() } },
    series: [{ type: "heatmap", data: dadosR, itemStyle: { borderColor: cor("--folha"), borderWidth: 3, borderRadius: 4 },
      label: { show: true, fontSize: 13, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 } }],
  }, true);

  // Escala de quadradinhos em SP
  const spBO = ultima("São Paulo", ULTIMO, "total").registros;
  const spOAB = FA.denuncias_oab.find((o) => o.sigla === "SP").valor;
  const spTJ = V.tribunais.find((t) => t.sigla === "SP").total;
  const UN = 1000;
  const quadros = (n) => {
    const cheios = Math.floor(n / UN), resto = (n % UN) / UN;
    return `<div class="quadros">${"<i></i>".repeat(cheios)}${resto > 0 ? `<i class="frac" style="--p:${Math.max(4, resto * 100)}%"></i>` : ""}<em>${n < UN ? n1.format(n / UN).replace(",0", "") + " de quadrado" : ""}</em></div>`;
  };
  document.getElementById("escala-sp").innerHTML = `<div class="escala">
    <p class="dica">1 quadrado = ${fmt(UN)} casos.</p>
    <div class="escala-linha"><div class="escala-rot"><b>${fmt(spBO)}</b>boletins de estelionato em SP, ${ULTIMO} (Anuário)</div>${quadros(spBO)}</div>
    <div class="escala-linha"><div class="escala-rot"><b>${fmt(spOAB)}</b>denúncias de falso advogado à OAB-SP, ~1,5 ano até fev./2026</div>${quadros(spOAB)}</div>
    <div class="escala-linha"><div class="escala-rot"><b>${fmt(spTJ)}</b>acórdãos sobre o golpe no TJSP, 2023–2025 (Vieira)</div>${quadros(spTJ)}</div>
    <p class="dica">Os períodos e o que cada número conta são diferentes. A figura mostra a ordem de grandeza: o falso advogado que chega à OAB e ao tribunal é uma fração mínima do estelionato registrado, e o Anuário não diz quanto do estelionato é falso advogado.</p>
  </div>`;

  // Nota sobre as tabelas do Vieira
  const incons = V.tribunais.filter((t) => t.a2023 + t.a2024 + t.a2025 !== t.total).map((t) => `${t.tj}: ${t.a2023} + ${t.a2024} + ${t.a2025} = ${t.a2023 + t.a2024 + t.a2025}, mas o total impresso é ${t.total}`);
  const inconsR = V.regioes.filter((r) => r.a2023 + r.a2024 + r.a2025 !== r.total).map((r) => `${r.regiao}: soma ${r.a2023 + r.a2024 + r.a2025}, total impresso ${r.total}`);
  const somaAno = ["a2023", "a2024", "a2025"].map((k) => V.regioes.reduce((s, r) => s + r[k], 0));
  document.getElementById("nota-vieira").innerHTML = `
    <h4>Antes de citar as tabelas de Vieira (2026)</h4>
    <p>Somando as linhas, algumas não fecham com os totais impressos no próprio artigo:</p>
    <ul>${[...incons, ...inconsR].map((x) => `<li>${esc(x)}</li>`).join("")}
      <li>Somando as regiões por ano dá ${somaAno.join(", ")}; o Gráfico 1 diz ${V.anuais.map((a) => a.acordaos).join(", ")}.</li></ul>
    <p style="margin-top:8px">Os gráficos desta página usam os números como estão impressos. No texto do TCC, cite os totais (que batem com as frases do artigo: 378 nos três maiores tribunais, 512 de 693 no Nordeste e Sudeste) e, se usar os anos, mencione a diferença.</p>`;
}
document.getElementById("seg-disp-falso").addEventListener("click", (ev) => { const b = ev.target.closest(".seg"); if (!b) return; disp.crime = b.dataset.valor; desenharFalso(); });

// ================================================================ MATÉRIAS
const mat = { grupo: "todos", busca: "" };
function referenciaMateria(m) {
  return `${m.veiculo.replace(/ \(opinião\)$/, "").toUpperCase()}. ${m.titulo}. ${dataBR(m.data)}. Disponível em: ${m.url}. ${ACESSO}`;
}
function montarMaterias() {
  const grupos = [...new Set(FA.materias.map((m) => m.grupo))];
  document.getElementById("n-materias").textContent = FA.materias.length;
  const caixa = document.getElementById("chips-materias");
  caixa.innerHTML = [["todos", FA.materias.length], ...grupos.map((g) => [g, FA.materias.filter((m) => m.grupo === g).length])]
    .map(([g, n]) => `<button type="button" class="chip" data-grupo="${esc(g)}">${g === "todos" ? "Todas" : esc(g)}<span class="n">${n}</span></button>`).join("");
  caixa.addEventListener("click", (ev) => { const b = ev.target.closest("[data-grupo]"); if (!b) return; mat.grupo = b.dataset.grupo; materias(); });
  document.getElementById("busca-materias").addEventListener("input", (ev) => { mat.busca = ev.target.value; materias(); });
}
function materias() {
  document.querySelectorAll("#chips-materias .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.grupo === mat.grupo)));
  const termo = mat.busca.trim().toLowerCase();
  const lista = FA.materias.filter((m) => (mat.grupo === "todos" || m.grupo === mat.grupo) && (!termo || `${m.titulo} ${m.veiculo} ${m.resumo}`.toLowerCase().includes(termo)));
  const caixa = document.getElementById("lista-materias");
  if (!lista.length) { caixa.innerHTML = `<p class="dica">Nenhuma matéria com "${esc(mat.busca)}".</p>`; return; }
  const grupos = [...new Set(lista.map((m) => m.grupo))];
  caixa.innerHTML = grupos.map((g) => `<section class="grupo-materias"><h3>${esc(g)}</h3><ul class="lista-materias">${
    lista.filter((m) => m.grupo === g).sort((a, b) => b.data.localeCompare(a.data)).map((m) => `<li class="materia">
      <time datetime="${m.data}">${dataBR(m.data)}</time>
      <div>
        <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.titulo)}</a>
        <div class="meta"><span>${esc(m.veiculo)}</span>${m.no_tcc ? `<span class="carimbo c-ok">Já nas suas fontes</span>` : `<span class="carimbo c-neutro">Nova</span>`}</div>
        <p>${esc(m.resumo)}</p>
        <button type="button" class="botao copiar-ref" data-copiar="${esc(referenciaMateria(m))}">Copiar referência</button>
      </div>
    </li>`).join("")}</ul></section>`).join("");
}

// =============================================================== CONSULTAR
const con = { uf: "Minas Gerais", ano: ULTIMO, crime: "eletronico" };
try { const s = JSON.parse(localStorage.getItem("golpe-em-registro") || "{}"); for (const k of ["uf", "ano", "crime"]) if (s[k] != null) con[k] = s[k]; } catch (e) {}
const guardar = () => { try { localStorage.setItem("golpe-em-registro", JSON.stringify(con)); } catch (e) {} };
const referencia = (e) => `${AUTOR}. ${edicao(e).titulo}. São Paulo: Fórum Brasileiro de Segurança Pública, ${e}. Disponível em: ${edicao(e).url}. ${ACESSO}`;
const referenciaCapitulo = (e) => { const c = D.capitulos[String(e)]; return `${c.autores}. ${c.titulo}. In: ${AUTOR}. ${edicao(e).titulo}. São Paulo: Fórum Brasileiro de Segurança Pública, ${e}. p. ${c.paginas}. Disponível em: ${edicao(e).url}. ${ACESSO}`; };
const chamada = (e) => `(${AUTOR}, ${e}, p. ${edicao(e).pagina})`;
const blocoCitar = (titulo, texto) => `<div class="bloco-citar"><div class="cabeca"><h3>${esc(titulo)}</h3><button type="button" class="botao" data-copiar="${esc(texto)}">Copiar</button></div><p class="texto-citar">${esc(texto)}</p></div>`;

function montarConsulta() {
  const sel = document.getElementById("sel-uf");
  sel.innerHTML = UFS.map((u) => `<option value="${esc(u.uf)}">${esc(u.uf)}</option>`).join("");
  sel.addEventListener("change", () => { con.uf = sel.value; guardar(); ficha(); });
  const seg = document.getElementById("seg-c-ano");
  seg.innerHTML = ANOS.map((a) => `<button type="button" class="seg" data-valor="${a}">${a}</button>`).join("");
  seg.addEventListener("click", (ev) => { const b = ev.target.closest(".seg"); if (!b) return; con.ano = +b.dataset.valor; guardar(); ficha(); });
  document.getElementById("seg-c-crime").addEventListener("click", (ev) => { const b = ev.target.closest(".seg"); if (!b) return; con.crime = b.dataset.valor; guardar(); ficha(); });
}

function ficha() {
  document.getElementById("sel-uf").value = con.uf;
  document.querySelectorAll("#seg-c-ano .seg").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.valor === con.ano)));
  document.querySelectorAll("#seg-c-crime .seg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === con.crime)));
  const { uf, ano, crime } = con;
  const v = versoes(uf, ano, crime);
  const u = v[v.length - 1];
  const el = document.getElementById("ficha");
  if (!u) { el.innerHTML = `<div class="ficha-topo"><p>Sem dado para esta combinação.</p></div>`; return; }
  const informado = u.situacao === "informado";
  const ehBrasil = uf === "Brasil";
  const q = crime === "eletronico" ? quebra(u.sigla) : null;
  const cob = D.cobertura.find((c) => c.ano === ano);
  const revisado = v.length > 1 && v[0].registros !== u.registros;
  const total = ultima(uf, ano, "total");
  const ed = edicao(u.edicao);

  const carimbos = [informado ? `<span class="carimbo c-ok">Informado</span>` : `<span class="carimbo c-alerta">Não informado</span>`];
  if (v.length > 1) carimbos.push(revisado ? `<span class="carimbo c-ambar">Revisado na edição ${u.edicao}</span>` : v[0].situacao !== u.situacao ? `<span class="carimbo c-ambar">Mudou de situação</span>` : `<span class="carimbo c-neutro">Igual nas duas edições</span>`);
  if (q) carimbos.push(`<span class="carimbo c-alerta">Quebra de série em ${q.ano}</span>`);
  if (ehBrasil && crime === "eletronico" && cob) carimbos.push(`<span class="carimbo c-alerta">Cobre ${cob.ufs_que_informam} de 27 UFs</span>`);

  const avisos = [];
  if (ehBrasil && crime === "eletronico" && cob) {
    avisos.push(["forte", `Não inclui <b>${cob.ufs_sem_dado.join(", ")}</b>, que somam ${pct(100 - cob.pct_total_coberto)} do estelionato do país. Entre os estados que informam, o eletrônico é <b>${pct(cob.pct_eletronico_entre_informantes)}</b> do total; dividir pelo total nacional daria ${pct(cob.pct_eletronico_ingenuo)}, um número errado.`]);
    const bf = D.base_fixa.find((b) => b.ano === ano);
    if (bf && bf.cresc_publicado_pct != null) avisos.push(["medio", `De ${ano - 1} para ${ano}, o total publicado cresceu ${pct(bf.cresc_publicado_pct, true)}; nos ${bf.ufs_na_base} estados que informam desde 2021, sem quebra, <b>${pct(bf.cresc_base_fixa_pct, true)}</b>.`]);
  }
  if (!informado) avisos.push(["forte", `O estado não informou este número ao Anuário ("..." na tabela). Não é zero: escreva que o dado não está disponível.`]);
  if (q) avisos.push(["forte", `${esc(q.motivo)}.${q.documentada ? "" : " O Anuário não explica a mudança em nota."}`]);
  if (revisado) avisos.push(["medio", `A edição ${v[0].edicao} publicou <b>${fmt(v[0].registros)}</b>; a ${u.edicao} revisou para <b>${fmt(u.registros)}</b> (${pct(100 * (u.registros / v[0].registros - 1), true)}). Cite a edição ${u.edicao}.`]);
  if (crime === "eletronico" && informado && !ehBrasil && total) avisos.push(["", `É <b>${pct(100 * u.registros / total.registros)}</b> do estelionato registrado no estado nesse ano (${fmt(total.registros)}).`]);
  if (u.uf_nota_texto) avisos.push(["medio", `Nota do Anuário: ${esc(u.uf_nota_texto)}`]);
  avisos.push(["", "São registros policiais, não crimes: a pesquisa de vitimização do FBSP estima 26,3 milhões de vítimas de golpe em um ano."]);

  const lugar = ehBrasil ? "no Brasil" : `${PREP[uf] || "em"} ${uf}`;
  let frase;
  if (!informado) frase = `O estado não informou ao Anuário Brasileiro de Segurança Pública o número de registros de ${CRIME_NOME[crime]} em ${ano} ${chamada(u.edicao)}.`;
  else if (ehBrasil && crime === "eletronico" && cob) frase = `Em ${ano}, os ${cob.ufs_que_informam} estados que informaram o dado somaram ${fmt(u.registros)} registros de estelionato por meio eletrônico; ${cob.ufs_sem_dado.join(", ")} não informaram ${chamada(u.edicao)}.`;
  else frase = `Em ${ano}, foram registradas ${fmt(u.registros)} ocorrências de ${CRIME_NOME[crime]} ${lugar}, o que corresponde a ${n1.format(u.taxa)} registros por 100 mil habitantes ${chamada(u.edicao)}.`;

  el.innerHTML = `
    <div class="ficha-topo">
      <p class="ficha-assunto"><b>${esc(uf)}</b> · ${ano} · ${CRIME_NOME[crime]}</p>
      <div class="numero-linha"><span class="numero ${informado ? "" : "vazio"}">${informado ? fmt(u.registros) : "não informado"}</span>${informado ? `<span class="taxa">${n1.format(u.taxa)} por 100 mil hab.</span>` : ""}</div>
      <div class="carimbos">${carimbos.join("")}</div>
    </div>
    <div class="ficha-corpo">
      <section>
        <h3>Versões publicadas</h3>
        <ul class="versoes">${v.map((x) => `<li><span>Edição ${x.edicao} · ${edicao(x.edicao).tabela}, p. ${edicao(x.edicao).pagina}</span><span class="v">${x.situacao === "informado" ? fmt(x.registros) : "não informado"}</span></li>`).join("")}</ul>
      </section>
      <section>
        <h3>Antes de citar</h3>
        <ul class="avisos">${avisos.map(([g, t]) => `<li class="aviso ${g}">${t}</li>`).join("")}</ul>
      </section>
    </div>
    <div class="citar">
      ${blocoCitar("Frase pronta", frase)}
      ${blocoCitar("Citação no texto", chamada(u.edicao))}
      ${blocoCitar(`Referência (${ed.tabela}, p. ${ed.pagina})`, referencia(u.edicao))}
    </div>`;
}

// ================================================================= TRECHOS
const TEMAS = { "falso-advogado": "Falso advogado", "dados-pessoais": "Dados pessoais e engenharia social", "impunidade": "Impunidade", "acao-penal": "Ação penal", "subnotificacao": "Subnotificação", "limites": "Limites do dado", "crime-organizado": "Crime organizado" };
const tre = { tema: "todos", busca: "" };
function montarTrechos() {
  const cont = {};
  D.trechos.forEach((t) => (cont[t.tema] = (cont[t.tema] || 0) + 1));
  document.getElementById("n-trechos").textContent = D.trechos.length;
  const caixa = document.getElementById("chips-trechos");
  caixa.innerHTML = [["todos", "Todos", D.trechos.length], ...Object.entries(TEMAS).filter(([k]) => cont[k]).map(([k, n]) => [k, n, cont[k]])]
    .map(([k, n, c]) => `<button type="button" class="chip" data-tema="${k}">${esc(n)}<span class="n">${c}</span></button>`).join("");
  caixa.addEventListener("click", (ev) => { const b = ev.target.closest("[data-tema]"); if (!b) return; tre.tema = b.dataset.tema; trechos(); });
  document.getElementById("busca-trechos").addEventListener("input", (ev) => { tre.busca = ev.target.value; trechos(); });
}
function trechos() {
  document.querySelectorAll("#chips-trechos .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tema === tre.tema)));
  const termo = tre.busca.trim().toLowerCase();
  const lista = D.trechos.filter((t) => (tre.tema === "todos" || t.tema === tre.tema) && (!termo || (t.texto + " " + t.uso).toLowerCase().includes(termo)));
  const caixa = document.getElementById("lista-trechos");
  if (!lista.length) { caixa.innerHTML = `<p class="dica">Nenhum trecho com "${esc(tre.busca)}".</p>`; return; }
  caixa.innerHTML = lista.map((t) => {
    const c = D.capitulos[String(t.edicao)];
    const cit = `(${c.chamada}, ${t.edicao}, p. ${t.pagina})`;
    return `<article class="trecho">
      <div class="trecho-meta"><span>${esc(TEMAS[t.tema])}</span><span class="fonte">${esc(cit)}</span></div>
      <blockquote>“${esc(t.texto)}”</blockquote>
      <p class="uso"><b>Como pode servir:</b> ${esc(t.uso)}</p>
      ${t.obs ? `<p class="obs">${esc(t.obs)}</p>` : ""}
      <div class="acoes">
        <button type="button" class="botao" data-copiar="${esc(`“${t.texto}” ${cit}.`)}">Copiar citação</button>
        <button type="button" class="botao" data-copiar="${esc(referenciaCapitulo(t.edicao))}">Copiar referência</button>
      </div>
    </article>`;
  }).join("");
}

// ================================================================ CUIDADOS
function cuidados() {
  const cob = D.cobertura.find((c) => c.ano === ULTIMO);
  const bf = D.base_fixa.find((b) => b.ano === ULTIMO);
  const re = D.revisoes_resumo.find((r) => r.crime === "eletronico");
  const rt = D.revisoes_resumo.find((r) => r.crime === "total");
  const f = D.funil.find((x) => x.ano === ULTIMO);
  const itens = [
    ["Grave", "c-alerta", "O estelionato eletrônico não cobre o país inteiro", `${cob.ufs_sem_dado.join(", ")} não informam o eletrônico e somam ${pct(100 - cob.pct_total_coberto)} do estelionato de ${ULTIMO}. Os ${fmt(cob.eletronico_informado)} casos parecem ser ${pct(cob.pct_eletronico_ingenuo)} do total do Brasil, mas são ${pct(cob.pct_eletronico_entre_informantes)} entre os estados que informam.`, `"Nos ${cob.ufs_que_informam} estados que informam o dado…", nunca "no Brasil" sem ressalva.`],
    ["Grave", "c-alerta", "O crescimento publicado mistura golpe novo com estado novo", `De ${ULTIMO - 1} para ${ULTIMO}, o eletrônico publicado cresceu ${pct(bf.cresc_publicado_pct, true)}; nos ${bf.ufs_na_base} estados de sempre, ${pct(bf.cresc_base_fixa_pct, true)}. Pernambuco começou a contar no fim de 2024.`, `para falar de crescimento, prefira o estelionato total ou diga que a base de estados mudou.`],
    ["Grave", "c-alerta", "O Anuário não mede o falso advogado", `O golpe do falso advogado está dentro do estelionato, mas nenhuma tabela o separa. Os números do golpe vêm de outras fontes (Vieira, OAB, CNJ), cada uma contando uma coisa diferente.`, `"o Anuário não desagrega o golpe do falso advogado; os dados disponíveis vêm de…"`],
    ["Grave", "c-alerta", "Há quebras de série que impedem comparar anos", D.quebras.map((q) => `${q.sigla} (${q.ano})`).join(", ") + ".", `não compare um ano antes e um depois da quebra no mesmo estado.`],
    ["Atenção", "c-ambar", "As tabelas de Vieira (2026) não fecham em algumas linhas", "TJBA, TJPB, TJMA e as regiões Nordeste e Sul têm soma dos anos diferente do total impresso. Veja a nota na aba Falso advogado.", `cite os totais e mencione a diferença se usar os anos.`],
    ["Atenção", "c-ambar", "Denúncias à OAB não se comparam entre seccionais", "Cada seccional conta num período: SP em ~1,5 ano até fev./2026, PR só 2025, ES até out./2026, MG até abr./2025.", `cite cada número com o período e a fonte, sem ranking entre estados.`],
    ["Atenção", "c-ambar", "O número muda depois de publicado", `Dos ${re.publicados_duas_vezes} números estaduais de eletrônico publicados duas vezes, ${re.revisados} mudaram (${re.revisados_10pct} em 10% ou mais). No total, ${rt.revisados} de ${rt.publicados_duas_vezes}.`, `cite sempre a edição mais recente que traz o ano.`],
    ["Atenção", "c-ambar", "Registro não é crime", `O Anuário conta boletins. A pesquisa do FBSP estima 26,3 milhões de vítimas de golpe em um ano, contra ${fmt(f.boletins)} boletins de estelionato em ${ULTIMO}.`, `"foram registradas X ocorrências", não "ocorreram X golpes".`],
    ["Detalhe", "c-neutro", "Na edição 2025, a planilha e o PDF numeram a tabela de forma diferente", `No Excel, a aba T19 tem o título "Tabela 15"; no PDF é a Tabela 19, p. 105.`, `cite a tabela e a página do PDF.`],
    ["Detalhe", "c-neutro", "Citação direta com mais de três linhas tem outro formato", "Pela ABNT, até três linhas vai no texto entre aspas; acima disso, parágrafo próprio, recuo de 4 cm, letra menor e sem aspas.", `ao colar um trecho longo, tire as aspas e aplique o recuo.`],
  ];
  document.getElementById("cuidados").innerHTML = itens.map(([g, c, t, p, faca]) => `<article class="cuidado"><span class="carimbo ${c} gravidade">${g}</span><h3>${esc(t)}</h3><p>${esc(p)}</p><p class="faca">${esc(faca)}</p></article>`).join("");
}

// ================================================================== início
const desenhados = new Set();
function desenharAba(id) {
  requestAnimationFrame(() => {
    if (id === "estados") desenharEstados();
    if (id === "comparativos") desenharComparativos();
    if (id === "falso") desenharFalso();
    if (id === "consultar") ficha();
    desenhados.add(id);
    Object.values(graficos).forEach((g) => g.resize());
  });
}
function redesenharTudo() {
  // As cores vêm das variáveis CSS: ao trocar o tema, os gráficos são refeitos.
  Object.keys(graficos).forEach((k) => { graficos[k].dispose(); delete graficos[k]; });
  desenharAba(abaAtual);
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redesenharTudo);
new MutationObserver(redesenharTudo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
let espera;
window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => desenharAba(abaAtual), 150); });

document.getElementById("gerado").textContent = new Date(D.gerado_em + "T12:00").toLocaleDateString("pt-BR");
montarControlesEstados();
montarMaterias();
montarConsulta();
montarTrechos();
materias();
trechos();
cuidados();
abrir((location.hash || "").slice(1), false);
