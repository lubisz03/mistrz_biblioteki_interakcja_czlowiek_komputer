"""
WebSocket consumer dla powiadomień i aktywnych użytkowników.
Obsługuje:
- Tracking aktywnych użytkowników
- Powiadomienia o możliwości gry
- Zaproszenia do meczów
"""
import json
import asyncio
from datetime import datetime, timedelta
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from jwt import decode as jwt_decode
from django.conf import settings
from typing import Dict, Set, Optional
from collections import defaultdict

from .models import Match, UserRanking, Book, Subject
from auth_api.serializers import UserSerializer

User = get_user_model()

# Globalne struktury danych (w produkcji użyj Redis)
# {user_id: {channel_name, last_seen, user_data}}
active_users: Dict[int, Dict] = {}
# {match_id: {player1_id, book_id, subject_id, created_at, timeout_task}}
pending_matches: Dict[int, Dict] = {}
# {match_id: {player1_id, player2_id, created_at, timeout_task}}
pending_invites: Dict[int, Dict] = {}


class NotificationConsumer(AsyncWebsocketConsumer):
    """Consumer dla powiadomień i aktywnych użytkowników"""

    async def connect(self):
        """Połączenie WebSocket z autentykacją JWT"""
        # Autentykacja przez JWT token w query string
        query_string = self.scope.get('query_string', b'').decode()

        # Parsuj query string
        token = None
        if query_string:
            params = query_string.split('&')
            for param in params:
                if param.startswith('token='):
                    token = param.split('=', 1)[1]
                    break

        if not token:
            print(f"NotificationConsumer: No token provided. Query string: {query_string}")
            await self.close(code=4001)  # 4001 = Unauthorized
            return

        try:
            # Weryfikacja tokena - najpierw sprawdź czy token jest poprawny
            validated_token = UntypedToken(token)

            # Dekoduj token
            decoded_data = jwt_decode(
                token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = decoded_data.get('user_id')

            if not user_id:
                print(f"NotificationConsumer: No user_id in token. Decoded: {decoded_data}")
                await self.close(code=4001)
                return

            # Pobierz użytkownika
            self.user = await self.get_user(user_id)
            if not self.user:
                print(f"NotificationConsumer: User {user_id} not found in database")
                await self.close(code=4001)
                return

            if not self.user.is_active:
                print(f"NotificationConsumer: User {user_id} is not active")
                await self.close(code=4001)
                return

            self.user_id = user_id
            print(f"NotificationConsumer: User {user_id} ({self.user.email}) authenticated successfully")

        except TokenError as e:
            print(f"NotificationConsumer: TokenError: {str(e)}")
            await self.close(code=4001)
            return
        except InvalidToken as e:
            print(f"NotificationConsumer: InvalidToken: {str(e)}")
            await self.close(code=4001)
            return
        except Exception as e:
            import traceback
            print(f"NotificationConsumer: Exception during auth: {type(e).__name__}: {str(e)}")
            print(traceback.format_exc())
            await self.close(code=4001)
            return

        # Dołącz do grupy użytkownika (dla powiadomień)
        self.user_group_name = f'user_{self.user_id}'
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)

        # Dołącz do grupy aktywnych użytkowników
        self.active_users_group = 'active_users'
        await self.channel_layer.group_add(self.active_users_group, self.channel_name)

        # Zarejestruj użytkownika jako aktywnego
        await self.register_active_user()

        await self.accept()

        # Wyślij listę aktywnych użytkowników
        await self.send_active_users_list()

        # Rozpocznij heartbeat loop
        self._heartbeat_task = asyncio.create_task(self.heartbeat_loop())

    async def disconnect(self, close_code):
        """Rozłączenie - usuń użytkownika z aktywnych"""
        # Anuluj heartbeat loop
        if hasattr(self, '_heartbeat_task'):
            self._heartbeat_task.cancel()

        await self.unregister_active_user()
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)
        if hasattr(self, 'active_users_group'):
            await self.channel_layer.group_discard(self.active_users_group, self.channel_name)

    async def receive(self, text_data):
        """Odbieranie wiadomości od klienta"""
        try:
            data = json.loads(text_data)
            event_type = data.get('type')

            if event_type == 'ping':
                await self.handle_ping()
            elif event_type == 'match:accept':
                match_id = data.get('match_id')
                await self.handle_match_accept(match_id)
            elif event_type == 'match:decline':
                match_id = data.get('match_id')
                await self.handle_match_decline(match_id)
            elif event_type == 'invite:accept':
                match_id = data.get('match_id')
                await self.handle_invite_accept(match_id)
            elif event_type == 'invite:decline':
                match_id = data.get('match_id')
                await self.handle_invite_decline(match_id)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({'type': 'error', 'message': 'Invalid JSON'}))

    # Event handlers

    async def handle_ping(self):
        """Aktualizuj last_seen użytkownika"""
        await self.update_last_seen()

    async def handle_match_accept(self, match_id: int):
        """Gracz zaakceptował mecz"""
        if match_id in pending_matches:
            match_data = pending_matches[match_id]
            if match_data['player1_id'] != self.user_id:
                # Zaktualizuj istniejący mecz zamiast tworzyć nowy
                try:
                    match = await database_sync_to_async(Match.objects.get)(id=match_id)
                    match.player2_id = self.user_id
                    match.status = 'ready'
                    await database_sync_to_async(match.save)()

                    # Anuluj timeout
                    if 'timeout_task' in match_data:
                        match_data['timeout_task'].cancel()
                    del pending_matches[match_id]

                    # Powiadom obu graczy
                    opponent_data = await NotificationConsumer.get_user_data(self.user_id)
                    await self.channel_layer.group_send(
                        f'user_{match_data["player1_id"]}',
                        {
                            'type': 'match_accepted',
                            'match_id': match.id,
                            'opponent': opponent_data,
                        }
                    )
                    await self.send(text_data=json.dumps({
                        'type': 'match:accepted',
                        'match_id': match.id,
                    }))
                except Exception as e:
                    print(f"Error accepting match: {e}")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Nie udało się zaakceptować meczu',
                    }))

    async def handle_match_decline(self, match_id: int):
        """Gracz odrzucił mecz"""
        if match_id in pending_matches:
            match_data = pending_matches[match_id]
            # Powiadom gracza 1
            opponent_data = await NotificationConsumer.get_user_data(self.user_id)
            await self.channel_layer.group_send(
                f'user_{match_data["player1_id"]}',
                {
                    'type': 'match_declined',
                    'match_id': match_id,
                    'opponent': opponent_data,
                }
            )

    async def handle_invite_accept(self, match_id: int):
        """Gracz zaakceptował zaproszenie"""
        if match_id in pending_invites:
            invite_data = pending_invites[match_id]
            if invite_data['player2_id'] == self.user_id:
                # Zaktualizuj mecz
                try:
                    match = await database_sync_to_async(Match.objects.get)(id=match_id)
                    match.status = 'ready'
                    await database_sync_to_async(match.save)()

                    # Anuluj timeout
                    if 'timeout_task' in invite_data:
                        invite_data['timeout_task'].cancel()
                    del pending_invites[match_id]

                    # Powiadom gracza 1
                    await self.channel_layer.group_send(
                        f'user_{invite_data["player1_id"]}',
                        {
                            'type': 'invite_accepted',
                            'match_id': match_id,
                        }
                    )
                    await self.send(text_data=json.dumps({
                        'type': 'invite:accepted',
                        'match_id': match_id,
                    }))
                except Exception as e:
                    print(f"Error accepting invite: {e}")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Nie udało się zaakceptować zaproszenia',
                    }))

    async def handle_invite_decline(self, match_id: int):
        """Gracz odrzucił zaproszenie"""
        if match_id in pending_invites:
            invite_data = pending_invites[match_id]
            if invite_data['player2_id'] == self.user_id:
                # Anuluj timeout
                if 'timeout_task' in invite_data:
                    invite_data['timeout_task'].cancel()
                del pending_invites[match_id]

                # Powiadom gracza 1
                await self.channel_layer.group_send(
                    f'user_{invite_data["player1_id"]}',
                    {
                        'type': 'invite_declined',
                        'match_id': match_id,
                    }
                )

    # Helper methods

    async def register_active_user(self):
        """Zarejestruj użytkownika jako aktywnego"""
        user_data = await NotificationConsumer.get_user_data(self.user_id)
        active_users[self.user_id] = {
            'channel_name': self.channel_name,
            'last_seen': datetime.now(),
            'user_data': user_data,
        }
        # Powiadom innych o nowym aktywnym użytkowniku
        await self.channel_layer.group_send(
            self.active_users_group,
            {
                'type': 'user_joined',
                'user': user_data,
            }
        )

    async def unregister_active_user(self):
        """Usuń użytkownika z aktywnych"""
        if self.user_id in active_users:
            del active_users[self.user_id]
            # Powiadom innych o opuszczeniu
            await self.channel_layer.group_send(
                self.active_users_group,
                {
                    'type': 'user_left',
                    'user_id': self.user_id,
                }
            )

    async def update_last_seen(self):
        """Aktualizuj last_seen użytkownika"""
        if self.user_id in active_users:
            active_users[self.user_id]['last_seen'] = datetime.now()

    async def send_active_users_list(self):
        """Wyślij listę aktywnych użytkowników"""
        # Filtruj nieaktywnych (ostatnia aktywność > 5 minut temu)
        cutoff = datetime.now() - timedelta(minutes=5)
        active = [
            user_data['user_data']
            for user_data in active_users.values()
            if user_data['last_seen'] > cutoff and user_data['user_data']['id'] != self.user_id
        ]

        await self.send(text_data=json.dumps({
            'type': 'active_users',
            'users': active,
        }))

    @database_sync_to_async
    def get_user(self, user_id):
        """Pobierz użytkownika"""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    @staticmethod
    @database_sync_to_async
    def get_user_data(user_id):
        """Pobierz dane użytkownika z rankingiem"""
        try:
            user = User.objects.get(id=user_id)
            # Pobierz najlepszy ranking
            best_ranking = UserRanking.objects.filter(
                user=user).order_by('-points').first()
            serializer = UserSerializer(user)
            data = serializer.data
            if best_ranking:
                data['best_ranking'] = {
                    'points': best_ranking.points,
                    'subject': best_ranking.subject.name,
                }
            return data
        except User.DoesNotExist:
            return None

    # WebSocket event handlers (wysyłane do klientów)

    async def user_joined(self, event):
        """Nowy aktywny użytkownik"""
        await self.send(text_data=json.dumps({
            'type': 'user:joined',
            'user': event['user'],
        }))

    async def user_left(self, event):
        """Użytkownik opuścił platformę"""
        await self.send(text_data=json.dumps({
            'type': 'user:left',
            'user_id': event['user_id'],
        }))

    async def match_notification(self, event):
        """Powiadomienie o możliwości gry"""
        await self.send(text_data=json.dumps({
            'type': 'match:notification',
            'match_id': event['match_id'],
            'player': event['player'],
            'book': event['book'],
            'subject': event['subject'],
            'timeout': 60,
        }))

    async def match_accepted(self, event):
        """Mecz został zaakceptowany"""
        await self.send(text_data=json.dumps({
            'type': 'match:accepted',
            'match_id': event['match_id'],
            'opponent': event['opponent'],
        }))

    async def match_declined(self, event):
        """Mecz został odrzucony"""
        await self.send(text_data=json.dumps({
            'type': 'match:declined',
            'match_id': event['match_id'],
            'opponent': event['opponent'],
        }))

    async def match_timeout(self, event):
        """Timeout meczu"""
        await self.send(text_data=json.dumps({
            'type': 'match:timeout',
            'match_id': event['match_id'],
        }))

    async def invite_notification(self, event):
        """Powiadomienie o zaproszeniu"""
        await self.send(text_data=json.dumps({
            'type': 'invite:notification',
            'match_id': event['match_id'],
            'player': event['player'],
            'book': event['book'],
            'subject': event['subject'],
            'timeout': 60,
        }))

    async def invite_accepted(self, event):
        """Zaproszenie zostało zaakceptowane"""
        await self.send(text_data=json.dumps({
            'type': 'invite:accepted',
            'match_id': event['match_id'],
        }))

    async def invite_declined(self, event):
        """Zaproszenie zostało odrzucone"""
        await self.send(text_data=json.dumps({
            'type': 'invite:declined',
            'match_id': event['match_id'],
        }))

    async def invite_timeout(self, event):
        """Timeout zaproszenia"""
        await self.send(text_data=json.dumps({
            'type': 'invite:timeout',
            'match_id': event['match_id'],
        }))

    async def heartbeat_loop(self):
        """Pętla heartbeat - wysyła ping co 30 sekund"""
        try:
            while True:
                await asyncio.sleep(30)
                await self.send(text_data=json.dumps({
                    'type': 'ping',
                }))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Heartbeat loop error: {e}")


