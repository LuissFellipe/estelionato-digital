-- Num mesmo estado e ano, as taxas do total e do eletrônico dividem pela
-- mesma população. Se divergirem, a extração trocou alguma coluna.
with pop as (
    select edicao, uf, ano, crime, registros / taxa * 100000 as populacao
    from {{ ref('stg_anuario__estelionato') }}
    where not eh_brasil and situacao = 'informado' and registros > 0
)

select t.edicao, t.uf, t.ano, t.populacao, e.populacao
from pop as t
inner join pop as e using (edicao, uf, ano)
where t.crime = 'total' and e.crime = 'eletronico'
    and abs(e.populacao / t.populacao - 1) > 0.001
