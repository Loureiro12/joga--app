import { MockAdsService, type AdsService } from '@/features/ads/AdsService';
import { GoogleAdsService } from '@/features/ads/GoogleAdsService';
import { adsState } from '@/features/ads/adsStore';
import { MockAiGameService, type AiGameService } from '@/features/ai/AiGameService';
import { MockBombContentService, RemoteBombContentService, type BombContentService } from '@/features/bomb/BombContentService';
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
import { FirebaseTelemetryService } from '@/features/telemetry/FirebaseTelemetryService';
import { MockTelemetryService, type TelemetryService } from '@/features/telemetry/TelemetryService';
import type { SocialService } from '@/features/social/SocialService';
import { SupabaseSocialService } from '@/features/social/SupabaseSocialService';

import { AppState, Platform } from 'react-native';

import { features } from '@/core/config/features';

import { telemetryOptedIn } from '@/features/settings/settingsStore';

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
  /** Desafios e temas da Bomba-Relógio gerados por IA. Simulado = só o banco local. */
  bombContent: BombContentService;
  social: SocialService;
  history: HistoryService;
  profile: ProfileService;
  ads: AdsService;
  /** Firebase Analytics, Crashlytics e Performance. Simulado = só log em dev. */
  telemetry: TelemetryService;
};

const supabase = isSupabaseConfigured ? createSupabaseClient() : null;

/** `ws://IP-DO-MAC:8787/ws` em dev. Exige o Supabase: é o token dele que identifica o jogador na sala. */
const roomServerUrl = process.env.EXPO_PUBLIC_ROOM_SERVER_URL;

function createRoomService(): RoomService {
  if (!supabase || !roomServerUrl) return new MockRoomService();
  const remote = new RemoteRoomService({
    url: roomServerUrl,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    telemetry,
  });
  // O sistema costuma matar o socket com o app em segundo plano, às vezes sem avisar.
  AppState.addEventListener('change', (state) => state === 'active' && remote.notifyForeground());
  return remote;
}

/** Criada antes do objeto `services` porque o serviço de anúncios a recebe por construtor. */
const telemetry: TelemetryService = features.telemetry && Platform.OS !== 'web' ? new FirebaseTelemetryService(telemetryOptedIn) : new MockTelemetryService();

export const services: Services = {
  room: createRoomService(),
  auth: supabase ? new SupabaseAuthService(supabase, platformAuth) : new MockAuthService(),
  profile: supabase ? new SupabaseProfileService(supabase) : new MockProfileService(),
  billing: new MockBillingService(),
  ai: new MockAiGameService(),
  // A geração mora no servidor de salas, que é quem tem a chave da Anthropic. Sem ele (ou sem
  // login), o jogo roda com o banco local — é o caminho normal em dev e quando a rede falha.
  bombContent:
    supabase && roomServerUrl
      ? new RemoteBombContentService({ url: roomServerUrl, getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null })
      : new MockBombContentService(),
  social: supabase ? new SupabaseSocialService(supabase, friendInviteLink) : new MockSocialService(),
  history: supabase ? new SupabaseHistoryService(supabase) : new MockHistoryService(),
  // A web não tem SDK de anúncio, e o harness do navegador roda em cima dela: o simulado só
  // registra no log de dev onde o anúncio cairia.
  ads: features.ads && Platform.OS !== 'web' ? new GoogleAdsService(telemetry) : new MockAdsService(),
  // Mesma razão dos anúncios: o SDK é nativo e a web não tem ponte. O interruptor de Ajustes
  // chega como função para o serviço não precisar importar o store na subida.
  telemetry,
};

/**
 * Sobe o que precisa acontecer uma vez, na abertura do app. Nunca lança.
 *
 * **A telemetria vem primeiro, e isso não é arbitrário:** é o que faz o Crashlytics capturar uma
 * falha que aconteça na subida do AdMob ou do Supabase. Se ela subisse por último, justamente as
 * falhas mais graves — as de inicialização, que derrubam o app antes da primeira tela — não
 * apareceriam em relatório nenhum.
 */
export async function startServices(): Promise<void> {
  await services.telemetry.start().catch(() => {});
  services.telemetry.setUserProps({ backend: backendMode, premium: false, telemetria: telemetryOptedIn() });
  await adsState.load();
  await services.ads.start().catch(() => {});
}

export const backendMode: 'supabase' | 'mock' = supabase ? 'supabase' : 'mock';
export const roomMode: 'remote' | 'mock' = supabase && roomServerUrl ? 'remote' : 'mock';
