import { useState } from 'react';
import { ChevronLeft, ChevronRight, Users, Trophy } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import type { User } from '../../types/api';

interface ActiveUsersSidebarProps {
  activeUsers: User[];
  onChallenge: (userId: number) => void;
}

export default function ActiveUsersSidebar({ activeUsers, onChallenge }: ActiveUsersSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-primary text-white p-2 rounded-l-lg shadow-lg transition-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label={isOpen ? 'Ukryj aktywnych użytkowników' : 'Pokaż aktywnych użytkowników'}
      >
        {isOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-30 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="bg-primary text-white p-4 flex items-center gap-2">
            <Users className="w-6 h-6" />
            <h2 className="text-xl font-bold">Aktywni gracze</h2>
            <span className="ml-auto bg-white/20 px-2 py-1 rounded text-sm">
              {activeUsers.length}
            </span>
          </div>

          {/* Users list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeUsers.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Brak aktywnych graczy</p>
              </div>
            ) : (
              activeUsers.map((user) => (
                <Card key={user.id} className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {user.first_name?.[0] || user.email[0].toUpperCase()}
                    </div>

                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">
                        {user.first_name && user.last_name
                          ? `${user.first_name} ${user.last_name}`
                          : user.username || user.email}
                      </h3>
                      <p className="text-sm text-gray-600 truncate">{user.email}</p>
                      {user.best_ranking && (
                        <div className="flex items-center gap-1 mt-1">
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span className="text-xs text-gray-600">
                            {user.best_ranking.points} pkt ({user.best_ranking.subject})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Challenge button */}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onChallenge(user.id)}
                      className="flex-shrink-0"
                    >
                      Wyzwij
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
