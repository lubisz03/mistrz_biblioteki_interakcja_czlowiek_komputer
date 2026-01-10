import { useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';
import api from '../../services/api';
import type { Subject, Book } from '../../types/api';
import type { User } from '../../types/api';

interface ChallengeModalProps {
  opponent: User;
  onClose: () => void;
}

export default function ChallengeModal({ opponent, onClose }: ChallengeModalProps) {
  const navigate = useNavigate();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ['subjects'],
    queryFn: async () => {
      const response = await api.get('/quiz/subjects/');
      return response.data;
    },
  });

  const { data: books } = useQuery<Book[]>({
    queryKey: ['books', selectedSubjectId],
    queryFn: async () => {
      if (!selectedSubjectId) return [];
      const response = await api.get(`/quiz/subjects/${selectedSubjectId}/books/`);
      return response.data;
    },
    enabled: !!selectedSubjectId,
  });

  const handleChallenge = async () => {
    if (!selectedSubjectId || !selectedBookId) {
      alert('Wybierz kategorię i książkę');
      return;
    }

    try {
      const response = await api.post('/quiz/matches/challenge/', {
        book_id: selectedBookId,
        subject_id: selectedSubjectId,
        opponent_id: opponent.id,
      });
      const matchId = response.data?.id;
      if (matchId) {
        navigate(`/matchmaking/${matchId}`);
        onClose();
      }
    } catch (error: unknown) {
      console.error('Error challenging user:', error);
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      alert(apiError.response?.data?.message || apiError.message || 'Nie udało się wyzwać gracza');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-primary">
              Wyzwij {opponent.first_name && opponent.last_name
                ? `${opponent.first_name} ${opponent.last_name}`
                : opponent.username || opponent.email}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Wybór kategorii */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Wybierz kategorię
              </label>
              <div className="grid grid-cols-2 gap-3">
                {subjects?.map((subject) => (
                  <button
                    key={subject.id}
                    onClick={() => {
                      setSelectedSubjectId(subject.id);
                      setSelectedBookId(null);
                    }}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      selectedSubjectId === subject.id
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-200 hover:border-primary/50'
                    }`}
                    style={{
                      borderColor: selectedSubjectId === subject.id ? subject.color : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: subject.color }}
                      />
                      <span className="font-semibold">{subject.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Wybór książki */}
            {selectedSubjectId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Wybierz książkę
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {books?.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => setSelectedBookId(book.id)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${
                        selectedBookId === book.id
                          ? 'border-primary bg-primary/10'
                          : 'border-gray-200 hover:border-primary/50'
                      }`}
                    >
                      <p className="font-semibold">{book.title}</p>
                      <p className="text-sm text-gray-600">{book.author}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Przyciski */}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={onClose}>
                Anuluj
              </Button>
              <Button
                variant="primary"
                onClick={handleChallenge}
                disabled={!selectedSubjectId || !selectedBookId}
              >
                Wyzwij
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
