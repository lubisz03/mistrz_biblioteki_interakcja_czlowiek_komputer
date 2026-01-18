import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import SkeletonLoader from '../components/ui/SkeletonLoader';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { RankingEntry } from '../types/api';

export default function Ranking() {
  const { subjectId } = useParams<{ subjectId?: string }>();
  const { user } = useAuthStore();

  const { data: rankings, isLoading } = useQuery<RankingEntry[]>({
    queryKey: ['ranking', subjectId],
    queryFn: async () => {
      const url = subjectId
        ? `/quiz/ranking/${subjectId}/`
        : '/quiz/ranking/';
      const response = await api.get(url);
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="mb-8">
          <SkeletonLoader variant="text" width="200px" height="48px" className="mb-2" />
          <SkeletonLoader variant="text" width="300px" height="24px" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonLoader key={i} variant="rectangular" height="80px" />
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">Ranking</h1>
        {subjectId && (
          <p className="text-gray-600 text-lg">Ranking w kategorii</p>
        )}
      </div>

      <div className="space-y-3">
        {rankings?.map((entry) => {
          const isCurrentUser = entry.user.id === user?.id;
          return (
            <Card
              key={entry.position}
              className={isCurrentUser ? 'bg-blue-50 border-2 border-primary' : ''}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-primary w-12 text-center">
                    {entry.position}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {isCurrentUser ? 'Ty' : entry.user.username || entry.user.email}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {entry.wins} wygranych, {entry.losses} przegranych
                    </p>
                  </div>
                </div>
                <div className="text-2xl font-bold text-primary">
                  {entry.points} pkt
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
