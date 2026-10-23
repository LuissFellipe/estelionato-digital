-- O número mais recente de cada UF, ano e crime: a última edição que publicou
-- aquele ano. Os anos do meio da série saem em duas edições, e vale a revisão.
with publicacoes as (
    select
        *,
        count(*) over (partition by uf, ano, crime) as publicacoes,
        row_number() over (partition by uf, ano, crime order by edicao desc) as ordem
    from {{ ref('stg_anuario__estelionato') }}
)

select
    uf,
    sigla,
    regiao,
    eh_brasil,
    ano,
    crime,
    registros,
    taxa,
    situacao,
    -- A população que a taxa usa. No Brasil, para o eletrônico, é só a dos
    -- estados que informaram.
    registros / taxa * 100000 as populacao_da_taxa,
    edicao,
    publicacoes,
    uf_nota_texto
from publicacoes
where ordem = 1
