"""Exporta os marts do DuckDB para o JSON que a página lê."""

import json
from datetime import date
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
BANCO = RAIZ / "data" / "estelionato.duckdb"
SAIDA = RAIZ / "site" / "data" / "dados.json"


def linhas(con, sql: str) -> list[dict]:
    cursor = con.execute(sql)
    nomes = [c[0] for c in cursor.description]
    return [dict(zip(nomes, linha)) for linha in cursor.fetchall()]


def main() -> None:
    con = duckdb.connect(str(BANCO), read_only=True)
    ultimo_ano = con.execute("select max(ano) from fct_estelionato").fetchone()[0]
    dados = {
        "gerado_em": date.today().isoformat(),
        "ultimo_ano": ultimo_ano,
        "edicoes": [r[0] for r in con.execute("select distinct edicao from stg_anuario__estelionato order by 1").fetchall()],
        "serie_nacional": linhas(con, """
            select ano, registros, primeira_publicacao, primeira_edicao, ultima_edicao
            from fct_serie_nacional order by ano
        """),
        "cobertura": linhas(con, """
            select ano, ufs_que_informam, ufs_sem_dado, pct_total_coberto,
                   pct_eletronico_ingenuo, pct_eletronico_entre_informantes
            from fct_cobertura_eletronico order by ano
        """),
        "base_fixa": linhas(con, """
            select ano, base_fixa, publicado, ufs_na_base, ufs,
                   cresc_base_fixa_pct, cresc_publicado_pct, pct_eletronico_base_fixa
            from fct_eletronico_base_fixa order by ano
        """),
        "participacao": linhas(con, f"""
            select uf, sigla, regiao, total, eletronico, situacao_eletronico, pct_eletronico, taxa_total
            from fct_participacao_eletronico where ano = {ultimo_ano}
            order by pct_eletronico desc nulls last
        """),
        "revisoes": linhas(con, """
            select sigla, uf, ano, crime, edicao_original, edicao_revisada,
                   registros_original, registros_revisado, variacao_pct, tipo, nota_revisada
            from fct_revisoes
            where not eh_brasil and tipo not in ('igual', 'nunca informado')
            order by crime, abs(coalesce(variacao_pct, 1e9)) desc
        """),
        "revisoes_resumo": linhas(con, """
            select crime,
                   count(*) filter (where tipo in ('igual', 'revisado')) as publicados_duas_vezes,
                   count(*) filter (where tipo = 'revisado') as revisados,
                   count(*) filter (where tipo = 'revisado' and abs(variacao_pct) >= 10) as revisados_10pct,
                   count(*) filter (where tipo = 'revisado' and tem_nota) as revisados_com_nota
            from fct_revisoes where not eh_brasil group by crime
        """),
        "revisoes_brasil": linhas(con, """
            select ano, crime, registros_original, registros_revisado, variacao_pct
            from fct_revisoes where eh_brasil order by crime, ano
        """),
        "quebras": linhas(con, "select sigla, ano, documentada, motivo from quebras_de_serie order by sigla"),
        "funil": linhas(con, "select * from fct_funil order by ano"),
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, indent=1))
    print(f"{SAIDA.relative_to(RAIZ)}: {SAIDA.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
