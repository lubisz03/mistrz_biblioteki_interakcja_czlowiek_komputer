import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  BookOpen,
  Cpu,
  Droplet,
  Target,
  Cloud,
  AtSign,
  Divide,
  Building,
  Sun,
  Library,
  type LucideIcon,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import api from '../services/api';
import type { Subject } from '../types/api';

const iconMap: Record<string, LucideIcon> = {
  wrench: Wrench,
  book: BookOpen,
  cpu: Cpu,
  droplet: Droplet,
  target: Target,
  cloud: Cloud,
  atsign: AtSign,
  divide: Divide,
  building: Building,
  sun: Sun,
  library: Library,
};

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: subjects, isLoading } = useQuery<Subject[]>({
    queryKey: ['subjects'],
    queryFn: async () => {
      const response = await api.get('/quiz/subjects/');
      return response.data;
    },
  });

  const filteredSubjects =
    subjects?.filter((subject) => subject.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-lg text-gray-600">Ładowanie kategorii...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">Kategorie</h1>
        <p className="text-gray-600 text-lg">Wybierz obszar wiedzy który cię interesuje</p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Wyszukaj kategorię"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSubjects.map((subject) => {
          const IconComponent = iconMap[subject.icon_name.toLowerCase()] || BookOpen;
          return (
            <Card key={subject.id} onClick={() => navigate(`/category/${subject.id}`)} className="cursor-pointer">
              <div
                className="flex items-center gap-4 p-4 rounded-lg text-white"
                style={{ backgroundColor: subject.color }}
              >
                <div className="flex-shrink-0">
                  <IconComponent className="w-10 h-10" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">{subject.name}</h3>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
