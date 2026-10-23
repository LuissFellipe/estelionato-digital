"""As planilhas dos Anuários Brasileiros de Segurança Pública que entram no projeto.

Cada edição traz dois anos: o ano anterior à publicação e, revisado, o ano antes
dele. O estelionato por meio eletrônico existe desde 2021 (Lei 14.155/2021), e a
primeira edição com ele em planilha é a de 2023. A de 2022 só saiu em PDF.
"""

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BRUTO = RAIZ / "data" / "bruto"
BRONZE = RAIZ / "data" / "bronze"

DSPACE = "https://publicacoes.forumseguranca.org.br/server/api/core/bitstreams/{}/content"

# edição (ano de publicação) -> URL da planilha
EDICOES = {
    2023: DSPACE.format("963ce35a-5889-491f-bf70-4be8c7043e60"),
    2024: DSPACE.format("8d67098f-1319-4d84-b57c-fb3246a5f66f"),
    2025: "https://forumseguranca.org.br/wp-content/uploads/2025/09/anuario-2025.xlsx",
    2026: "https://forumseguranca.org.br/wp-content/uploads/2026/07/anuario-2026.xlsx",
}


def planilha(edicao: int) -> Path:
    return BRUTO / f"anuario-{edicao}.xlsx"
