.PHONY: baixar extrair transform painel docs pipeline site

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

# Os números, as fontes e o contorno dos estados num dados.js que a página carrega.
painel:
	uv run python painel/gerar.py

pipeline: baixar extrair transform painel

# Documentação do dbt como página estática, publicada junto com o painel em /dbt/.
docs:
	cd dbt_estelionato && uv run dbt docs generate --static --profiles-dir .
	mkdir -p painel/dbt && cp dbt_estelionato/target/static_index.html painel/dbt/index.html

# A página também abre com dois cliques em painel/index.html; o servidor é opcional.
site:
	@echo "abra http://localhost:8003"
	uv run python -m http.server 8003 -d painel
