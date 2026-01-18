from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, F, Count, Sum
from django.contrib.auth import get_user_model

from .models import Subject, Book, UserRanking, Benefit, Match, Question
from .serializers import (
    SubjectSerializer, BookSerializer, UserRankingSerializer,
    RankingEntrySerializer, BenefitSerializer, MatchSerializer,
    MatchCreateSerializer, UserBasicSerializer
)

User = get_user_model()


class SubjectListView(ListAPIView):
    """
    List all subjects with their name, color, and Lucide icon name.
    All fields are read-only.
    """
    queryset = Subject.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = SubjectSerializer


class BookListView(ListAPIView):
    """
    List all books for a given subject.
    All fields are read-only.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = BookSerializer

    def get_queryset(self):
        subject_id = self.kwargs['subject_id']
        return Book.objects.filter(subject_id=subject_id).order_by('title')


class RankingView(APIView):
    """Ranking ogólny lub w kategorii"""
    permission_classes = [IsAuthenticated]

    def get(self, request, subject_id=None):
        if subject_id:
            # Ranking w kategorii
            rankings = UserRanking.objects.filter(subject_id=subject_id).select_related(
                'user', 'subject').order_by('-points', '-wins')
        else:
            # Ranking ogólny (suma punktów ze wszystkich kategorii)
            rankings = UserRanking.objects.values('user').annotate(
                total_points=Sum('points'),
                total_wins=Sum('wins'),
                total_losses=Sum('losses')
            ).order_by('-total_points', '-total_wins')

            # Konwertuj na listę z pozycjami
            result = []
            for idx, ranking in enumerate(rankings, start=1):
                user = User.objects.get(id=ranking['user'])
                result.append({
                    'position': idx,
                    'user': UserBasicSerializer(user).data,
                    'points': ranking['total_points'],
                    'wins': ranking['total_wins'],
                    'losses': ranking['total_losses'],
                })

            serializer = RankingEntrySerializer(result, many=True)
            return Response(serializer.data)

        # Ranking w kategorii z pozycjami
        result = []
        for idx, ranking in enumerate(rankings, start=1):
            result.append({
                'position': idx,
                'user': UserBasicSerializer(ranking.user).data,
                'points': ranking.points,
                'wins': ranking.wins,
                'losses': ranking.losses,
                'subject_id': ranking.subject.id,
            })

        serializer = RankingEntrySerializer(result, many=True)
        return Response(serializer.data)


class UserProfileView(APIView):
    """Profil użytkownika z rankingami"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        rankings = UserRanking.objects.filter(
            user=user).select_related('subject').order_by('-points')

        user_data = UserBasicSerializer(user).data
        rankings_data = UserRankingSerializer(rankings, many=True).data

        return Response({
            'user': user_data,
            'rankings': rankings_data,
        })


