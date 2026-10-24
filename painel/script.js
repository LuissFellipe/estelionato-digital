// Painel de visualização: lê window.DADOS e window.ESTADOS (gerados por painel/gerar.py).
const D = window.DADOS;
const FA = D.falso_advogado;
const V = FA.vieira;

// ------------------------------------------------------------------ formatos
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = (v) => (v == null ? "–" : nf.format(v));
const pct = (v, sinal) => (v == null ? "–" : (sinal && v > 0 ? "+" : "") + n1.format(v) + "%");
const mil = (v) => (v == null ? "–" : v >= 1e6 ? n1.format(v / 1e6) + " mi" : v >= 1000 ? nf.format(v / 1000) + " mil" : nf.format(v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cor = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const estreito = () => window.innerWidth < 640;
const dataBR = (iso) => new Date(iso + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

// --------------------------------------------------------------------- dados
// Cada ano sai em duas edições do Anuário; vale a mais recente.
const ULT = new Map();
D.registros.forEach((r) => {
  const k = `${r.uf}|${r.ano}|${r.crime}`;
  if (!ULT.has(k) || ULT.get(k).edicao < r.edicao) ULT.set(k, r);
});
const reg = (uf, ano, crime) => ULT.get(`${uf}|${ano}|${crime}`);
const ANOS = [...new Set(D.registros.map((r) => r.ano))].sort();
const ULTIMO = ANOS[ANOS.length - 1];
const UFS = [...new Map(D.registros.filter((r) => r.sigla).map((r) => [r.sigla, { sigla: r.sigla, uf: r.uf, regiao: r.regiao }])).values()]
  .sort((a, b) => a.uf.localeCompare(b.uf, "pt-BR"));
const NOME = Object.fromEntries(UFS.map((u) => [u.sigla, u.uf]));
const valor = (sigla, ano, crime, medida) => { const r = reg(NOME[sigla], ano, crime); return r && r.situacao === "informado" ? r[medida] : null; };
const POP = Object.fromEntries(UFS.map((u) => { const r = reg(u.uf, ULTIMO, "total"); return [u.sigla, r.registros / r.taxa * 1e5]; }));

// ------------------------------------------------------------------- ECharts
const graficos = {};
function grafico(id) {
  if (!graficos[id]) graficos[id] = echarts.init(document.getElementById(id), null, { renderer: "svg" });
  return graficos[id];
}
const base = () => ({
  animationDuration: 300,
  textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: cor("--tinta-2") },
  tooltip: {
    backgroundColor: cor("--card"), borderColor: cor("--fio-forte"), borderWidth: 1, confine: true,
    textStyle: { color: cor("--tinta"), fontSize: 13 }, extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,.15);border-radius:8px;",
  },
});
const eixoValor = (extra = {}) => ({
  type: "value", axisLine: { show: false }, axisTick: { show: false },
  splitLine: { lineStyle: { color: cor("--grade") } },
  axisLabel: { color: cor("--tinta-3"), fontFamily: "JetBrains Mono, monospace", fontSize: 11, formatter: (v) => (Math.abs(v) >= 10000 ? mil(v) : nf.format(v)) },
  nameTextStyle: { color: cor("--tinta-3"), fontSize: 12 },
  ...extra,
});
const eixoCat = (dados, extra = {}) => ({
  type: "category", data: dados, axisTick: { show: false },
  axisLine: { lineStyle: { color: cor("--fio-forte") } }, axisLabel: { color: cor("--tinta-2"), fontSize: 12 },
  ...extra,
});
const rotuloMono = (extra = {}) => ({ show: true, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: cor("--tinta"), ...extra });
// Sequencial amarelo → vermelho, igual nos dois temas.
const FAIXAS = ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];
const RAMPA = ["#ffffcc", "#fed976", "#fd8d3c", "#e31a1c", "#800026"];
const PALETA = () => [cor("--serie-1"), cor("--serie-2"), cor("--serie-3"), cor("--serie-4"), cor("--serie-5")];

