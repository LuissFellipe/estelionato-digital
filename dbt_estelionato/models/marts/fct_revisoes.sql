-- Cada ano do meio da série é publicado duas vezes: como ano corrente numa
-- edição e, revisado, como ano anterior na seguinte. Esta tabela põe as duas
-- versões lado a lado.
with versoes as (
    select * from {{ ref('stg_anuario__estelionato') }}
),

pares as (
    select
        o.uf,
        o.sigla,
        o.regiao,
        o.eh_brasil,
        o.ano,
        o.crime,
        o.edicao as edicao_original,
        o.registros as registros_original,
        o.situacao as situacao_original,
        r.edicao as edicao_revisada,
        r.registros as registros_revisado,
        r.situacao as situacao_revisada,
        r.uf_nota_texto as nota_revisada
    from versoes as o
    inner join versoes as r
        on r.uf = o.uf and r.ano = o.ano and r.crime = o.crime and r.edicao = o.edicao + 1
)

select
    *,
    registros_revisado - registros_original as diferenca,
    100.0 * (registros_revisado / registros_original - 1) as variacao_pct,
    case
        when situacao_original = 'nao_informado' and situacao_revisada = 'nao_informado' then 'nunca informado'
        when situacao_original = 'nao_informado' then 'passou a informar'
        when situacao_revisada = 'nao_informado' then 'deixou de informar'
        when registros_revisado = registros_original then 'igual'
        else 'revisado'
    end as tipo,
    nota_revisada is not null as tem_nota
from pares
