"""Monta o Caderno do Estelionato: uma página HTML única, sem framework, com
os números dos marts, as fontes de citação e os trechos curados embutidos.

Os trechos de fontes.json foram conferidos literalmente contra o texto dos
PDFs, página a página.
"""

import json
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
BANCO = RAIZ / "data" / "estelionato.duckdb"
AQUI = Path(__file__).resolve().parent


def linhas(con, sql: str) -> list[dict]:
    cursor = con.execute(sql)
    nomes = [c[0] for c in cursor.description]
    return [dict(zip(nomes, l)) for l in cursor.fetchall()]


def main() -> None:
    con = duckdb.connect(str(BANCO), read_only=True)
    fontes = json.loads((AQUI / "fontes.json").read_text())
    dados = {
        **fontes,
        "registros": linhas(con, """
            select edicao, uf, sigla, regiao, ano, crime, registros, taxa, situacao, uf_nota_texto
            from stg_anuario__estelionato order by uf, ano, crime, edicao
        """),
        "quebras": linhas(con, "select sigla, ano, documentada, motivo from quebras_de_serie"),
        "cobertura": linhas(con, "select * exclude (ufs_sem_dado), ufs_sem_dado::varchar[] as ufs_sem_dado from fct_cobertura_eletronico order by ano"),
        "base_fixa": linhas(con, "select ano, base_fixa, publicado, ufs_na_base, cresc_base_fixa_pct, cresc_publicado_pct, pct_eletronico_base_fixa from fct_eletronico_base_fixa order by ano"),
        "revisoes_resumo": linhas(con, """
            select crime,
                   count(*) filter (where tipo in ('igual', 'revisado')) as publicados_duas_vezes,
                   count(*) filter (where tipo = 'revisado') as revisados,
                   count(*) filter (where tipo = 'revisado' and abs(variacao_pct) >= 10) as revisados_10pct
            from fct_revisoes where not eh_brasil group by crime
        """),
        "funil": linhas(con, "select * from fct_funil order by ano"),
    }
    modelo = (AQUI / "modelo.html").read_text()
    json_dados = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    saida = AQUI / "caderno.html"
    saida.write_text(modelo.replace("/*__DADOS__*/null", json_dados))
    print(f"{saida.relative_to(RAIZ)}: {saida.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
