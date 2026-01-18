import pdfplumber
import requests
from typing import Optional
import io


class PDFExtractor:
    """Extractor do pobierania i parsowania treści z PDF."""

    def __init__(self, max_pages: int = 50):
        """
        Args:
            max_pages: Maksymalna liczba stron do ekstrakcji (dla wydajności)
        """
        self.max_pages = max_pages

    def extract_text_from_url(self, pdf_url: str) -> Optional[str]:
        """
        Pobiera PDF z URL i ekstrahuje tekst.

        Args:
            pdf_url: URL do pliku PDF

        Returns:
            Tekst z PDF lub None w przypadku błędu
        """
        try:
            # Pobierz PDF
            response = requests.get(pdf_url, timeout=30)
            response.raise_for_status()

            # Otwórz PDF z pdfplumber
            pdf_bytes = io.BytesIO(response.content)

            text_parts = []
            with pdfplumber.open(pdf_bytes) as pdf:
                # Ogranicz liczbę stron dla wydajności
                pages_to_extract = min(len(pdf.pages), self.max_pages)

                for i, page in enumerate(pdf.pages[:pages_to_extract]):
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)

            full_text = "\n\n".join(text_parts)
            return full_text if full_text.strip() else None

        except Exception as e:
            print(f"Error extracting PDF from {pdf_url}: {e}")
            return None

    def extract_table_of_contents(self, pdf_url: str) -> Optional[str]:
        """
        Ekstrahuje spis treści z PDF (pierwsze strony).

        Args:
            pdf_url: URL do pliku PDF

        Returns:
            Tekst spisu treści lub None
        """
        try:
            response = requests.get(pdf_url, timeout=30)
            response.raise_for_status()

            pdf_bytes = io.BytesIO(response.content)

            text_parts = []
            with pdfplumber.open(pdf_bytes) as pdf:
                # Spis treści jest zwykle w pierwszych 10 stronach
                for page in pdf.pages[:10]:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)

            toc_text = "\n\n".join(text_parts)
            return toc_text if toc_text.strip() else None

        except Exception as e:
            print(f"Error extracting TOC from {pdf_url}: {e}")
            return None
