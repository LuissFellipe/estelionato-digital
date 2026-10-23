// Página do estelionato digital. Lê data/dados.json, gerado por
// export/exportar.py, e desenha os gráficos em SVG puro.

const NS = "http://www.w3.org/2000/svg";
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = (v) => (v == null ? "–" : num.format(v));
const pct = (v, sinal = false) => (v == null ? "–" : (sinal && v > 0 ? "+" : "") + dec1.format(v) + "%");
const mi = (v) => dec1.format(v / 1e6).replace(",0", "") + " mi";
const CRIME = { total: "Total", eletronico: "Eletrônico" };

let DADOS;

function el(tag, attrs = {}, pai) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (pai) pai.appendChild(n);
  return n;
}

function texto(pai, x, y, conteudo, attrs = {}) {
  const t = el("text", { x, y, ...attrs }, pai);
  t.textContent = conteudo;
  return t;
}

// Retângulo com os cantos do lado do dado arredondados e o lado da base reto.
function barra(pai, x, y, w, h, lado, attrs) {
  const r = Math.min(4, Math.abs(lado === "cima" ? w : h) / 2, Math.abs(lado === "cima" ? h : w));
  let d;
  if (lado === "cima") {
    d = `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  } else if (lado === "direita") {
    d = `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  } else {
    d = `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }
  return el("path", { d, ...attrs }, pai);
}

function novoSvg(id, altura) {
  const caixa = document.getElementById(id);
  caixa.innerHTML = "";
  const largura = caixa.clientWidth;
  const svg = el("svg", { viewBox: `0 0 ${largura} ${altura}`, role: "img" }, caixa);
  return { caixa, svg, largura };
}

// Tooltip compartilhado; o alvo de hover é maior que a marca.
const dica = document.getElementById("tooltip");
function ligarDica(caixa, alvo, marcas, conteudo) {
  const mostrar = (ev) => {
    dica.innerHTML = conteudo();
    dica.hidden = false;
    caixa.classList.add("focado");
    marcas.forEach((m) => m.classList.add("ativa"));
    mover(ev);
  };
  const mover = (ev) => {
    const x = ev.clientX + 14;
    const y = ev.clientY + 14;
    const w = dica.offsetWidth;
    const h = dica.offsetHeight;
    dica.style.left = Math.min(x, window.innerWidth - w - 8) + "px";
    dica.style.top = (y + h > window.innerHeight ? ev.clientY - h - 10 : y) + "px";
  };
  const esconder = () => {
    dica.hidden = true;
    caixa.classList.remove("focado");
    marcas.forEach((m) => m.classList.remove("ativa"));
  };
  alvo.addEventListener("pointerenter", mostrar);
  alvo.addEventListener("pointermove", mover);
  alvo.addEventListener("pointerleave", esconder);
}

const linhaDica = (rotulo, valor) => `<div class="t-linha">${rotulo}: <b>${valor}</b></div>`;

function tabela(id, colunas, linhas) {
  const cab = colunas.map((c) => `<th class="${c.num ? "num" : ""}">${c.rotulo}</th>`).join("");
  const corpo = linhas
    .map((l) => "<tr>" + colunas.map((c) => `<td class="${c.num ? "num" : ""}">${c.valor(l)}</td>`).join("") + "</tr>")
    .join("");
  document.getElementById(id).innerHTML = `<div class="tabela-rolagem"><table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table></div>`;
}

function legenda(id, itens) {
  document.getElementById(id).innerHTML = itens
    .map(([cor, rotulo]) => `<span><i style="background:var(${cor})"></i>${rotulo}</span>`)
    .join("");
}

function escala(d0, d1, r0, r1) {
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

// ---------------------------------------------------------------- destaques

function destaques() {
  const serie = DADOS.serie_nacional;
  const primeiro = serie[0];
  const ultimo = serie[serie.length - 1];
  const cob = DADOS.cobertura[DADOS.cobertura.length - 1];
  const rev = DADOS.revisoes_resumo.find((r) => r.crime === "eletronico");
  const funil = DADOS.funil[DADOS.funil.length - 1];
  const cartoes = [
    [mi(ultimo.registros), `registros de estelionato em ${ultimo.ano}, ${pct(100 * (ultimo.registros / primeiro.registros - 1), true)} desde ${primeiro.ano}`],
    [Math.round(cob.pct_total_coberto) + "%",`do estelionato de ${cob.ano} vem de estados que informam o golpe digital`],
    [`${rev.revisados} de ${rev.publicados_duas_vezes}`, "números de golpe digital mudaram na edição seguinte"],
    [dec1.format(funil.processos_por_100_boletins), `processos penais para cada 100 boletins de estelionato em ${funil.ano}`],
  ];
  document.getElementById("destaques").innerHTML = cartoes
    .map(([v, r]) => `<div class="cartao"><div class="valor">${v}</div><div class="rotulo">${r}</div></div>`)
    .join("");
}

// ---------------------------------------------------------- 1. série nacional

function graficoSerie() {
  const dados = DADOS.serie_nacional;
  const altura = 260;
  const { caixa, svg, largura } = novoSvg("g-serie", altura);
  const m = { t: 24, r: 8, b: 28, l: 44 };
  const max = 2_500_000;
  const y = escala(0, max, altura - m.b, m.t);
  const passo = (largura - m.l - m.r) / dados.length;
  const w = Math.min(48, passo * 0.62);

  const grade = el("g", { class: "grade" }, svg);
  for (const v of [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000]) {
    el("line", { x1: m.l, x2: largura - m.r, y1: y(v), y2: y(v) }, grade);
    texto(svg, m.l - 8, y(v) + 4, v === 0 ? "0" : mi(v), { "text-anchor": "end" });
  }

  dados.forEach((d, i) => {
    const cx = m.l + passo * i + passo / 2;
    const marca = barra(svg, cx - w / 2, y(d.registros), w, y(0) - y(d.registros), "cima", { class: "marca", fill: "var(--serie-1)" });
    texto(svg, cx, altura - 8, d.ano, { "text-anchor": "middle" });
    if (i === 0 || i === dados.length - 1) {
      texto(svg, cx, y(d.registros) - 8, mi(d.registros), { "text-anchor": "middle", class: "valor-rotulo" });
    }
    const alvo = el("rect", { class: "alvo", x: cx - passo / 2, y: m.t, width: passo, height: altura - m.t - m.b }, svg);
    ligarDica(caixa, alvo, [marca], () => {
      let h = `<div class="t-titulo">${d.ano}</div>` + linhaDica("Registros", fmt(d.registros));
      if (d.primeira_publicacao !== d.registros) {
        h += linhaDica(`Na edição ${d.primeira_edicao}`, fmt(d.primeira_publicacao));
      }
      return h;
    });
  });

  tabela("t-serie", [
    { rotulo: "Ano", valor: (d) => d.ano },
    { rotulo: "Registros (última versão)", num: true, valor: (d) => fmt(d.registros) },
    { rotulo: "Primeira publicação", num: true, valor: (d) => `${fmt(d.primeira_publicacao)} (ed. ${d.primeira_edicao})` },
  ], dados);
}

// ------------------------------------------------- 2. participação por estado

function graficoParticipacao() {
  const dados = DADOS.participacao;
  const quebras = new Map(DADOS.quebras.map((q) => [q.sigla, q]));
  const estreito = document.getElementById("g-participacao").clientWidth < 520;
  const linha = 24;
  const m = { t: 4, r: 56, b: 4, l: estreito ? 44 : 150 };
  const altura = m.t + m.b + linha * dados.length;
  const { caixa, svg, largura } = novoSvg("g-participacao", altura);
  const x = escala(0, 100, m.l, largura - m.r);
  const h = 14;

  dados.forEach((d, i) => {
    const y0 = m.t + i * linha;
    const nome = (estreito ? d.sigla : d.uf) + (quebras.has(d.sigla) ? " *" : "");
    texto(svg, m.l - 8, y0 + linha / 2 + 4, nome, { "text-anchor": "end" });
    let marca;
    if (d.situacao_eletronico === "informado") {
      marca = barra(svg, x(0), y0 + (linha - h) / 2, Math.max(1, x(d.pct_eletronico) - x(0)), h, "direita", { class: "marca", fill: "var(--serie-1)" });
      texto(svg, x(d.pct_eletronico) + 6, y0 + linha / 2 + 4, pct(d.pct_eletronico), { class: "valor-rotulo" });
    } else {
      marca = el("rect", { class: "marca vazio", x: x(0), y: y0 + (linha - h) / 2, width: x(100) - x(0), height: h, rx: 4 }, svg);
      texto(svg, x(0) + 8, y0 + linha / 2 + 4, "não informa o golpe digital", {});
    }
    const alvo = el("rect", { class: "alvo", x: 0, y: y0, width: largura, height: linha }, svg);
    ligarDica(caixa, alvo, [marca], () => {
      let html = `<div class="t-titulo">${d.uf}</div>` + linhaDica("Estelionato", fmt(d.total));
      html += linhaDica("Eletrônico", d.situacao_eletronico === "informado" ? `${fmt(d.eletronico)} (${pct(d.pct_eletronico)})` : "não informado");
      if (quebras.has(d.sigla)) html += `<div class="t-linha">* ${quebras.get(d.sigla).motivo}</div>`;
      return html;
    });
  });
  el("line", { class: "zero", x1: x(0), x2: x(0), y1: m.t, y2: altura - m.b }, svg);

  const ano = DADOS.ultimo_ano;
  document.getElementById("cap-participacao").textContent =
    `Parte do estelionato de cada estado registrada como eletrônica, ${ano}. * Estado com quebra na série (ver seção 4).`;
  tabela("t-participacao", [
    { rotulo: "UF", valor: (d) => d.uf },
    { rotulo: "Estelionato", num: true, valor: (d) => fmt(d.total) },
    { rotulo: "Eletrônico", num: true, valor: (d) => (d.situacao_eletronico === "informado" ? fmt(d.eletronico) : "não informado") },
    { rotulo: "% eletrônico", num: true, valor: (d) => pct(d.pct_eletronico) },
  ], dados);
}

function textoCobertura() {
  const c = DADOS.cobertura[DADOS.cobertura.length - 1];
  const sem = DADOS.participacao.filter((d) => d.situacao_eletronico !== "informado");
  const nomes = sem.map((d) => d.uf);
  const peso = sem.reduce((s, d) => s + d.total, 0) / DADOS.participacao.reduce((s, d) => s + d.total, 0);
  const lista = nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] : nomes[0];
  document.getElementById("txt-cobertura").innerHTML =
    `${lista} não informam quantos estelionatos são eletrônicos, e juntos respondem por <strong>${pct(100 * peso)}</strong> de todo o estelionato do país em ${c.ano}. ` +
    `Dividir o eletrônico publicado pelo total nacional dá ${pct(c.pct_eletronico_ingenuo)}; entre os estados que informam, a proporção é <strong>${pct(c.pct_eletronico_entre_informantes)}</strong>. ` +
    `E mesmo entre esses ela varia demais — de ${pct(Math.max(...DADOS.participacao.map((d) => d.pct_eletronico ?? 0)))} a ${pct(Math.min(...DADOS.participacao.filter((d) => d.pct_eletronico != null).map((d) => d.pct_eletronico)))} — para ser só crime: parte da diferença vem do jeito de cada polícia classificar o boletim.`;
}

// --------------------------------------------- 3. crescimento: publicado × base

function graficoCrescimento() {
  const dados = DADOS.base_fixa.filter((d) => d.cresc_publicado_pct != null);
  const altura = 260;
  const { caixa, svg, largura } = novoSvg("g-crescimento", altura);
  const m = { t: 24, r: 8, b: 28, l: 44 };
  const max = Math.ceil(Math.max(...dados.flatMap((d) => [d.cresc_publicado_pct, d.cresc_base_fixa_pct])) / 20) * 20;
  const y = escala(0, max, altura - m.b, m.t);
  const passo = (largura - m.l - m.r) / dados.length;
  const w = Math.min(36, passo * 0.3);
  const series = [
    ["cresc_publicado_pct", "var(--serie-2)", "Total publicado"],
    ["cresc_base_fixa_pct", "var(--serie-1)", "Mesma base de estados"],
  ];

  const grade = el("g", { class: "grade" }, svg);
  for (let v = 0; v <= max; v += 20) {
    el("line", { x1: m.l, x2: largura - m.r, y1: y(v), y2: y(v) }, grade);
    texto(svg, m.l - 8, y(v) + 4, v + "%", { "text-anchor": "end" });
  }

  dados.forEach((d, i) => {
    const cx = m.l + passo * i + passo / 2;
    const marcas = series.map(([campo, cor], s) => {
      const x0 = cx + (s === 0 ? -w - 1 : 1);
      const marca = barra(svg, x0, y(d[campo]), w, y(0) - y(d[campo]), "cima", { class: "marca", fill: cor });
      if (i === dados.length - 1) {
        texto(svg, x0 + w / 2, y(d[campo]) - 8, pct(d[campo]), { "text-anchor": "middle", class: "valor-rotulo" });
      }
      return marca;
    });
    texto(svg, cx, altura - 8, `${d.ano - 1}→${d.ano}`, { "text-anchor": "middle" });
    const alvo = el("rect", { class: "alvo", x: cx - passo / 2, y: m.t, width: passo, height: altura - m.t - m.b }, svg);
    ligarDica(caixa, alvo, marcas, () =>
      `<div class="t-titulo">${d.ano - 1} → ${d.ano}</div>` +
      linhaDica("Total publicado", `${pct(d.cresc_publicado_pct, true)} (${fmt(d.publicado)})`) +
      linhaDica(`${d.ufs_na_base} estados fixos`, `${pct(d.cresc_base_fixa_pct, true)} (${fmt(d.base_fixa)})`)
    );
  });

  legenda("l-crescimento", series.map(([, cor, rotulo]) => [cor.slice(4, -1), rotulo]));
  const ultimo = dados[dados.length - 1];
  document.getElementById("cap-crescimento").textContent =
    `Crescimento anual do estelionato eletrônico. Base fixa: ${ultimo.ufs.join(", ")} — os ${ultimo.ufs_na_base} estados que informaram todos os anos desde ${DADOS.base_fixa[0].ano}, sem quebra de série.`;
  tabela("t-crescimento", [
    { rotulo: "Ano", valor: (d) => d.ano },
    { rotulo: "Total publicado", num: true, valor: (d) => fmt(d.publicado) },
    { rotulo: "Crescimento", num: true, valor: (d) => pct(d.cresc_publicado_pct, true) },
    { rotulo: "Base fixa", num: true, valor: (d) => fmt(d.base_fixa) },
    { rotulo: "Crescimento", num: true, valor: (d) => pct(d.cresc_base_fixa_pct, true) },
    { rotulo: "% eletrônico na base", num: true, valor: (d) => pct(d.pct_eletronico_base_fixa) },
  ], DADOS.base_fixa);
}

function textoCrescimento() {
  const b = DADOS.base_fixa;
  const u = b[b.length - 1];
  const p = b[0];
  document.getElementById("txt-crescimento").innerHTML =
    `O total nacional de estelionato eletrônico soma os estados que informaram em cada ano, e essa lista muda: a Bahia entra em 2022, Rio Grande do Norte e Rio Grande do Sul em 2023, e Pernambuco some e volta. ` +
    `Em ${u.ano}, o total publicado cresceu <strong>${pct(u.cresc_publicado_pct, true)}</strong>; nos mesmos ${u.ufs_na_base} estados de sempre, <strong>${pct(u.cresc_base_fixa_pct, true)}</strong>. ` +
    `O golpe digital cresce de verdade — nesses estados ele foi de ${pct(p.pct_eletronico_base_fixa)} para ${pct(u.pct_eletronico_base_fixa)} do estelionato entre ${p.ano} e ${u.ano} —, mas mais devagar do que a manchete.`;
}

// -------------------------------------------------------------- 4. revisões

function graficoRevisoes() {
  const dados = DADOS.revisoes
    .filter((d) => d.crime === "eletronico" && d.tipo === "revisado" && Math.abs(d.variacao_pct) >= 10)
    .sort((a, b) => b.variacao_pct - a.variacao_pct);
  const estreito = document.getElementById("g-revisoes").clientWidth < 520;
  const linha = 26;
  const m = { t: 22, r: 16, b: 4, l: estreito ? 64 : 92 };
  const altura = m.t + m.b + linha * dados.length;
  const { caixa, svg, largura } = novoSvg("g-revisoes", altura);
  const lim = 100;
  const x = escala(-lim, lim, m.l, largura - m.r);
  const h = 14;

  const grade = el("g", { class: "grade" }, svg);
  for (const v of [-100, -50, 0, 50, 100]) {
    el("line", { x1: x(v), x2: x(v), y1: m.t - 6, y2: altura - m.b }, grade);
    texto(svg, x(v), m.t - 10, (v > 0 ? "+" : "") + v + "%", { "text-anchor": "middle" });
  }

  dados.forEach((d, i) => {
    const y0 = m.t + i * linha;
    const v = Math.max(-lim, Math.min(lim, d.variacao_pct));
    const cortado = v !== d.variacao_pct;
    texto(svg, m.l - 8, y0 + linha / 2 + 4, `${d.sigla} ${d.ano}`, { "text-anchor": "end" });
    const sobe = v > 0;
    const marca = sobe
      ? barra(svg, x(0), y0 + (linha - h) / 2, x(v) - x(0), h, "direita", { class: "marca", fill: "var(--sobe)" })
      : barra(svg, x(v), y0 + (linha - h) / 2, x(0) - x(v), h, "esquerda", { class: "marca", fill: "var(--desce)" });
    // Rótulo do lado de dentro do zero, para não colidir com a borda.
    const rotulo = pct(d.variacao_pct, true) + (cortado ? " ▸" : "");
    texto(svg, sobe ? x(0) - 6 : x(0) + 6, y0 + linha / 2 + 4, rotulo, { "text-anchor": sobe ? "end" : "start", class: "valor-rotulo" });
    const alvo = el("rect", { class: "alvo", x: 0, y: y0, width: largura, height: linha }, svg);
    ligarDica(caixa, alvo, [marca], () => {
      let html = `<div class="t-titulo">${d.uf}, ${d.ano}</div>`;
      html += linhaDica(`Edição ${d.edicao_original}`, fmt(d.registros_original));
      html += linhaDica(`Edição ${d.edicao_revisada}`, fmt(d.registros_revisado));
      html += `<div class="t-linha">${d.nota_revisada ? "Nota: " + d.nota_revisada : "Sem nota explicando a mudança."}</div>`;
      return html;
    });
  });
  el("line", { class: "zero", x1: x(0), x2: x(0), y1: m.t - 6, y2: altura - m.b }, svg);
  legenda("l-revisoes", [["--desce", "Revisado para baixo"], ["--sobe", "Revisado para cima"]]);

  tabela("t-revisoes", [
    { rotulo: "UF", valor: (d) => d.sigla },
    { rotulo: "Ano", valor: (d) => d.ano },
    { rotulo: "Crime", valor: (d) => CRIME[d.crime] },
    { rotulo: "Original", num: true, valor: (d) => `${fmt(d.registros_original)} (${d.edicao_original})` },
    { rotulo: "Revisado", num: true, valor: (d) => `${fmt(d.registros_revisado)} (${d.edicao_revisada})` },
    { rotulo: "Variação", num: true, valor: (d) => (d.variacao_pct == null ? d.tipo : pct(d.variacao_pct, true)) },
  ], DADOS.revisoes);

  tabela("t-quebras", [
    { rotulo: "UF", valor: (d) => d.sigla },
    { rotulo: "Desde", valor: (d) => d.ano },
    { rotulo: "Em nota?", valor: (d) => (d.documentada ? "sim" : "não") },
    { rotulo: "O que aconteceu", valor: (d) => d.motivo },
  ], DADOS.quebras);
}

function textoRevisoes() {
  const e = DADOS.revisoes_resumo.find((r) => r.crime === "eletronico");
  const t = DADOS.revisoes_resumo.find((r) => r.crime === "total");
  const br = DADOS.revisoes_brasil.filter((r) => r.crime === "eletronico");
  const maior = br.reduce((a, b) => (Math.abs(b.variacao_pct) > Math.abs(a.variacao_pct) ? b : a));
  document.getElementById("txt-revisoes").innerHTML =
    `Cada edição do Anuário traz dois anos, e o mais antigo vem revisado. Dos ${e.publicados_duas_vezes} números estaduais de estelionato eletrônico publicados duas vezes, <strong>${e.revisados} mudaram</strong>, ${e.revisados_10pct} em 10% ou mais. ` +
    `No total de estelionato a revisão é rotina pequena: ${t.revisados} de ${t.publicados_duas_vezes} mudaram, só ${t.revisados_10pct} em 10% ou mais. ` +
    `No Brasil, o eletrônico de ${maior.ano} foi publicado como ${fmt(maior.registros_original)} e revisado para ${fmt(maior.registros_revisado)} (${pct(maior.variacao_pct, true)}).`;
}

// ------------------------------------------------------------------- 5. funil

function funil() {
  const f = DADOS.funil[DADOS.funil.length - 1];
  const a = DADOS.funil[0];
  const cartoes = [
    [fmt(f.boletins), "boletins de ocorrência", `${pct(100 * (f.boletins / a.boletins - 1), true)} sobre ${a.ano}`],
    [fmt(f.processos), "processos penais", `<b>${dec1.format(f.processos_por_100_boletins)}</b> para cada 100 boletins`],
    [fmt(f.presos), "presos", `<b>${dec1.format(f.presos_por_100_boletins)}</b> para cada 100 boletins`],
  ];
  document.getElementById("funil").innerHTML = cartoes
    .map(([v, r, p]) => `<div class="cartao"><div class="valor">${v}</div><div class="rotulo">${r}, ${f.ano}</div><div class="por100">${p}</div></div>`)
    .join("");
}

// ------------------------------------------------------------------- início

function desenhar() {
  graficoSerie();
  graficoParticipacao();
  graficoCrescimento();
  graficoRevisoes();
}

fetch("data/dados.json")
  .then((r) => r.json())
  .then((dados) => {
    DADOS = dados;
    document.getElementById("edicoes").textContent = `${dados.edicoes[0]} a ${dados.edicoes[dados.edicoes.length - 1]}`;
    document.getElementById("gerado").textContent = new Date(dados.gerado_em + "T12:00").toLocaleDateString("pt-BR");
    destaques();
    textoCobertura();
    textoCrescimento();
    textoRevisoes();
    funil();
    desenhar();
    let espera;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(desenhar, 150);
    });
  });
