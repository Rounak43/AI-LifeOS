import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from './Spinner.jsx';

/**
 * Gate routes behind authentication. While auth state is resolving we show a
 * spinner (avoids a flash of the login page for already-signed-in users).
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your day…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}
