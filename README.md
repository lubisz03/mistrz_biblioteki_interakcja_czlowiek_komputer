# Mistrz Zasobów Biblioteki PŁ

Quiz multiplayer dla studentów Politechniki Łódzkiej, w którym gracze rywalizują odpowiadając na pytania generowane przez AI na podstawie książek z biblioteki uczelnianej.

---

## 1. Analiza wymagań

### 1.1 Sformułowanie problemu

Studenci rzadko korzystają z zasobów biblioteki uczelnianej. Brakuje motywacji do zapoznawania się z literaturą naukową. Istniejące systemy biblioteczne są statyczne i nie angażują użytkowników.

**Cel projektu:** Stworzyć grywalizowaną aplikację quiz, która:
- Zachęca do poznawania książek z biblioteki PŁ
- Umożliwia rywalizację między studentami w czasie rzeczywistym
- Motywuje poprzez system rankingów

### 1.2 Przegląd istniejących rozwiązań

| Rozwiązanie | Cechy | Różnice względem naszego projektu |
|-------------|-------|-----------------------------------|
| Kahoot | Quizy multiplayer, timer, ranking | Brak integracji z uczelnią, brak AI |
| Duolingo | Grywalizacja, streak, punkty | Single-player, brak rywalizacji 1v1 |
| Quizlet | Fiszki, testy | Brak real-time multiplayer |

**Wyróżniki naszego rozwiązania:**
- Pytania generowane przez AI z prawdziwych książek bibliotecznych
- Mecze 1v1 w czasie rzeczywistym przez WebSocket
- Integracja z systemem uczelnianym (email @edu.p.lodz.pl)
- System rankingów per kategoria

### 1.3 Specyfikacja wymagań

#### Wymagania funkcjonalne

| ID | Wymaganie | Priorytet |
|----|-----------|-----------|
| F1 | Rejestracja i logowanie przez email uczelniane | Wysoki |
| F2 | Wybór kategorii (przedmiotu) i książki | Wysoki |
| F3 | Matchmaking - wyszukiwanie przeciwnika | Wysoki |
| F4 | Quiz 1v1 w czasie rzeczywistym (10 pytań, 60s/pytanie) | Wysoki |
| F5 | Generowanie pytań przez AI z treści książek | Wysoki |
| F6 | Ranking globalny i per kategoria | Średni |
| F7 | Zapraszanie znajomych po numerze indeksu | Średni |
| F8 | Lista aktywnych użytkowników | Niski |
| F9 | Powiadomienia o zaproszeniach do meczu | Niski |

#### Wymagania niefunkcjonalne

| ID | Wymaganie | Metryka |
|----|-----------|---------|
| NF1 | Czas odpowiedzi API | < 500ms |
| NF2 | Synchronizacja timera między graczami | < 100ms różnicy |
| NF3 | Obsługa rozłączeń WebSocket | Auto-reconnect do 5 prób |
| NF4 | Timeout API | 30 sekund |
| NF5 | Obsługa błędów sieciowych | Retry z exponential backoff |

### 1.4 Przypadki użycia

```
┌─────────────────────────────────────────────────────────────┐
│                        STUDENT                               │
├─────────────────────────────────────────────────────────────┤
│  ○ Rejestracja (email @edu.p.lodz.pl)                       │
│  ○ Logowanie                                                 │
│  ○ Wybór kategorii i książki                                │
│  ○ Wyszukanie przeciwnika / zaproszenie znajomego           │
│  ○ Rozwiązywanie quizu 1v1                                  │
│  ○ Przeglądanie rankingu                                    │
│  ○ Przeglądanie profilu i statystyk                         │
└─────────────────────────────────────────────────────────────┘
```

**Szczegółowy przypadek użycia: Rozgrywka quizu**

```
Aktor: Student
Warunki wstępne: Zalogowany, wybrał książkę

1. Student klika "Wyszukaj przeciwnika"
2. System tworzy mecz i szuka drugiego gracza
3. Gdy znajdzie - oba gracze widzą ekran "Gotowy?"
4. Po potwierdzeniu - AI generuje 10 pytań z książki
5. Gracze odpowiadają na pytania (60s/pytanie)
6. Po każdym pytaniu - wyświetlenie wyniku dla obu graczy
7. Po 10 pytaniach - ekran końcowy z wynikiem
8. Aktualizacja rankingu
```

---

## 2. Konstrukcja systemu

### 2.1 Architektura systemu

