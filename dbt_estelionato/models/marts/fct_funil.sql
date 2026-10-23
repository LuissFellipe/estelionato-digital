-- Do boletim à prisão. Processos e presos de um ano não são os casos
-- registrados naquele ano, então a razão é de volume, não de coorte.
with etapas as (
    pivot (select ano, etapa, valor from {{ ref('stg_anuario__funil') }})
    on etapa using max(valor)
)

select
    ano,
    boletins,
    processos,
    presos,
    100.0 * processos / boletins as processos_por_100_boletins,
    100.0 * presos / boletins as presos_por_100_boletins
from etapas
