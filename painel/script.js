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

// "abrir" só rola até a seção pedida.
function abrir(id) { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }

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
    textStyle: { fontFamily: "Lato, system-ui, sans-serif", color: cor("--tinta-2") },
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
// Rampa padrão de mapa de calor (amarelo → vermelho), igual nos dois temas: valor alto é sempre o mais escuro e vermelho.
const rampa = () => ["#ffffcc", "#fed976", "#fd8d3c", "#e31a1c", "#800026"];
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
const est = { ano: ULTIMO, crime: "total", medida: "taxa", sel: null, vis: "mapa", busca: "" };
// Seis faixas do amarelo ao vermelho, como nos mapas do Our World in Data.
const FAIXAS = ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];

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
  caixa.addEventListener("click", (ev) => {
    const b = ev.target.closest(".seg"); if (!b) return;
    est[b.parentElement.dataset.grupo] = b.dataset.valor;
    desenharEstados();
  });
  document.getElementById("abas-vis").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-vis]"); if (!b) return;
    est.vis = b.dataset.vis; desenharEstados();
  });
  const sl = document.getElementById("slider-ano");
  sl.min = ANOS[0]; sl.max = ULTIMO; sl.step = 1; sl.value = est.ano;
  document.getElementById("ano-min").textContent = ANOS[0];
  document.getElementById("ano-max").textContent = ULTIMO;
  sl.addEventListener("input", () => { parar(); est.ano = +sl.value; desenharEstados(); });
  let relogio = null;
  const parar = () => { clearInterval(relogio); relogio = null; document.getElementById("play").textContent = "▶"; };
  document.getElementById("play").addEventListener("click", () => {
    if (relogio) return parar();
    if (est.ano === ULTIMO) est.ano = ANOS[0];
    document.getElementById("play").textContent = "❚❚";
    desenharEstados();
    relogio = setInterval(() => { if (est.ano >= ULTIMO) return parar(); est.ano += 1; desenharEstados(); }, 1100);
  });
  document.getElementById("busca-estado").addEventListener("input", (ev) => { est.busca = ev.target.value; listaEstados(); });
}
function marcarControlesEstados() {
  document.querySelectorAll("#controles-estados .segmentos .seg").forEach((b) => b.setAttribute("aria-pressed", String(est[b.parentElement.dataset.grupo] === b.dataset.valor)));
  document.querySelectorAll("#abas-vis [data-vis]").forEach((b) => b.setAttribute("aria-selected", String(est.vis === b.dataset.vis)));
  document.getElementById("slider-ano").value = est.ano;
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

// Limites das faixas: sextis dos valores do ano, arredondados a dois algarismos.
function limites(valores) {
  const v = valores.filter((x) => x != null).sort((a, b) => a - b);
  const arred = (x) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / p) * p; };
  const cortes = [1, 2, 3, 4, 5].map((k) => arred(v[Math.min(v.length - 1, Math.floor((k * v.length) / 6))]));
  return [...new Set(cortes)];
}

function desenharEstados() {
  marcarControlesEstados();
  registrarMapa();
  const vals = valoresEstados();
  const nomeTipo = est.crime === "total" ? "Estelionato" : "Estelionato por meio eletrônico";
  document.getElementById("g-titulo").innerHTML = `${nomeTipo} <span class="ano">${est.ano}</span>`;
  document.getElementById("g-sub").textContent = est.medida === "taxa" ? "Registros policiais por 100 mil habitantes, por estado." : "Número de registros policiais por estado.";
  document.getElementById("g-nota").innerHTML = est.crime === "eletronico"
    ? `<b>Nota:</b> SP, RJ e CE não separam o estelionato eletrônico; ficam sem dado. Registros policiais, não crimes.`
    : `<b>Nota:</b> inclui o estelionato comum e a fraude eletrônica (art. 171 do Código Penal). Registros policiais, não crimes.`;
  const alerta = document.getElementById("alerta-eletronico");
  const cob = D.cobertura.find((c) => c.ano === est.ano);
  alerta.hidden = est.crime !== "eletronico";
  if (cob) alerta.innerHTML = `<b>${cob.ufs_sem_dado.map((s) => NOME[s]).join(", ")}</b> não informam o estelionato eletrônico em ${est.ano} e somam ${pct(100 - cob.pct_total_coberto)} de todo o estelionato do país.`;
  document.getElementById("vis-mapa").hidden = est.vis !== "mapa";
  document.getElementById("vis-calor").hidden = est.vis !== "calor";
  document.getElementById("linha-tempo").hidden = est.vis !== "mapa";

  if (est.vis === "mapa") desenharMapaEstados(vals);
  else desenharCalor();
  listaEstados();
  fichaEstado();
}

