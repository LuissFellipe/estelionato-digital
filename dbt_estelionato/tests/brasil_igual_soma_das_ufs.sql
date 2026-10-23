-- A linha Brasil é a soma das UFs que informaram, nos dois crimes.
with soma as (
    select
        edicao, ano, crime,
        sum(registros) filter (where not eh_brasil) as soma_ufs,
        max(registros) filter (where eh_brasil) as brasil
    from {{ ref('stg_anuario__estelionato') }}
    group by all
)

select * from soma where soma_ufs <> brasil
