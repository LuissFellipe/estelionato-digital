-- Uma linha por edição, UF, ano e crime, com o número absoluto e a taxa lado
-- a lado. A variação percentual da tabela fica de fora: é derivada dos dois
-- anos e recalculável.
with valores as (
    select * from {{ source('bronze', 'estelionato_uf') }}
    where medida in ('absoluto', 'taxa')
),

notas as (
    select edicao, nota, texto from {{ source('bronze', 'notas') }}
)

select
    v.edicao,
    v.uf,
    u.sigla,
    coalesce(u.regiao, 'Brasil') as regiao,
    v.uf = 'Brasil' as eh_brasil,
    v.ano,
    v.crime,
    max(v.valor) filter (where v.medida = 'absoluto') as registros,
    max(v.valor) filter (where v.medida = 'taxa') as taxa,
    -- "..." na planilha: o estado não informou. Nulo aqui não é zero.
    max(v.situacao) filter (where v.medida = 'absoluto') as situacao,
    max(v.uf_nota) as uf_nota,
    max(nu.texto) as uf_nota_texto,
    max(v.ano_nota) as ano_nota,
    max(v.linha_excel) as linha_excel
from valores as v
left join {{ ref('ufs') }} as u on u.uf = v.uf
left join notas as nu on nu.edicao = v.edicao and nu.nota = v.uf_nota
group by all
