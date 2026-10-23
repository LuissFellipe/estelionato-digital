-- O crescimento do estelionato eletrônico com a mesma base de estados em
-- todos os anos. O total nacional publicado mistura crime novo com estado
-- novo: BA entra em 2022, RN e RS em 2023, e PE some e volta. Aqui ficam só
-- os estados que informaram todos os anos e não têm quebra de série.
with serie as (
    select * from {{ ref('fct_participacao_eletronico') }}
),

anos as (
    select count(distinct ano) as n from serie
),

base as (
    select sigla
    from serie
    where situacao_eletronico = 'informado'
    group by sigla
    having count(*) = (select n from anos)
        and sigla not in (select sigla from {{ ref('quebras_de_serie') }})
),

anual as (
    select
        s.ano,
        sum(s.eletronico) filter (where s.sigla in (select sigla from base)) as base_fixa,
        sum(s.total) filter (where s.sigla in (select sigla from base)) as total_base_fixa,
        sum(s.eletronico) as publicado,
        (select count(*) from base) as ufs_na_base,
        (select list(sigla order by sigla) from base) as ufs
    from serie as s
    group by s.ano
)

select
    *,
    100.0 * (base_fixa / lag(base_fixa) over (order by ano) - 1) as cresc_base_fixa_pct,
    100.0 * (publicado / lag(publicado) over (order by ano) - 1) as cresc_publicado_pct,
    100.0 * base_fixa / total_base_fixa as pct_eletronico_base_fixa
from anual
