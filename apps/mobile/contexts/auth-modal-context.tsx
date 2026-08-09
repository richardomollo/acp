import { createContext, useContext, useState, useCallback } from 'react';

// Callback receives the newly-authenticated userId
export type AuthSuccessCallback = (userId: string) => void;

interface AuthModalOptions {
  defaultTab?: 'login' | 'signup';
  redirectTo?: string;
}

interface AuthModalCtx {
  visible: boolean;
  defaultTab: 'login' | 'signup';
  redirectTo: string | undefined;
  showAuthModal: (onSuccess?: AuthSuccessCallback, options?: AuthModalOptions) => void;
  hideAuthModal: () => void;
  /** Called by the modal itself after successful login/signup */
  _notifySuccess: (userId: string) => void;
}

const AuthModalContext = createContext<AuthModalCtx>({
  visible: false,
  defaultTab: 'login',
  redirectTo: undefined,
  showAuthModal: () => {},
  hideAuthModal: () => {},
  _notifySuccess: () => {},
});

export const useAuthModal = () => useContext(AuthModalContext);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'login' | 'signup'>('login');
  const [redirectTo, setRedirectTo] = useState<string | undefined>(undefined);
  // Store callback in state using the function-updater trick to avoid stale closures
  const [onSuccess, setOnSuccess] = useState<AuthSuccessCallback | undefined>(undefined);

  const showAuthModal = useCallback((callback?: AuthSuccessCallback, options?: AuthModalOptions) => {
    setOnSuccess(() => callback);
    setDefaultTab(options?.defaultTab ?? 'login');
    setRedirectTo(options?.redirectTo);
    setVisible(true);
  }, []);

  const hideAuthModal = useCallback(() => {
    setVisible(false);
    setOnSuccess(undefined);
    setRedirectTo(undefined);
  }, []);

  const _notifySuccess = useCallback((userId: string) => {
    setVisible(false);
    // Run callback after modal close animation starts
    setTimeout(() => {
      onSuccess?.(userId);
      setOnSuccess(undefined);
      setRedirectTo(undefined);
    }, 100);
  }, [onSuccess]);

  return (
    <AuthModalContext.Provider value={{ visible, defaultTab, redirectTo, showAuthModal, hideAuthModal, _notifySuccess }}>
      {children}
    </AuthModalContext.Provider>
  );
}
