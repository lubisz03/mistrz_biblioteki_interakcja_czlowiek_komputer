from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

# Create your models here.


class Subject(models.Model):
    name = models.CharField(max_length=255)
    color = models.CharField(
        max_length=7, help_text="Hex color code (e.g., #FF5733)")
    icon_name = models.CharField(
        max_length=100,
        help_text="Lucide icon name (e.g., 'book', 'math', 'science')"
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Book(models.Model):
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    isbn = models.CharField(max_length=255)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    toc_pdf_url = models.URLField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class Question(models.Model):
    """Zapisane pytania wygenerowane z książek"""
    book = models.ForeignKey(
        Book, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    option_a = models.CharField(max_length=500)
    option_b = models.CharField(max_length=500)
    option_c = models.CharField(max_length=500)
    option_d = models.CharField(max_length=500)
    correct_answer = models.CharField(
        max_length=1,
        choices=[('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')],
        help_text="Poprawna odpowiedź - NIE wysyłać w API przed zakończeniem pytania"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.book.title} - {self.question_text[:50]}..."


class Match(models.Model):
    """Mecz 1v1 między dwoma graczami"""
    STATUS_CHOICES = [
        ('waiting', 'Oczekiwanie na przeciwnika'),
        ('ready', 'Gracze gotowi'),
        ('active', 'W trakcie'),
        ('finished', 'Zakończony'),
    ]

    player1 = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='matches_as_player1')
    player2 = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='matches_as_player2',
        null=True,
        blank=True
    )
    book = models.ForeignKey(
        Book, on_delete=models.CASCADE, related_name='matches')
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name='matches')
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='waiting')
    current_question_index = models.IntegerField(default=0)
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)
    winner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='won_matches'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Match {self.id}: {self.player1} vs {self.player2 or 'Waiting...'}"


class MatchQuestion(models.Model):
    """Odpowiedzi graczy na pytania w meczu"""
    match = models.ForeignKey(
        Match, on_delete=models.CASCADE, related_name='match_questions')
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    question_order = models.IntegerField()
    player1_answer = models.CharField(max_length=1, null=True, blank=True, choices=[
                                      ('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')])
    player2_answer = models.CharField(max_length=1, null=True, blank=True, choices=[
                                      ('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')])
    player1_correct = models.BooleanField(null=True, blank=True)
    player2_correct = models.BooleanField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['question_order']
        unique_together = ['match', 'question_order']

    def __str__(self):
        return f"Match {self.match.id} - Question {self.question_order}"


class UserRanking(models.Model):
    """Ranking użytkownika w danej kategorii"""
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='rankings')
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name='rankings')
    points = models.IntegerField(default=0)
    wins = models.IntegerField(default=0)
    losses = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'subject']
        ordering = ['-points', '-wins']
        indexes = [
            models.Index(fields=['subject', '-points']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.subject.name}: {self.points} pts"


class Benefit(models.Model):
    """Korzyści użytkownika (np. darmowy parking)"""
    BENEFIT_TYPES = [
        ('parking', 'Darmowy parking'),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='benefits')
    benefit_type = models.CharField(max_length=50, choices=BENEFIT_TYPES)
    usage_count = models.IntegerField(default=0)
    max_usage = models.IntegerField(default=30)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'benefit_type']
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} - {self.get_benefit_type_display()}: {self.usage_count}/{self.max_usage}"

    @property
    def remaining_usage(self):
        return max(0, self.max_usage - self.usage_count)
