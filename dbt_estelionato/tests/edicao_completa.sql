-- Cada edição traz Brasil + 27 UFs, dois anos e dois crimes.
select edicao, count(*) as linhas
from {{ ref('stg_anuario__estelionato') }}
group by edicao
having count(*) <> 28 * 2 * 2
