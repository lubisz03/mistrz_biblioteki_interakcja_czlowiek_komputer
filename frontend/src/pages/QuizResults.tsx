import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, TrendingUp, RotateCcw } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuthStore } from '../store/authStore';
import type { Match } from '../types/api';

interface QuizResultsProps {
  match: Match;
  finalScore: { player1: number; player2: number; winner: number | null };
  questionResults: Array<{ your_correct: boolean; opponent_correct: boolean }>;
}

export default function QuizResults({ match, finalScore, questionResults }: QuizResultsProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Sprawdź czy jest remis - jeśli wyniki są równe i winner jest null
  const isDraw = finalScore.winner === null || finalScore.winner === undefined;
  // Sprawdź czy użytkownik wygrał - winner musi być ustawiony i równy user.id
  const isWinner = !isDraw && finalScore.winner === user?.id;
  const yourScore = user?.id === match.player1?.id ? finalScore.player1 : finalScore.player2;
  const opponentScore = user?.id === match.player1?.id ? finalScore.player2 : finalScore.player1;
  const opponent = user?.id === match.player1?.id ? match.player2 : match.player1;

  // Debug logi
  console.log('QuizResults: Final score check', {
    finalScore,
    user_id: user?.id,
    isDraw,
    isWinner,
    yourScore,
    opponentScore,
    winner: finalScore.winner
  });


  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Winner Animation */}
        <div className="text-center mb-8 animate-bounce-in">
          {isWinner ? (
            <div className="mb-6">
              <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-4 animate-bounce" />
              <h1 className="text-5xl font-bold text-green-600 mb-2">Zwycięstwo!</h1>
              <p className="text-2xl text-gray-600">Gratulacje!</p>
            </div>
          ) : isDraw ? (
            <div className="mb-6">
              <Medal className="w-24 h-24 text-gray-500 mx-auto mb-4" />
              <h1 className="text-5xl font-bold text-gray-600 mb-2">Remis!</h1>
              <p className="text-2xl text-gray-600">Dobra gra!</p>
            </div>
          ) : (
            <div className="mb-6">
              <TrendingUp className="w-24 h-24 text-blue-500 mx-auto mb-4" />
              <h1 className="text-5xl font-bold text-red-600 mb-2">Przegrana</h1>
              <p className="text-2xl text-gray-600">Spróbuj ponownie!</p>
            </div>
          )}
        </div>

        {/* Scores */}
        <Card className="mb-6 animate-scale-in">
          <div className="grid grid-cols-2 gap-6">
            <div className={`text-center p-6 rounded-lg ${isWinner ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50'}`}>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Twój wynik</h3>
              <div className="text-4xl font-bold text-primary">{yourScore}</div>
              <div className="text-sm text-gray-600 mt-2">z {questionResults.length} pytań</div>
            </div>
            <div className={`text-center p-6 rounded-lg ${!isWinner && !isDraw ? 'bg-red-50 border-2 border-red-500' : 'bg-gray-50'}`}>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {opponent?.first_name && opponent?.last_name
                  ? `${opponent.first_name} ${opponent.last_name}`
                  : opponent?.username || opponent?.email || 'Przeciwnik'}
              </h3>
              <div className="text-4xl font-bold text-primary">{opponentScore}</div>
              <div className="text-sm text-gray-600 mt-2">z {questionResults.length} pytań</div>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(`/category/${match.subject?.id}`)}
            className="flex items-center gap-2 px-8 py-4"
          >
            <RotateCcw className="w-5 h-5" />
            Zagraj ponownie
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/')}
            className="px-8 py-4"
          >
            Powrót do głównej
          </Button>
        </div>
      </div>
    </Layout>
  );
}
