import { MockAdsService, type AdsService } from '@/features/ads/AdsService';
import { GoogleAdsService } from '@/features/ads/GoogleAdsService';
import { adsState } from '@/features/ads/adsStore';
import { MockAiGameService, type AiGameService } from '@/features/ai/AiGameService';
import { MockAuthService, type AuthService } from '@/features/auth/AuthService';
import { platformAuth } from '@/features/auth/platformAuth';
import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
import { MockHistoryService, type HistoryService } from '@/features/history/HistoryService';
import { SupabaseHistoryService } from '@/features/history/SupabaseHistoryService';
import { MockRoomService } from '@/features/match/services/MockRoomService';
import { RemoteRoomService } from '@/features/match/services/RemoteRoomService';
import type { RoomService } from '@/features/match/services/RoomService';
import { MockBillingService, type BillingService } from '@/features/premium/BillingService';
import { MockProfileService, type ProfileService } from '@/features/profile/ProfileService';
import { SupabaseProfileService } from '@/features/profile/SupabaseProfileService';
import { friendInviteLink, MockSocialService } from '@/features/social/MockSocialService';
import type { SocialService } from '@/features/social/SocialService';
import { SupabaseSocialService } from '@/features/social/SupabaseSocialService';

import { AppState } from 'react-native';

import { features } from '@/core/config/features';

import { createSupabaseClient, isSupabaseConfigured } from './supabase/client';

/**
 * Composition root: ÚNICO lugar que sabe quais implementações estão em uso.
 * Telas e stores importam `services` e dependem só das interfaces.
 *
 * Com EXPO_PUBLIC_SUPABASE_URL/ANON_KEY definidas, conta, perfil, histórico e amigos são reais;
 * sem elas, tudo roda simulado (útil para design, testes de UI e o harness web).
 */
export type Services = {
  room: RoomService;
  auth: AuthService;
  billing: BillingService;
  ai: AiGameService;
  social: SocialService;
  history: HistoryService;
  profile: ProfileService;
  ads: AdsService;
};

const supabase = isSupabaseConfigured ? createSupabaseClient() : null;

/** `ws://IP-DO-MAC:8787/ws` em dev. Exige o Supabase: é o token dele que identifica o jogador na sala. */
const roomServerUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;

function createRoomService(): RoomService {
  if (!supabase || !roomServerUrl) return new MockRoomService();
  const remote = new RemoteRoomService({
    url: roomServerUrl,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });
  // O sistema costuma matar o socket com o app em segundo plano, às vezes sem avisar.
  AppState.addEventListener('change', (state) => state === 'active' && remote.notifyForeground());
  return remote;
}

export const services: Services = {
  room: createRoomService(),
  auth: supabase ? new SupabaseAuthService(supabase, platformAuth) : new MockAuthService(),
  profile: supabase ? new SupabaseProfileService(supabase) : new MockProfileService(),
  billing: new MockBillingService(),
  ai: new MockAiGameService(),
  social: supabase ? new SupabaseSocialService(supabase, friendInviteLink) : new MockSocialService(),
  history: supabase ? new SupabaseHistoryService(supabase) : new MockHistoryService(),
  // Sem a flag (ou sem o SDK nativo), o simulado só registra no log de dev onde o anúncio cairia.
  ads: features.ads ? new GoogleAdsService() : new MockAdsService(),
};

/** Sobe o que precisa acontecer uma vez, na abertura do app. Nunca lança. */
export async function startServices(): Promise<void> {
  await adsState.load();
  await services.ads.start().catch(() => {});
}

export const backendMode: 'supabase' | 'mock' = supabase ? 'supabase' : 'mock';
export const roomMode: 'remote' | 'mock' = supabase && roomServerUrl ? 'remote' : 'mock';