```
┌─────────────┐     HTTP/WS      ┌─────────────┐     SQL      ┌──────────┐
│   Frontend  │◄───────────────►│   Backend   │◄────────────►│ PostgreSQL│
│   (React)   │                  │  (Django)   │              └──────────┘
└─────────────┘                  └──────┬──────┘
                                        │
                         ┌──────────────┼──────────────┐
                         │              │              │
                         ▼              ▼              ▼
                  ┌───────────┐  ┌───────────┐  ┌───────────┐
                  │   Redis   │  │   Claude  │  │  Tavily   │
                  │ (WebSocket│  │(LangChain)│  │ (Search)  │
                  │  Channels)│  └───────────┘  └───────────┘
                  └───────────┘
```

- **Redis** - channel layer dla WebSocket (synchronizacja meczu między graczami)
- **Claude** - API do generowania pytań quizowych (wywoływany przez HTTP)
- **Tavily** - opcjonalne wyszukiwanie dodatkowych informacji o książkach

### 2.2 Stos technologiczny

#### Backend
| Technologia | Wersja | Zastosowanie |
|-------------|--------|--------------|
| Python | 3.11 | Język backendu |
| Django | 5.x | Framework webowy |
| Django REST Framework | - | API REST |
| Django Channels | - | WebSocket |
| PostgreSQL | - | Baza danych |
| Redis | - | Channel layer dla WebSocket |
| LangChain | - | Integracja z AI |
| Claude Sonnet 4.5 | - | Generowanie pytań |
| SimpleJWT | - | Autentykacja JWT |

#### Frontend
| Technologia | Wersja | Zastosowanie |
|-------------|--------|--------------|
| React | 19.2 | Framework UI |
| TypeScript | - | Typowanie |
| Vite | 7.2 | Bundler |
| Zustand | 5.0 | State management |
| React Query | 5.90 | Cache i fetching |
| Tailwind CSS | 3.4 | Stylowanie |
| Axios | 1.13 | HTTP client |
| Lucide React | - | Ikony |

### 2.3 Struktura projektu

```
mistrz_biblioteki/
├── backend/
│   ├── src/
│   │   ├── auth_api/          # Autentykacja, użytkownicy
│   │   │   ├── models.py      # Model User
│   │   │   ├── views.py       # Login, Register, JWT
│   │   │   └── backends.py    # Custom auth backend
│   │   ├── quiz/              # Logika quizu
│   │   │   ├── models.py      # Subject, Book, Match, Question...
│   │   │   ├── views.py       # API endpoints
│   │   │   ├── consumers.py   # WebSocket MatchConsumer
│   │   │   └── notification_consumer.py
│   │   ├── ai/                # Generowanie pytań
│   │   │   ├── agent/         # LangChain agent
│   │   │   └── extractors/    # PDF extraction
│   │   └── src/               # Konfiguracja Django
│   │       ├── settings.py
│   │       └── routing.py     # WebSocket routing
│   ├── docker-compose.yml
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── pages/             # Strony aplikacji
        │   ├── Home.tsx       # Wybór kategorii
        │   ├── Category.tsx   # Wybór książki
        │   ├── Quiz.tsx       # Ekran quizu
        │   ├── Ranking.tsx    # Rankingi
        │   └── ...
        ├── components/        # Komponenty UI
        │   ├── quiz/          # Timer, AnswerButton...
        │   ├── ui/            # Button, Card, Toast...
        │   └── layout/        # Header, Footer, Sidebar
        ├── services/          # API, WebSocket
        ├── store/             # Zustand stores
        └── types/             # TypeScript types
```

### 2.4 Model bazy danych

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    User      │       │   Subject    │       │    Book      │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id           │       │ id           │       │ id           │
│ email        │       │ name         │◄──────│ subject_id   │
│ username     │       │ color        │       │ title        │
│ password     │       │ icon_name    │       │ author       │
└──────┬───────┘       └──────────────┘       │ isbn         │
       │                                       │ toc_pdf_url  │
       │                                       └──────┬───────┘
       │                                              │
       │       ┌──────────────┐       ┌──────────────┤
       │       │    Match     │       │   Question   │
       │       ├──────────────┤       ├──────────────┤
       ├──────►│ player1_id   │       │ id           │
       ├──────►│ player2_id   │       │ book_id      │◄─────┘
       │       │ book_id      │       │ question_text│
       │       │ subject_id   │       │ option_a/b/c/d│
       │       │ status       │       │ correct_answer│
       │       │ player1_score│       └──────┬───────┘
       │       │ player2_score│              │
       ├──────►│ winner_id    │              │
       │       └──────┬───────┘              │
       │              │                      │
       │       ┌──────┴───────┐              │
       │       │MatchQuestion │              │
       │       ├──────────────┤              │
       │       │ match_id     │◄─────────────┘
       │       │ question_id  │
       │       │ question_order│
       │       │ player1_answer│
       │       │ player2_answer│
       │       │ player1_correct│
       │       │ player2_correct│
       │       └──────────────┘
       │
       │       ┌──────────────┐
       │       │ UserRanking  │
       │       ├──────────────┤
       └──────►│ user_id      │
               │ subject_id   │
               │ points       │
               │ wins         │
               │ losses       │
               └──────────────┘