class BenefitsView(APIView):
    """Korzyści użytkownika"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        benefits = Benefit.objects.filter(user=request.user, is_active=True)
        serializer = BenefitSerializer(benefits, many=True)
        return Response(serializer.data)


class UseBenefitView(APIView):
    """Wykorzystaj benefit"""
    permission_classes = [IsAuthenticated]

    def post(self, request, benefit_id):
        try:
            benefit = Benefit.objects.get(
                id=benefit_id, user=request.user, is_active=True)

            if benefit.usage_count >= benefit.max_usage:
                return Response(
                    {'error': 'Benefit został już wykorzystany w pełni'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            benefit.usage_count += 1
            benefit.save()

            serializer = BenefitSerializer(benefit)
            return Response(serializer.data)
        except Benefit.DoesNotExist:
            return Response(
                {'error': 'Benefit nie został znaleziony'},
                status=status.HTTP_404_NOT_FOUND
            )


class MatchViewSet(viewsets.ModelViewSet):
    """Zarządzanie meczami"""
    permission_classes = [IsAuthenticated]
    serializer_class = MatchSerializer

    def get_queryset(self):
        return Match.objects.filter(
            Q(player1=self.request.user) | Q(player2=self.request.user)
        ).select_related('player1', 'player2', 'book', 'subject', 'winner').prefetch_related('match_questions').order_by('-created_at')

    @action(detail=False, methods=['post'])
    def find(self, request):
        """Znajdź przeciwnika (matchmaking)"""
        serializer = MatchCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        book_id = serializer.validated_data['book_id']
        subject_id = serializer.validated_data['subject_id']
        invite_email = serializer.validated_data.get('invite_email')
        invite_index = serializer.validated_data.get('invite_index')

        try:
            book = Book.objects.get(id=book_id)
            subject = Subject.objects.get(id=subject_id)
        except (Book.DoesNotExist, Subject.DoesNotExist):
            return Response(
                {'error': 'Książka lub kategoria nie została znaleziona'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Jeśli zaproszenie przez email/index
        if invite_email or invite_index:
            try:
                if invite_email:
                    opponent = User.objects.get(email=invite_email)
                else:
                    # Zakładamy, że index jest w username
                    opponent = User.objects.get(username=invite_index)

                if opponent == request.user:
                    return Response(
                        {'error': 'Nie możesz zaprosić samego siebie'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Utwórz mecz z zaproszeniem
                match = Match.objects.create(
                    player1=request.user,
                    player2=opponent,
                    book=book,
                    subject=subject,
                    status='waiting'
                )

                # Wyślij powiadomienie o zaproszeniu przez WebSocket
                from .notification_consumer import send_invite_notification
                from asgiref.sync import async_to_sync

                # Wywołaj funkcję asynchroniczną z synchronicznego kontekstu
                async_to_sync(send_invite_notification)(
                    match.id,
                    request.user.id,
                    opponent.id,
                    book.id,
                    subject.id
                )

                serializer = MatchSerializer(match)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            except User.DoesNotExist:
                return Response(
                    {'error': 'Użytkownik nie został znaleziony'},
                    status=status.HTTP_404_NOT_FOUND
                )

        # Matchmaking - utwórz mecz i wyślij powiadomienia do aktywnych graczy
        match = Match.objects.create(
            player1=request.user,
            book=book,
            subject=subject,
            status='waiting'
        )

        # Wyślij powiadomienia do aktywnych graczy
        from .notification_consumer import send_match_notification
        from asgiref.sync import async_to_sync

        # Wywołaj funkcję asynchroniczną z synchronicznego kontekstu
        async_to_sync(send_match_notification)(
            match.id,
            request.user.id,
            book.id,
            subject.id
        )

        serializer = MatchSerializer(match)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def challenge(self, request):
        """Wyzwij konkretnego gracza (z sidebaru)"""
        serializer = MatchCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        book_id = serializer.validated_data['book_id']
        subject_id = serializer.validated_data['subject_id']
        opponent_id = serializer.validated_data.get('opponent_id')

        if not opponent_id:
            return Response(
                {'error': 'Opponent ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            book = Book.objects.get(id=book_id)
            subject = Subject.objects.get(id=subject_id)
            opponent = User.objects.get(id=opponent_id)
        except (Book.DoesNotExist, Subject.DoesNotExist, User.DoesNotExist):
            return Response(
                {'error': 'Książka, kategoria lub użytkownik nie został znaleziony'},
                status=status.HTTP_404_NOT_FOUND
            )

        if opponent == request.user:
            return Response(
                {'error': 'Nie możesz wyzwać samego siebie'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Utwórz mecz z zaproszeniem
        match = Match.objects.create(
            player1=request.user,
            player2=opponent,
            book=book,
            subject=subject,
            status='waiting'
        )

        # Wyślij powiadomienie o zaproszeniu przez WebSocket
        from .notification_consumer import send_invite_notification
        from asgiref.sync import async_to_sync

        # Wywołaj funkcję asynchroniczną z synchronicznego kontekstu
        async_to_sync(send_invite_notification)(
            match.id,
            request.user.id,
            opponent.id,
            book.id,
            subject.id
        )

        serializer = MatchSerializer(match)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def ready(self, request, pk=None):
        """Oznacz gotowość do meczu"""
        match = self.get_object()

        if match.player1 != request.user and match.player2 != request.user:
            return Response(
                {'error': 'Nie jesteś uczestnikiem tego meczu'},
                status=status.HTTP_403_FORBIDDEN
            )

        if match.status == 'waiting':
            match.status = 'ready'
            match.save()

        serializer = MatchSerializer(match)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start meczu - generuj pytania i rozpocznij rozgrywkę"""
        match = self.get_object()

        if match.player1 != request.user and (not match.player2 or match.player2 != request.user):
            return Response(
                {'error': 'Nie jesteś uczestnikiem tego meczu'},
                status=status.HTTP_403_FORBIDDEN
            )

        if match.status != 'ready' or not match.player2:
            return Response(
                {'error': 'Mecz nie jest gotowy do startu'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Sprawdź czy pytania już istnieją
        from .models import MatchQuestion
        if MatchQuestion.objects.filter(match=match).exists():
            # Pytania już istnieją, tylko zmień status
            match.status = 'active'
            from django.utils import timezone
            match.started_at = timezone.now()
            match.save()
        else:
            # Generuj pytania
            from ai.agent.question_generator import BookQuestionGenerator
            generator = BookQuestionGenerator()

            try:
                result = generator.generate_questions_simple(
                    title=match.book.title,
                    author=match.book.author,
                    isbn=match.book.isbn,
                    subject=match.book.subject.name,
                    toc_pdf_url=match.book.toc_pdf_url
                )

                # Zapisz pytania do bazy
                from .models import Question
                questions = []
                for q_data in result.questions[:10]:  # Maksymalnie 10 pytań
                    question = Question.objects.create(
                        book=match.book,
                        question_text=q_data.question,
                        option_a=q_data.option_a,
                        option_b=q_data.option_b,
                        option_c=q_data.option_c,
                        option_d=q_data.option_d,
                        correct_answer=q_data.correct_answer.lower(),
                    )
                    questions.append(question)

                # Utwórz MatchQuestion dla każdego pytania
                for idx, question in enumerate(questions):
                    MatchQuestion.objects.create(
                        match=match,
                        question=question,
                        question_order=idx,
                    )

                # Start meczu
                match.status = 'active'
                from django.utils import timezone
                match.started_at = timezone.now()
                match.save()

            except Exception as e:
                return Response(
                    {'error': f'Błąd podczas generowania pytań: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        serializer = MatchSerializer(match)
        return Response(serializer.data)
