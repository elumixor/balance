export interface IntegrationStatus {
  accountId: string;
  provider: string;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
}
