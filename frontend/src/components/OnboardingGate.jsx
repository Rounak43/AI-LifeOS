import { useAuth } from '../context/AuthContext.jsx';
import Onboarding from '../pages/Onboarding.jsx';
import Spinner from './Spinner.jsx';

/**
 * Blocks the app until a signed-in user has completed first-run profile setup.
 * `onboardingComplete` lives on the profile doc; the live listener flips this the
 * moment setup is saved.
 */
export default function OnboardingGate({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <Spinner label="Loading your day…" />;

  // Signed in, profile loaded, but not yet onboarded → force setup (no skip).
  if (user && profile && profile.onboardingComplete !== true) {
    return <Onboarding />;
  }

  return children;
}
