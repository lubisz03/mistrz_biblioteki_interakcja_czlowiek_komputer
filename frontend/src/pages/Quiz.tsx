import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProgressBar from '../components/ui/ProgressBar';
import AnswerButton from '../components/quiz/AnswerButton';
import Timer from '../components/quiz/Timer';
import { connectSocket, getSocket } from '../services/socket';
import { getAuthToken } from '../services/auth';
import { useMatchStore } from '../store/matchStore';
import type { Question, MatchResult } from '../types/api';

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

  const { setCurrentQuestion: setStoreQuestion, addQuestionResult } = useMatchStore();

  useEffect(() => {
    if (!matchId) return;

    const token = getAuthToken();
    if (!token) {
      navigate('/');
      return;
    }

    const socket = connectSocket(parseInt(matchId), token);

    socket.on('match:question', (data: { data: Question }) => {
      const question = data.data || data;
      // WAŻNE: Nie przechowujemy correct_answer w state!
      setCurrentQuestion({
        ...question,
        correct_answer: undefined, // Usuwamy correct_answer dla bezpieczeństwa
      } as Question);
      setStoreQuestion(question);
      setSelectedAnswer(null);
      setShowResult(false);
      setTimeLeft(60);
    });

    socket.on('match:result', (data: { data: MatchResult }) => {
      const result = data.data || data;
      // TERAZ otrzymujemy poprawną odpowiedź
      setQuestionResults((prev) => [...prev, result]);
      addQuestionResult(result);
      setShowResult(true);

      // Po 3 sekundach przejdź do następnego pytania
      setTimeout(() => {
        setShowResult(false);
      }, 3000);
    });

    socket.on('match:end', (data: { data: any }) => {
      const endData = data.data || data;
      setMatchEnded(true);
      setFinalScore({
        player1: endData.player1_score,
        player2: endData.player2_score,
        winner: endData.winner_id,
      });
    });

    socket.on('match:opponent_answered', () => {
      // Przeciwnik odpowiedział - można pokazać wizualną informację
    });

    socket.connect().catch((error) => {
      console.error('WebSocket connection error:', error);
    });

    // Wyślij gotowość
    socket.send('match:ready');

    return () => {
      const currentSocket = getSocket();
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, [matchId, navigate, setStoreQuestion, addQuestionResult]);

  const handleAnswer = (answer: string) => {
    if (selectedAnswer || showResult) return;

    setSelectedAnswer(answer);
    const socket = getSocket();
    if (socket) {
      socket.send('match:answer', { answer });
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
    const isIncorrect = isSelected && !isCorrect;

    return {
      isCorrect,
      isIncorrect,
      isSelected,
    };
  };

  if (matchEnded && finalScore) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-primary mb-8">Koniec meczu!</h1>
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <div className="text-2xl mb-4">
              <span className="font-bold">Gracz 1:</span> {finalScore.player1} pkt
            </div>
            <div className="text-2xl mb-6">
              <span className="font-bold">Gracz 2:</span> {finalScore.player2} pkt
            </div>
            {finalScore.winner && (
              <div className="text-3xl font-bold text-green-600 mb-6">
                Zwycięzca: Gracz {finalScore.winner}
              </div>
            )}
            {!finalScore.winner && (
              <div className="text-3xl font-bold text-gray-600 mb-6">Remis!</div>
            )}
          </div>
          <button
            onClick={() => navigate('/')}
            className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90"
          >
            Powrót do głównej
          </button>
        </div>
      </Layout>
    );
  }

  if (!currentQuestion) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-lg text-gray-600">Oczekiwanie na pytanie...</div>
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
            current={questionResults.length + 1}
            total={10}
          />
        </div>

        <div className="mb-6 flex justify-between items-center">
          <div className="text-lg text-gray-600">
            Pytanie {questionResults.length + 1} z 10
          </div>
          <Timer
            seconds={timeLeft}
            onTimeout={() => {
              if (!selectedAnswer) {
                handleAnswer('a'); // Automatyczna odpowiedź przy timeout
              }
            }}
          />
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {currentQuestion.question_text}
          </h2>

          <div className="space-y-4">
            <AnswerButton
              label="A"
              text={currentQuestion.option_a}
              isSelected={selectedAnswer === 'a'}
              showResult={showResult}
              {...(answerStatusA || {})}
              onClick={() => handleAnswer('a')}
            />
            <AnswerButton
              label="B"
              text={currentQuestion.option_b}
              isSelected={selectedAnswer === 'b'}
              showResult={showResult}
              {...(answerStatusB || {})}
              onClick={() => handleAnswer('b')}
            />
            <AnswerButton
              label="C"
              text={currentQuestion.option_c}
              isSelected={selectedAnswer === 'c'}
              showResult={showResult}
              {...(answerStatusC || {})}
              onClick={() => handleAnswer('c')}
            />
            <AnswerButton
              label="D"
              text={currentQuestion.option_d}
              isSelected={selectedAnswer === 'd'}
              showResult={showResult}
              {...(answerStatusD || {})}
              onClick={() => handleAnswer('d')}
            />
          </div>
        </div>

        {showResult && questionResults.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-lg">
              {questionResults[questionResults.length - 1].your_correct
                ? '✓ Poprawna odpowiedź!'
                : '✗ Błędna odpowiedź'}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