let mapaPronto = false;
function registrarMapa() {
  if (mapaPronto) return;
  const geo = JSON.parse(JSON.stringify(window.ESTADOS));
  geo.features.forEach((f) => { f.properties.name = f.properties.uf; });
  echarts.registerMap("BR", geo);
  mapaPronto = true;
}
const centros = {};
function centro(sigla) {
  if (centros[sigla]) return centros[sigla];
  const f = window.ESTADOS.features.find((x) => x.properties.uf === sigla);
  const polis = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const anel = polis.map((p) => p[0]).sort((a, b) => b.length - a.length)[0];
  const xs = anel.map((p) => p[0]), ys = anel.map((p) => p[1]);
  return (centros[sigla] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
}

const dica = document.getElementById("dica");
function mostrarDica(el, html) {
  const r = el.getBoundingClientRect();
  dica.innerHTML = html; dica.hidden = false;
  dica.style.left = `${Math.min(r.left, innerWidth - 290)}px`; dica.style.top = `${r.bottom + 6}px`;
}

// ================================================================== ESTADOS
const est = { crime: "total", medida: "taxa", ano: ULTIMO, sel: ["SP", "DF", "MG"] };
// A cor de cada estado nas linhas acompanha o estado, não a posição.
const corSel = {};
function corDoEstado(sigla) {
  if (!corSel[sigla]) {
    const usadas = new Set(est.sel.filter((s) => s !== sigla).map((s) => corSel[s]));
    corSel[sigla] = [0, 1, 2, 3, 4].find((i) => !usadas.has(i)) ?? 0;
  }
  return PALETA()[corSel[sigla]];
}
const PEQUENOS = ["RN", "PB", "PE", "AL", "SE", "ES", "RJ", "DF"];
const unidade = () => (est.medida === "taxa" ? "por 100 mil hab." : "registros");
const fmtMedida = (v) => (v == null ? "não informa" : est.medida === "taxa" ? n1.format(v) : fmt(v));
const curto = (v) => (v == null ? "–" : est.medida === "taxa" ? nf.format(Math.round(v)) : mil(v));
const nomeCrime = () => (est.crime === "total" ? "Estelionato" : "Estelionato eletrônico");

function alternar(sigla) {
  if (est.sel.includes(sigla)) { est.sel = est.sel.filter((s) => s !== sigla); delete corSel[sigla]; }
  else { if (est.sel.length >= 5) delete corSel[est.sel.shift()]; est.sel.push(sigla); }
  desenharEstados();
}

function dicaEstado(sigla) {
  const v = valor(sigla, est.ano, est.crime, est.medida);
  const r = reg(NOME[sigla], est.ano, est.crime);
  if (v == null) return `<b>${esc(NOME[sigla])}</b><br>Não informa o ${est.crime === "eletronico" ? "estelionato eletrônico" : "dado"} em ${est.ano}`;
  return `<b>${esc(NOME[sigla])}</b>, ${est.ano}<br>${fmt(r.registros)} registros<br>${n1.format(r.taxa)} por 100 mil hab.`;
}

function montarEstados() {
  document.querySelectorAll("#estados .seg").forEach((g) => g.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    est[g.dataset.grupo] = b.dataset.valor;
    if (est.crime === "eletronico") est.sel = est.sel.filter((s) => valor(s, ULTIMO, "eletronico", "taxa") != null);
    if (!est.sel.length) est.sel = est.crime === "eletronico" ? ["SC", "DF", "MG"] : ["SP", "DF", "MG"];
    desenharEstados();
  }));
  const sl = document.getElementById("ano");
  sl.min = ANOS[0]; sl.max = ULTIMO; sl.step = 1; sl.value = est.ano;
  let relogio = null;
  const parar = () => { clearInterval(relogio); relogio = null; document.getElementById("play").textContent = "▶"; };
  sl.addEventListener("input", () => { parar(); est.ano = +sl.value; desenharEstados(); });
  document.getElementById("play").addEventListener("click", () => {
    if (relogio) return parar();
    if (est.ano === ULTIMO) est.ano = ANOS[0];
    document.getElementById("play").textContent = "❚❚";
    desenharEstados();
    relogio = setInterval(() => { if (est.ano >= ULTIMO) return parar(); est.ano += 1; desenharEstados(); }, 1000);
  });
}

