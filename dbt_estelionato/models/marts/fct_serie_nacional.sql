-- Registros de estelionato no Brasil, com a primeira e a última versão de
-- cada ano. Junta o painel (desde 2018) e a tabela por UF (desde 2021).
with versoes as (
    select edicao, ano, registros from {{ ref('stg_anuario__serie_nacional') }}
    union
    select edicao, ano, registros from {{ ref('stg_anuario__estelionato') }}
    where eh_brasil and crime = 'total'
)

select
    ano,
    arg_max(registros, edicao) as registros,
    arg_min(registros, edicao) as primeira_publicacao,
    min(edicao) as primeira_edicao,
    max(edicao) as ultima_edicao
from versoes
group by ano
