select edicao, aba, nota, texto
from {{ source('bronze', 'notas') }}
