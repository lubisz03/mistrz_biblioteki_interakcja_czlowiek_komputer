import { Link, useNavigate } from 'react-router-dom';
import { Search, MessageCircle, User, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="bg-primary text-white py-4 px-6">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-accent w-12 h-12 rounded flex items-center justify-center text-white font-bold text-xl">
            PŁ
          </div>
          <h1 className="text-xl font-semibold">Mistrz Zasobów Biblioteki PŁ</h1>
        </div>

        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Wyszukaj kategorię"
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/10 text-white placeholder-gray-300 border border-white/20 focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <MessageCircle className="w-6 h-6 cursor-pointer hover:text-gray-200" />
          <Link to="/profile" title="Profil">
            <User className="w-6 h-6 cursor-pointer hover:text-gray-200" />
          </Link>
          {user && (
            <button
              onClick={handleLogout}
              title="Wyloguj"
              className="p-1 hover:bg-white/10 rounded"
            >
              <LogOut className="w-6 h-6 cursor-pointer hover:text-gray-200" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
