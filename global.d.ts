import type { BusinessProfile, OmniSnapshot } from './types';
export {};

declare global {
  type OmniLicenseStatus = {
    status: 'demo_available' | 'active' | 'expired' | 'blocked';
    mode?: 'demo' | 'commercial';
    plan?: 'monthly' | 'annual';
    licenseId?: string;
    customer?: string;
    demoDays?: number;
    demoStartedAt?: string;
    expiresAt?: string;
    remainingMs?: number;
    installationId: string;
    reason?: string;
    message?: string;
  };

  type OmniDatabaseInfo = {
    path: string;
    integrity: string;
    documents: number;
    migrations: number;
  };

  interface Window {
    omniStandalone: {
      license: {
        getStatus(): Promise<OmniLicenseStatus>;
        startDemo(): Promise<OmniLicenseStatus>;
        activate(token: string): Promise<OmniLicenseStatus>;
        getInstallationId(): Promise<string>;
      };
      database: {
        getInfo(): Promise<OmniDatabaseInfo>;
        backup(label?: string): Promise<string>;
        snapshot(): Promise<OmniSnapshot>;
        replaceSnapshot(snapshot: OmniSnapshot): Promise<OmniSnapshot>;
        list<T = unknown>(collection: string): Promise<T[]>;
        put<T = unknown>(collection: string, id: string, data: T): Promise<T>;
        remove(collection: string, id: string): Promise<{ ok: boolean }>;
        saveProfile(profile: BusinessProfile): Promise<BusinessProfile>;
        importProducts(products: unknown[]): Promise<{ imported: number; products: unknown[] }>;
        importBarcodes(mappings: unknown[]): Promise<{ updated: number; products: unknown[] }>;
        adjustStock(payload: unknown): Promise<{ product: unknown }>;
        commitSale(payload: unknown): Promise<{ sale: unknown; snapshot: OmniSnapshot }>;
        voidSale(saleId: string): Promise<{ sale: unknown; snapshot: OmniSnapshot }>;
        commitPurchase(payload: unknown): Promise<{ purchase: unknown; snapshot: OmniSnapshot }>;
        voidPurchase(purchaseId: string): Promise<{ purchase: unknown; snapshot: OmniSnapshot }>;
        openCash(payload: unknown): Promise<{ closure: unknown; snapshot: OmniSnapshot }>;
        closeCash(payload: unknown): Promise<{ closure: unknown; snapshot: OmniSnapshot }>;
      };
      app: {
        getInfo(): Promise<{ name: string; version: string; packaged: boolean }>;
      };
    };
  }
}
