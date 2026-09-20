import { MockAiGameService, type AiGameService } from '@/features/ai/AiGameService';
import { MockAuthService, type AuthService } from '@/features/auth/AuthService';
import { platformAuth } from '@/features/auth/platformAuth';
import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
import { MockHistoryService, type HistoryService } from '@/features/history/HistoryService';
import { MockRoomService } from '@/features/match/services/MockRoomService';
import type { RoomService } from '@/features/match/services/RoomService';
import { MockBillingService, type BillingService } from '@/features/premium/BillingService';
import { MockProfileService, type ProfileService } from '@/features/profile/ProfileService';
import { SupabaseProfileService } from '@/features/profile/SupabaseProfileService';
import { MockSocialService, type SocialService } from '@/features/social/SocialService';

import { createSupabaseClient, isSupabaseConfigured } from './supabase/client';

/**
 * Composition root: ÚNICO lugar que sabe quais implementações estão em uso.
 * Telas e stores importam `services` e dependem só das interfaces.
 *
 * Com EXPO_PUBLIC_SUPABASE_URL/ANON_KEY definidas, conta e perfil são reais;
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
};

const supabase = isSupabaseConfigured ? createSupabaseClient() : null;

export const services: Services = {
  room: new MockRoomService(),
  auth: supabase ? new SupabaseAuthService(supabase, platformAuth) : new MockAuthService(),
  profile: supabase ? new SupabaseProfileService(supabase) : new MockProfileService(),
  billing: new MockBillingService(),
  ai: new MockAiGameService(),
  social: new MockSocialService(),
  history: new MockHistoryService(),
};

export const backendMode: 'supabase' | 'mock' = supabase ? 'supabase' : 'mock';
