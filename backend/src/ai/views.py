from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from quiz.models import Book
from ai.agent.question_generator import BookQuestionGenerator


class GenerateQuestionsView(APIView):
    """
    Endpoint do generowania pytań z książki używając agenta LangChain.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, book_id):
        """
        Generuje 10 pytań i odpowiedzi dla danej książki.

        Body: (opcjonalne)
        - use_agent: bool (domyślnie True) - czy używać agenta z Tavily
        """
        try:
            # Pobierz książkę
            book = Book.objects.get(id=book_id)

            # Inicjalizuj generator
            generator = BookQuestionGenerator()

            # Sprawdź czy używać agenta czy prostego LLM
            use_agent = request.data.get('use_agent', True)

            # Generuj pytania
            if use_agent:
                result = generator.generate_questions(
                    title=book.title,
                    author=book.author,
                    isbn=book.isbn,
                    subject=book.subject.name,
                    toc_pdf_url=book.toc_pdf_url
                )
            else:
                result = generator.generate_questions_simple(
                    title=book.title,
                    author=book.author,
                    isbn=book.isbn,
                    subject=book.subject.name,
                    toc_pdf_url=book.toc_pdf_url
                )

            # Zwróć odpowiedź (result jest już dict po model_dump())
            return Response(
                {
                    "success": True,
                    "data": result.model_dump() if hasattr(result, 'model_dump') else result
                },
                status=status.HTTP_200_OK
            )

        except Book.DoesNotExist:
            return Response(
                {"success": False, "error": "Książka nie została znaleziona"},
                status=status.HTTP_404_NOT_FOUND
            )
        except ValueError as e:
            return Response(
                {"success": False, "error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"success": False, "error": f"Błąd podczas generowania pytań: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
