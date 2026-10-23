.PHONY: baixar extrair transform export docs pipeline site

# As etapas dependem uma da outra pela ordem, não por arquivos: com make -j o
# transform rodaria antes de a extração terminar.
.NOTPARALLEL:

export PROJETO := $(CURDIR)

baixar:
	uv run python ingest/baixar.py

extrair:
	uv run python ingest/extrair.py

transform:
	cd dbt_estelionato && uv run dbt build --profiles-dir .

export:
	uv run python export/exportar.py

pipeline: baixar extrair transform export

# Documentação do dbt como página estática, publicada junto com o painel em /dbt/.
docs:
	cd dbt_estelionato && uv run dbt docs generate --static --profiles-dir .
	mkdir -p site/dbt && cp dbt_estelionato/target/static_index.html site/dbt/index.html

site:
	@echo "abra http://localhost:8003"
	uv run python -m http.server 8003 -d site
