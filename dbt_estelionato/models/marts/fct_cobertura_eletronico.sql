-- Que parte do país o número de estelionato eletrônico cobre. Os estados que
-- não informam o eletrônico informam o total, então o peso deles no total
-- mede o tamanho do buraco.
with ultimo as (
    select * from {{ ref('fct_estelionato') }} where not eh_brasil
),

por_uf as (
    select
        t.ano,
        t.sigla,
        t.registros as total,
        e.registros as eletronico,
        e.situacao = 'informado' as informa
    from ultimo as t
    inner join ultimo as e on e.uf = t.uf and e.ano = t.ano and e.crime = 'eletronico'
    where t.crime = 'total'
)

select
    ano,
    count(*) filter (where informa) as ufs_que_informam,
    list(sigla order by sigla) filter (where not informa) as ufs_sem_dado,
    sum(total) as total_brasil,
    sum(total) filter (where informa) as total_ufs_que_informam,
    sum(eletronico) as eletronico_informado,
    100.0 * sum(total) filter (where informa) / sum(total) as pct_total_coberto,
    -- A leitura ingênua divide o eletrônico pelo total do país inteiro.
    100.0 * sum(eletronico) / sum(total) as pct_eletronico_ingenuo,
    100.0 * sum(eletronico) / sum(total) filter (where informa) as pct_eletronico_entre_informantes
from por_uf
group by ano
