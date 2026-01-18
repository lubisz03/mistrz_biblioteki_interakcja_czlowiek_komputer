import os
from typing import Optional, List, Dict, Any
from langchain_tavily import TavilySearch
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, Field, ValidationError

from ai.extractors.pdf_extractor import PDFExtractor


# Modele Pydantic do walidacji odpowiedzi
class QuestionAnswer(BaseModel):
    """Model pojedynczego pytania wielokrotnego wyboru."""
    question: str = Field(..., description="Pytanie dotyczące treści książki")
    option_a: str = Field(..., description="Opcja odpowiedzi A")
    option_b: str = Field(..., description="Opcja odpowiedzi B")
    option_c: str = Field(..., description="Opcja odpowiedzi C")
    option_d: str = Field(..., description="Opcja odpowiedzi D")
    correct_answer: str = Field(...,
                                description="Poprawna odpowiedź: 'a', 'b', 'c' lub 'd'")


class BookQuestionsResponse(BaseModel):
    """Model odpowiedzi z listą pytań wielokrotnego wyboru dla książki."""
    book_title: str = Field(..., description="Tytuł książki")
    book_author: str = Field(..., description="Autor książki")
    book_isbn: str = Field(..., description="ISBN książki")
    subject: str = Field(..., description="Kategoria/temat książki")
    questions: List[QuestionAnswer] = Field(...,
                                            description="Lista 10 pytań wielokrotnego wyboru")


