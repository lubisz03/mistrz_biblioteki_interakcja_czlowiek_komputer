import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Category from './pages/Category';
import Ranking from './pages/Ranking';
import Profile from './pages/Profile';
import Benefits from './pages/Benefits';
import Ready from './pages/Ready';
import Matchmaking from './pages/Matchmaking';
import Quiz from './pages/Quiz';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PublicRoute from './components/auth/PublicRoute';
import { useAuthStore } from './store/authStore';

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/category/:subjectId"
          element={
            <ProtectedRoute>
              <Category />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ranking"
          element={
            <ProtectedRoute>
              <Ranking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ranking/:subjectId"
          element={
            <ProtectedRoute>
              <Ranking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/benefits"
          element={
            <ProtectedRoute>
              <Benefits />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ready/:matchId"
          element={
            <ProtectedRoute>
              <Ready />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matchmaking/:matchId"
          element={
            <ProtectedRoute>
              <Matchmaking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quiz/:matchId"
          element={
            <ProtectedRoute>
              <Quiz />
            </ProtectedRoute>
          }
        />

        {/* Catch all - redirect to home */}
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