# Helper functions dla matchmakingu

async def send_match_notification(match_id: int, player1_id: int, book_id: int, subject_id: int):
    """Wyślij powiadomienie o możliwości gry do aktywnych użytkowników"""
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()

    # Pobierz dane
    book = await database_sync_to_async(Book.objects.get)(id=book_id)
    subject = await database_sync_to_async(Subject.objects.get)(id=subject_id)
    player1_data = await NotificationConsumer.get_user_data(player1_id)

    if not player1_data:
        return

    # Wyślij do wszystkich aktywnych użytkowników (oprócz gracza 1)
    cutoff = datetime.now() - timedelta(minutes=5)
    active_user_ids = [
        user_id for user_id, user_data in active_users.items()
        if user_data['last_seen'] > cutoff and user_id != player1_id
    ]

    for user_id in active_user_ids:
        await channel_layer.group_send(
            f'user_{user_id}',
            {
                'type': 'match_notification',
                'match_id': match_id,
                'player': player1_data,
                'book': {
                    'id': book.id,
                    'title': book.title,
                    'author': book.author,
                },
                'subject': {
                    'id': subject.id,
                    'name': subject.name,
                    'color': subject.color,
                },
            }
        )

    # Utwórz timeout task
    async def timeout_handler():
        await asyncio.sleep(60)
        if match_id in pending_matches:
            # Anuluj mecz
            await channel_layer.group_send(
                f'user_{player1_id}',
                {
                    'type': 'match_timeout',
                    'match_id': match_id,
                }
            )
            # Usuń mecz z bazy jeśli istnieje
            try:
                match = await database_sync_to_async(Match.objects.get)(id=match_id)
                if match.status == 'waiting' and not match.player2_id:
                    await database_sync_to_async(match.delete)()
            except:
                pass
            del pending_matches[match_id]

    timeout_task = asyncio.create_task(timeout_handler())
    pending_matches[match_id] = {
        'player1_id': player1_id,
        'book_id': book_id,
        'subject_id': subject_id,
        'created_at': datetime.now(),
        'timeout_task': timeout_task,
    }


