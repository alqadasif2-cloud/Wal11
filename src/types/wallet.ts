export interface CryptoAsset {
  symbol: string;
  name: string;
  nameAr: string;
  balance: number;
  usdPrice: number;
  usdValue: number;
  change24h: number;
  bidPrice?: number;
  askPrice?: number;
  spread?: number;
  high24h?: number;
  low24h?: number;
  isLive?: boolean;
  network: string;
  icon: string;
}

export interface LiveMarketData {
  symbol: string;
  tickerSymbol: string;
  name: string;
  nameAr: string;
  price: number;
  bidPrice: number;
  askPrice: number;
  spread: number;
  change24h: number;
  change24hAmount: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: string;
  isLive: boolean;
  source: string;
}

export interface User {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  role: 'owner' | 'user';
  accountStatus: 'active' | 'suspended';
  createdAt: string;
  lastActivityAt?: string;
  walletId: string;
  demoAddress: string;
  passwordHash?: string;
  updatedAt?: string;
}

export interface Wallet {
  walletId: string;
  ownerUserId: string;
  networkType: 'BEP20' | 'ERC20' | 'TRC20' | string;
  demoAddress: string;
  totalDemoBalance: number;
  availableDemoBalance: number;
  lockedDemoBalance: number;
  assets: CryptoAsset[];
  updatedAt?: string;
}

export interface Transaction {
  transactionId: string;
  originalTransactionId?: string;
  senderUserId: string;
  senderUsername: string;
  senderAddress: string;
  receiverUserId: string;
  receiverUsername: string;
  receiverAddress: string;
  destinationAddress?: string;
  amount: number;
  currency: string;
  network: string;
  transactionType: 'receive' | 'send' | 'refund' | 'admin_adjustment' | 'lock_release';
  status: 'completed' | 'locked' | 'refunded' | 'cancelled' | 'rejected' | 'pending';
  statusTextAr: string;
  createdAt: string;
  formattedTimeAr?: string;
  lockUntil?: string;
  lockDurationMinutes?: number;
  refundReason?: string;
  isSimulated?: boolean;
  isHistorical?: boolean;
  notes?: string;
  networkTxHash?: string;
}

export interface AppNotification {
  notificationId: string;
  recipientUserId: string;
  transactionId?: string;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  createdAt: string;
  read: boolean;
  type: 'incoming_transfer' | 'locked_transfer' | 'lock_unlocked' | 'admin' | string;
}

export interface AuditLog {
  logId: string;
  adminUserId: string;
  adminUsername: string;
  actionType: 'system_reset' | 'balance_add' | 'balance_deduct' | 'user_suspend' | 'user_activate' | 'lock_release' | 'transfer' | string;
  targetUserId: string;
  targetUsername: string;
  timestamp: string;
  reason: string;
  previousValue?: string;
  newValue?: string;
  details?: string;
}

/**
 * Only show real wallet-to-wallet sent & received transfers in user transaction history.
 * Excludes owner/admin balance adjustments and internal self-swaps.
 */
export function isWalletTransferTransaction(tx: Transaction | null | undefined): boolean {
  if (!tx) return false;
  if (tx.transactionType === 'admin_adjustment') return false;
  if (tx.transactionId?.startsWith('TX_ADMIN_')) return false;
  if (tx.transactionId?.startsWith('TX_SWAP_')) return false;
  if (tx.senderUsername && /^admin\b/i.test(tx.senderUsername.trim())) return false;
  if (tx.isSimulated && tx.notes?.startsWith('تعديل إداري')) return false;
  if (tx.senderUserId && tx.receiverUserId && tx.senderUserId === tx.receiverUserId) return false;
  return (
    tx.transactionType === 'send' ||
    tx.transactionType === 'receive' ||
    tx.transactionType === 'refund'
  );
}

/**
 * Hide administrative balance-adjustment notifications from user notification feeds.
 */
export function isUserVisibleNotification(notif: AppNotification | null | undefined): boolean {
  if (!notif) return false;
  if (notif.transactionId?.startsWith('TX_ADMIN_')) return false;
  if (notif.type === 'admin' && (notif.titleAr?.includes('الإدارة') || notif.title?.toLowerCase().includes('admin'))) {
    return false;
  }
  return true;
}

