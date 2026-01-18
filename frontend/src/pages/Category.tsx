import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SkeletonLoader from '../components/ui/SkeletonLoader';
import api from '../services/api';
import { useToastStore } from '../store/toastStore';
import { logger } from '../utils/logger';
import type { Book, Subject } from '../types/api';

export default function Category() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToastStore();

  const { data: books, isLoading: booksLoading } = useQuery<Book[]>({
    queryKey: ['books', subjectId],
    queryFn: async () => {
      const response = await api.get(`/quiz/subjects/${subjectId}/books/`);
      return response.data;
    },
    enabled: !!subjectId,
  });

  const { data: subject } = useQuery<Subject>({
    queryKey: ['subject', subjectId],
    queryFn: async () => {
      const response = await api.get(`/quiz/subjects/`);
      const subjects = response.data;
      return subjects.find((s: Subject) => s.id === parseInt(subjectId || '0'));
    },
    enabled: !!subjectId,
  });

  const handleFindOpponent = async (bookId: number) => {
    try {
      const response = await api.post('/quiz/matches/find/', {
        book_id: bookId,
        subject_id: parseInt(subjectId || '0'),
      });
      // Interceptor już rozpakował response.data.data -> response.data
      logger.debug('Full response:', response);
      logger.debug('Response data:', response.data);
      const matchId = response.data?.id;
      logger.debug('Match ID:', matchId);
      if (matchId) {
        const path = `/matchmaking/${matchId}`;
        logger.debug('Navigating to:', path);
        navigate(path, { replace: false });
      } else {
        logger.error('No match ID in response:', response.data);
        showToast('error', 'Nie udało się utworzyć meczu. Spróbuj ponownie.');
      }
    } catch (error: unknown) {
      logger.error('Error finding opponent:', error);
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = apiError.response?.data?.message || apiError.message || 'Nie udało się znaleźć przeciwnika';
      showToast('error', errorMessage);
    }
  };

  const handleInviteFriend = async (bookId: number, index: string) => {
    try {
      const response = await api.post('/quiz/matches/find/', {
        book_id: bookId,
        subject_id: parseInt(subjectId || '0'),
        invite_index: index,
      });
      // Interceptor już rozpakował response.data.data -> response.data
      logger.debug('Full response (invite):', response);
      logger.debug('Response data (invite):', response.data);
      const matchId = response.data?.id;
      logger.debug('Match ID (invite):', matchId);
      if (matchId) {
        const path = `/matchmaking/${matchId}`;
        logger.debug('Navigating to (invite):', path);
        navigate(path, { replace: false });
      } else {
        logger.error('No match ID in response:', response.data);
        showToast('error', 'Nie udało się utworzyć meczu. Spróbuj ponownie.');
      }
    } catch (error: unknown) {
      logger.error('Error inviting friend:', error);
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = apiError.response?.data?.message || apiError.message || 'Nie udało się zaprosić znajomego';
      showToast('error', errorMessage);
    }
  };

  if (booksLoading) {
    return (
      <Layout>
        <div className="mb-8">
          <SkeletonLoader variant="text" width="300px" height="48px" className="mb-2" />
          <SkeletonLoader variant="text" width="400px" height="24px" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLoader key={i} variant="rectangular" height="120px" />
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">{subject?.name || 'Kategoria'}</h1>
        <p className="text-gray-600 text-lg">Wybierz książkę lub materiał, z którego chcesz rozwiązać quiz</p>
      </div>

      <div className="space-y-4">
        {books?.map((book) => (
          <Card key={book.id}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">{book.title}</h3>
                <p className="text-gray-600">{book.author}</p>
              </div>
              <div className="flex gap-4">
                <Button onClick={() => handleFindOpponent(book.id)}>Wyszukaj przeciwnika</Button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Wpisz numer indeksu aby wyzwać znajomego:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Numer indeksu"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLInputElement;
                      if (target.value) {
                        handleInviteFriend(book.id, target.value);
                      }
                    }
                  }}
                />
                <Button
                  variant="success"
                  onClick={(e) => {
                    const input = (e.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
                    if (input?.value) {
                      handleInviteFriend(book.id, input.value);
                    }
                  }}
                >
                  Wyzwij znajomego
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