```

### 2.5 API Endpoints

#### Autentykacja (`/api/auth/`)
| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/login/` | Logowanie (JWT w cookies) |
| POST | `/register/` | Rejestracja (email @p.lodz.pl) |
| POST | `/token/refresh/` | Odświeżenie tokena |
| POST | `/logout/` | Wylogowanie |
| GET | `/token/websocket/` | Token do WebSocket |
| GET | `/user/` | Dane użytkownika |

#### Quiz (`/api/quiz/`)
| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/subjects/` | Lista kategorii |
| GET | `/subjects/:id/books/` | Książki w kategorii |
| POST | `/matches/find/` | Szukaj przeciwnika |
| POST | `/matches/:id/ready/` | Potwierdź gotowość |
| GET | `/ranking/` | Ranking globalny |
| GET | `/ranking/:subjectId/` | Ranking w kategorii |

#### WebSocket
| Endpoint | Opis |
|----------|------|
| `ws/match/:matchId/` | Komunikacja w meczu |
| `ws/notifications/` | Powiadomienia, aktywni użytkownicy |

### 2.6 Algorytmika

#### Generowanie pytań (AI)

```python
# Uproszczony przepływ
1. Pobierz PDF z toc_pdf_url książki
2. Wyekstrahuj tekst (pdfplumber, max 30 stron)
3. Wyślij do Claude Sonnet 4.5 przez LangChain
4. Prompt: "Wygeneruj 10 pytań wielokrotnego wyboru..."
5. Walidacja odpowiedzi (Pydantic)
6. Zapis do bazy (Question)
```

#### Synchronizacja meczu (WebSocket)

```
Player1                    Server                    Player2
   │                         │                          │
   │──── match:ready ───────►│                          │
   │                         │◄──── match:ready ────────│
   │                         │                          │
   │◄─── match:start ────────│─── match:start ─────────►│
   │     (question #0)       │                          │
   │                         │                          │
   │──── match:answer ──────►│                          │
   │                         │─── opponent_answered ───►│
   │                         │                          │
   │                         │◄──── match:answer ───────│
   │                         │                          │
   │◄─── match:result ───────│─── match:result ────────►│
   │     (your_correct,      │                          │
   │      opponent_correct)  │                          │
   │                         │                          │
   │      ... (repeat x10) ...                          │
   │                         │                          │
   │◄─── match:end ──────────│─── match:end ───────────►│
```

#### Timer synchronizacji

- Serwer wysyła `match:timer_sync` co sekundę
- Zawiera `time_left` i `question_index`
- Frontend synchronizuje lokalny timer z serwerem
- Przy timeout (time_left=0) - automatyczna odpowiedź

### 2.7 Bezpieczeństwo

| Aspekt | Implementacja |
|--------|---------------|
| Autentykacja | JWT w HttpOnly cookies |
| Walidacja email | Tylko domeny @p.lodz.pl, @edu.p.lodz.pl |
| Token refresh | Automatyczna rotacja, blacklist starych |
| WebSocket auth | Token w query string, weryfikacja przy połączeniu |
| CORS | Konfigurowalny, domyślnie all origins (demo) |
| Hasła | Django password hashers (PBKDF2) |
| API errors | Zunifikowany format, bez stacktrace w produkcji |

### 2.8 Odporność na błędy

| Warstwa | Mechanizm |
|---------|-----------|
| Frontend API | Timeout 30s, retry 3x z exponential backoff |
| WebSocket | Auto-reconnect 5x, wykrywanie offline |
| UI | ErrorBoundary, Toast notifications, ConnectionStatus |
| Backend | Custom exception handler, logging |
| Baza danych | Atomic updates dla wyników meczu (F() expressions) |

---

## 3. Testowanie systemu

### 3.1 Testowanie poprawności działania

| Scenariusz | Oczekiwany wynik | Status |
|------------|------------------|--------|
| Rejestracja z email uczelnianym | Konto utworzone | ✓ |
| Rejestracja z innym email | Błąd walidacji | ✓ |
| Logowanie | JWT w cookies | ✓ |
| Matchmaking | Mecz utworzony, WebSocket połączony | ✓ |
| Odpowiedź na pytanie | Wynik widoczny u obu graczy | ✓ |
| Timeout pytania | Automatyczne przejście dalej | ✓ |
| Rozłączenie gracza | Powiadomienie przeciwnika | ✓ |
| Zakończenie meczu | Ranking zaktualizowany | ✓ |

### 3.2 Testowanie wydajności

| Metryka | Pomiar |
|---------|--------|
| Czas generowania pytań (AI) | ~5-10s dla 10 pytań |
| Latencja WebSocket | <50ms (sieć lokalna) |
| Synchronizacja timera | <100ms różnicy między graczami |
| Czas ładowania strony | <2s (z cache) |

### 3.3 Testowanie UX (heurystyki Nielsena)

| Heurystyka | Implementacja |
|------------|---------------|
| Widoczność stanu systemu | ConnectionStatus, Loading spinners, Timer sync |
| Zgodność z rzeczywistością | Polskie komunikaty, kontekst uczelniany |
| Kontrola użytkownika | Możliwość anulowania matchmakingu |
| Spójność | Jednolity design (Tailwind), komponenty UI |
| Zapobieganie błędom | Walidacja email, disabled buttons podczas ładowania |
| Rozpoznawanie zamiast pamiętania | Ikony kategorii, wizualne oznaczenia |
| Elastyczność | Skróty klawiszowe (Enter dla odpowiedzi) |
| Estetyka | Animacje, kolorystyka, responsywność |
| Pomoc w rozpoznawaniu błędów | Toast z opisem błędu, retry button |
| Dokumentacja | Ten dokument |

---

## 4. Samouczek

### 4.1 Instalacja

#### Wymagania
- Docker i Docker Compose
- Node.js 18+
- Klucz API Anthropic (Claude)

#### Backend

```bash
cd backend

# Utwórz plik .env
cat > .env << EOF
SECRET_KEY=your-secret-key
DEBUG=true
DATABASE_URL=postgres://postgres:postgres@db:5432/quiz
REDIS_URL=redis://redis:6379/0
ANTHROPIC_API_KEY=your-anthropic-key
EOF

# Uruchom kontenery
docker-compose up -d

# Migracje (jeśli potrzebne)
docker-compose exec web python manage.py migrate
```

#### Frontend

```bash
cd frontend

# Instalacja zależności
npm install

# Utwórz plik .env
cat > .env << EOF
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000
EOF

# Uruchom dev server
npm run dev
```

#### Produkcja

```bash
# Backend
docker-compose -f docker-compose.yml up -d

# Frontend
npm run build
# Serwuj dist/ przez nginx lub inny serwer
```

### 4.2 Używanie aplikacji

#### Rejestracja i logowanie

1. Wejdź na stronę aplikacji
2. Kliknij "Zarejestruj się"
3. Podaj email uczelniany (@edu.p.lodz.pl)
4. Ustaw hasło
5. Zaloguj się

#### Rozgrywka

1. **Wybierz kategorię** - na stronie głównej kliknij interesujący Cię przedmiot
2. **Wybierz książkę** - wybierz materiał z listy
3. **Znajdź przeciwnika**:
   - Kliknij "Wyszukaj przeciwnika" (losowy gracz)
   - Lub wpisz numer indeksu znajomego i kliknij "Wyzwij"
4. **Poczekaj na matchmaking** - system szuka drugiego gracza
5. **Potwierdź gotowość** - gdy znajdzie, kliknij "Jestem gotowy"
6. **Rozwiązuj quiz**:
   - Masz 60 sekund na każde pytanie
   - Kliknij odpowiedź A/B/C/D
   - Zobacz wynik po każdym pytaniu
7. **Sprawdź wynik końcowy** - kto wygrał, ile punktów

#### Ranking i profil

- **Ranking** - w menu kliknij "Ranking" aby zobaczyć najlepszych graczy
- **Profil** - kliknij na swoje imię aby zobaczyć statystyki

#### Wskazówki

- Timer jest zsynchronizowany z serwerem - nie oszukasz!
- Widzisz gdy przeciwnik odpowiedział
- Po każdym pytaniu widzisz czy Twoja odpowiedź była poprawna
- Wygrane mecze dają punkty do rankingu

---

## 5. Podsumowanie

**Mistrz Zasobów Biblioteki PŁ** to aplikacja quizowa łącząca:
- Grywalizację (rankingi, rywalizacja 1v1)
- Integrację uczelnianą (email PŁ, biblioteka)
- Nowoczesne technologie (React, Django, WebSocket, AI)
- Real-time multiplayer (synchronizacja do 100ms)

Projekt spełnia założone wymagania funkcjonalne i niefunkcjonalne, zapewniając angażujące doświadczenie użytkownika przy jednoczesnej odporności na błędy sieciowe i serwerowe.
