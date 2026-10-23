select
    edicao,
    case etapa
        when 'Boletins de Ocorrência' then 'boletins'
        when 'Processos Penais' then 'processos'
        when 'Presos' then 'presos'
    end as etapa,
    ano,
    valor
from {{ source('bronze', 'funil') }}
