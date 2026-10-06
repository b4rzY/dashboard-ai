export type ERPDocument = {
  externalId: string;
  companyId: string;
  currency: string;
  amountMinor: string;
  outstandingMinor: string;
  dueAt: Date;
  kind: 'RECEIVABLE' | 'PAYABLE';
};
export interface ERPProvider {
  getDocuments(companyId: string, since: Date): Promise<ERPDocument[]>;
  getPayments(
    companyId: string,
    since: Date,
  ): Promise<
    { externalId: string; invoiceId: string; amountMinor: string; currency: string; paidAt: Date }[]
  >;
}
