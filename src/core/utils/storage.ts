import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Storage usado pelo `persist` do Zustand. Trocar por MMKV/SecureStore aqui, se necessário. */
export const persistStorage = createJSONStorage(() => AsyncStorage);
