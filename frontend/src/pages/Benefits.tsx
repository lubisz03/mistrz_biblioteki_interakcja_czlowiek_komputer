import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import api from '../services/api';
import type { Benefit } from '../types/api';

export default function Benefits() {
  const queryClient = useQueryClient();

  const { data: benefits, isLoading } = useQuery<Benefit[]>({
    queryKey: ['benefits'],
    queryFn: async () => {
      const response = await api.get('/quiz/user/me/benefits/');
      // Interceptor już rozpakował response.data.data -> response.data
      return response.data;
    },
  });

  const useBenefitMutation = useMutation({
    mutationFn: async (benefitId: number) => {
      const response = await api.post(`/quiz/user/me/benefits/${benefitId}/use/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
    },
  });

  const handleUseBenefit = (benefitId: number) => {
    useBenefitMutation.mutate(benefitId);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-lg text-gray-600">Ładowanie korzyści...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">Twoje korzyści</h1>
      </div>

      <div className="space-y-4">
        {benefits?.map((benefit) => (
          <Card key={benefit.id}>
            <div className="bg-green-600 text-white p-6 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">
                  {benefit.benefit_type === 'parking' ? 'Darmowy parking' : benefit.benefit_type}
                </h3>
                <div className="text-lg font-semibold">
                  {benefit.usage_count}/{benefit.max_usage}
                </div>
              </div>
              <p className="text-green-100 mb-4">Posiadasz niewykorzystane bilety parkingowe PŁ!</p>
              <div className="mb-4">
                <ProgressBar current={benefit.usage_count} total={benefit.max_usage} className="bg-green-700" />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleUseBenefit(benefit.id)}
                  disabled={benefit.usage_count >= benefit.max_usage}
                  className="bg-green-500 hover:bg-green-400"
                >
                  Wykorzystaj
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