function desenharEstados() {
  document.querySelectorAll("#estados .seg").forEach((g) => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(est[g.dataset.grupo] === b.dataset.valor))));
  document.getElementById("ano").value = est.ano;
  document.getElementById("ano-rot").textContent = est.ano;
  const cob = D.cobertura.find((c) => c.ano === est.ano);
  document.getElementById("nota-estados").textContent = est.crime === "eletronico" && cob ? `${cob.ufs_sem_dado.join(", ")} não informam o estelionato eletrônico em ${est.ano}.` : "";
  document.getElementById("tit-mapa").textContent = `${nomeCrime()} ${unidade()}, ${est.ano}`;
  document.getElementById("tit-ranking").textContent = `Ranking dos estados, ${est.ano}`;
  document.getElementById("tit-linhas").textContent = `${nomeCrime()} ${unidade()}, ${ANOS[0]}–${ULTIMO}`;
  document.getElementById("tit-calor").textContent = `${nomeCrime()} ${unidade()} por estado e ano`;
  desenharMapa();
  desenharRanking();
  desenharLinhas();
  desenharCalorEstados();
}

function desenharMapa() {
  registrarMapa();
  const vals = UFS.map((u) => ({ sigla: u.sigla, v: valor(u.sigla, est.ano, est.crime, est.medida) }));
  const circulos = est.medida === "registros";
  let faixas = null;
  if (!circulos) {
    // Sextis de todos os anos juntos: a mesma cor vale o mesmo número em qualquer ano.
    const todos = ANOS.flatMap((a) => UFS.map((u) => valor(u.sigla, a, est.crime, "taxa"))).filter((x) => x != null).sort((a, b) => a - b);
    const arred = (x) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)); return Math.round(x / p) * p; };
    const cortes = [...new Set([1, 2, 3, 4, 5].map((k) => arred(todos[Math.floor((k * todos.length) / 6)])))];
    faixas = cortes.map((c, i) => ({ gte: i ? cortes[i - 1] : 0, lt: c, color: FAIXAS[i] }));
    faixas.push({ gte: cortes[cortes.length - 1], color: FAIXAS[cortes.length] });
  }
  const faixaDe = (v) => faixas.findIndex((f) => v >= f.gte && (f.lt == null || v < f.lt));
  const corDe = (v) => (v == null || !faixas ? null : faixas[faixaDe(v)].color);
  const escuro = (v) => v != null && faixas && faixaDe(v) >= 4;
  document.getElementById("legenda-mapa").innerHTML = circulos
    ? `<span class="txt">Área do círculo proporcional ao número de registros.</span>`
    : `<div class="bin sem"><i></i><span>sem dado</span></div>` + faixas.map((f, i) => `<div class="bin"><i style="background:${f.color}"></i><span>${i ? nf.format(f.gte) : "0"}</span></div>`).join("");

  const pequeno = estreito();
  const maxV = Math.max(...vals.map((x) => x.v ?? 0));
  const tinta = cor("--tinta");
  const m = grafico("c-mapa");
  m.setOption({
    ...base(),
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => dicaEstado(p.name) },
    visualMap: faixas ? { type: "piecewise", show: false, pieces: faixas, seriesIndex: 0 } : undefined,
    geo: {
      map: "BR", roam: false, aspectScale: 0.95, layoutCenter: [pequeno ? "50%" : "42%", "50%"], layoutSize: pequeno ? "100%" : "104%", selectedMode: false,
      itemStyle: { areaColor: cor("--vazio"), borderColor: cor("--card"), borderWidth: 0.8 },
      emphasis: { label: { show: !circulos }, itemStyle: { borderColor: tinta, borderWidth: 2, areaColor: circulos ? cor("--vazio") : null } },
      label: {
        show: !circulos, lineHeight: 13,
        formatter: (p) => (PEQUENOS.includes(p.name) ? "" : `{s|${p.name}}\n{v|${curto(vals.find((x) => x.sigla === p.name).v)}}`),
        rich: { s: { fontSize: pequeno ? 9 : 11, fontWeight: 800 }, v: { fontSize: pequeno ? 8 : 10.5, fontFamily: "JetBrains Mono, monospace" } },
      },
      regions: vals.map((x) => ({
        name: x.sigla,
        label: { color: escuro(x.v) ? "#ffffff" : corDe(x.v) ? "#1d1d1d" : tinta },
        ...(est.sel.includes(x.sigla) ? { itemStyle: { borderColor: tinta, borderWidth: 2.2 } } : {}),
      })),
    },
    series: [
      { type: "map", geoIndex: 0, data: vals.map((x) => ({ name: x.sigla, value: x.v ?? undefined })) },
      ...(circulos ? [{
        type: "scatter", coordinateSystem: "geo", z: 3,
        data: vals.filter((x) => x.v != null).map((x) => ({ name: x.sigla, value: [...centro(x.sigla), x.v] })),
        symbolSize: (d) => 4 + (pequeno ? 44 : 80) * Math.sqrt(d[2] / maxV),
        itemStyle: { color: cor("--serie-1"), opacity: 0.6, borderColor: cor("--card"), borderWidth: 1 },
        label: { show: true, position: "bottom", distance: 2, color: tinta, lineHeight: 12,
          formatter: (p) => (PEQUENOS.includes(p.name) ? "" : `{s|${p.name}} {v|${mil(p.value[2])}}`),
          rich: { s: { fontSize: pequeno ? 9 : 11, fontWeight: 800 }, v: { fontSize: pequeno ? 8 : 10.5, fontFamily: "JetBrains Mono, monospace" } } },
        labelLayout: { hideOverlap: true },
      }] : []),
    ],
  }, true);
  m.off("click");
  m.on("click", (p) => p.name && NOME[p.name] && alternar(p.name));

  const caixa = document.getElementById("pequenos");
  caixa.innerHTML = PEQUENOS.map((s) => {
    const x = vals.find((y) => y.sigla === s), c = corDe(x.v);
    const estilo = circulos ? "" : c ? `background:${c};color:${escuro(x.v) ? "#fff" : "#1d1d1d"}` : "";
    return `<button type="button" class="peq${x.v == null ? " nd" : ""}${est.sel.includes(s) ? " sel" : ""}" data-sigla="${s}" style="${estilo}"><b>${s}</b><span>${curto(x.v)}</span></button>`;
  }).join("");
  caixa.onclick = (ev) => { const b = ev.target.closest("[data-sigla]"); if (b) alternar(b.dataset.sigla); };
  caixa.onmouseover = (ev) => { const b = ev.target.closest("[data-sigla]"); if (b) mostrarDica(b, dicaEstado(b.dataset.sigla)); };
  caixa.onmouseout = () => { dica.hidden = true; };
}

