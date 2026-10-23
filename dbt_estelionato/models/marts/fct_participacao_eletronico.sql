-- Quanto do estelionato de cada estado é registrado como eletrônico. A
-- diferença entre vizinhos é grande demais para ser só crime: é também o
-- jeito de cada polícia classificar o boletim.
with ultimo as (
    select * from {{ ref('fct_estelionato') }} where not eh_brasil
)

select
    t.uf,
    t.sigla,
    t.regiao,
    t.ano,
    t.registros as total,
    t.taxa as taxa_total,
    e.registros as eletronico,
    e.taxa as taxa_eletronico,
    e.situacao as situacao_eletronico,
    100.0 * e.registros / t.registros as pct_eletronico
from ultimo as t
inner join ultimo as e on e.uf = t.uf and e.ano = t.ano and e.crime = 'eletronico'
where t.crime = 'total'
