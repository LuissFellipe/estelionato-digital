-- O painel e a tabela da mesma edição dão o mesmo número para o Brasil.
select s.edicao, s.ano, s.registros, t.registros
from {{ ref('stg_anuario__serie_nacional') }} as s
inner join {{ ref('stg_anuario__estelionato') }} as t
    on t.edicao = s.edicao and t.ano = s.ano and t.eh_brasil and t.crime = 'total'
where s.registros <> t.registros
