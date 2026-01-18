import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import ProgressBar from '../components/ui/ProgressBar';
import AnswerButton from '../components/quiz/AnswerButton';
import Timer from '../components/quiz/Timer';
import OpponentStatus from '../components/quiz/OpponentStatus';
import QuestionTransition from '../components/quiz/QuestionTransition';
import QuizResults from './QuizResults';
import { connectSocket, getSocket, disconnectSocket, type MatchWebSocket } from '../services/socket';
import api from '../services/api';
import { useMatchStore } from '../store/matchStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConnectionStore } from '../store/connectionStore';
import { logger } from '../utils/logger';
import type { Question, MatchResult, Match } from '../types/api';

export default function Quiz() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionResults, setQuestionResults] = useState<MatchResult[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [matchEnded, setMatchEnded] = useState(false);
  const [finalScore, setFinalScore] = useState<{ player1: number; player2: number; winner: number | null } | null>(null);
  const [opponentStatus, setOpponentStatus] = useState<'waiting' | 'answering' | 'answered'>('waiting');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0); // Śledź aktualny numer pytania (0-based)
  const socketConnectedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const resultsFetchedRef = useRef(false); // Zapobiegaj wielokrotnemu pobieraniu wyników
  const questionRequestedRef = useRef(false); // Zapobiegaj wielokrotnemu żądaniu pytania
  const currentQuestionRef = useRef<Question | null>(null); // Ref do aktualnego pytania dla timeoutu

  const { setCurrentQuestion: setStoreQuestion, addQuestionResult } = useMatchStore();
  const { user: currentUser } = useAuthStore();
  const { showToast } = useToastStore();

  // Pobierz informacje o meczu
  const { data: match } = useQuery<Match>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const response = await api.get(`/quiz/matches/${matchId}/`);
      return response.data;
    },
    enabled: !!matchId,
  });

  // NIE synchronizuj z match.current_question_index - może być nieaktualne
  // Zamiast tego używaj current_question_index z eventów WebSocket (match:start, match:question)

  useEffect(() => {
      logger.debug('Quiz: useEffect triggered', {
        matchId,
        matchStatus: match?.status,
        matchEnded,
        resultsFetched: resultsFetchedRef.current,
        finalScore: !!finalScore
      });

    if (!matchId) {
      logger.warn('Quiz: No matchId, redirecting to /');
      navigate('/');
      return;
    }

    // WAŻNE: Jeśli mecz już się zakończył lub mamy wyniki, NIE próbuj łączyć się z WebSocketem
    // To zapobiega pętli łączenia/rozłączania
    // Dodatkowo: jeśli mamy już finalScore, oznacza to że QuizResults będzie wyświetlony - nie próbuj łączyć się
    if (matchEnded || match?.status === 'finished' || resultsFetchedRef.current || finalScore) {
      logger.debug('Quiz: Match already finished, skipping socket connection', {
        matchEnded,
        matchStatus: match?.status,
        resultsFetched: resultsFetchedRef.current,
        hasFinalScore: !!finalScore
      });

      // Zamknij socket jeśli istnieje i ustaw status na disconnected
      const currentSocket = getSocket();
      if (currentSocket) {
        logger.debug('Quiz: Closing socket because match is finished');
        currentSocket.disconnect();
        const connectionStore = useConnectionStore.getState();
        connectionStore.setMatchSocketStatus('disconnected');
      }

      // Pobierz wyniki meczu bezpośrednio bez próby połączenia WebSocket (tylko raz)
      if (!resultsFetchedRef.current && !finalScore) {
        resultsFetchedRef.current = true;
        api.get(`/quiz/matches/${matchId}/`).then((response) => {
          const matchData = response.data;
          logger.debug('Quiz: Fetched match results from API', matchData);
          setMatchEnded(true);
          setFinalScore({
            player1: matchData.player1_score || 0,
            player2: matchData.player2_score || 0,
            winner: matchData.winner_id || null,
          });
        }).catch((error) => {
          logger.error('Quiz: Error fetching match results:', error);
        });
      }
      return;
    }

    let isMounted = true;
    let socketInstance: MatchWebSocket | null = null;

        // Funkcja pomocnicza do obsługi pytania
        const handleQuestion = (questionData: any) => {
          if (!isMounted) return;
          logger.debug('Quiz: Handling question data', questionData);
          // questionData może być bezpośrednio Question lub { data: Question }
          const question = questionData?.data || questionData;

          if (question && question.question_text) {
            // Sprawdź czy to nowe pytanie (inny ID niż aktualne)
            const isNewQuestion = !currentQuestion || currentQuestion.id !== question.id;

            if (isNewQuestion) {
              logger.debug('Quiz: Setting new question:', question.question_text.substring(0, 50));
              const questionObj = {
                ...question,
                correct_answer: undefined, // Usuwamy correct_answer dla bezpieczeństwa
              } as Question;
              setCurrentQuestion(questionObj);
              currentQuestionRef.current = questionObj; // Zaktualizuj ref
              setStoreQuestion(question);
              setSelectedAnswer(null);
              setShowResult(false); // Ukryj wynik poprzedniego pytania
              setTimeLeft(60); // Resetuj timer
              setOpponentStatus('waiting'); // Reset status przeciwnika - WAŻNE: resetuj przy każdym nowym pytaniu
              // Resetuj flagę żądania pytania gdy otrzymamy pytanie
              questionRequestedRef.current = false;
              // NIE aktualizuj currentQuestionIndex tutaj - jest aktualizowany w handleMatchStart i handleMatchQuestion
              logger.debug('Quiz: Reset opponent status to waiting for new question');
            } else {
              logger.debug('Quiz: Received same question, ignoring');
            }
          } else {
            logger.warn('Quiz: Invalid question data received', questionData);
          }
        };

    // Obsługa pierwszego pytania z match:start
    const handleMatchStart = (data: any) => {
      logger.debug('Quiz: Received match:start', data);
      // Synchronizuj currentQuestionIndex z danymi z backendu
      const questionData = data?.data || data;
      if (questionData?.current_question_index !== undefined) {
        const newIndex = questionData.current_question_index;
        setCurrentQuestionIndex(newIndex);
        logger.debug('Quiz: Updated currentQuestionIndex from match:start:', newIndex);
      } else {
        // Jeśli nie ma current_question_index, zakładamy że to pierwsze pytanie (0)
        setCurrentQuestionIndex(0);
        logger.debug('Quiz: Reset currentQuestionIndex to 0 for first question (no index in data)');
      }
      // Sprawdź czy to nowe pytanie przed obsługą
      const question = data?.data || data;
      if (question && question.id) {
        const isNewQuestion = !currentQuestion || currentQuestion.id !== question.id;
        if (isNewQuestion) {
          logger.debug('Quiz: match:start - new question, handling');
          handleQuestion(data);
        } else {
          logger.debug('Quiz: match:start - same question, ignoring');
        }
      } else {
        handleQuestion(data);
      }
      // Resetuj timer na początku meczu
      setTimeLeft(60);
    };

    const handleMatchQuestion = (data: any) => {
      logger.debug('Quiz: Received match:question - moving to next question', data);
      // Synchronizuj currentQuestionIndex z danymi z backendu
      const questionData = data?.data || data;
      if (questionData?.current_question_index !== undefined) {
        const newIndex = questionData.current_question_index;
        setCurrentQuestionIndex(newIndex);
        logger.debug('Quiz: Updated currentQuestionIndex from match:question:', newIndex);
        // Resetuj timer dla nowego pytania
        setTimeLeft(60);
      } else if (data?.current_question_index !== undefined) {
        const newIndex = data.current_question_index;
        setCurrentQuestionIndex(newIndex);
        logger.debug('Quiz: Updated currentQuestionIndex from match:question:', newIndex);
        // Resetuj timer dla nowego pytania
        setTimeLeft(60);
      } else {
        // Jeśli nie ma current_question_index w danych, zwiększ lokalnie
        setCurrentQuestionIndex((prev) => {
          const newIndex = prev + 1;
          logger.debug('Quiz: Incremented currentQuestionIndex locally:', newIndex);
          return newIndex;
        });
        setTimeLeft(60);
      }
      handleQuestion(data);
    };

        const handleMatchResult = (data: { data: MatchResult }) => {
          if (!isMounted) return;
          logger.debug('Quiz: Received match:result', data);
          const result = data.data || data;
          logger.debug('Quiz: Match result data:', {
            your_correct: result.your_correct,
            opponent_correct: result.opponent_correct,
            your_answer: result.your_answer,
            opponent_answer: result.opponent_answer,
            question_id: result.question?.id,
          });

          // Jeśli nie mamy aktualnego pytania, wyślij match:ready aby otrzymać aktualne pytanie
          // To może się zdarzyć gdy użytkownik dołącza do aktywnego meczu i otrzymuje wyniki z poprzednich pytań
          if (!currentQuestionRef.current && socketInstance && !questionRequestedRef.current) {
            logger.warn('Quiz: Received match:result but no currentQuestion, requesting current question');
            questionRequestedRef.current = true;
            socketInstance.send('match:ready');
          }

          // Sprawdź czy ten wynik już nie został dodany (zabezpieczenie przed duplikatami)
          setQuestionResults((prev) => {
            // Sprawdź czy wynik dla tego pytania już istnieje
            const existingResult = prev.find((r) => r.question?.id === result.question?.id);
            if (existingResult) {
              logger.debug('Quiz: Result for this question already exists, skipping duplicate');
              return prev;
            }
            logger.debug('Quiz: Adding new result to questionResults, total results:', prev.length + 1);
            return [...prev, result];
          });
          addQuestionResult(result);
          setShowResult(true);
          // Reset status przeciwnika po otrzymaniu wyniku
          setOpponentStatus('waiting');
          logger.debug('Quiz: Reset opponent status after result');

          // Ukryj wynik po 3 sekundach - backend wyśle następne pytanie po 3 sekundach
          setTimeout(() => {
            if (isMounted) {
              setShowResult(false);
            }
          }, 3000);
        };

    const handleMatchEnd = (data: { data: any }) => {
      if (!isMounted) return;
      logger.debug('Quiz: Received match:end', data);
      const endData = data.data || data;
      logger.debug('Quiz: Match end data:', {
        player1_score: endData.player1_score,
        player2_score: endData.player2_score,
        winner_id: endData.winner_id,
        currentUser: currentUser?.id
      });

      // Zamknij socket i zapobiegaj ponownym połączeniom
      socketConnectedRef.current = false;
      resultsFetchedRef.current = true;

      // Zamknij socket jeśli istnieje - użyj getSocket() zamiast socketInstance
      const currentSocket = getSocket();
      if (currentSocket) {
        try {
          logger.debug('Quiz: Disconnecting socket after match:end');
          disconnectSocket(); // Użyj disconnectSocket() aby poprawnie zamknąć i zresetować status
        } catch (error) {
          logger.error('Quiz: Error closing socket:', error);
        }
      }

      // Wyczyść listenery
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      // Ustaw status połączenia na disconnected
      const connectionStore = useConnectionStore.getState();
      connectionStore.setMatchSocketStatus('disconnected');

      // Ustaw stan końcowy
      logger.debug('Quiz: Setting matchEnded=true and finalScore');
      setMatchEnded(true);
      setFinalScore({
        player1: endData.player1_score || 0,
        player2: endData.player2_score || 0,
        winner: endData.winner_id || null,
      });
      logger.debug('Quiz: Match end state updated successfully');
    };

    const handleOpponentAnswered = () => {
      logger.debug('Quiz: Opponent answered event received');
      if (isMounted) {
        setOpponentStatus('answered');
        logger.debug('Quiz: Set opponent status to answered');
      }
    };

    const handleTimerSync = (data: { time_left: number; question_index: number }) => {
      if (!isMounted) return;
      logger.debug('Quiz: Received timer sync', {
        time_left: data.time_left,
        question_index: data.question_index,
        current_question_index: currentQuestionIndex,
        currentQuestion: currentQuestion?.id
      });
      // Synchronizuj timer tylko jeśli to aktualne pytanie
      // question_index to indeks aktualnego pytania (0-based)
      // currentQuestionIndex to aktualny numer pytania (0-based)
      if (data.question_index === currentQuestionIndex) {
        setTimeLeft(data.time_left);
        logger.debug('Quiz: Updated timeLeft to', data.time_left);
      } else {
        // Jeśli question_index jest większe niż currentQuestionIndex, zaktualizuj currentQuestionIndex
        // To może się zdarzyć jeśli timer sync przyjdzie przed match:question
        if (data.question_index > currentQuestionIndex) {
          logger.debug('Quiz: Timer sync question_index ahead, updating currentQuestionIndex', {
            received: data.question_index,
            current: currentQuestionIndex
          });
          setCurrentQuestionIndex(data.question_index);
          setTimeLeft(data.time_left);
        } else {
          logger.debug('Quiz: Ignoring timer sync - wrong question index', {
            received: data.question_index,
            expected: currentQuestionIndex
          });
        }
      }
    };

    const handleOpponentDisconnect = (data: { message?: string }) => {
      if (!isMounted) return;
      logger.warn('Quiz: Opponent disconnected', data);
      setOpponentStatus('waiting'); // Reset status
      showToast('warning', 'Przeciwnik rozłączył się. Mecz zostanie zakończony.');
      // Automatycznie zakończ mecz po 3 sekundach
      setTimeout(() => {
        if (isMounted) {
          // Pobierz aktualne wyniki meczu
          api.get(`/quiz/matches/${matchId}/`).then((response) => {
            const matchData = response.data;
            setMatchEnded(true);
            setFinalScore({
              player1: matchData.player1_score || 0,
              player2: matchData.player2_score || 0,
              winner: matchData.winner_id || null,
            });
          }).catch((error) => {
            logger.error('Quiz: Error fetching match results after disconnect:', error);
            // Fallback: zakończ mecz z obecnymi wynikami
            setMatchEnded(true);
            setFinalScore({
              player1: 0,
              player2: 0,
              winner: currentUser?.id || null,
            });
          });
        }
      }, 3000);
    };

    const handleMatchTimeout = (data: { message?: string; question_index?: number }) => {
      if (!isMounted) return;
      logger.warn('Quiz: Match timeout', data);
      showToast('warning', 'Czas na odpowiedź minął. Przechodzimy do następnego pytania.');
      // Jeśli gracz nie odpowiedział, automatycznie wybierz pierwszą opcję
      if (!selectedAnswer && socketInstance) {
        setSelectedAnswer('a');
        setOpponentStatus('answering');
        socketInstance.send('match:answer', { answer: 'a' });
      }
    };

    const handleMatchAlreadyEnded = (data: { message?: string }) => {
      if (!isMounted) return;
      logger.warn('Quiz: Match already ended', data);
      // Ustaw flagę aby zapobiec ponownym połączeniom
      socketConnectedRef.current = false;
      // Zapobiegaj wielokrotnemu pobieraniu wyników
      if (resultsFetchedRef.current) {
        logger.debug('Quiz: Results already fetched, skipping');
        return;
      }
      resultsFetchedRef.current = true;
      showToast('info', 'Ten mecz już się zakończył.');
      // Pobierz wyniki meczu
      api.get(`/quiz/matches/${matchId}/`).then((response) => {
        const matchData = response.data;
        setMatchEnded(true);
        setFinalScore({
          player1: matchData.player1_score || 0,
          player2: matchData.player2_score || 0,
          winner: matchData.winner_id || null,
        });
      }).catch((error) => {
        logger.error('Quiz: Error fetching match results:', error);
        navigate('/');
      });
    };

    const registerListeners = (socket: MatchWebSocket) => {
      socket.on('match:start', handleMatchStart);
      socket.on('match:question', handleMatchQuestion);
      socket.on('match:result', handleMatchResult);
      socket.on('match:end', handleMatchEnd);
      socket.on('match:opponent_answered', handleOpponentAnswered);
      socket.on('match:timer_sync', handleTimerSync);
      socket.on('match:opponent_disconnect', handleOpponentDisconnect);
      socket.on('match:timeout', handleMatchTimeout);
      socket.on('match:already_ended', handleMatchAlreadyEnded);

      // Zwróć funkcję cleanup
      return () => {
        socket.off('match:start', handleMatchStart);
        socket.off('match:question', handleMatchQuestion);
        socket.off('match:result', handleMatchResult);
        socket.off('match:end', handleMatchEnd);
        socket.off('match:opponent_answered', handleOpponentAnswered);
        socket.off('match:timer_sync', handleTimerSync);
        socket.off('match:opponent_disconnect', handleOpponentDisconnect);
        socket.off('match:timeout', handleMatchTimeout);
        socket.off('match:already_ended', handleMatchAlreadyEnded);
      };
    };

    const fetchTokenAndConnect = async () => {
      try {
        // Sprawdź czy mecz już się zakończył - jeśli tak, nie próbuj łączyć się ponownie
        if (match?.status === 'finished' || matchEnded || resultsFetchedRef.current) {
          logger.debug('Quiz: Match already finished, skipping socket connection', {
            matchStatus: match?.status,
            matchEnded,
            resultsFetched: resultsFetchedRef.current
          });
          // Pobierz wyniki meczu bezpośrednio (tylko raz)
          if (!resultsFetchedRef.current) {
            resultsFetchedRef.current = true;
            api.get(`/quiz/matches/${matchId}/`).then((response) => {
              const matchData = response.data;
              setMatchEnded(true);
              setFinalScore({
                player1: matchData.player1_score || 0,
                player2: matchData.player2_score || 0,
                winner: matchData.winner_id || null,
              });
            }).catch((error) => {
              logger.error('Quiz: Error fetching match results:', error);
            });
          }
          return;
        }

        // Sprawdź czy socket już istnieje i jest połączony dla tego meczu
        const existingSocket = getSocket();
        if (existingSocket && existingSocket.matchId === parseInt(matchId)) {
          const ws = (existingSocket as any).ws;
          if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            logger.debug('Quiz: Reusing existing socket connection');
            socketInstance = existingSocket;
            socketConnectedRef.current = true;

            // WAŻNE: Zawsze rejestruj listenery, nawet jeśli socket jest już połączony
            // Listenery z poprzednich komponentów mogą nie być odpowiednie dla Quiz
            cleanupRef.current = registerListeners(socketInstance);

            // Wyślij match:ready aby otrzymać aktualne pytanie jeśli mecz już się rozpoczął
            if (ws.readyState === WebSocket.OPEN) {
              logger.debug('Quiz: Socket already open, sending match:ready');
              socketInstance.send('match:ready');
            }
            return;
          }
        }

        logger.debug('Quiz: Fetching WebSocket token...');
        const tokenResponse = await api.get('/auth/token/websocket/');
        const token = tokenResponse.data?.token;

        if (!token) {
          logger.error('Quiz: No token received from API');
          if (isMounted) {
            logger.warn('Quiz: No token, but staying on page');
          }
          return;
        }

        logger.debug('Quiz: Token received, connecting socket...');
        socketInstance = connectSocket(parseInt(matchId), token);
        socketConnectedRef.current = true;

        // Zarejestruj listenery
        cleanupRef.current = registerListeners(socketInstance);

        // Sprawdź czy socket jest już połączony
        const ws = (socketInstance as any).ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          logger.debug('Quiz: Socket already open, sending match:ready');
          socketInstance.send('match:ready');
        } else {
          socketInstance.connect().then(() => {
            logger.debug('Quiz: Socket connected, sending match:ready');
            if (isMounted && socketInstance) {
              socketInstance.send('match:ready');
            }
          }).catch((error: unknown) => {
            logger.error('Quiz: WebSocket connection error:', error);
            if (isMounted) {
              logger.warn('Quiz: WebSocket connection failed, but staying on page');
            }
          });
        }
      } catch (error) {
        logger.error('Quiz: Error connecting socket:', error);
        socketConnectedRef.current = false;
        if (isMounted) {
          // Nie przekierowuj automatycznie - może być problem z połączeniem
          logger.warn('Quiz: Error occurred, but staying on page');
        }
      }
    };

    // Połącz się z WebSocketem tylko jeśli mecz nie jest zakończony
    // WAŻNE: Nie uruchamiaj jeśli już pobraliśmy wyniki lub mecz się zakończył
    // Dodatkowo: jeśli mamy finalScore, oznacza to że QuizResults będzie wyświetlony - nie próbuj łączyć się
    const isMatchFinished = match?.status === ('finished' as Match['status']);
    if (!resultsFetchedRef.current && !matchEnded && !isMatchFinished && !finalScore) {
      fetchTokenAndConnect();
    } else if (matchEnded || isMatchFinished || finalScore) {
      // Jeśli mecz się zakończył, upewnij się że socket jest zamknięty i mamy wyniki
      const currentSocket = getSocket();
      if (currentSocket) {
        logger.debug('Quiz: Closing socket because match is finished (in useEffect)');
        disconnectSocket();
      }

      // Jeśli mecz się zakończył, upewnij się że mamy wyniki
      if (!resultsFetchedRef.current && !finalScore) {
        resultsFetchedRef.current = true;
        api.get(`/quiz/matches/${matchId}/`).then((response) => {
          const matchData = response.data;
          setMatchEnded(true);
          setFinalScore({
            player1: matchData.player1_score || 0,
            player2: matchData.player2_score || 0,
            winner: matchData.winner_id || null,
          });
        }).catch((error) => {
          logger.error('Quiz: Error fetching match results:', error);
        });
      }
    }

    // Dodaj timeout: jeśli po 2 sekundach nie mamy pytania, wyślij match:ready
    const questionTimeout = setTimeout(() => {
      if (isMounted && !questionRequestedRef.current && !matchEnded && match?.status !== 'finished' && !resultsFetchedRef.current) {
        // Sprawdź czy mamy pytanie używając refa
        if (!currentQuestionRef.current) {
          logger.warn('Quiz: No question received after 2 seconds, sending match:ready');
          questionRequestedRef.current = true;
          const socket = getSocket();
          if (socket) {
            socket.send('match:ready');
          }
        }
      }
    }, 2000);

    return () => {
      logger.debug('Quiz: useEffect cleanup');
      clearTimeout(questionTimeout);
      isMounted = false;
      // NIE resetuj socketConnectedRef i resultsFetchedRef tutaj - mogą być potrzebne po zakończeniu meczu
      questionRequestedRef.current = false;
      // Wywołaj funkcję cleanup jeśli istnieje
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [matchId, navigate, setStoreQuestion, addQuestionResult, match, currentUser?.id, showToast, matchEnded, finalScore]);

  const handleAnswer = (answer: string) => {
    if (selectedAnswer || showResult) {
      logger.debug('Quiz: handleAnswer called but answer already selected or showing result', { selectedAnswer, showResult });
      return;
    }

    logger.debug('Quiz: handleAnswer called with answer', answer);
    setSelectedAnswer(answer);
    setOpponentStatus('answering'); // Oznacz że czekamy na przeciwnika
    const socket = getSocket();
    if (socket) {
      logger.debug('Quiz: Sending match:answer to socket', { answer });
      socket.send('match:answer', { answer });
    } else {
      logger.error('Quiz: Socket not available when trying to send answer');
    }
  };

  const getAnswerStatus = (option: string) => {
    if (!showResult || !questionResults.length) return null;

    const lastResult = questionResults[questionResults.length - 1];
    // Używamy correct_answer z wyniku (już otrzymanego z serwera)
    const correctAnswer = lastResult.question?.correct_answer;
    if (!correctAnswer) return null;

    const isCorrect = option === correctAnswer;
    const isSelected = option === selectedAnswer;
    // Pokazuj jako błędną tylko jeśli użytkownik ją wybrał i nie jest poprawna
    const isIncorrect = isSelected && !isCorrect;

    return {
      isCorrect, // Zawsze pokazuj poprawną odpowiedź (zielona)
      isIncorrect, // Pokazuj jako błędną tylko jeśli użytkownik ją wybrał (czerwona)
      isSelected,
    };
  };

  // Wyświetl ekran końcowy jeśli mecz się zakończył i mamy wyniki
  if (matchEnded && finalScore && match) {
    logger.debug('Quiz: Rendering QuizResults', {
      matchEnded,
      finalScore,
      matchId: match.id,
      questionResultsCount: questionResults.length
    });
    return <QuizResults match={match} finalScore={finalScore} questionResults={questionResults} />;
  }

  // Jeśli mecz się zakończył ale nie mamy finalScore, spróbuj pobrać wyniki
  if (matchEnded && !finalScore && match && match.status === 'finished') {
    logger.warn('Quiz: Match ended but no finalScore, fetching results');
    if (!resultsFetchedRef.current) {
      resultsFetchedRef.current = true;
      api.get(`/quiz/matches/${matchId}/`).then((response) => {
        const matchData = response.data;
        setFinalScore({
          player1: matchData.player1_score || 0,
          player2: matchData.player2_score || 0,
          winner: matchData.winner_id || null,
        });
      }).catch((error) => {
        logger.error('Quiz: Error fetching match results:', error);
      });
    }
  }

  if (!currentQuestion) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            {/* Animated loader */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-primary rounded-full animate-spin"></div>
            </div>

            {/* Pulsing text */}
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-gray-800 animate-pulse">
                Oczekiwanie na pytanie...
              </h2>
              <p className="text-gray-600">
                Przygotowujemy quiz dla Ciebie
              </p>
            </div>

            {/* Animated dots */}
            <div className="flex justify-center gap-2 mt-6">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const answerStatusA = getAnswerStatus('a');
  const answerStatusB = getAnswerStatus('b');
  const answerStatusC = getAnswerStatus('c');
  const answerStatusD = getAnswerStatus('d');

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <ProgressBar
            current={currentQuestionIndex + 1}
            total={match?.total_questions || 10}
          />
        </div>

        <div className="mb-6 flex justify-between items-center">
          <div className="text-lg text-gray-600">
            Pytanie {currentQuestionIndex + 1} z {match?.total_questions || 10}
          </div>
          <Timer
            seconds={timeLeft}
            onTimeout={() => {
              if (!selectedAnswer) {
                handleAnswer('a'); // Automatyczna odpowiedź przy timeout
              }
            }}
            isSynced={true}
          />
        </div>

        {/* Opponent Status */}
        {match && (
          <div className="mb-6">
            <OpponentStatus
              opponent={
                currentUser?.id === match.player1?.id
                  ? match.player2 || undefined
                  : match.player1 || undefined
              }
              status={opponentStatus}
            />
          </div>
        )}

        <QuestionTransition key={currentQuestion.id || questionResults.length}>
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6 animate-scale-in">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 animate-fade-in">
              {currentQuestion.question_text}
            </h2>

            <div className="space-y-4">
              <AnswerButton
                label="A"
                text={currentQuestion.option_a}
                showResult={showResult}
                {...(answerStatusA || {})}
                isSelected={selectedAnswer === 'a'}
                onClick={() => handleAnswer('a')}
                className={answerStatusA?.isIncorrect ? 'animate-shake' : ''}
              />
              <AnswerButton
                label="B"
                text={currentQuestion.option_b}
                showResult={showResult}
                {...(answerStatusB || {})}
                isSelected={selectedAnswer === 'b'}
                onClick={() => handleAnswer('b')}
                className={answerStatusB?.isIncorrect ? 'animate-shake' : ''}
              />
              <AnswerButton
                label="C"
                text={currentQuestion.option_c}
                showResult={showResult}
                {...(answerStatusC || {})}
                isSelected={selectedAnswer === 'c'}
                onClick={() => handleAnswer('c')}
                className={answerStatusC?.isIncorrect ? 'animate-shake' : ''}
              />
              <AnswerButton
                label="D"
                text={currentQuestion.option_d}
                showResult={showResult}
                {...(answerStatusD || {})}
                isSelected={selectedAnswer === 'd'}
                onClick={() => handleAnswer('d')}
                className={answerStatusD?.isIncorrect ? 'animate-shake' : ''}
              />
            </div>
          </div>
        </QuestionTransition>

        {showResult && questionResults.length > 0 && (() => {
          const lastResult = questionResults[questionResults.length - 1];
          // Używamy tego samego źródła prawdy co getAnswerStatus - sprawdzamy czy wybrana odpowiedź jest poprawna
          const correctAnswer = lastResult.question?.correct_answer;
          // Sprawdź czy użytkownik odpowiedział poprawnie - używamy tego samego porównania co getAnswerStatus
          // Jeśli mamy correctAnswer i selectedAnswer, porównaj je
          // W przeciwnym razie użyj your_correct z wyniku (zawsze dostępne)
          const userAnsweredCorrectly = correctAnswer && selectedAnswer
            ? selectedAnswer === correctAnswer
            : lastResult.your_correct;

          return (
            <div
              className={`rounded-lg p-4 mb-6 border-2 animate-bounce-in ${
                userAnsweredCorrectly
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <p
                className={`text-lg font-semibold flex items-center gap-2 ${
                  userAnsweredCorrectly
                    ? 'text-green-800'
                    : 'text-red-800'
                }`}
              >
                {userAnsweredCorrectly ? (
                  <>
                    <span className="text-2xl">✓</span>
                    <span>Poprawna odpowiedź!</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">✗</span>
                    <span>Błędna odpowiedź</span>
                  </>
                )}
              </p>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
