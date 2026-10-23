-- Todo rótulo de linha que não é "Brasil" tem de casar com o seed de UFs,
-- depois de separada a nota de rodapé.
select distinct edicao, uf
from {{ ref('stg_anuario__estelionato') }}
where not eh_brasil and sigla is null
