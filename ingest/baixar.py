"""Baixa as planilhas dos Anuários. Arquivo já baixado não é baixado de novo:
uma edição publicada não muda, e a seguinte sai uma vez por ano."""

import sys

import requests

from fontes import BRUTO, EDICOES, planilha

# O site do Fórum responde 403 a clientes sem cara de navegador.
CABECALHO = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}


def main() -> None:
    BRUTO.mkdir(parents=True, exist_ok=True)
    for edicao, url in EDICOES.items():
        destino = planilha(edicao)
        if destino.exists():
            print(f"{edicao}: já baixada")
            continue
        resposta = requests.get(url, headers=CABECALHO, timeout=120)
        resposta.raise_for_status()
        # Um XLSX é um ZIP; uma página de erro servida com 200 não começa assim.
        if not resposta.content.startswith(b"PK"):
            sys.exit(f"{edicao}: {url} não devolveu uma planilha")
        destino.write_bytes(resposta.content)
        print(f"{edicao}: {len(resposta.content) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