class BookQuestionGenerator:
    """Agent do generowania pytań z książek używający LangChain, Tavily i PDF."""

    def __init__(self):
        self.pdf_extractor = PDFExtractor(max_pages=30)
        self.llm = None
        self.llm_with_tools = None
        self.tavily_tool = None
        self._initialize_agent()

    def _initialize_agent(self):
        """Inicjalizuje agenta LangChain z Tavily."""
        # Sprawdź klucze API
        tavily_api_key = os.getenv("TAVILY_API_KEY")
        # Sprawdź różne możliwe nazwy dla klucza API
        openai_api_key = os.getenv("CLOUDE_API_KEY") or os.getenv(
            "ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")

        if not tavily_api_key:
            raise ValueError(
                "TAVILY_API_KEY nie jest ustawiony w zmiennych środowiskowych")
        if not openai_api_key:
            raise ValueError(
                "CLOUDE_API_KEY, ANTHROPIC_API_KEY lub OPENAI_API_KEY nie jest ustawiony w zmiennych środowiskowych")

        # Inicjalizuj LLM - tylko Claude
        from langchain_anthropic import ChatAnthropic
        self.llm = ChatAnthropic(
            model="claude-sonnet-4-5",
            temperature=0.7,
            api_key=openai_api_key
        )

        # Inicjalizuj narzędzie Tavily
        self.tavily_tool = TavilySearch(
            max_results=3,
            api_key=tavily_api_key
        )

        # Bind tools to LLM (nowsze API LangChain)
        self.llm_with_tools = self.llm.bind_tools([self.tavily_tool])

    def generate_questions(
        self,
        title: str,
        author: str,
        isbn: str,
        subject: str,
        toc_pdf_url: str
    ) -> BookQuestionsResponse:
        """
        Generuje 10 pytań i odpowiedzi dla danej książki używając LLM z dostępem do Tavily.

        Args:
            title: Tytuł książki
            author: Autor książki
            isbn: ISBN książki
            subject: Kategoria/temat książki
            toc_pdf_url: URL do PDF z spisem treści

        Returns:
            BookQuestionsResponse z pytaniami i odpowiedziami
        """
        # Ekstrahuj tekst z PDF
        print(f"Ekstrakcja treści z PDF: {toc_pdf_url}")
        pdf_text = self.pdf_extractor.extract_text_from_url(toc_pdf_url)

        if not pdf_text:
            raise ValueError(
                f"Nie udało się ekstrahować treści z PDF: {toc_pdf_url}")

        # System prompt
        system_prompt = """Jesteś ekspertem w tworzeniu pytań edukacyjnych wielokrotnego wyboru z książek akademickich i naukowych.

Twoim zadaniem jest stworzenie 10 wysokiej jakości pytań wielokrotnego wyboru na podstawie:
1. Treści książki (spis treści i wybrane fragmenty z PDF)
2. Informacji o książce (tytuł, autor, temat)
3. Dodatkowych informacji z wyszukiwarki Tavily (jeśli potrzebne - użyj dostępnego narzędzia)

WYMAGANIA DO PYTAŃ:
- Pytania MUSZĄ być oparte wyłącznie na treści książki
- Pytania powinny pokrywać różne tematy z książki
- Pytania powinny być na różnym poziomie trudności (podstawowe, średnie, zaawansowane)
- Pytania powinny testować zrozumienie, nie tylko pamięć
- FOKUS NA TREŚCI: Pytania powinny koncentrować się na koncepcjach, metodach, teorii, definicjach, zastosowaniach i zrozumieniu materiału
- UNIKAJ pytań typu "w którym rozdziale...", "który autor...", "jaki tytuł rozdziału..." - maksymalnie 1-2 takie pytania na 10
- Preferuj pytania o: definicje, koncepcje, metody, zastosowania, przykłady, obliczenia, interpretacje, porównania
- Każde pytanie musi mieć dokładnie 4 opcje odpowiedzi (a, b, c, d)
- Tylko jedna opcja powinna być poprawna
- Nieprawidłowe opcje powinny być wiarygodne i związane z tematem (nie oczywiście błędne)

WYMAGANIA DO ODPOWIEDZI:
- Każda opcja (a, b, c, d) powinna być konkretna i zwięzła (1-2 zdania)
- Poprawna odpowiedź musi być precyzyjna i oparta na treści książki
- Nieprawidłowe opcje powinny być logiczne i testować zrozumienie (np. częste błędy, podobne koncepcje, mylące alternatywy)
- Wszystkie opcje powinny być podobnej długości i stylu

FORMAT WYJŚCIOWY:
Zwróć TYLKO poprawny JSON z dokładnie 10 pytaniami wielokrotnego wyboru w formacie:
{{
    "book_title": "tytuł",
    "book_author": "autor",
    "book_isbn": "isbn",
    "subject": "temat",
    "questions": [
        {{
            "question": "pytanie 1",
            "option_a": "odpowiedź A",
            "option_b": "odpowiedź B",
            "option_c": "odpowiedź C",
            "option_d": "odpowiedź D",
            "correct_answer": "a"
        }},
        ...
    ]
}}

Pamiętaj:
- Wszystkie pytania MUSZĄ być bezpośrednio związane z treścią książki!
- FOKUS NA TREŚCI, nie na strukturze książki (rozdziały, autorzy rozdziałów)
- correct_answer musi być dokładnie 'a', 'b', 'c' lub 'd' (małe litery)"""

        # Przygotuj prompt dla LLM
        user_prompt = f"""Na podstawie poniższych informacji o książce, stwórz 10 pytań wielokrotnego wyboru.

INFORMACJE O KSIĄŻCE:
- Tytuł: {title}
- Autor: {author}
- ISBN: {isbn}
- Temat/Kategoria: {subject}

TREŚĆ KSIĄŻKI (spis treści i fragmenty):
{pdf_text[:8000]}

Zadanie: Stwórz dokładnie 10 pytań wielokrotnego wyboru (a, b, c, d) opartych WYŁĄCZNIE na treści tej książki.

WAŻNE WYTYCZNE:
- FOKUS NA TREŚCI: Pytania powinny koncentrować się na koncepcjach, metodach, teorii, definicjach, zastosowaniach
- UNIKAJ pytań o strukturę książki (rozdziały, autorzy rozdziałów) - maksymalnie 1-2 takie pytania
- Preferuj pytania o: definicje, koncepcje, metody, zastosowania, przykłady, obliczenia, interpretacje
- Pytania powinny pokrywać różne tematy z książki i być na różnym poziomie trudności
- Każde pytanie musi mieć 4 opcje odpowiedzi, z których tylko jedna jest poprawna
- Nieprawidłowe opcje powinny być wiarygodne i logiczne

Jeśli potrzebujesz dodatkowych informacji o książce, możesz użyć narzędzia wyszukiwarki Tavily."""

        # Wywołaj LLM z tools
        print("Generowanie pytań przez LLM z dostępem do Tavily...")
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]

        # Wykonaj wywołanie z możliwością użycia tools
        response = self.llm_with_tools.invoke(messages)

        # Jeśli LLM chce użyć tool, wykonaj to (maksymalnie 3 iteracje)
        max_iterations = 3
        iteration = 0
        while hasattr(response, 'tool_calls') and response.tool_calls and iteration < max_iterations:
            from langchain_core.messages import ToolMessage
            tool_results = []
            for tool_call in response.tool_calls:
                tool_name = tool_call.get("name", "")
                tool_args = tool_call.get("args", {})
                if "tavily" in tool_name.lower() or "search" in tool_name.lower():
                    try:
                        result = self.tavily_tool.invoke(tool_args)
                        tool_results.append(
                            ToolMessage(
                                content=str(result),
                                tool_call_id=tool_call.get("id", "")
                            )
                        )
                    except Exception as e:
                        print(f"Błąd podczas wywołania Tavily: {e}")

            # Dodaj wyniki tool do konwersacji
            messages.append(response)
            messages.extend(tool_results)

            # Kontynuuj konwersację
            response = self.llm_with_tools.invoke(messages)
            iteration += 1

        # Parsuj odpowiedź
        agent_response = response.content if hasattr(
            response, 'content') else str(response)

        # Spróbuj wyciągnąć JSON z odpowiedzi
        import json
        import re

        # Szukaj JSON w odpowiedzi
        json_match = re.search(r'\{.*\}', agent_response, re.DOTALL)
        if json_match:
            try:
                json_str = json_match.group(0)
                data = json.loads(json_str)

                # Waliduj przez Pydantic
                response_obj = BookQuestionsResponse(**data)
                return response_obj
            except (json.JSONDecodeError, ValidationError) as e:
                print(f"Błąd parsowania JSON: {e}")
                print(f"Odpowiedź LLM: {agent_response[:500]}")
                raise ValueError(
                    f"Nie udało się sparsować odpowiedzi: {e}")
        else:
            raise ValueError("Nie znaleziono JSON w odpowiedzi")

    def generate_questions_simple(
        self,
        title: str,
        author: str,
        isbn: str,
        subject: str,
        toc_pdf_url: str
    ) -> BookQuestionsResponse:
        """
        Uproszczona wersja bez agenta - bezpośrednie wywołanie LLM.
        Użyj tego jeśli agent nie działa poprawnie.
        """
        # Ekstrahuj tekst z PDF
        pdf_text = self.pdf_extractor.extract_text_from_url(toc_pdf_url)

        if not pdf_text:
            raise ValueError(
                f"Nie udało się ekstrahować treści z PDF: {toc_pdf_url}")

        # Przygotuj prompt
        system_prompt = """Jesteś ekspertem w tworzeniu pytań edukacyjnych wielokrotnego wyboru z książek akademickich.

Stwórz DOKŁADNIE 10 pytań wielokrotnego wyboru (a, b, c, d) opartych WYŁĄCZNIE na treści książki.
Każde pytanie musi mieć 4 opcje odpowiedzi, z których tylko jedna jest poprawna.

WAŻNE: FOKUS NA TREŚCI - koncentruj się na koncepcjach, metodach, teorii, definicjach, zastosowaniach.
UNIKAJ pytań o strukturę książki (rozdziały, autorzy) - maksymalnie 1-2 takie pytania."""

        user_prompt = f"""INFORMACJE O KSIĄŻCE:
- Tytuł: {title}
- Autor: {author}
- ISBN: {isbn}
- Temat: {subject}

TREŚĆ KSIĄŻKI:
{pdf_text[:6000]}

WYMAGANIA:
- Pytania MUSZĄ być oparte na treści książki
- FOKUS NA TREŚCI: koncepcje, metody, teoria, definicje, zastosowania
- UNIKAJ pytań o strukturę (rozdziały, autorzy) - maksymalnie 1-2
- Różne poziomy trudności
- Różne tematy z książki
- Każde pytanie: 4 opcje (a, b, c, d), tylko jedna poprawna
- Nieprawidłowe opcje powinny być wiarygodne

Zwróć TYLKO poprawny JSON w formacie:
{{
    "book_title": "{title}",
    "book_author": "{author}",
    "book_isbn": "{isbn}",
    "subject": "{subject}",
    "questions": [
        {{
            "question": "pytanie",
            "option_a": "odpowiedź A",
            "option_b": "odpowiedź B",
            "option_c": "odpowiedź C",
            "option_d": "odpowiedź D",
            "correct_answer": "a"
        }},
        ...
    ]
}}"""

        # Wywołaj LLM bezpośrednio
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        response = self.llm.invoke(messages)
        response_text = response.content

        # Parsuj JSON
        import json
        import re

        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return BookQuestionsResponse(**data)
        else:
            raise ValueError("Nie znaleziono JSON w odpowiedzi")
