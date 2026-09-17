import { wait } from '@/core/utils/format';

export type PlanId = 'jogae_monthly' | 'jogae_yearly';

export type Plan = {
  id: PlanId;
  label: string;
  price: string;
  caption: string;
  /** Sufixo do CTA: "R$ 99/ano" */
  ctaSuffix: string;
  badge?: string;
};

/** Fase 2: RevenueCat (`react-native-purchases`), entitlement `premium`, trial de 7 dias. */
export interface BillingService {
  getPlans(): Promise<Plan[]>;
  purchase(planId: PlanId): Promise<{ premium: boolean }>;
  restore(): Promise<{ premium: boolean }>;
}

export const PLANS: Plan[] = [
  { id: 'jogae_monthly', label: 'Mensal', price: 'R$ 14,90', caption: 'por mês', ctaSuffix: 'R$ 14,90/mês' },
  { id: 'jogae_yearly', label: 'Anual', price: 'R$ 99', caption: 'R$ 8,25 / mês', ctaSuffix: 'R$ 99/ano', badge: '−45%' },
];

export class MockBillingService implements BillingService {
  async getPlans() {
    return PLANS;
  }
  async purchase() {
    await wait(900);
    return { premium: true };
  }
  async restore() {
    await wait(600);
    return { premium: false };
  }
}
