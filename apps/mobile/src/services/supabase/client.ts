import 'react-native-url-polyfill/auto';
import './webcrypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { loggedFetch } from '@/core/logging/loggedFetch';

import type { Database } from '@jogae/db';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Sem as variáveis de ambiente o app roda 100% com os serviços simulados. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export type JogaeSupabase = SupabaseClient<Database>;

export function createSupabaseClient(): JogaeSupabase {
  if (!url || !anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY não definidas');

  const client = createClient<Database>(url, anonKey, {
    // Um fetch só para todo o cliente: login, perfil, histórico, amigos e RPCs entram no log
    // sem que cada serviço precise lembrar de se instrumentar.
    global: { fetch: loggedFetch() },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // O app trata os deep links na mão (OAuth e redefinição de senha), via PKCE.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  // Só renova o token com o app em primeiro plano (recomendação do Supabase para React Native).
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }
  return client;
}
