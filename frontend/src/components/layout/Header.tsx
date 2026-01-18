import { Link, useNavigate } from 'react-router-dom';
import {  User, LogOut } from 'lucide-react';
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
        <Link to="/" className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="bg-accent w-12 h-12 rounded flex items-center justify-center text-white font-bold text-xl">
            PŁ
          </div>
          <h1 className="text-xl font-semibold">Mistrz Zasobów Biblioteki PŁ</h1>
        </Link>

        <div className="flex items-center gap-4">

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