function desenharMapaEstados(vals) {
  const cortes = limites(vals.map((v) => v.valor));
  const faixas = cortes.map((c, i) => ({ gte: i === 0 ? 0 : cortes[i - 1], lt: c, color: FAIXAS[i] }));
  faixas.push({ gte: cortes[cortes.length - 1], color: FAIXAS[cortes.length] });
  const rot = (x) => (est.medida === "taxa" ? nf.format(x) : x >= 1000 ? nf.format(x / 1000) + " mil" : nf.format(x));
  document.getElementById("legenda-bins").innerHTML =
    `<div class="bin sem"><i></i><span>sem dado</span></div>` +
    faixas.map((f, i) => `<div class="bin"><i style="background:${f.color}"></i><span>${i === 0 ? "0" : rot(f.gte)}</span></div>`).join("");
  const mapa = grafico("g-mapa");
  mapa.setOption({
    ...base(),
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => tooltipEstado(p.name) },
    visualMap: { type: "piecewise", show: false, pieces: faixas, seriesIndex: 0 },
    series: [{
      type: "map", map: "BR", roam: false, aspectScale: 0.95, layoutCenter: ["50%", "50%"], layoutSize: "100%", selectedMode: false,
      itemStyle: { areaColor: cor("--vazio"), borderColor: cor("--folha"), borderWidth: 0.8 },
      emphasis: { label: { show: true, color: cor("--tinta"), fontWeight: 700, fontFamily: "IBM Plex Mono, monospace" }, itemStyle: { borderColor: cor("--tinta"), borderWidth: 2, areaColor: null } },
      label: { show: false },
      data: vals.map((v) => ({ name: v.sigla, value: v.valor ?? undefined, ...(v.sigla === est.sel ? { itemStyle: { borderColor: cor("--tinta"), borderWidth: 2.5 } } : {}) })),
    }],
  }, true);
  mapa.off("mouseover"); mapa.off("mouseout"); mapa.off("click");
  const linha = (sigla) => document.querySelector(`.estado-linha[data-sigla="${sigla}"]`);
  mapa.on("mouseover", (p) => { const l = linha(p.name); if (l) { l.classList.add("ativo"); l.scrollIntoView({ block: "nearest" }); } });
  mapa.on("mouseout", (p) => linha(p.name)?.classList.remove("ativo"));
  mapa.on("click", (p) => selecionarEstado(p.name));
}