async def send_invite_notification(match_id: int, player1_id: int, player2_id: int, book_id: int, subject_id: int):
    """Wyślij powiadomienie o zaproszeniu do konkretnego gracza"""
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()

    # Pobierz dane
    book = await database_sync_to_async(Book.objects.get)(id=book_id)
    subject = await database_sync_to_async(Subject.objects.get)(id=subject_id)
    player1_data = await NotificationConsumer.get_user_data(player1_id)

    if not player1_data:
        return

    # Wyślij do gracza 2
    await channel_layer.group_send(
        f'user_{player2_id}',
        {
            'type': 'invite_notification',
            'match_id': match_id,
            'player': player1_data,
            'book': {
                'id': book.id,
                'title': book.title,
                'author': book.author,
            },
            'subject': {
                'id': subject.id,
                'name': subject.name,
                'color': subject.color,
            },
        }
    )

    # Utwórz timeout task
    async def timeout_handler():
        await asyncio.sleep(60)
        if match_id in pending_invites:
            # Anuluj zaproszenie
            await channel_layer.group_send(
                f'user_{player1_id}',
                {
                    'type': 'invite_timeout',
                    'match_id': match_id,
                }
            )
            # Usuń mecz z bazy jeśli istnieje
            try:
                match = await database_sync_to_async(Match.objects.get)(id=match_id)
                if match.status == 'waiting':
                    await database_sync_to_async(match.delete)()
            except:
                pass
            del pending_invites[match_id]

    timeout_task = asyncio.create_task(timeout_handler())
    pending_invites[match_id] = {
        'player1_id': player1_id,
        'player2_id': player2_id,
        'created_at': datetime.now(),
        'timeout_task': timeout_task,
    }
