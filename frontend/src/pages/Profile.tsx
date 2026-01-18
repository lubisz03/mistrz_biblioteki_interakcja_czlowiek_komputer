import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import SkeletonLoader from '../components/ui/SkeletonLoader';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import type { UserRanking } from '../types/api';
import { Cpu } from 'lucide-react';

export default function Profile() {
  const navigate = useNavigate();
  const { user, fetchUser } = useAuthStore();

  useEffect(() => {
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  const { data: rankings } = useQuery<UserRanking[]>({
    queryKey: ['user-rankings'],
    queryFn: async () => {
      const response = await api.get('/quiz/user/me/');
      // Interceptor już rozpakował response.data.data -> response.data
      return response.data.rankings;
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <Layout>
        <div className="mb-8">
          <div className="flex items-center gap-6 mb-6">
            <SkeletonLoader variant="circular" width={96} height={96} />
            <div className="space-y-2">
              <SkeletonLoader variant="text" width="200px" height="48px" />
              <SkeletonLoader variant="text" width="250px" height="24px" />
            </div>
          </div>
          <SkeletonLoader variant="text" width="250px" height="32px" className="mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonLoader key={i} variant="rectangular" height="80px" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-8">
        <div className="flex items-center gap-6 mb-6">
          <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center text-white text-3xl font-bold">
            {user.first_name?.[0] || user.email[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-primary">{user.username || user.email}</h1>
            <p className="text-gray-600">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">Dostępne rankingi</h2>
        <div className="space-y-3">
          {rankings?.map((ranking) => (
            <Card
              key={ranking.id}
              onClick={() => navigate(`/ranking/${ranking.subject.id}`)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: ranking.subject.color }}
                >
                  <Cpu className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{ranking.subject.name}</h3>
                  <p className="text-sm text-gray-600">
                    {ranking.points} punktów • {ranking.wins} wygranych
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