function listaEstados() {
  const vals = valoresEstados();
  const max = Math.max(...vals.map((v) => v.valor ?? 0));
  const termo = est.busca.trim().toLowerCase();
  const ord = [...vals].sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1)).filter((v) => !termo || v.uf.toLowerCase().includes(termo));
  const caixa = document.getElementById("lista-estados");
  caixa.innerHTML = ord.map((v) => `<button type="button" class="estado-linha${v.valor == null ? " nd" : ""}${v.sigla === est.sel ? " sel" : ""}" data-sigla="${v.sigla}" style="--p:${v.valor == null ? 0 : (100 * v.valor / max).toFixed(1)}%"><span>${esc(v.uf)}</span><span class="v">${v.valor == null ? "sem dado" : fmtMedida(v.valor)}</span></button>`).join("") || `<p class="dica">Nenhum estado com "${esc(est.busca)}".</p>`;
  caixa.onclick = (ev) => { const b = ev.target.closest("[data-sigla]"); if (b) selecionarEstado(b.dataset.sigla); };
  caixa.onmouseover = (ev) => { const b = ev.target.closest("[data-sigla]"); if (b && est.vis === "mapa" && graficos["g-mapa"]) graficos["g-mapa"].dispatchAction({ type: "highlight", seriesIndex: 0, name: b.dataset.sigla }); };
  caixa.onmouseout = (ev) => { const b = ev.target.closest("[data-sigla]"); if (b && est.vis === "mapa" && graficos["g-mapa"]) graficos["g-mapa"].dispatchAction({ type: "downplay", seriesIndex: 0, name: b.dataset.sigla }); };
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
        <button type="button" class="botao" id="fechar-ficha">Fechar</button>
      </div>
    </div>`;
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
  // Célula clara recebe tinta escura fixa; célula escura, branco. No tema escuro a rampa se inverte.
  dados.forEach((d) => { const alto = d.value[2] > max * 0.55; d.label = { color: d.value[2] < 0 ? cor("--tinta-3") : (alto ? "#ffffff" : "#14202b") }; });
  document.getElementById("sub-calor").textContent = `${est.crime === "total" ? "Estelionato total" : "Estelionato eletrônico"}, ${rotuloMedida().replace(/\.$/, "")}. Estados ordenados pelo valor de ${ULTIMO}. Cinza: não informado. Quanto mais vermelho, maior o valor.`;
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
  document.getElementById("funil").innerHTML = `
    <div class="legenda-tabela">Boletins de ocorrência, processos penais e presos por estelionato no Brasil, ${f.ano}. Fonte: Anuário 2026, Quadro 04 (p. 125).</div>
    <table><thead><tr><th>Etapa</th><th class="num">${D.funil[0].ano}</th><th class="num">${f.ano}</th><th class="num">Por 100 boletins (${f.ano})</th></tr></thead><tbody>
      <tr><td>Boletins de ocorrência</td><td class="num">${fmt(D.funil[0].boletins)}</td><td class="num">${fmt(f.boletins)}</td><td class="num">100,0</td></tr>
      <tr><td>Processos penais</td><td class="num">${fmt(D.funil[0].processos)}</td><td class="num">${fmt(f.processos)}</td><td class="num">${n1.format(f.processos_por_100_boletins)}</td></tr>
      <tr><td>Presos</td><td class="num">${fmt(D.funil[0].presos)}</td><td class="num">${fmt(f.presos)}</td><td class="num">${n1.format(f.presos_por_100_boletins)}</td></tr>
    </tbody></table>
    <p class="nota-tabela">Nota: processos e presos de um ano não são os casos registrados naquele ano; a razão compara volumes e não acompanha casos.</p>`;
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
  regs.forEach((r, y) => ["a2023", "a2024", "a2025"].forEach((k, x) => dadosR.push({ value: [x, y, r[k]], label: { color: r[k] > 100 ? "#ffffff" : "#14202b" } })));
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
    <p style="margin-top:8px">Os gráficos desta página usam os números como estão impressos. Ao citar, use os totais (que batem com as frases do artigo: 378 nos três maiores tribunais, 512 de 693 no Nordeste e Sudeste) e, se usar os anos, mencione a diferença.</p>`;
}
document.getElementById("seg-disp-falso").addEventListener("click", (ev) => { const b = ev.target.closest(".seg"); if (!b) return; disp.crime = b.dataset.valor; desenharFalso(); });

// ================================================================ MATÉRIAS
const mat = { grupo: "todos", busca: "" };
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
        <div class="meta"><span>${esc(m.veiculo)}</span></div>
        <p>${esc(m.resumo)}</p>
      </div>
    </li>`).join("")}</ul></section>`).join("");
}

// ================================================================== início
function desenharTudo() {
  requestAnimationFrame(() => {
    desenharEstados();
    desenharComparativos();
    desenharFalso();
    Object.values(graficos).forEach((g) => g.resize());
  });
}
function redesenharTudo() {
  // As cores vêm das variáveis CSS: ao trocar o tema, os gráficos são refeitos.
  Object.keys(graficos).forEach((k) => { graficos[k].dispose(); delete graficos[k]; });
  desenharTudo();
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redesenharTudo);
new MutationObserver(redesenharTudo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
let espera;
window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(desenharTudo, 150); });

document.getElementById("gerado").textContent = new Date(D.gerado_em + "T12:00").toLocaleDateString("pt-BR");
montarControlesEstados();
montarMaterias();
materias();
desenharTudo();
