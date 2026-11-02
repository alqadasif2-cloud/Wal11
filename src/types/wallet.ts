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
