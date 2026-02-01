"""
WebSocket consumers for real-time multiplayer matches.
"""
import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from jwt import decode as jwt_decode
from django.conf import settings
from collections import defaultdict

from .models import Match, MatchQuestion, Question, UserRanking, Book, Subject
from .serializers import QuestionSerializer, QuestionWithAnswerSerializer, MatchQuestionWithAnswerSerializer

User = get_user_model()

# Globalna kolejka matchmaking (w produkcji użyj Redis)
matchmaking_queue = defaultdict(list)  # {book_id: [match_id, ...]}


class MatchConsumer(AsyncWebsocketConsumer):
    """Consumer dla real-time meczów multiplayer"""

    async def connect(self):
        """Połączenie WebSocket z autentykacją JWT"""
        self.match_id = self.scope['url_route']['kwargs']['match_id']
        self.match = None
        self.user = None
        self.match_group_name = f'match_{self.match_id}'
        # Śledzenie czasu rozpoczęcia każdego pytania {question_index: timestamp}
        self.question_start_time = {}
        # Flaga, aby upewnić się, że timer sync loop jest uruchamiany tylko raz
        self._timer_loop_started = False
        self._timer_task = None

        # Autentykacja przez JWT token w query string
        query_string = self.scope.get('query_string', b'').decode()

        # Parsuj query string - obsłuż URL encoding
        token = None
        if query_string:
            params = query_string.split('&')
            for param in params:
                if param.startswith('token='):
                    token = param.split('=', 1)[1]
                    # URL decode jeśli potrzeba
                    import urllib.parse
                    token = urllib.parse.unquote(token)
                    break

        if not token:
            print(
                f"MatchConsumer: No token provided. Query string: {query_string}")
            await self.close(code=4001)
            return

        try:
            # Weryfikacja tokena
            validated_token = UntypedToken(token)
            decoded_data = jwt_decode(
                token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = decoded_data.get('user_id')

            if not user_id:
                print(f"MatchConsumer: No user_id in token")
                await self.close(code=4001)
                return

            self.user = await self.get_user(user_id)
            if not self.user:
                print(f"MatchConsumer: User {user_id} not found")
                await self.close(code=4001)
                return

            if not self.user.is_active:
                print(f"MatchConsumer: User {user_id} is not active")
                await self.close(code=4001)
                return

        except TokenError as e:
            print(f"MatchConsumer: TokenError: {str(e)}")
            await self.close(code=4001)
            return
        except InvalidToken as e:
            print(f"MatchConsumer: InvalidToken: {str(e)}")
            await self.close(code=4001)
            return
        except Exception as e:
            import traceback
            print(
                f"MatchConsumer: Exception during auth: {type(e).__name__}: {str(e)}")
            print(traceback.format_exc())
            await self.close(code=4001)
            return

        # Sprawdź czy mecz istnieje
        self.match = await self.get_match(self.match_id)
        if not self.match:
            await self.close()
            return

        # Sprawdź czy mecz już się zakończył
        if self.match.status == 'finished':
            # WAŻNE: Zaakceptuj socket PRZED wysyłaniem wiadomości
            await self.accept()
            await self.send(text_data=json.dumps({
                'type': 'match:already_ended',
                'message': 'Ten mecz już się zakończył.',
            }))
            # Poczekaj chwilę aby upewnić się, że wiadomość została wysłana
            await asyncio.sleep(0.1)
            await self.close()
            return

        # Sprawdź czy użytkownik jest uczestnikiem lub może dołączyć (matchmaking)
        is_player1 = self.match.player1_id == self.user.id
        is_player2 = self.match.player2_id == self.user.id if self.match.player2_id else False

        # Jeśli mecz czeka na przeciwnika i użytkownik nie jest player1, może dołączyć jako player2
        if not is_player1 and not is_player2:
            if self.match.status == 'waiting' and not self.match.player2_id:
                # Dołącz jako player2 (matchmaking)
                self.match.player2_id = self.user.id
                await database_sync_to_async(self.match.save)()
                is_player2 = True
            else:
                await self.accept()
                await self.close()
                return

        # Dołącz do grupy meczu
        await self.channel_layer.group_add(
            self.match_group_name,
            self.channel_name
        )

        # WAŻNE: Zaakceptuj socket PRZED wysyłaniem wiadomości
        await self.accept()

        # Powiadom o połączeniu
        await self.channel_layer.group_send(
            self.match_group_name,
            {
                'type': 'match_joined',
                'user_id': self.user.id,
                'username': self.user.username or self.user.email,
            }
        )

        # Jeśli mecz jest już aktywny, wyślij aktualne pytanie do tego gracza
        if self.match.status == 'active':
            print(
                f"MatchConsumer: Player {self.user.id} joining active match {self.match.id}, sending current question")
            # Poczekaj chwilę, aby upewnić się, że połączenie jest w pełni ustanowione
            await asyncio.sleep(0.2)
            current_question = await self.get_next_question(self.match)
            if current_question:
                question_data = await self.get_question_data(current_question)
                # Dodaj current_question_index do danych
                question_data['current_question_index'] = self.match.current_question_index
                print(
                    f"MatchConsumer: Sending current question (index={self.match.current_question_index}) to joining player {self.user.id}")
                # Wysyłaj bezpośrednio do gracza, który dołącza później
                await self.send(text_data=json.dumps({
                    'type': 'match:start',
                    'data': question_data,
                }))
                print(
                    f"MatchConsumer: Sent current question to joining player {self.user.id}")
                # NIE uruchamiaj timer sync loop tutaj - powinien być już uruchomiony przez player1
            else:
                print(
                    f"MatchConsumer: ERROR - No current question found for match {self.match.id}, index={self.match.current_question_index}")

        # Jeśli obaj gracze są połączeni, powiadom o znalezieniu przeciwnika
        if self.match.player2_id:
            await self.channel_layer.group_send(
                self.match_group_name,
                {
                    'type': 'match_found',
                    'player1_id': self.match.player1_id,
                    'player2_id': self.match.player2_id,
                }
            )

            # Jeśli mecz jest w stanie ready, automatycznie generuj pytania i startuj
            if self.match.status == 'ready':
                # Poczekaj chwilę, aby obaj gracze się połączyli
                await asyncio.sleep(1)
                await self.start_match()

        # Rozpocznij timer sync jeśli mecz jest aktywny
        # WAŻNE: Timer sync loop powinien być uruchamiany TYLKO przez player1
        # NIE uruchamiaj go dla player2, który dołącza później
        if self.match.status == 'active':
            if self.match.player1_id == self.user.id and not self._timer_loop_started:
                # Anuluj poprzedni timer task jeśli istnieje
                if self._timer_task:
                    try:
                        self._timer_task.cancel()
                    except:
                        pass
                self._timer_loop_started = True
                self._timer_task = asyncio.create_task(self.timer_sync_loop())
                print(
                    f"MatchConsumer: User {self.user.id} (player1) - Started timer sync loop in connect() for active match")
            else:
                print(
                    f"MatchConsumer: User {self.user.id} (player2 or already started) - NOT starting timer sync loop in connect()")

        # Rozpocznij heartbeat loop
        self._heartbeat_task = asyncio.create_task(self.heartbeat_loop())

    async def disconnect(self, close_code):
        """Rozłączenie"""
        # Anuluj taski
        if hasattr(self, '_timer_task') and self._timer_task is not None:
            try:
                self._timer_task.cancel()
            except:
                pass
        if hasattr(self, '_heartbeat_task') and self._heartbeat_task is not None:
            try:
                self._heartbeat_task.cancel()
            except:
                pass

        # Jeśli mecz jest aktywny i gracz się rozłącza, powiadom przeciwnika
        if hasattr(self, 'match') and self.match and self.match.status == 'active':
            if hasattr(self, 'user') and self.user:
                # Sprawdź czy to gracz 1 czy 2
                opponent_id = None
                if self.match.player1_id == self.user.id:
                    opponent_id = self.match.player2_id
                elif self.match.player2_id == self.user.id:
                    opponent_id = self.match.player1_id

                if opponent_id:
                    # Powiadom przeciwnika o rozłączeniu
                    await self.channel_layer.group_send(
                        self.match_group_name,
                        {
                            'type': 'opponent_disconnect',
                            'user_id': self.user.id,
                            'opponent_id': opponent_id,
                            'message': 'Przeciwnik rozłączył się.',
                        }
                    )
                    # Zakończ mecz automatycznie
                    await self.end_match_on_disconnect()

        if hasattr(self, 'match_group_name'):
            await self.channel_layer.group_discard(
                self.match_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        """Odbieranie wiadomości od klienta"""
        try:
            data = json.loads(text_data)
            event_type = data.get('type')
            print(
                f"MatchConsumer: receive() from user {self.user.id if self.user else 'unknown'}, type={event_type}")

            if event_type == 'match:ready':
                await self.handle_ready()
            elif event_type == 'match:answer':
                answer = data.get('answer')
                await self.handle_answer(answer)
            elif event_type == 'match:join':
                await self.handle_join()
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({'type': 'error', 'message': 'Invalid JSON'}))

    async def handle_ready(self):
        """Gracz gotowy"""
        print(
            f"MatchConsumer: handle_ready() called for user {self.user.id if self.user else 'unknown'}")
        if not self.match or not self.user:
            print(f"MatchConsumer: handle_ready() - no match or user, returning")
            return

        # Użyj bezpośredniego wywołania
        match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
        self.match = match
        print(
            f"MatchConsumer: handle_ready() - match {match.id} status={match.status}, player2_id={match.player2_id}")

        if match.status == 'waiting' and match.player2_id:
            # Generuj pytania i startuj mecz
            print(
                f"MatchConsumer: handle_ready() - match waiting with player2, starting match")
            await self.start_match()
            return

        if match.status == 'active':
            print(
                f"MatchConsumer: handle_ready() - match active, getting current question index={match.current_question_index}")
            
            # Sprawdź czy aktualny wynik pytania powinien być przetworzony
            # (edge case: gracze reconnect po odpowiedziach ale przed przetworzeniem wyniku)
            match_question = await database_sync_to_async(
                lambda: MatchQuestion.objects.select_related('question').filter(
                    match=match,
                    question_order=match.current_question_index
                ).first()
            )()
            
            if match_question:
                if (match_question.player1_answer and match_question.player2_answer and 
                    match_question.player1_correct is None and match_question.player2_correct is None):
                    # Obaj odpowiedzieli ale wynik nie został przetworzony
                    print(
                        f"MatchConsumer: handle_ready() - found unprocessed result for question {match.current_question_index}, processing")
                    await self.process_question_result(match_question)
                    return  # process_question_result wyśle następne pytanie lub zakończy mecz
            
            current_question = await self.get_next_question(match)
            if current_question:
                question_data = await self.get_question_data(current_question)
                question_data['current_question_index'] = match.current_question_index
                print(
                    f"MatchConsumer: handle_ready() - sending match:question to user {self.user.id}")
                await self.send(text_data=json.dumps({
                    'type': 'match:question',
                    'data': question_data,
                }))
                print(
                    f"MatchConsumer: handle_ready() - match:question SENT to user {self.user.id}")
            else:
                print(
                    f"MatchConsumer: handle_ready() - ERROR: no question found for index={match.current_question_index}")
        else:
            print(
                f"MatchConsumer: handle_ready() - match status {match.status} not handled")

    async def handle_answer(self, answer):
        """Obsługa odpowiedzi gracza"""
        print(
            f"MatchConsumer: handle_answer called for user {self.user.id} with answer {answer}")
        if not self.match or not self.user or answer not in ['a', 'b', 'c', 'd']:
            print(
                f"MatchConsumer: handle_answer - invalid input: match={self.match}, user={self.user}, answer={answer}")
            return

        # Sprawdź czy mecz już się zakończył
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
        if self.match.status == 'finished':
            print(
                f"MatchConsumer: handle_answer - match {self.match.id} already finished")
            await self.send(text_data=json.dumps({
                'type': 'match:already_ended',
                'message': 'Ten mecz już się zakończył.',
            }))
            return

        if self.match.status != 'active':
            print(
                f"MatchConsumer: handle_answer - match {self.match.id} not active (status={self.match.status})")
            return

        # Anuluj timeout dla tego pytania jeśli istnieje
        if hasattr(self, '_question_timeout_task'):
            self._question_timeout_task.cancel()

        # Zapisz odpowiedź
        print(
            f"MatchConsumer: Saving answer for user {self.user.id}, match {self.match.id}, question {self.match.current_question_index}")
        match_question = await self.save_answer(self.match, self.user, answer)

        if not match_question:
            print(
                f"MatchConsumer: Failed to save answer for user {self.user.id}")
            return

        print(
            f"MatchConsumer: Answer saved successfully for user {self.user.id}")

        # WAŻNE: Odśwież obiekt z bazy, aby mieć najnowsze dane (w tym odpowiedź przeciwnika)
        # Używamy select_related('question') aby załadować relację question w jednym zapytaniu
        match_question = await database_sync_to_async(
            lambda: MatchQuestion.objects.select_related('question').get(
                match=self.match,
                question_order=self.match.current_question_index
            )
        )()

        print(
            f"MatchConsumer: Refreshed match_question - player1_answer={match_question.player1_answer}, player2_answer={match_question.player2_answer}")

        # Sprawdź czy obaj gracze odpowiedzieli
        if match_question.player1_answer and match_question.player2_answer:
            # Gracz który widzi że obaj odpowiedzieli przetwarza wynik
            # Zabezpieczenie przed race condition jest w process_question_result (atomowy update)
            print(
                f"MatchConsumer: Both players answered for match {self.match.id}, question {match_question.question_order}")
            print(f"MatchConsumer: User {self.user.id} will process result")
            await self.process_question_result(match_question)
        else:
            # Powiadom przeciwnika, że odpowiedziałeś
            print(
                f"MatchConsumer: Player {self.user.id} answered, waiting for opponent. player1_answer={match_question.player1_answer}, player2_answer={match_question.player2_answer}")
            await self.channel_layer.group_send(
                self.match_group_name,
                {
                    'type': 'opponent_answered',
                    'user_id': self.user.id,
                }
            )
            print(
                f"MatchConsumer: Sent opponent_answered event to group {self.match_group_name}")
            # Rozpocznij timeout dla przeciwnika (jeśli jeszcze nie odpowiedział)
            await self.start_question_timeout()

    async def handle_join(self):
        """Dołącz do kolejki matchmaking"""
        # Matchmaking jest obsługiwany w connect()
        pass

    async def start_match(self):
        """Start meczu - generuj pytania i rozpocznij rozgrywkę"""
        if not self.match or not self.match.player2_id:
            return

        # Odśwież mecz z bazy, aby mieć najnowszy status
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)

        # Sprawdź czy mecz już nie jest aktywny (zabezpieczenie przed wielokrotnym startem)
        if self.match.status == 'active':
            print(
                f"Mecz {self.match.id} już jest aktywny, wysyłam aktualne pytanie do gracza {self.user.id}")
            # Wyślij aktualne pytanie do tego gracza (np. gdy dołącza później)
            current_question = await self.get_next_question(self.match)
            if current_question:
                question_data = await self.get_question_data(current_question)
                # Dodaj current_question_index do danych, aby frontend mógł zsynchronizować
                question_data['current_question_index'] = self.match.current_question_index
                await self.send(text_data=json.dumps({
                    'type': 'match:start',
                    'data': question_data,
                }))
                print(
                    f"MatchConsumer: Sent current question (index={self.match.current_question_index}) to late-joining player {self.user.id}")
            else:
                print(
                    f"MatchConsumer: No current question found for match {self.match.id}")
            return

        # Sprawdź czy pytania już istnieją
        questions_exist = await database_sync_to_async(
            MatchQuestion.objects.filter(match=self.match).exists
        )()

        if not questions_exist:
            print(
                f"MatchConsumer: Generating questions for match {self.match.id}")
            # Generuj pytania
            await self.generate_match_questions()
            print(
                f"MatchConsumer: Questions generated for match {self.match.id}")
        else:
            print(
                f"MatchConsumer: Questions already exist for match {self.match.id}")

        # Odśwież mecz z bazy po generowaniu pytań
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)

        # Start meczu - użyj update aby uniknąć race condition
        from django.utils import timezone
        updated = await database_sync_to_async(Match.objects.filter(
            id=self.match.id,
            status__in=['waiting', 'ready']
        ).update)(
            status='active',
            started_at=timezone.now()
        )

        if updated == 0:
            print(
                f"MatchConsumer: Match {self.match.id} already active, skipping status update")
        else:
            print(
                f"MatchConsumer: Match {self.match.id} status updated to active")

        # Odśwież obiekt meczu
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)

        # Upewnij się, że current_question_index jest 0 na początku
        if self.match.current_question_index != 0:
            print(
                f"MatchConsumer: Resetting current_question_index from {self.match.current_question_index} to 0")
            await database_sync_to_async(Match.objects.filter(id=self.match.id).update)(
                current_question_index=0
            )
            self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)

        # Sprawdź ile pytań zostało utworzonych
        questions_count = await self.get_match_questions_count(self.match)
        print(
            f"MatchConsumer: Match {self.match.id} has {questions_count} questions, current_question_index={self.match.current_question_index}")

        # Wyślij pierwsze pytanie
        first_question = await self.get_next_question(self.match)
        if first_question:
            print(
                f"MatchConsumer: Sending first question for match {self.match.id}")
            question_data = await self.get_question_data(first_question)
            # Dodaj current_question_index do danych (pierwsze pytanie = 0)
            question_data['current_question_index'] = 0

            # Ustaw czas rozpoczęcia pierwszego pytania
            from django.utils import timezone
            self.question_start_time[0] = timezone.now()

            await self.channel_layer.group_send(
                self.match_group_name,
                {
                    'type': 'match_start',
                    'data': question_data,
                }
            )
            print(
                f"MatchConsumer: First question sent to group {self.match_group_name}")
            # Rozpocznij timeout dla pierwszego pytania
            await self.start_question_timeout()
        else:
            print(
                f"MatchConsumer: ERROR - No first question found for match {self.match.id}, current_question_index={self.match.current_question_index}, questions_count={questions_count}")

    async def generate_match_questions(self):
        """Generuj pytania dla meczu"""
        # Sprawdź czy pytania już istnieją (zabezpieczenie przed duplikatami)
        existing_questions = await database_sync_to_async(
            MatchQuestion.objects.filter(match=self.match).count
        )()

        if existing_questions > 0:
            print(
                f"Pytania dla meczu {self.match.id} już istnieją ({existing_questions} pytań), pomijam generowanie")
            return

        from ai.agent.question_generator import BookQuestionGenerator

        def _generate_questions():
            generator = BookQuestionGenerator()
            return generator.generate_questions_simple(
                title=self.match.book.title,
                author=self.match.book.author,
                isbn=self.match.book.isbn,
                subject=self.match.book.subject.name,
                toc_pdf_url=self.match.book.toc_pdf_url
            )

        try:
            print(
                f"MatchConsumer: Starting question generation for match {self.match.id}")
            # Uruchom generowanie w osobnym wątku (to może zająć trochę czasu)
            result = await asyncio.to_thread(_generate_questions)
            print(
                f"MatchConsumer: Generated {len(result.questions)} questions from AI")

            # Zapisz pytania do bazy
            questions = []
            for q_data in result.questions[:10]:  # Maksymalnie 10 pytań
                question = await database_sync_to_async(Question.objects.create)(
                    book=self.match.book,
                    question_text=q_data.question,
                    option_a=q_data.option_a,
                    option_b=q_data.option_b,
                    option_c=q_data.option_c,
                    option_d=q_data.option_d,
                    correct_answer=q_data.correct_answer.lower(),
                )
                questions.append(question)
            print(
                f"MatchConsumer: Created {len(questions)} Question objects in database")

            # Utwórz MatchQuestion dla każdego pytania - użyj get_or_create aby uniknąć duplikatów
            created_count = 0
            for idx, question in enumerate(questions):
                # Sprawdź czy już istnieje przed utworzeniem
                exists = await database_sync_to_async(
                    MatchQuestion.objects.filter(
                        match=self.match,
                        question_order=idx
                    ).exists
                )()

                if not exists:
                    await database_sync_to_async(MatchQuestion.objects.create)(
                        match=self.match,
                        question=question,
                        question_order=idx,
                    )
                    created_count += 1
                else:
                    print(
                        f"MatchConsumer: MatchQuestion for match {self.match.id}, order {idx} already exists, skipping")

            print(
                f"MatchConsumer: Created {created_count} MatchQuestion objects for match {self.match.id}")
        except Exception as e:
            print(f"Błąd podczas generowania pytań: {e}")
            import traceback
            traceback.print_exc()
            # W przypadku błędu, użyj istniejących pytań jeśli są
            pass

    async def process_question_result(self, match_question):
        """Przetwarzanie wyniku pytania po odpowiedzi obu graczy"""
        print(
            f"MatchConsumer: process_question_result called by user {self.user.id} for match {self.match.id}, question_order={match_question.question_order}")

        # Odśwież obiekt z bazy, aby mieć najnowsze dane
        match_question = await database_sync_to_async(
            lambda: MatchQuestion.objects.select_related('question').get(
                match=self.match,
                question_order=self.match.current_question_index
            )
        )()

        # Sprawdź czy obaj gracze odpowiedzieli
        if not match_question.player1_answer or not match_question.player2_answer:
            print(
                f"MatchConsumer: Not both players answered yet. player1_answer={match_question.player1_answer}, player2_answer={match_question.player2_answer}")
            return

        # Oblicz poprawność odpowiedzi
        correct_answer = match_question.question.correct_answer
        player1_correct = match_question.player1_answer == correct_answer
        player2_correct = match_question.player2_answer == correct_answer

        # ATOMOWE ZABEZPIECZENIE przed race condition:
        # Użyj update() z warunkiem - tylko jeden gracz może zaktualizować
        # Jeśli updated == 0, to znaczy że inny gracz już zaktualizował
        updated = await database_sync_to_async(
            lambda: MatchQuestion.objects.filter(
                id=match_question.id,
                player1_correct__isnull=True,
                player2_correct__isnull=True
            ).update(
                player1_correct=player1_correct,
                player2_correct=player2_correct
            )
        )()

        if updated == 0:
            print(
                f"MatchConsumer: Question {match_question.question_order} already processed by another player, skipping")
            return

        print(f"MatchConsumer: User {self.user.id} successfully claimed processing for question {match_question.question_order}")

        # Anuluj timeout dla tego pytania
        if hasattr(self, '_question_timeout_task'):
            self._question_timeout_task.cancel()

        # Odśwież match_question po update
        match_question = await database_sync_to_async(
            lambda: MatchQuestion.objects.select_related('question').get(id=match_question.id)
        )()

        # Zaktualizuj wyniki meczu atomowo
        from django.db.models import F
        score_updates = {}
        if player1_correct:
            score_updates['player1_score'] = F('player1_score') + 1
        if player2_correct:
            score_updates['player2_score'] = F('player2_score') + 1

        if score_updates:
            await database_sync_to_async(
                lambda: Match.objects.filter(id=self.match.id).update(**score_updates)
            )()

        # Odśwież self.match z bazy
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
        print(
            f"MatchConsumer: Scores updated - player1={self.match.player1_score}, player2={self.match.player2_score}")

        # Wyślij wyniki z POPRAWNĄ ODPOWIEDZIĄ (dopiero teraz!)
        # WAŻNE: Wysyłamy SUROWE dane bez personalizacji - każdy consumer personalizuje je dla swojego użytkownika
        serializer = MatchQuestionWithAnswerSerializer(match_question)
        raw_result_data = serializer.data
        raw_result_data['player1_answer'] = match_question.player1_answer
        raw_result_data['player2_answer'] = match_question.player2_answer
        raw_result_data['player1_correct'] = match_question.player1_correct
        raw_result_data['player2_correct'] = match_question.player2_correct

        print(
            f"MatchConsumer: Sending match_result to group {self.match_group_name} for question {match_question.question_order}")
        print(
            f"MatchConsumer: Result data - player1_correct={match_question.player1_correct}, player2_correct={match_question.player2_correct}")

        # Wyślij wynik do grupy (wszystkich graczy) - każdy consumer personalizuje dane
        await self.channel_layer.group_send(
            self.match_group_name,
            {
                'type': 'match_result',
                'raw_data': raw_result_data,
            }
        )
        print(
            f"MatchConsumer: match_result sent to group {self.match_group_name}")

        # WAŻNE: Uruchom opóźnione przejście do następnego pytania w osobnym task'u
        # Nie używaj await asyncio.sleep() tutaj - to blokowałoby consumera gracza który przetwarza wynik,
        # uniemożliwiając mu otrzymanie własnego match_result przed upływem 3 sekund!
        async def delayed_advance():
            await asyncio.sleep(3.0)
            await self.advance_match()
        
        asyncio.create_task(delayed_advance())

    async def advance_match(self):
        """Przejście do następnego pytania lub zakończenie meczu"""
        questions_count = await self.get_match_questions_count(self.match)
        print(
            f"MatchConsumer: advance_match called for match {self.match.id}, current_index={self.match.current_question_index}, total={questions_count}")

        if self.match.current_question_index >= questions_count - 1:
            # Zakończ mecz
            print(
                f"MatchConsumer: Match {self.match.id} finished, ending match")
            await self.end_match()
        else:
            # Następne pytanie
            self.match.current_question_index += 1
            await database_sync_to_async(self.match.save)()
            print(
                f"MatchConsumer: Moving to next question, new index={self.match.current_question_index}")

            next_question = await self.get_next_question(self.match)
            if next_question:
                question_data = await self.get_question_data(next_question)
                print(
                    f"MatchConsumer: Sending next question to group {self.match_group_name}")

                # Ustaw czas rozpoczęcia nowego pytania
                from django.utils import timezone
                self.question_start_time[self.match.current_question_index] = timezone.now(
                )

                await self.channel_layer.group_send(
                    self.match_group_name,
                    {
                        'type': 'match_question',
                        'data': {
                            **question_data,
                            'current_question_index': self.match.current_question_index,
                        },
                    }
                )
                # Rozpocznij timeout dla następnego pytania
                await self.start_question_timeout()
            else:
                print(
                    f"MatchConsumer: ERROR - No next question found for match {self.match.id}, index={self.match.current_question_index}")

    async def end_match(self):
        """Zakończenie meczu"""
        self.match.status = 'finished'
        from django.utils import timezone
        self.match.finished_at = timezone.now()

        # Określ zwycięzcę - użyj player1_id i player2_id zamiast bezpośredniego dostępu do obiektów
        print(
            f"MatchConsumer: end_match - Determining winner for match {self.match.id}")
        print(
            f"MatchConsumer: Scores - player1={self.match.player1_score}, player2={self.match.player2_score}")
        if self.match.player1_score > self.match.player2_score:
            self.match.winner_id = self.match.player1_id
            print(
                f"MatchConsumer: Player1 wins (score {self.match.player1_score} vs {self.match.player2_score})")
        elif self.match.player2_score > self.match.player1_score:
            self.match.winner_id = self.match.player2_id
            print(
                f"MatchConsumer: Player2 wins (score {self.match.player2_score} vs {self.match.player1_score})")
        else:
            # Remis - winner pozostaje None
            self.match.winner_id = None
            print(
                f"MatchConsumer: Draw (score {self.match.player1_score} vs {self.match.player2_score})")

        await database_sync_to_async(self.match.save)()
        # Odśwież mecz z bazy, aby mieć pewność że winner_id jest zapisany
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
        print(f"MatchConsumer: After save - winner_id={self.match.winner_id}")

        # Zaktualizuj rankingi
        await self.update_rankings()

        # Wyślij końcowe wyniki
        final_data = await self.get_final_match_data(self.match)

        print(
            f"MatchConsumer: Sending match:end to group {self.match_group_name} for match {self.match.id}")
        print(
            f"MatchConsumer: Final data - player1_score={self.match.player1_score}, player2_score={self.match.player2_score}, winner_id={self.match.winner_id}")

        await self.channel_layer.group_send(
            self.match_group_name,
            {
                'type': 'match_end',
                'data': final_data,
            }
        )
        print(
            f"MatchConsumer: match:end sent to group {self.match_group_name}")

    async def update_rankings(self):
        """Aktualizacja rankingów po zakończeniu meczu"""
        # Użyj winner_id zamiast winner, aby uniknąć SynchronousOnlyOperation
        if not self.match.winner_id:
            return  # Remis - brak zmian w rankingach

        # Pobierz zwycięzcę i przegranego używając ID
        winner_id = self.match.winner_id
        loser_id = self.match.player2_id if winner_id == self.match.player1_id else self.match.player1_id

        # Pobierz obiekty User używając database_sync_to_async
        winner = await self.get_user(winner_id)
        loser = await self.get_user(loser_id)

        if winner and loser:
            # Pobierz obiekt Subject używając subject_id, aby uniknąć SynchronousOnlyOperation
            subject = await self.get_subject(self.match.subject_id)
            if subject:
                # Zaktualizuj rankingi dla zwycięzcy i przegranego
                await self.update_user_ranking(winner, subject, True)
                await self.update_user_ranking(loser, subject, False)

    # WebSocket event handlers (wysyłane do klientów)

    async def match_joined(self, event):
        """Gracz dołączył do meczu"""
        await self.send(text_data=json.dumps({
            'type': 'match:joined',
            'user_id': event['user_id'],
            'username': event['username'],
        }))

    async def player_ready(self, event):
        """Gracz gotowy"""
        await self.send(text_data=json.dumps({
            'type': 'match:player_ready',
            'user_id': event['user_id'],
        }))

    async def opponent_answered(self, event):
        """Przeciwnik odpowiedział"""
        # Wysyłaj do wszystkich graczy w grupie (każdy powinien widzieć, że przeciwnik odpowiedział)
        # Sprawdź tylko, czy to nie jest nasza własna odpowiedź
        if event['user_id'] != self.user.id:
            print(
                f"MatchConsumer: Sending opponent_answered to user {self.user.id} (opponent {event['user_id']} answered)")
            await self.send(text_data=json.dumps({
                'type': 'match:opponent_answered',
            }))
        else:
            print(
                f"MatchConsumer: Ignoring opponent_answered event - it's our own answer (user {self.user.id})")

    async def match_result(self, event):
        """Wynik pytania (z poprawną odpowiedzią!) - personalizowany dla każdego gracza"""
        raw_data = event.get('raw_data', event.get('data', {}))
        
        # Personalizuj dane dla tego użytkownika
        personalized_data = dict(raw_data)
        if self.user.id == self.match.player1_id:
            personalized_data['your_answer'] = raw_data.get('player1_answer')
            personalized_data['your_correct'] = raw_data.get('player1_correct')
            personalized_data['opponent_answer'] = raw_data.get('player2_answer')
            personalized_data['opponent_correct'] = raw_data.get('player2_correct')
        else:
            personalized_data['your_answer'] = raw_data.get('player2_answer')
            personalized_data['your_correct'] = raw_data.get('player2_correct')
            personalized_data['opponent_answer'] = raw_data.get('player1_answer')
            personalized_data['opponent_correct'] = raw_data.get('player1_correct')
        
        print(f"MatchConsumer: match_result handler for user {self.user.id} - your_correct={personalized_data.get('your_correct')}")
        
        await self.send(text_data=json.dumps({
            'type': 'match:result',
            'data': personalized_data,
        }))

    async def match_question(self, event):
        """Nowe pytanie (BEZ poprawnej odpowiedzi!)"""
        print(
            f"MatchConsumer: match_question handler called for user {self.user.id}")
        # Odśwież mecz z bazy, aby mieć aktualny current_question_index
        if hasattr(self, 'match') and self.match:
            self.match = await database_sync_to_async(
                lambda: Match.objects.select_related(
                    'player1', 'player2', 'book', 'subject').get(id=self.match.id)
            )()
            # Upewnij się, że current_question_index jest w danych
            question_data = event.get('data', {})
            if isinstance(question_data, dict):
                question_data['current_question_index'] = self.match.current_question_index
            await self.send(text_data=json.dumps({
                'type': 'match:question',
                'data': question_data,
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'match:question',
                'data': event.get('data', {}),
            }))
        # Rozpocznij timeout dla nowego pytania (tylko dla tego gracza)
        if hasattr(self, 'match') and self.match and self.match.status == 'active':
            print(
                f"MatchConsumer: match_question - User {self.user.id}, match.player1_id={self.match.player1_id}, is_player1={self.match.player1_id == self.user.id}")
            # Ustaw czas rozpoczęcia nowego pytania
            from django.utils import timezone
            question_index = self.match.current_question_index
            self.question_start_time[question_index] = timezone.now()
            print(
                f"MatchConsumer: User {self.user.id} - Set question_start_time[{question_index}] = {self.question_start_time[question_index]}")
            await self.start_question_timeout()
            # Uruchom timer sync loop dla nowego pytania
            # WAŻNE: Timer sync loop powinien być uruchamiany TYLKO przez player1
            if self.match.player1_id == self.user.id:
                if self._timer_task:
                    try:
                        self._timer_task.cancel()
                        print(
                            f"MatchConsumer: User {self.user.id} - Cancelled previous timer task")
                    except:
                        pass
                self._timer_task = asyncio.create_task(self.timer_sync_loop())
                print(
                    f"MatchConsumer: User {self.user.id} (player1) - Started timer sync loop for question {question_index}")
            else:
                print(
                    f"MatchConsumer: User {self.user.id} (player2) - NOT starting timer sync loop (only player1 should)")

    async def match_end(self, event):
        """Koniec meczu"""
        print(
            f"MatchConsumer: match_end handler called for user {self.user.id}, match {self.match.id if hasattr(self, 'match') and self.match else 'unknown'}")
        await self.send(text_data=json.dumps({
            'type': 'match:end',
            'data': event['data'],
        }))
        print(f"MatchConsumer: match:end sent to user {self.user.id}")

    async def match_found(self, event):
        """Znaleziono przeciwnika"""
        await self.send(text_data=json.dumps({
            'type': 'match:found',
            'player1_id': event['player1_id'],
            'player2_id': event['player2_id'],
        }))

    async def match_start(self, event):
        """Start meczu z pierwszym pytaniem"""
        print(
            f"MatchConsumer: match_start handler called for user {self.user.id}")
        await self.send(text_data=json.dumps({
            'type': 'match:start',
            'data': event['data'],
        }))
        # Rozpocznij timeout dla pierwszego pytania (tylko dla tego gracza)
        if hasattr(self, 'match') and self.match and self.match.status == 'active':
            # Odśwież mecz z bazy, aby mieć aktualny current_question_index
            self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
            print(
                f"MatchConsumer: match_start - User {self.user.id}, match.player1_id={self.match.player1_id}, is_player1={self.match.player1_id == self.user.id}")
            # Ustaw czas rozpoczęcia pierwszego pytania
            from django.utils import timezone
            self.question_start_time[0] = timezone.now()
            print(
                f"MatchConsumer: User {self.user.id} - Set question_start_time[0] = {self.question_start_time[0]}")
            await self.start_question_timeout()
            # Uruchom timer sync loop dla pierwszego pytania
            # WAŻNE: Timer sync loop powinien być uruchamiany TYLKO przez player1
            if self.match.player1_id == self.user.id:
                if self._timer_task:
                    try:
                        self._timer_task.cancel()
                        print(
                            f"MatchConsumer: User {self.user.id} - Cancelled previous timer task")
                    except:
                        pass
                self._timer_loop_started = True
                self._timer_task = asyncio.create_task(self.timer_sync_loop())
                print(
                    f"MatchConsumer: User {self.user.id} (player1) - Started timer sync loop for question 0")
            else:
                print(
                    f"MatchConsumer: User {self.user.id} (player2) - NOT starting timer sync loop (only player1 should)")

    # Helper methods

    @database_sync_to_async
    def get_user(self, user_id):
        """Pobierz użytkownika"""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def get_subject(self, subject_id):
        """Pobierz przedmiot"""
        try:
            from .models import Subject
            return Subject.objects.get(id=subject_id)
        except Subject.DoesNotExist:
            return None

    @database_sync_to_async
    def get_match(self, match_id):
        """Pobierz mecz"""
        try:
            return Match.objects.select_related('player1', 'player2', 'book', 'subject').get(id=match_id)
        except Match.DoesNotExist:
            return None

    @database_sync_to_async
    def save_answer(self, match, user, answer):
        """Zapisz odpowiedź gracza"""
        try:
            # Używamy select_related('question') aby załadować relację question w jednym zapytaniu
            match_question = MatchQuestion.objects.select_related('question').get(
                match=match,
                question_order=match.current_question_index
            )

            if user.id == match.player1_id:
                match_question.player1_answer = answer
            elif user.id == match.player2_id:
                match_question.player2_answer = answer

            from django.utils import timezone
            match_question.answered_at = timezone.now()
            match_question.save()

            return match_question
        except MatchQuestion.DoesNotExist:
            return None

    @database_sync_to_async
    def get_match_questions_count(self, match):
        """Pobierz liczbę pytań w meczu"""
        return MatchQuestion.objects.filter(match=match).count()

    @database_sync_to_async
    def get_next_question(self, match):
        """Pobierz następne pytanie"""
        try:
            # Używamy select_related('question') aby załadować relację question w jednym zapytaniu
            match_question = MatchQuestion.objects.select_related('question').get(
                match=match,
                question_order=match.current_question_index
            )
            return match_question.question
        except MatchQuestion.DoesNotExist:
            return None

    async def get_question_data(self, question):
        """Pobierz dane pytania (BEZ poprawnej odpowiedzi!)"""
        serializer = QuestionSerializer(question)
        return serializer.data

    async def get_result_data(self, match_question):
        """Pobierz dane wyniku (Z poprawną odpowiedzią!)"""
        serializer = MatchQuestionWithAnswerSerializer(match_question)
        data = serializer.data

        # Dodaj informacje o tym, który gracz to jesteś
        if self.user.id == self.match.player1_id:
            data['your_answer'] = match_question.player1_answer
            data['your_correct'] = match_question.player1_correct
            data['opponent_answer'] = match_question.player2_answer
            data['opponent_correct'] = match_question.player2_correct
        else:
            data['your_answer'] = match_question.player2_answer
            data['your_correct'] = match_question.player2_correct
            data['opponent_answer'] = match_question.player1_answer
            data['opponent_correct'] = match_question.player1_correct

        return data

    async def get_final_match_data(self, match):
        """Pobierz końcowe dane meczu"""
        match_questions = await database_sync_to_async(list)(
            MatchQuestion.objects.filter(
                match=match).select_related('question')
        )

        results = []
        for mq in match_questions:
            # Użyj database_sync_to_async do serializacji, aby uniknąć SynchronousOnlyOperation
            def serialize_match_question():
                serializer = MatchQuestionWithAnswerSerializer(mq)
                return serializer.data

            data = await database_sync_to_async(serialize_match_question)()

            if self.user.id == match.player1_id:
                data['your_answer'] = mq.player1_answer
                data['your_correct'] = mq.player1_correct
                data['opponent_answer'] = mq.player2_answer
                data['opponent_correct'] = mq.player2_correct
            else:
                data['your_answer'] = mq.player2_answer
                data['your_correct'] = mq.player2_correct
                data['opponent_answer'] = mq.player1_answer
                data['opponent_correct'] = mq.player1_correct

            results.append(data)

        final_data = {
            'match_id': match.id,
            'player1_score': match.player1_score,
            'player2_score': match.player2_score,
            'winner_id': match.winner_id if match.winner_id else None,
            'questions': results,
        }
        print(
            f"MatchConsumer: get_final_match_data for user {self.user.id}, match {match.id}: player1_score={final_data['player1_score']}, player2_score={final_data['player2_score']}, winner_id={final_data['winner_id']}")
        return final_data

    @database_sync_to_async
    def update_user_ranking(self, user, subject, won):
        """Aktualizuj ranking użytkownika"""
        ranking, created = UserRanking.objects.get_or_create(
            user=user,
            subject=subject,
            defaults={'points': 0, 'wins': 0, 'losses': 0}
        )

        if won:
            ranking.points += 10  # Punkty za wygraną
            ranking.wins += 1
        else:
            ranking.losses += 1

        ranking.save()

    async def timer_sync_loop(self):
        """Pętla synchronizacji timera - wysyła aktualny czas co sekundę"""
        print(f"MatchConsumer: User {self.user.id} - timer_sync_loop started")
        while True:
            try:
                if not self.match or self.match.status != 'active':
                    print(
                        f"MatchConsumer: User {self.user.id} - timer_sync_loop: match not active, breaking")
                    break

                # Odśwież mecz z bazy, aby mieć aktualny current_question_index
                self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
                question_index = self.match.current_question_index

                # Pobierz aktualne pytanie
                # Używamy select_related('question') aby załadować relację question w jednym zapytaniu
                match_question = await database_sync_to_async(
                    lambda: MatchQuestion.objects.select_related('question').filter(
                        match=self.match,
                        question_order=question_index
                    ).first()
                )()

                if not match_question:
                    print(
                        f"MatchConsumer: User {self.user.id} - timer_sync_loop: no match_question found, breaking")
                    break

                # Sprawdź czy obaj gracze odpowiedzieli
                if match_question.player1_answer and match_question.player2_answer:
                    # Sprawdź czy wynik został już przetworzony
                    if match_question.player1_correct is None or match_question.player2_correct is None:
                        # Wynik nie został przetworzony - przetwórz go teraz
                        print(
                            f"MatchConsumer: User {self.user.id} - timer_sync_loop: both players answered but result not processed, processing now")
                        await self.process_question_result(match_question)
                    else:
                        print(
                            f"MatchConsumer: User {self.user.id} - timer_sync_loop: both players answered and result processed, breaking")
                    break

                # Oblicz pozostały czas
                from django.utils import timezone
                current_time = timezone.now()

                # Pobierz czas rozpoczęcia pytania
                if question_index not in self.question_start_time:
                    # Jeśli nie ma czasu rozpoczęcia, ustaw go teraz
                    self.question_start_time[question_index] = current_time
                    print(
                        f"MatchConsumer: User {self.user.id} - timer_sync_loop: set start_time[{question_index}] = {current_time}")

                start_time = self.question_start_time[question_index]
                elapsed = (current_time - start_time).total_seconds()
                time_left = max(0, int(60 - elapsed))

                # Wysyłaj timer sync co sekundę
                print(
                    f"MatchConsumer: User {self.user.id} - timer_sync_loop: sending time_left={time_left}, question_index={question_index}")
                await self.channel_layer.group_send(
                    self.match_group_name,
                    {
                        'type': 'timer_sync',
                        'time_left': time_left,
                        'question_index': question_index,
                    }
                )

                # Jeśli czas się skończył, przerwij pętlę
                if time_left <= 0:
                    print(
                        f"MatchConsumer: User {self.user.id} - timer_sync_loop: time expired, breaking")
                    break

                await asyncio.sleep(1)
            except asyncio.CancelledError:
                print(
                    f"MatchConsumer: User {self.user.id} - timer_sync_loop: cancelled")
                break
            except Exception as e:
                print(
                    f"MatchConsumer: User {self.user.id} - Timer sync loop error: {e}")
                import traceback
                traceback.print_exc()
                break

    async def timer_sync(self, event):
        """Handler dla timer sync event"""
        print(
            f"MatchConsumer: User {self.user.id} - timer_sync handler: sending time_left={event['time_left']}, question_index={event['question_index']}")
        await self.send(text_data=json.dumps({
            'type': 'match:timer_sync',
            'time_left': event['time_left'],
            'question_index': event['question_index'],
        }))

    async def heartbeat_loop(self):
        """Pętla heartbeat - wysyła ping co 30 sekund"""
        try:
            while True:
                await asyncio.sleep(30)
                if hasattr(self, 'match') and self.match and self.match.status == 'active':
                    await self.send(text_data=json.dumps({
                        'type': 'ping',
                    }))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Heartbeat loop error: {e}")

    async def start_question_timeout(self):
        """Rozpocznij timeout dla aktualnego pytania (60 sekund)"""
        # Anuluj poprzedni timeout jeśli istnieje
        if hasattr(self, '_question_timeout_task'):
            self._question_timeout_task.cancel()

        async def timeout_handler():
            try:
                await asyncio.sleep(60)  # 60 sekund timeout
                # Sprawdź czy mecz nadal jest aktywny i czy pytanie nie zostało już odpowiedziane
                self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
                if self.match.status != 'active':
                    return

                # Sprawdź aktualne pytanie
                # Używamy select_related('question') aby załadować relację question w jednym zapytaniu
                match_question = await database_sync_to_async(
                    lambda: MatchQuestion.objects.select_related('question').filter(
                        match=self.match,
                        question_order=self.match.current_question_index
                    ).first()
                )()

                if not match_question:
                    return

                # Sprawdź czy któryś z graczy nie odpowiedział
                player1_answered = match_question.player1_answer is not None
                player2_answered = match_question.player2_answer is not None

                if not player1_answered or not player2_answered:
                    # Automatycznie odpowiedz dla gracza, który nie odpowiedział
                    if not player1_answered:
                        match_question.player1_answer = 'a'  # Domyślna odpowiedź
                        match_question.player1_correct = False
                    if not player2_answered:
                        match_question.player2_answer = 'a'  # Domyślna odpowiedź
                        match_question.player2_correct = False

                    from django.utils import timezone
                    match_question.answered_at = timezone.now()
                    await database_sync_to_async(match_question.save)()

                    # Powiadom o timeout
                    await self.channel_layer.group_send(
                        self.match_group_name,
                        {
                            'type': 'match_timeout',
                            'question_index': self.match.current_question_index,
                            'message': 'Czas na odpowiedź minął.',
                        }
                    )

                    # Przetwórz wynik pytania
                    # Atomowy update w process_question_result zapobiega race condition
                    print(f"MatchConsumer: Timeout - User {self.user.id} will process result")
                    await self.process_question_result(match_question)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"Question timeout handler error: {e}")

        self._question_timeout_task = asyncio.create_task(timeout_handler())

    async def end_match_on_disconnect(self):
        """Zakończ mecz gdy gracz się rozłącza"""
        if not self.match or self.match.status != 'active':
            return

        # Odśwież mecz z bazy
        self.match = await database_sync_to_async(Match.objects.get)(id=self.match.id)
        if self.match.status != 'active':
            return

        # Ustaw zwycięzcę jako gracza, który pozostał - użyj winner_id zamiast winner
        if self.match.player1_id == self.user.id:
            # Player1 się rozłączył, player2 wygrywa
            self.match.winner_id = self.match.player2_id
            # Bonus za pozostałe pytania
            self.match.player2_score += (10 -
                                         self.match.current_question_index)
        else:
            # Player2 się rozłączył, player1 wygrywa
            self.match.winner_id = self.match.player1_id
            # Bonus za pozostałe pytania
            self.match.player1_score += (10 -
                                         self.match.current_question_index)

        self.match.status = 'finished'
        from django.utils import timezone
        self.match.finished_at = timezone.now()
        await database_sync_to_async(self.match.save)()

        # Zaktualizuj rankingi
        await self.update_rankings()

        # Wyślij końcowe wyniki
        final_data = await self.get_final_match_data(self.match)
        await self.channel_layer.group_send(
            self.match_group_name,
            {
                'type': 'match_end',
                'data': final_data,
            }
        )

    async def opponent_disconnect(self, event):
        """Handler dla rozłączenia przeciwnika"""
        if event.get('user_id') != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'match:opponent_disconnect',
                'message': event.get('message', 'Przeciwnik rozłączył się.'),
            }))

    async def match_timeout(self, event):
        """Handler dla timeout pytania"""
        await self.send(text_data=json.dumps({
            'type': 'match:timeout',
            'question_index': event.get('question_index'),
            'message': event.get('message', 'Czas na odpowiedź minął.'),
        }))
