"use client";

import {
  defaultDealConfig,
  defaultServicePackages,
  type DealConfig,
  type ServicePackage,
} from "@/lib/site-config";

const SERVICE_STORAGE_KEY = "gbatx-service-packages";
const DEAL_STORAGE_KEY = "gbatx-deal-config";

export function loadServicePackages(): ServicePackage[] {
  if (typeof window === "undefined") return defaultServicePackages;
  const raw = window.localStorage.getItem(SERVICE_STORAGE_KEY);
  if (!raw) return defaultServicePackages;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultServicePackages;
    return parsed as ServicePackage[];
  } catch {
    return defaultServicePackages;
  }
}

export function saveServicePackages(packages: ServicePackage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(packages));
}

export function loadDealConfig(): DealConfig {
  if (typeof window === "undefined") return defaultDealConfig;
  const raw = window.localStorage.getItem(DEAL_STORAGE_KEY);
  if (!raw) return defaultDealConfig;
  try {
    return { ...defaultDealConfig, ...(JSON.parse(raw) as DealConfig) };
  } catch {
    return defaultDealConfig;
  }
}

export function saveDealConfig(config: DealConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEAL_STORAGE_KEY, JSON.stringify(config));
}
