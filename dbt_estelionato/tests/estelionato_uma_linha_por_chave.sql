select uf, ano, crime, count(*)
from {{ ref('fct_estelionato') }}
group by all
having count(*) > 1
