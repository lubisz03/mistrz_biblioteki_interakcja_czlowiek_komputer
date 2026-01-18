from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Subject, Book, Question, Match, MatchQuestion, UserRanking, Benefit

User = get_user_model()


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'color', 'icon_name']
        read_only_fields = ['id', 'name', 'color', 'icon_name']


class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ['id', 'title', 'author', 'isbn', 'subject', 'toc_pdf_url']
        read_only_fields = ['id', 'title', 'author',
                            'isbn', 'subject', 'toc_pdf_url']


class QuestionSerializer(serializers.ModelSerializer):
    """Serializer dla pytania - BEZ correct_answer dla bezpieczeństwa"""
    class Meta:
        model = Question
        fields = ['id', 'book', 'question_text',
                  'option_a', 'option_b', 'option_c', 'option_d']
        read_only_fields = ['id', 'book', 'question_text',
                            'option_a', 'option_b', 'option_c', 'option_d']


class QuestionWithAnswerSerializer(serializers.ModelSerializer):
    """Serializer z correct_answer - tylko po zakończeniu pytania/meczu"""
    class Meta:
        model = Question
        fields = ['id', 'book', 'question_text', 'option_a',
                  'option_b', 'option_c', 'option_d', 'correct_answer']
        read_only_fields = ['id', 'book', 'question_text', 'option_a',
                            'option_b', 'option_c', 'option_d', 'correct_answer']


class UserBasicSerializer(serializers.ModelSerializer):
    """Podstawowe informacje o użytkowniku"""
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'username']
        read_only_fields = ['id', 'email',
                            'first_name', 'last_name', 'username']


class MatchQuestionSerializer(serializers.ModelSerializer):
    """Serializer dla odpowiedzi w meczu"""
    question = QuestionSerializer(read_only=True)

    class Meta:
        model = MatchQuestion
        fields = ['id', 'match', 'question', 'question_order', 'player1_answer', 'player2_answer',
                  'player1_correct', 'player2_correct', 'answered_at']
        read_only_fields = ['id', 'match', 'question', 'question_order', 'player1_answer', 'player2_answer',
                            'player1_correct', 'player2_correct', 'answered_at']


class MatchQuestionWithAnswerSerializer(serializers.ModelSerializer):
    """Serializer z poprawną odpowiedzią - tylko po zakończeniu pytania"""
    question = QuestionWithAnswerSerializer(read_only=True)

    class Meta:
        model = MatchQuestion
        fields = ['id', 'match', 'question', 'question_order', 'player1_answer', 'player2_answer',
                  'player1_correct', 'player2_correct', 'answered_at']
        read_only_fields = ['id', 'match', 'question', 'question_order', 'player1_answer', 'player2_answer',
                            'player1_correct', 'player2_correct', 'answered_at']


class MatchSerializer(serializers.ModelSerializer):
    """Serializer dla meczu"""
    player1 = UserBasicSerializer(read_only=True)
    player2 = UserBasicSerializer(read_only=True)
    book = BookSerializer(read_only=True)
    subject = SubjectSerializer(read_only=True)
    winner = UserBasicSerializer(read_only=True)
    total_questions = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = ['id', 'player1', 'player2', 'book', 'subject', 'status', 'current_question_index',
                  'player1_score', 'player2_score', 'winner', 'created_at', 'started_at', 'finished_at', 'total_questions']
        read_only_fields = ['id', 'player1', 'player2', 'book', 'subject', 'status', 'current_question_index',
                            'player1_score', 'player2_score', 'winner', 'created_at', 'started_at', 'finished_at', 'total_questions']

    def get_total_questions(self, obj):
        """Zwróć liczbę pytań w meczu"""
        # Użyj prefetch_related jeśli dostępne, w przeciwnym razie użyj count()
        if hasattr(obj, '_prefetched_objects_cache') and 'match_questions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['match_questions'])
        return obj.match_questions.count()


class UserRankingSerializer(serializers.ModelSerializer):
    """Serializer dla rankingu użytkownika"""
    user = UserBasicSerializer(read_only=True)
    subject = SubjectSerializer(read_only=True)

    class Meta:
        model = UserRanking
        fields = ['id', 'user', 'subject', 'points',
                  'wins', 'losses', 'updated_at']
        read_only_fields = ['id', 'user', 'subject',
                            'points', 'wins', 'losses', 'updated_at']


class RankingEntrySerializer(serializers.Serializer):
    """Serializer dla pozycji w rankingu"""
    position = serializers.IntegerField()
    user = UserBasicSerializer()
    points = serializers.IntegerField()
    wins = serializers.IntegerField()
    losses = serializers.IntegerField()
    subject_id = serializers.IntegerField(required=False)


class BenefitSerializer(serializers.ModelSerializer):
    """Serializer dla korzyści użytkownika"""
    remaining_usage = serializers.IntegerField(read_only=True)

    class Meta:
        model = Benefit
        fields = ['id', 'user', 'benefit_type', 'usage_count', 'max_usage',
                  'remaining_usage', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'benefit_type', 'usage_count',
                            'max_usage', 'remaining_usage', 'is_active', 'created_at', 'updated_at']


class MatchCreateSerializer(serializers.Serializer):
    """Serializer do tworzenia meczu"""
    book_id = serializers.IntegerField()
    subject_id = serializers.IntegerField()
    invite_email = serializers.EmailField(required=False, allow_null=True)
    invite_index = serializers.CharField(
        required=False, allow_null=True, max_length=50)
    opponent_id = serializers.IntegerField(required=False, allow_null=True)
