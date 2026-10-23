select edicao, ano, registros
from {{ source('bronze', 'serie_nacional') }}
