export type Institution = { id: string; name: string; code: string };
export type ProviderAccount = {
  id: string;
  numberMasked: string;
  type: string;
  currency: string;
  name: string;
  currentBalance: string;
  availableBalance: string;
  active: boolean;
  refreshedAt: Date | null;
};
export type ProviderTransaction = {
  id: string;
  transactionDate: Date;
  postingDate: Date;
  description: string;
  normalizedDescription: string;
  amount: string;
  currency: string;
  transactionType: 'CREDIT' | 'DEBIT';
  reference: string | null;
  counterparty: string | null;
  providerStatus: string;
  rawMetadata: { type: string; pending: boolean };
};
export type ProviderConnection = {
  id: string;
  institution: Institution;
  status: 'CONNECTED' | 'SYNCING' | 'NEEDS_ATTENTION';
  accounts: ProviderAccount[];
};
export interface BankingProvider {
  getConnections(): Promise<{ id: string; institution: Institution }[]>;
  getConnection(credential: string): Promise<ProviderConnection>;
  getAccounts(credential: string): Promise<ProviderAccount[]>;
  getBalances(
    credential: string,
  ): Promise<Pick<ProviderAccount, 'id' | 'currentBalance' | 'availableBalance'>[]>;
  getTransactions(
    credential: string,
    accountId: string,
    since: Date,
    until: Date,
    updatedSince?: Date,
  ): Promise<ProviderTransaction[]>;
}