function desenharRanking() {
  const vals = UFS.map((u) => ({ sigla: u.sigla, v: valor(u.sigla, est.ano, est.crime, est.medida) }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  const g = grafico("c-ranking");
  g.setOption({
    ...base(),
    grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => dicaEstado(vals[p.dataIndex].sigla) },
    xAxis: eixoValor({ show: false }),
    yAxis: eixoCat(vals.map((x) => (estreito() ? x.sigla : NOME[x.sigla])), { inverse: true, axisLine: { show: false }, axisLabel: { color: cor("--tinta-2"), fontSize: 11.5, interval: 0 } }),
    series: [{
      type: "bar", barWidth: "70%", cursor: "pointer",
      data: vals.map((x) => ({ value: x.v ?? 0, itemStyle: { color: est.sel.includes(x.sigla) ? corDoEstado(x.sigla) : cor("--suave"), borderRadius: [0, 4, 4, 0] } })),
      label: rotuloMono({ position: "right", formatter: (p) => fmtMedida(vals[p.dataIndex].v) }),
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar(vals[p.dataIndex].sigla));
}

function desenharLinhas() {
  const series = est.sel.map((s) => {
    const c = corDoEstado(s);
    return {
      name: NOME[s], type: "line", data: ANOS.map((a) => valor(s, a, est.crime, est.medida)), connectNulls: false,
      symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, color: c }, itemStyle: { color: c, borderColor: cor("--card"), borderWidth: 1.5 },
      endLabel: { show: true, formatter: () => s, color: c, fontWeight: 800, fontSize: 12 },
    };
  });
  // Brasil como referência só no total: no eletrônico faltam SP, RJ e CE e a média nacional distorce.
  if (est.crime === "total") {
    series.push({
      name: "Brasil", type: "line", data: ANOS.map((a) => reg("Brasil", a, "total")?.[est.medida] ?? null),
      symbol: "none", lineStyle: { width: 2, type: "dashed", color: cor("--tinta-3") }, itemStyle: { color: cor("--tinta-3") },
      endLabel: { show: true, formatter: "BR", color: cor("--tinta-3"), fontWeight: 800, fontSize: 12 },
    });
  }
  grafico("c-linhas").setOption({
    ...base(),
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 4, textStyle: { color: cor("--tinta-2") } },
    grid: { left: 4, right: 36, top: 40, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", valueFormatter: (v) => fmtMedida(v) },
    xAxis: eixoCat(ANOS.map(String), { boundaryGap: false }),
    yAxis: eixoValor(),
    series,
  }, true);
}

function desenharCalorEstados() {
  const ordem = UFS.map((u) => ({ s: u.sigla, v: valor(u.sigla, ULTIMO, est.crime, est.medida) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map((x) => x.s);
  const dados = [];
  const max = Math.max(...ordem.flatMap((s) => ANOS.map((a) => valor(s, a, est.crime, est.medida) ?? 0)));
  ordem.forEach((s, y) => ANOS.forEach((a, x) => {
    const v = valor(s, a, est.crime, est.medida);
    dados.push({ value: [x, y, v ?? "-"], label: { color: v != null && v > max * 0.6 ? "#ffffff" : "#1d1d1d" } });
  }));
  grafico("c-calor").setOption({
    ...base(),
    grid: { left: 4, right: 8, top: 4, bottom: 44, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => `<b>${esc(NOME[ordem[p.value[1]]])}</b>, ${ANOS[p.value[0]]}<br>${p.value[2] === "-" ? "não informa" : fmtMedida(p.value[2]) + " " + unidade()}` },
    xAxis: eixoCat(ANOS.map(String), { position: "top", axisLine: { show: false } }),
    yAxis: eixoCat(ordem.map((s) => (estreito() ? s : NOME[s])), { inverse: true, axisLine: { show: false }, axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0 } }),
    visualMap: { min: 0, max, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 220, calculable: false,
      text: [fmtMedida(max), "0"], textStyle: { color: cor("--tinta-3"), fontSize: 11 }, inRange: { color: RAMPA } },
    series: [{
      type: "heatmap", data: dados,
      itemStyle: { borderColor: cor("--card"), borderWidth: 2, borderRadius: 3 },
      label: { show: !estreito(), fontSize: 10, fontFamily: "JetBrains Mono, monospace",
        formatter: (p) => (p.value[2] === "-" ? "" : curto(p.value[2])) },
      emphasis: { itemStyle: { borderColor: cor("--tinta"), borderWidth: 2 } },
    }],
  }, true);
}

// ======================================================= TOTAL × ELETRÔNICO
function desenharEletronico() {
  // Série nacional
  const sn = D.serie_nacional;
  grafico("c-serie").setOption({
    ...base(),
    grid: { left: 4, right: 4, top: 24, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmt(v) + " registros" },
    xAxis: eixoCat(sn.map((s) => String(s.ano))),
    yAxis: eixoValor(),
    series: [{ type: "bar", barWidth: "58%", itemStyle: { color: cor("--serie-1"), borderRadius: [4, 4, 0, 0] }, data: sn.map((s) => s.registros),
      label: rotuloMono({ position: "top", formatter: (p) => mil(p.value) }) }],
  }, true);

  // Publicado × mesma base
  const bf = D.base_fixa;
  document.getElementById("nota-base").textContent = `Mesmos estados: os ${bf[0].ufs_na_base} que informam desde ${bf[0].ano}, sem quebra de série.`;
  grafico("c-base").setOption({
    ...base(),
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 4, textStyle: { color: cor("--tinta-2") } },
    grid: { left: 4, right: 56, top: 36, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", valueFormatter: (v) => fmt(v) + " registros" },
    xAxis: eixoCat(bf.map((b) => String(b.ano)), { boundaryGap: false }),
    yAxis: eixoValor(),
    series: [
      ["Total publicado", bf.map((b) => b.publicado), cor("--serie-2")],
      ["Mesmos estados", bf.map((b) => b.base_fixa), cor("--serie-1")],
    ].map(([n, d, c]) => ({
      name: n, type: "line", data: d, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, color: c }, itemStyle: { color: c },
      endLabel: { show: true, formatter: (p) => mil(p.value), color: cor("--tinta"), fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
    })),
  }, true);

  // Empilhado: eletrônico + restante, por 100 mil
  const part = UFS.map((u) => {
    const t = reg(u.uf, ULTIMO, "total"), e = reg(u.uf, ULTIMO, "eletronico");
    const ok = e && e.situacao === "informado";
    return { sigla: u.sigla, uf: u.uf, taxa: t.taxa, total: t.registros, taxaE: ok ? e.taxa : null, eletr: ok ? e.registros : null, p: ok ? 100 * e.registros / t.registros : null };
  }).sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
  document.getElementById("tit-empilhado").textContent = `Parte eletrônica do estelionato por estado, ${ULTIMO} (por 100 mil hab.)`;
  grafico("c-empilhado").setOption({
    ...base(),
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: cor("--tinta-2") }, data: ["Eletrônico", "Demais", "Não separa"] },
    grid: { left: 4, right: 52, top: 32, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => {
      const p = part[ps[0].dataIndex];
      return `<b>${esc(p.uf)}</b><br>Total: ${n1.format(p.taxa)} por 100 mil (${fmt(p.total)})<br>` + (p.p == null ? "Não separa o eletrônico" : `Eletrônico: ${n1.format(p.taxaE)} por 100 mil (${fmt(p.eletr)}), ${pct(p.p)}`);
    } },
    xAxis: eixoValor(),
    yAxis: eixoCat(part.map((p) => (estreito() ? p.sigla : p.uf)), { inverse: true, axisLine: { show: false }, axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0 } }),
    series: [
      { name: "Eletrônico", type: "bar", stack: "t", barWidth: "68%", itemStyle: { color: cor("--serie-1") }, data: part.map((p) => p.taxaE) },
      { name: "Demais", type: "bar", stack: "t", itemStyle: { color: cor("--serie-2"), borderRadius: [0, 4, 4, 0] }, data: part.map((p) => (p.p == null ? null : p.taxa - p.taxaE)),
        label: rotuloMono({ position: "right", formatter: (x) => pct(part[x.dataIndex].p) }) },
      { name: "Não separa", type: "bar", stack: "t", itemStyle: { color: cor("--vazio"), borderRadius: [0, 4, 4, 0] }, data: part.map((p) => (p.p == null ? p.taxa : null)) },
    ],
  }, true);

  // Dispersão: taxa × % eletrônico
  const comE = part.filter((p) => p.p != null);
  const maxT = Math.max(...comE.map((p) => p.total));
  document.getElementById("tit-disp").textContent = `Taxa de estelionato × parte eletrônica, ${ULTIMO}`;
  grafico("c-disp").setOption({
    ...base(),
    grid: { left: 12, right: 24, top: 16, bottom: 32, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => { const d = comE[p.dataIndex]; return `<b>${esc(d.uf)}</b><br>${n1.format(d.taxa)} por 100 mil<br>${pct(d.p)} eletrônico<br>${fmt(d.total)} registros`; } },
    xAxis: eixoValor({ name: "estelionato por 100 mil hab.", nameLocation: "middle", nameGap: 28, scale: true, axisLabel: { formatter: (v) => nf.format(v), color: cor("--tinta-3"), fontSize: 11 } }),
    yAxis: eixoValor({ name: "% eletrônico", nameLocation: "middle", nameGap: 40, nameRotate: 90, min: 0, axisLabel: { formatter: (v) => v + "%", color: cor("--tinta-3"), fontSize: 11 } }),
    series: [{
      type: "scatter", data: comE.map((p) => [p.taxa, p.p]),
      symbolSize: (v, p) => 8 + 34 * Math.sqrt(comE[p.dataIndex].total / maxT),
      itemStyle: { color: cor("--serie-1"), opacity: 0.75, borderColor: cor("--card"), borderWidth: 1.5 },
      label: { show: true, position: "right", fontSize: 10.5, fontWeight: 700, color: cor("--tinta-2"), formatter: (p) => comE[p.dataIndex].sigla },
      labelLayout: { hideOverlap: true },
    }],
  }, true);
}

// ============================================================ FALSO ADVOGADO
function desenharFalso() {
  registrarMapa();
  const porSigla = Object.fromEntries(V.tribunais.map((t) => [t.sigla, t]));
  const maxTJ = Math.max(...V.tribunais.map((t) => t.total));
  grafico("c-mapa-falso").setOption({
    ...base(),
    tooltip: { ...base().tooltip, trigger: "item", formatter: (p) => {
      const t = porSigla[p.name];
      return `<b>${esc(NOME[p.name])}</b><br>` + (t ? `${t.tj}: ${t.total} acórdãos<br>2023: ${t.a2023} · 2024: ${t.a2024} · 2025: ${t.a2025}<br>${n1.format(t.total / POP[p.name] * 1e6)} por milhão de hab.` : "Fora dos 10 tribunais do levantamento");
    } },
    visualMap: { min: 0, max: maxTJ, orient: "horizontal", left: 0, bottom: 0, itemWidth: 12, itemHeight: 140, text: [String(maxTJ), "0"], textStyle: { color: cor("--tinta-3"), fontSize: 11 }, inRange: { color: RAMPA }, seriesIndex: 0 },
    series: [{
      type: "map", map: "BR", roam: false, aspectScale: 0.95, layoutCenter: ["50%", "46%"], layoutSize: "96%", selectedMode: false,
      itemStyle: { areaColor: cor("--vazio"), borderColor: cor("--card"), borderWidth: 0.8 },
      emphasis: { label: { show: true, color: cor("--tinta"), fontWeight: 800 }, itemStyle: { borderColor: cor("--tinta"), borderWidth: 2, areaColor: null } },
      label: { show: true, fontSize: 10.5, fontWeight: 800, color: "#1d1d1d", formatter: (p) => (porSigla[p.name] && !PEQUENOS.includes(p.name) ? `${p.name}\n${porSigla[p.name].total}` : "") },
      data: UFS.map((u) => ({ name: u.sigla, value: porSigla[u.sigla]?.total })),
    }],
  }, true);

  const anosV = ["a2023", "a2024", "a2025"];
  const coresAno = [cor("--suave"), cor("--serie-1"), "#173f78"];
  grafico("c-tj").setOption({
    ...base(),
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: cor("--tinta-2") } },
    grid: { left: 4, right: 4, top: 36, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const t = V.tribunais[ps[0].dataIndex]; return `<b>${t.tj}</b> (${t.regiao})<br>2023: ${t.a2023} · 2024: ${t.a2024} · 2025: ${t.a2025}<br>Total: <b>${t.total}</b>`; } },
    xAxis: eixoCat(V.tribunais.map((t) => t.tj), { axisLabel: { color: cor("--tinta-2"), fontSize: 11, interval: 0, rotate: estreito() ? 45 : 0 } }),
    yAxis: eixoValor(),
    series: anosV.map((k, i) => ({
      name: ["2023", "2024", "2025"][i], type: "bar", stack: "a", barWidth: "60%",
      itemStyle: { color: coresAno[i], borderColor: cor("--card"), borderWidth: 1, borderRadius: i === 2 ? [4, 4, 0, 0] : 0 },
      data: V.tribunais.map((t) => t[k]),
      label: i === 2 ? rotuloMono({ position: "top", formatter: (p) => V.tribunais[p.dataIndex].total }) : undefined,
    })),
  }, true);

  grafico("c-anual").setOption({
    ...base(),
    grid: { left: 4, right: 4, top: 24, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => v + " acórdãos" },
    xAxis: eixoCat(V.anuais.map((a) => String(a.ano))),
    yAxis: eixoValor(),
    series: [{ type: "bar", barWidth: "52%", itemStyle: { color: cor("--serie-2"), borderRadius: [4, 4, 0, 0] }, data: V.anuais.map((a) => a.acordaos), label: rotuloMono({ position: "top" }) }],
  }, true);

  const regs = V.regioes;
  const maxR = Math.max(...regs.flatMap((r) => anosV.map((k) => r[k])));
  grafico("c-regiao").setOption({
    ...base(),
    grid: { left: 4, right: 4, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => `<b>${regs[p.value[1]].regiao}</b>, ${2023 + p.value[0]}<br>${p.value[2]} acórdãos` },
    xAxis: eixoCat(["2023", "2024", "2025"], { position: "top", axisLine: { show: false } }),
    yAxis: eixoCat(regs.map((r) => r.regiao), { inverse: true, axisLine: { show: false } }),
    visualMap: { show: false, min: 0, max: maxR, inRange: { color: RAMPA } },
    series: [{
      type: "heatmap",
      data: regs.flatMap((r, y) => anosV.map((k, x) => ({ value: [x, y, r[k]], label: { color: r[k] > maxR * 0.55 ? "#ffffff" : "#1d1d1d" } }))),
      itemStyle: { borderColor: cor("--card"), borderWidth: 3, borderRadius: 4 },
      label: { show: true, fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" },
    }],
  }, true);

  const oab = [...FA.denuncias_oab].sort((a, b) => b.valor - a.valor);
  const og = grafico("c-oab");
  og.setOption({
    ...base(),
    grid: { left: 4, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...base().tooltip, formatter: (p) => { const o = oab[p.dataIndex]; return `<b>${o.seccional}</b><br>${o.mais_de ? "mais de " : ""}${fmt(o.valor)} denúncias<br>${esc(o.periodo)}`; } },
    xAxis: eixoValor({ show: false }),
    yAxis: eixoCat(oab.map((o) => o.seccional), { inverse: true, axisLine: { show: false } }),
    series: [{ type: "bar", barWidth: "60%", cursor: "pointer", itemStyle: { color: cor("--serie-2"), borderRadius: [0, 4, 4, 0] }, data: oab.map((o) => o.valor),
      label: rotuloMono({ position: "right", formatter: (p) => (oab[p.dataIndex].mais_de ? "+" : "") + fmt(p.value) }) }],
  }, true);
  og.off("click");
  og.on("click", (p) => window.open(oab[p.dataIndex].url, "_blank", "noopener"));
}

