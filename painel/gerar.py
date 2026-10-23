"""Gera os dados da página: os números do Anuário (marts do DuckDB), as fontes
de citação (consulta/fontes.json), os dados do falso advogado
(falso_advogado.json) e o contorno dos estados.

Saem dois arquivos. painel/dados.js é o público, publicado no GitHub Pages:
não leva os trechos do TCC nem a marcação das matérias que já estão nas
fontes do pré-projeto. painel/dados-completo.js leva tudo e só é usado no
artifact privado; ele e consulta/trechos_tcc.json ficam fora do git.

Sai como .js, e não .json, para a página abrir com dois cliques no
index.html: o navegador bloqueia fetch() de arquivo local, mas carrega um
<script src> normalmente.
"""

import json
from datetime import date
from pathlib import Path

import duckdb

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
BANCO = RAIZ / "data" / "estelionato.duckdb"


def linhas(con, sql: str) -> list[dict]:
    cursor = con.execute(sql)
    nomes = [c[0] for c in cursor.description]
    return [dict(zip(nomes, l)) for l in cursor.fetchall()]


def main() -> None:
    con = duckdb.connect(str(BANCO), read_only=True)
    dados = {
        "gerado_em": date.today().isoformat(),
        **json.loads((RAIZ / "consulta" / "fontes.json").read_text()),
        "falso_advogado": json.loads((AQUI / "falso_advogado.json").read_text()),
        "registros": linhas(con, """
            select edicao, uf, sigla, regiao, ano, crime, registros, taxa, situacao, uf_nota_texto
            from stg_anuario__estelionato order by uf, ano, crime, edicao
        """),
        "serie_nacional": linhas(con, "select ano, registros, primeira_publicacao, primeira_edicao from fct_serie_nacional order by ano"),
        "quebras": linhas(con, "select sigla, ano, documentada, motivo from quebras_de_serie"),
        "cobertura": linhas(con, "select * exclude (ufs_sem_dado), ufs_sem_dado::varchar[] as ufs_sem_dado from fct_cobertura_eletronico order by ano"),
        "base_fixa": linhas(con, """
            select ano, base_fixa, publicado, ufs_na_base, ufs::varchar[] as ufs,
                   cresc_base_fixa_pct, cresc_publicado_pct, pct_eletronico_base_fixa
            from fct_eletronico_base_fixa order by ano
        """),
        "revisoes_resumo": linhas(con, """
            select crime,
                   count(*) filter (where tipo in ('igual', 'revisado')) as publicados_duas_vezes,
                   count(*) filter (where tipo = 'revisado') as revisados,
                   count(*) filter (where tipo = 'revisado' and abs(variacao_pct) >= 10) as revisados_10pct
            from fct_revisoes where not eh_brasil group by crime
        """),
        "funil": linhas(con, "select * from fct_funil order by ano"),
    }
    estados = json.loads((AQUI / "estados.geojson").read_text())

    publico = json.loads(json.dumps(dados))
    for m in publico["falso_advogado"]["materias"]:
        m.pop("no_tcc", None)
    gravar(AQUI / "dados.js", {**publico, "privado": False}, estados)

    trechos = RAIZ / "consulta" / "trechos_tcc.json"
    if trechos.exists():
        completo = {**dados, **json.loads(trechos.read_text()), "privado": True}
        gravar(AQUI / "dados-completo.js", completo, estados)


def gravar(saida: Path, dados: dict, estados: dict) -> None:
    saida.write_text(
        "// Gerado por painel/gerar.py. Não editar à mão.\n"
        f"window.DADOS = {json.dumps(dados, ensure_ascii=False, separators=(',', ':'))};\n"
        f"window.ESTADOS = {json.dumps(estados, separators=(',', ':'))};\n"
    )
    print(f"{saida.relative_to(RAIZ)}: {saida.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
