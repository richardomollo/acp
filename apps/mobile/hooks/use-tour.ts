import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useTour(key: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(`tour:${key}`).then(seen => {
      if (!seen && !cancelled) {
        const t = setTimeout(() => setVisible(true), 700);
        return () => clearTimeout(t);
      }
    });
    return () => { cancelled = true; };
  }, [key]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    await AsyncStorage.setItem(`tour:${key}`, '1');
  }, [key]);

  return { visible, dismiss };
}