// ================================================================= MATÉRIAS
const mat = { grupo: "todos", busca: "" };
function montarMaterias() {
  document.getElementById("n-materias").textContent = FA.materias.length;
  const cont = {};
  FA.materias.forEach((m) => (cont[m.grupo] = (cont[m.grupo] || 0) + 1));
  const chips = document.getElementById("chips");
  chips.innerHTML = [["todos", "Todas", FA.materias.length], ...Object.entries(cont).map(([g, n]) => [g, g, n])]
    .map(([k, t, n]) => `<button type="button" class="chip" data-grupo="${esc(k)}">${esc(t)}<span class="q">${n}</span></button>`).join("");
  chips.addEventListener("click", (ev) => { const b = ev.target.closest("[data-grupo]"); if (b) { mat.grupo = b.dataset.grupo; materias(); } });
  document.getElementById("busca").addEventListener("input", (ev) => { mat.busca = ev.target.value; materias(); });
}
function materias() {
  document.querySelectorAll("#chips .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.grupo === mat.grupo)));
  const termo = mat.busca.trim().toLowerCase();
  const lista = FA.materias
    .filter((m) => (mat.grupo === "todos" || m.grupo === mat.grupo) && (!termo || `${m.titulo} ${m.veiculo} ${m.resumo}`.toLowerCase().includes(termo)))
    .sort((a, b) => b.data.localeCompare(a.data));
  document.getElementById("lista").innerHTML = lista.map((m) => `<li>
      <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.titulo)}</a>
      <span class="meta">${esc(m.veiculo)} · ${dataBR(m.data)}</span>
    </li>`).join("") || `<li class="meta">Nada encontrado.</li>`;
}

// =================================================================== início
function desenharTudo() {
  desenharEstados();
  desenharEletronico();
  desenharFalso();
}
function redesenhar() {
  Object.keys(graficos).forEach((k) => { graficos[k].dispose(); delete graficos[k]; });
  desenharTudo();
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redesenhar);
new MutationObserver(redesenhar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
let largura = innerWidth, espera;
window.addEventListener("resize", () => {
  clearTimeout(espera);
  espera = setTimeout(() => {
    // Cruzar o limite de 640 px muda rótulos e tamanhos; fora isso basta redimensionar.
    if ((largura < 640) !== (innerWidth < 640)) redesenhar();
    else Object.values(graficos).forEach((g) => g.resize());
    largura = innerWidth;
  }, 150);
});

document.getElementById("gerado").textContent = new Date(D.gerado_em + "T12:00").toLocaleDateString("pt-BR");
montarEstados();
montarMaterias();
materias();
desenharTudo();
