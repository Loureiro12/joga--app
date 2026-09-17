import { MockAiGameService, type AiGameService } from '@/features/ai/AiGameService';
import { MockAuthService, type AuthService } from '@/features/auth/AuthService';
import { MockHistoryService, type HistoryService } from '@/features/history/HistoryService';
import { MockRoomService } from '@/features/match/services/MockRoomService';
import type { RoomService } from '@/features/match/services/RoomService';
import { MockBillingService, type BillingService } from '@/features/premium/BillingService';
import { MockProfileService, type ProfileService } from '@/features/profile/ProfileService';
import { MockSocialService, type SocialService } from '@/features/social/SocialService';

/**
 * Composition root: ÚNICO lugar que sabe quais implementações estão em uso.
 * Fase 2 = trocar `new Mock…()` por `new Supabase…()` aqui (ou escolher por env).
 * Telas e stores importam `services` e dependem só das interfaces.
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

export const services: Services = {
  room: new MockRoomService(),
  auth: new MockAuthService(),
  billing: new MockBillingService(),
  ai: new MockAiGameService(),
  social: new MockSocialService(),
  history: new MockHistoryService(),
  profile: new MockProfileService(),
};
