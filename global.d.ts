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
      };
      app: {
        getInfo(): Promise<{ name: string; version: string; packaged: boolean }>;
      };
    };
  }
}
