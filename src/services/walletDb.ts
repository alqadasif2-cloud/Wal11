import { signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { marketPriceService } from './marketPriceService';
import { cleanForFirestore, RecipientLookupResult, WalletCloudService } from './walletCloudService';
import {
  AppNotification,
  AuditLog,
  CryptoAsset,
  isUserVisibleNotification,
  isWalletTransferTransaction,
  LiveMarketData,
  Transaction,
  User,
  Wallet,
} from '../types/wallet';

const STORAGE_KEYS = {
  USERS: 'twp_users_v4',
  WALLETS: 'twp_wallets_v4',
  TRANSACTIONS: 'twp_transactions_v4',
  AUDIT_LOGS: 'twp_audit_logs_v4',
  NOTIFICATIONS: 'twp_notifications_v4',
  CURRENT_USER: 'twp_current_user_v4',
  LANGUAGE: 'twp_language_v4',
  BACKUP: 'twp_backup_pre_migration_v4',
  PROCESSED_TXS: 'twp_processed_txs_v4',
};

export function createDefaultAssets(
  totalUsd: number,
  customPrices?: Record<string, LiveMarketData>
): CryptoAsset[] {
  const prices = customPrices || marketPriceService.getPrices();
  const btcPrice = prices['BTC']?.price || 96000;
  const ethPrice = prices['ETH']?.price || 3500;
  const bnbPrice = prices['BNB']?.price || 640;
  const usdtPrice = 1;
  const solPrice = prices['SOL']?.price || 185;

  const usdtShare = totalUsd * 0.7;
  const bnbShare = totalUsd * 0.15;
  const ethShare = totalUsd * 0.1;
  const btcShare = totalUsd * 0.05;

  const btcBalance = Math.round((btcShare / btcPrice) * 100000) / 100000;
  const ethBalance = Math.round((ethShare / ethPrice) * 10000) / 10000;
  const bnbBalance = Math.round((bnbShare / bnbPrice) * 10000) / 10000;
  const usdtBalance = Math.round(usdtShare * 100) / 100;

  return [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      nameAr: 'تيثر دولار',
      balance: usdtBalance,
      usdPrice: usdtPrice,
      usdValue: Math.round(usdtBalance * usdtPrice * 100) / 100,
      change24h: prices['USDT']?.change24h ?? 0.01,
      bidPrice: prices['USDT']?.bidPrice ?? 0.9999,
      askPrice: prices['USDT']?.askPrice ?? 1.0001,
      spread: prices['USDT']?.spread ?? 0.0002,
      high24h: prices['USDT']?.high24h,
      low24h: prices['USDT']?.low24h,
      isLive: prices['USDT']?.isLive ?? false,
      network: 'BEP20',
      icon: 'usdt',
    },
    {
      symbol: 'BNB',
      name: 'BNB Smart Chain',
      nameAr: 'بي إن بي سمارت شين',
      balance: bnbBalance,
      usdPrice: bnbPrice,
      usdValue: Math.round(bnbBalance * bnbPrice * 100) / 100,
      change24h: prices['BNB']?.change24h ?? 2.45,
      bidPrice: prices['BNB']?.bidPrice,
      askPrice: prices['BNB']?.askPrice,
      spread: prices['BNB']?.spread,
      high24h: prices['BNB']?.high24h,
      low24h: prices['BNB']?.low24h,
      isLive: prices['BNB']?.isLive ?? false,
      network: 'BEP20',
      icon: 'bnb',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      nameAr: 'إيثيريوم',
      balance: ethBalance,
      usdPrice: ethPrice,
      usdValue: Math.round(ethBalance * ethPrice * 100) / 100,
      change24h: prices['ETH']?.change24h ?? -1.15,
      bidPrice: prices['ETH']?.bidPrice,
      askPrice: prices['ETH']?.askPrice,
      spread: prices['ETH']?.spread,
      high24h: prices['ETH']?.high24h,
      low24h: prices['ETH']?.low24h,
      isLive: prices['ETH']?.isLive ?? false,
      network: 'ERC20',
      icon: 'eth',
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      nameAr: 'بيتكوين',
      balance: btcBalance,
      usdPrice: btcPrice,
      usdValue: Math.round(btcBalance * btcPrice * 100) / 100,
      change24h: prices['BTC']?.change24h ?? 3.82,
      bidPrice: prices['BTC']?.bidPrice,
      askPrice: prices['BTC']?.askPrice,
      spread: prices['BTC']?.spread,
      high24h: prices['BTC']?.high24h,
      low24h: prices['BTC']?.low24h,
      isLive: prices['BTC']?.isLive ?? false,
      network: 'Bitcoin',
      icon: 'btc',
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      nameAr: 'سولانا',
      balance: 0,
      usdPrice: solPrice,
      usdValue: 0,
      change24h: prices['SOL']?.change24h ?? 4.2,
      bidPrice: prices['SOL']?.bidPrice,
      askPrice: prices['SOL']?.askPrice,
      spread: prices['SOL']?.spread,
      high24h: prices['SOL']?.high24h,
      low24h: prices['SOL']?.low24h,
      isLive: prices['SOL']?.isLive ?? false,
      network: 'Solana',
      icon: 'sol',
    },
  ];
}

function getInitialSeedData(): {
  users: User[];
  wallets: Wallet[];
  transactions: Transaction[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
} {
  return {
    users: [
      {
        userId: 'usr_owner_sami',
        username: 'Sami',
        displayName: 'Sami (مالك المحفظة / Owner)',
        role: 'owner',
        accountStatus: 'active',
        createdAt: '2026-10-01T10:00:00.000Z',
        lastActivityAt: new Date().toISOString(),
        walletId: 'wlt_owner_sami',
        demoAddress: '0x71C6381f211322C81985B8Fa2A478b8813C824a8',
        passwordHash: '70707070',
      },
      {
        userId: 'usr_eslam_alqadasi',
        username: 'Eslam Alqadasi',
        displayName: 'Eslam Alqadasi',
        role: 'user',
        accountStatus: 'active',
        createdAt: '2026-10-05T08:00:00.000Z',
        lastActivityAt: new Date().toISOString(),
        walletId: 'wlt_eslam_alqadasi',
        demoAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        passwordHash: 'Eslam@2es',
      },
      {
        userId: 'usr_ahmed_crypto',
        username: 'Ahmed Crypto',
        displayName: 'أحمد التميمي',
        role: 'user',
        accountStatus: 'active',
        createdAt: '2026-10-06T12:00:00.000Z',
        lastActivityAt: new Date().toISOString(),
        walletId: 'wlt_ahmed_crypto',
        demoAddress: '0x8891dEa24B641c49129532B5B4961f77d3451A01',
        passwordHash: 'Ahmed@123',
      },
      {
        userId: 'usr_nour_tech',
        username: 'Nour Tech',
        displayName: 'نور للدعم التقني',
        role: 'user',
        accountStatus: 'active',
        createdAt: '2026-10-08T14:30:00.000Z',
        lastActivityAt: new Date().toISOString(),
        walletId: 'wlt_nour_tech',
        demoAddress: '0x992Bcd48102a9C1284Ea84092bF58B124C2817c9',
        passwordHash: 'Nour@123',
      },
    ],
    wallets: [
      {
        walletId: 'wlt_owner_sami',
        ownerUserId: 'usr_owner_sami',
        networkType: 'BEP20',
        demoAddress: '0x71C6381f211322C81985B8Fa2A478b8813C824a8',
        totalDemoBalance: 3000,
        availableDemoBalance: 3000,
        lockedDemoBalance: 0,
        assets: createDefaultAssets(3000),
      },
      {
        walletId: 'wlt_eslam_alqadasi',
        ownerUserId: 'usr_eslam_alqadasi',
        networkType: 'BEP20',
        demoAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        totalDemoBalance: 0,
        availableDemoBalance: 0,
        lockedDemoBalance: 0,
        assets: createDefaultAssets(0),
      },
      {
        walletId: 'wlt_ahmed_crypto',
        ownerUserId: 'usr_ahmed_crypto',
        networkType: 'BEP20',
        demoAddress: '0x8891dEa24B641c49129532B5B4961f77d3451A01',
        totalDemoBalance: 450,
        availableDemoBalance: 450,
        lockedDemoBalance: 0,
        assets: createDefaultAssets(450),
      },
      {
        walletId: 'wlt_nour_tech',
        ownerUserId: 'usr_nour_tech',
        networkType: 'BEP20',
        demoAddress: '0x992Bcd48102a9C1284Ea84092bF58B124C2817c9',
        totalDemoBalance: 600,
        availableDemoBalance: 600,
        lockedDemoBalance: 0,
        assets: createDefaultAssets(600),
      },
    ],
    transactions: [
      {
        transactionId: 'TX_HIST_001',
        senderUserId: 'usr_system_faucet',
        senderUsername: 'Sender External',
        senderAddress: '0x12a89B10d86290C22B487c645D792911b330F7c0',
        receiverUserId: 'usr_eslam_alqadasi',
        receiverUsername: 'Eslam Alqadasi',
        receiverAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        amount: 100,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'receive',
        status: 'completed',
        statusTextAr: 'مكتملة',
        createdAt: '2026-10-07T05:11:00.000Z',
        formattedTimeAr: '7 أكتوبر - 5:11 صباحًا',
        isSimulated: false,
        isHistorical: false,
        notes: 'سجل استلام',
      },
      {
        transactionId: 'TX_HIST_002',
        senderUserId: 'usr_system_faucet',
        senderUsername: 'Sender External',
        senderAddress: '0x33b890C12841c64128532B5B4961f77d3451A011',
        receiverUserId: 'usr_eslam_alqadasi',
        receiverUsername: 'Eslam Alqadasi',
        receiverAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        amount: 50,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'receive',
        status: 'completed',
        statusTextAr: 'مكتملة',
        createdAt: '2026-10-09T08:30:00.000Z',
        formattedTimeAr: '9 أكتوبر - 8:30 صباحًا',
        isSimulated: false,
        isHistorical: false,
        notes: 'سجل استلام',
      },
      {
        transactionId: 'TX_HIST_003',
        senderUserId: 'usr_system_faucet',
        senderUsername: 'Sender External',
        senderAddress: '0x77c90D22B487c645D792911b330F7c012a89B10d',
        receiverUserId: 'usr_eslam_alqadasi',
        receiverUsername: 'Eslam Alqadasi',
        receiverAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        amount: 150,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'receive',
        status: 'completed',
        statusTextAr: 'مكتملة',
        createdAt: '2026-10-09T15:15:00.000Z',
        formattedTimeAr: '9 أكتوبر - 3:15 مساءً',
        isSimulated: false,
        isHistorical: false,
        notes: 'سجل استلام',
      },
      {
        transactionId: 'TX_HIST_004',
        senderUserId: 'usr_system_faucet',
        senderUsername: 'Sender External',
        senderAddress: '0x8891dEa24B641c49129532B5B4961f77d3451A01',
        receiverUserId: 'usr_eslam_alqadasi',
        receiverUsername: 'Eslam Alqadasi',
        receiverAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        amount: 15,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'receive',
        status: 'completed',
        statusTextAr: 'مكتملة',
        createdAt: '2026-10-09T16:05:00.000Z',
        formattedTimeAr: '9 أكتوبر - 4:05 مساءً',
        isSimulated: false,
        isHistorical: false,
        notes: 'سجل استلام',
      },
      {
        transactionId: 'TX_HIST_005',
        senderUserId: 'usr_eslam_alqadasi',
        senderUsername: 'Eslam Alqadasi',
        senderAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        receiverUserId: 'usr_dest_742d',
        receiverUsername: '0x742d...fc26',
        receiverAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438fc26',
        destinationAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438fc26',
        amount: 15,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'send',
        status: 'completed',
        statusTextAr: 'إرسال',
        createdAt: '2026-10-09T17:13:00.000Z',
        formattedTimeAr: '9 أكتوبر - 5:13 مساءً',
        isSimulated: false,
        isHistorical: false,
        notes: 'إرسال إلى 0x742d35Cc6634C0532925a3b844Bc454e4438fc26',
      },
      {
        transactionId: 'TX_REFUND_001',
        originalTransactionId: 'TX_HIST_001',
        senderUserId: 'usr_eslam_alqadasi',
        senderUsername: 'Eslam Alqadasi',
        senderAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        receiverUserId: 'usr_system_faucet',
        receiverUsername: 'Sender External',
        receiverAddress: '0x12a89B10d86290C22B487c645D792911b330F7c0',
        amount: 100,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'refund',
        status: 'refunded',
        statusTextAr: 'مسترجع',
        createdAt: '2026-10-09T21:00:00.000Z',
        formattedTimeAr: '9 أكتوبر - 9:00 مساءً',
        refundReason: 'استرجاع من قبل المرسل',
        isSimulated: false,
        isHistorical: false,
        notes: 'عملية استرجاع مرتبطة بالمعاملة الأصلية TX_HIST_001',
      },
      {
        transactionId: 'TX_REFUND_002',
        originalTransactionId: 'TX_HIST_002',
        senderUserId: 'usr_eslam_alqadasi',
        senderUsername: 'Eslam Alqadasi',
        senderAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        receiverUserId: 'usr_system_faucet',
        receiverUsername: 'Sender External',
        receiverAddress: '0x33b890C12841c64128532B5B4961f77d3451A011',
        amount: 50,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'refund',
        status: 'refunded',
        statusTextAr: 'مسترجع',
        createdAt: '2026-10-09T21:02:00.000Z',
        formattedTimeAr: '9 أكتوبر - 9:02 مساءً',
        refundReason: 'استرجاع من قبل المرسل',
        isSimulated: false,
        isHistorical: false,
        notes: 'عملية استرجاع مرتبطة بالمعاملة الأصلية TX_HIST_002',
      },
      {
        transactionId: 'TX_REFUND_003',
        originalTransactionId: 'TX_HIST_003',
        senderUserId: 'usr_eslam_alqadasi',
        senderUsername: 'Eslam Alqadasi',
        senderAddress: '0x429E5A3bF6789D8b76c128dE65E2C4F22c4a9B12',
        receiverUserId: 'usr_system_faucet',
        receiverUsername: 'Sender External',
        receiverAddress: '0x77c90D22B487c645D792911b330F7c012a89B10d',
        amount: 150,
        currency: 'USD',
        network: 'BEP20',
        transactionType: 'refund',
        status: 'refunded',
        statusTextAr: 'مسترجع',
        createdAt: '2026-10-09T21:05:00.000Z',
        formattedTimeAr: '9 أكتوبر - 9:05 مساءً',
        refundReason: 'استرجاع من قبل المرسل',
        isSimulated: false,
        isHistorical: false,
        notes: 'عملية استرجاع مرتبطة بالمعاملة الأصلية TX_HIST_003',
      },
    ],
    auditLogs: [
      {
        logId: 'LOG_INIT_001',
        adminUserId: 'usr_owner_sami',
        adminUsername: 'Sami',
        actionType: 'system_reset',
        targetUserId: 'system',
        targetUsername: 'System Engine',
        timestamp: '2026-10-01T10:00:00.000Z',
        reason: 'تهيئة بيئة المحفظة وتخصيص رصيد المالك الأولي 3000$',
        previousValue: '0',
        newValue: '3000',
      },
    ],
    notifications: [
      {
        notificationId: 'notif_welcome',
        recipientUserId: 'usr_eslam_alqadasi',
        title: 'مرحباً بك في TRUST WALLET',
        titleAr: 'مرحباً بك في TRUST WALLET',
        body: 'تم تجهيز محفظتك بنجاح مع كامل الميزات ومزامنة Firebase والأسعار الحية.',
        bodyAr: 'تم تجهيز محفظتك بنجاح مع كامل الميزات ومزامنة Firebase والأسعار الحية.',
        createdAt: new Date().toISOString(),
        read: false,
        type: 'admin',
      },
    ],
  };
}

export class WalletDatabase {
  private static initDone = false;
  private static firestoreSyncActive = false;
  private static firestoreUnsubscribers: Unsubscribe[] = [];

  static initialize(): void {
    if (this.initDone) return;
    if (typeof window === 'undefined') return;

    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      const seed = getInitialSeedData();
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(seed.users));
      localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(seed.wallets));
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(seed.transactions));
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(seed.auditLogs));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(seed.notifications));
    } else if (!localStorage.getItem(STORAGE_KEYS.BACKUP)) {
      try {
        const snapshot = {
          users: localStorage.getItem(STORAGE_KEYS.USERS),
          wallets: localStorage.getItem(STORAGE_KEYS.WALLETS),
          transactions: localStorage.getItem(STORAGE_KEYS.TRANSACTIONS),
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEYS.BACKUP, JSON.stringify(snapshot));
      } catch {}
    }

    marketPriceService.start();
    this.ensureFirebaseAuth();
    this.startFirestoreSync();
    this.initDone = true;
  }

  private static async ensureFirebaseAuth(): Promise<void> {
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch {}
  }

  private static startFirestoreSync(): void {
    if (this.firestoreSyncActive || typeof window === 'undefined') return;
    this.firestoreSyncActive = true;
    this.seedFirestoreInitialData().catch(() => {});

    try {
      const unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          if (!snap.empty) {
            const cloudUsers: User[] = [];
            snap.forEach((d) => cloudUsers.push(d.data() as User));
            const localUsers = this.getUsers();
            const merged = this.mergeEntities(localUsers, cloudUsers, 'userId');
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(merged));
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      );
      this.firestoreUnsubscribers.push(unsubUsers);
    } catch {}

    try {
      const unsubWallets = onSnapshot(
        collection(db, 'wallets'),
        (snap) => {
          if (!snap.empty) {
            const cloudWallets: Wallet[] = [];
            snap.forEach((d) => cloudWallets.push(d.data() as Wallet));
            const localWallets = this.getWallets();
            const merged = this.mergeWalletsByOwner(localWallets, cloudWallets);
            localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(merged));
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'wallets');
        }
      );
      this.firestoreUnsubscribers.push(unsubWallets);
    } catch {}

    try {
      const unsubTxs = onSnapshot(
        collection(db, 'transactions'),
        (snap) => {
          if (!snap.empty) {
            const cloudTxs: Transaction[] = [];
            snap.forEach((d) => cloudTxs.push(d.data() as Transaction));
            const localTxs = this.getTransactions();
            const merged = this.mergeEntities(localTxs, cloudTxs, 'transactionId');
            merged.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(merged));
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        }
      );
      this.firestoreUnsubscribers.push(unsubTxs);
    } catch {}
  }

  private static mergeEntities<T>(local: T[], cloud: T[], idKey: keyof T): T[] {
    const map = new Map<unknown, T>();
    local.forEach((item) => map.set(item[idKey], item));
    cloud.forEach((item) => map.set(item[idKey], item));
    return Array.from(map.values());
  }

  private static mergeWalletsByOwner(local: Wallet[], cloud: Wallet[]): Wallet[] {
    const byOwner = new Map<string, Wallet>();
    const consider = (w: Wallet) => {
      if (!w || !w.ownerUserId) return;
      const existing = byOwner.get(w.ownerUserId);
      if (!existing) {
        byOwner.set(w.ownerUserId, w);
        return;
      }
      const existingTime = existing.updatedAt ? Date.parse(existing.updatedAt) || 0 : 0;
      const incomingTime = w.updatedAt ? Date.parse(w.updatedAt) || 0 : 0;
      if (incomingTime >= existingTime) {
        byOwner.set(w.ownerUserId, w);
      }
    };
    local.forEach(consider);
    cloud.forEach(consider);
    return Array.from(byOwner.values());
  }

  private static persistWalletToFirestore(w: Wallet): void {
    if (!w || !w.ownerUserId) return;
    const payload = cleanForFirestore({
      ...w,
      walletId: w.walletId || w.ownerUserId,
      updatedAt: w.updatedAt || new Date().toISOString(),
    });
    setDoc(doc(db, 'wallets', w.ownerUserId), payload, { merge: true }).catch(() => {});
    if (w.walletId && w.walletId !== w.ownerUserId) {
      setDoc(doc(db, 'wallets', w.walletId), payload, { merge: true }).catch(() => {});
    }
  }

  private static async seedFirestoreInitialData(): Promise<void> {
    try {
      await this.ensureFirebaseAuth();
      const localUsers = this.getUsers();
      const localWallets = this.getWallets();
      const localTxs = this.getTransactions();
      const existingSnap = await getDocs(collection(db, 'users'));
      if (existingSnap.empty) {
        for (const u of localUsers) {
          await setDoc(doc(db, 'users', u.userId), cleanForFirestore(u), { merge: true });
        }
        for (const w of localWallets) {
          await setDoc(doc(db, 'wallets', w.walletId), cleanForFirestore(w), { merge: true });
        }
        for (const t of localTxs) {
          await setDoc(doc(db, 'transactions', t.transactionId), cleanForFirestore(t), {
            merge: true,
          });
        }
      }
    } catch {}
  }

  static resetToSeed(): void {
    const seed = getInitialSeedData();
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(seed.users));
    localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(seed.wallets));
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(seed.transactions));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(seed.auditLogs));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(seed.notifications));
  }

  static getUsers(): User[] {
    this.initialize();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static getUserById(userId: string): User | undefined {
    return this.getUsers().find((u) => u.userId === userId);
  }

  static getUserByUsername(username: string): User | undefined {
    const normalized = WalletCloudService.extractRecipientQuery(username).trim().toLowerCase();
    return this.getUsers().find((u) => u.username.toLowerCase() === normalized);
  }

  static getUserByAddress(address: string): User | undefined {
    const cleaned = WalletCloudService.extractRecipientQuery(address).trim().toLowerCase();
    return this.getUsers().find((u) => u.demoAddress.toLowerCase() === cleaned);
  }

  static async lookupRecipientCloud(queryText: string): Promise<RecipientLookupResult> {
    return WalletCloudService.lookupRecipientCloud(queryText, this.getUsers());
  }

  static getWallets(): Wallet[] {
    this.initialize();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WALLETS);
      const parsed: Wallet[] = data ? JSON.parse(data) : [];
      return this.mergeWalletsByOwner(parsed, []);
    } catch {
      return [];
    }
  }

  static getWalletByUserId(userId: string): Wallet | undefined {
    this.checkAndReleaseExpiredLocks();
    const wallet = this.getWallets().find((w) => w.ownerUserId === userId);
    if (!wallet) return undefined;
    const livePrices = marketPriceService.getPrices();
    const refreshedAssets = createDefaultAssets(wallet.totalDemoBalance, livePrices);
    return {
      ...wallet,
      assets: refreshedAssets,
    };
  }

  static saveWallets(wallets: Wallet[], syncToCloud = true): void {
    const deduped = this.mergeWalletsByOwner(wallets, []);
    localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(deduped));
    if (syncToCloud) {
      deduped.forEach((w) => {
        this.persistWalletToFirestore(w);
      });
    }
  }

  static saveUsers(users: User[]): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    users.forEach((u) => {
      setDoc(doc(db, 'users', u.userId), cleanForFirestore(u), { merge: true }).catch(() => {});
    });
  }

  static getTransactions(): Transaction[] {
    this.initialize();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static getUserTransactions(userId: string): Transaction[] {
    this.checkAndReleaseExpiredLocks();
    return this.getTransactions().filter(
      (t) =>
        isWalletTransferTransaction(t) &&
        (t.senderUserId === userId ||
          t.receiverUserId === userId ||
          (t.transactionType === 'refund' &&
            (userId === 'usr_eslam_alqadasi' ||
              t.senderUserId === userId ||
              t.receiverUserId === userId)))
    );
  }

  static saveTransactions(txs: Transaction[], syncToCloud = true): void {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
    if (syncToCloud) {
      txs.forEach((t) => {
        setDoc(doc(db, 'transactions', t.transactionId), cleanForFirestore(t), {
          merge: true,
        }).catch(() => {});
      });
    }
  }

  static getAuditLogs(): AuditLog[] {
    this.initialize();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static addAuditLog(log: Omit<AuditLog, 'logId' | 'timestamp'>): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      ...log,
      logId:
        'LOG_' +
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).substring(2, 6).toUpperCase(),
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newLog);
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
  }

  static getNotifications(userId: string): AppNotification[] {
    this.initialize();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const all: AppNotification[] = data ? JSON.parse(data) : [];
      return all.filter((n) => n.recipientUserId === userId && isUserVisibleNotification(n));
    } catch {
      return [];
    }
  }

  static addNotification(
    notif: Omit<AppNotification, 'notificationId' | 'createdAt' | 'read'>
  ): void {
    const allNotifications: AppNotification[] = (() => {
      try {
        const d = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        return d ? JSON.parse(d) : [];
      } catch {
        return [];
      }
    })();

    const newNotif: AppNotification = {
      ...notif,
      notificationId: 'NTF_' + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      read: false,
    };

    allNotifications.unshift(newNotif);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(allNotifications));
    this.sendSystemNotification(
      newNotif.titleAr || newNotif.title,
      newNotif.bodyAr || newNotif.body
    );
  }

  static markNotificationRead(notificationId: string): void {
    try {
      const d = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (!d) return;
      const all: AppNotification[] = JSON.parse(d);
      const target = all.find((n) => n.notificationId === notificationId);
      if (target) {
        target.read = true;
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
      }
    } catch {}
  }

  static markAllNotificationsRead(userId: string): void {
    try {
      const d = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (!d) return;
      const all: AppNotification[] = JSON.parse(d);
      all.forEach((n) => {
        if (n.recipientUserId === userId) n.read = true;
      });
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
    } catch {}
  }

  static async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    try {
      return (await Notification.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  static sendSystemNotification(title: string, body: string): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: './assets/aistudio/Screenshot_20261014212008_a818ec9f.jpg',
          badge: './assets/aistudio/Screenshot_20261014212008_a818ec9f.jpg',
          tag: 'trust-wallet-pro-transfer',
        });
      } catch {}
    }
  }

  static getCurrentUser(): User | null {
    this.initialize();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (!raw || raw === 'logged_out') return null;
      const session = JSON.parse(raw);
      if (!session?.userId) return null;
      return this.getUserById(session.userId) || null;
    } catch {
      return null;
    }
  }

  static setCurrentUser(user: User | null): void {
    if (!user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, 'logged_out');
    } else {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify({ userId: user.userId }));
    }
  }

  static generateDemoAddress(): string {
    const chars = '0123456789abcdef';
    let addr = '0x';
    for (let i = 0; i < 40; i++) {
      addr += chars[Math.floor(Math.random() * 16)];
    }
    return addr;
  }

  static async registerUser(
    username: string,
    password: string,
    displayName?: string
  ): Promise<{ success: boolean; message: string; user?: User }> {
    this.initialize();
    const cleanUsername = username.trim();
    if (!cleanUsername || cleanUsername.length < 3) {
      return {
        success: false,
        message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل.',
      };
    }
    if (!password || password.length < 4) {
      return {
        success: false,
        message: 'كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل.',
      };
    }
    if (cleanUsername.toLowerCase() === 'sami') {
      return {
        success: false,
        message: 'لا يمكن إنشاء حساب المالك من خلال شاشة التسجيل العادية.',
      };
    }

    try {
      const existingSnap = await getDocs(
        query(collection(db, 'users'), where('username', '==', cleanUsername))
      );
      if (!existingSnap.empty) {
        return {
          success: false,
          message: 'اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم آخر.',
        };
      }
    } catch (e) {
      console.warn('Cloud username check note:', e);
    }

    if (this.getUserByUsername(cleanUsername)) {
      return {
        success: false,
        message: 'اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم آخر.',
      };
    }

    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const walletId = userId;
    const demoAddress = this.generateDemoAddress();
    const nowIso = new Date().toISOString();

    const newUser: User = {
      userId,
      username: cleanUsername,
      displayName: displayName?.trim() || cleanUsername,
      role: 'user',
      accountStatus: 'active',
      createdAt: nowIso,
      lastActivityAt: nowIso,
      walletId,
      demoAddress,
      passwordHash: password,
    };

    const initialBalance = 0;
    const newWallet: Wallet = {
      walletId,
      ownerUserId: userId,
      networkType: 'BEP20',
      demoAddress,
      totalDemoBalance: initialBalance,
      availableDemoBalance: initialBalance,
      lockedDemoBalance: 0,
      assets: createDefaultAssets(initialBalance),
      updatedAt: nowIso,
    };

    const users = this.getUsers().filter((u) => u.userId !== userId);
    users.push(newUser);
    this.saveUsers(users);

    const wallets = this.getWallets().filter((w) => w.ownerUserId !== userId);
    wallets.push(newWallet);
    this.saveWallets(wallets);

    try {
      await WalletCloudService.saveUserToCloud(newUser, newWallet);
    } catch (e) {
      console.warn('Cloud user save warning:', e);
    }

    this.addNotification({
      recipientUserId: userId,
      title: 'تم إنشاء المحفظة بنجاح',
      titleAr: 'تم إنشاء المحفظة بنجاح',
      body: 'مرحباً بك! تم تجهيز محفظتك بنجاح وبدء تشغيل الحساب ومزامنته عبر Firebase.',
      bodyAr: 'مرحباً بك! تم تجهيز محفظتك بنجاح وبدء تشغيل الحساب ومزامنته عبر Firebase.',
      type: 'incoming_transfer',
    });

    this.setCurrentUser(newUser);
    return {
      success: true,
      message: 'تم إنشاء الحساب ومزامنته سحابياً بنجاح.',
      user: newUser,
    };
  }

  static async loginWithGoogle(googleUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
  }): Promise<{ success: boolean; message: string; user?: User }> {
    this.initialize();
    const userId = googleUser.uid;
    let user = this.getUserById(userId);
    let wallet = user ? this.getWalletByUserId(userId) : undefined;

    if (!user) {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) user = userDoc.data() as User;
      } catch {}
    }

    if (!wallet && user) {
      try {
        const walletDoc = await getDoc(doc(db, 'wallets', user.walletId || userId));
        if (walletDoc.exists()) wallet = walletDoc.data() as Wallet;
      } catch {}
    }

    const nowIso = new Date().toISOString();
    const trustedAdminEmails = [
      'alsonadi44@gmail.com',
      'alsonadi22@gmail.com',
      'alqadasif2@gmail.com',
    ];

    if (!user) {
      const demoAddress = this.generateDemoAddress();
      const initialBalance = 0;
      const cleanName =
        googleUser.displayName ||
        (googleUser.email ? googleUser.email.split('@')[0] : 'User_' + userId.substring(0, 6));
      const normalizedEmail = googleUser.email?.toLowerCase() || '';

      user = {
        userId,
        username: cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        displayName: googleUser.displayName || cleanName,
        email: googleUser.email || undefined,
        role: trustedAdminEmails.includes(normalizedEmail) ? 'owner' : 'user',
        accountStatus: 'active',
        createdAt: nowIso,
        lastActivityAt: nowIso,
        walletId: userId,
        demoAddress,
      };

      wallet = {
        walletId: userId,
        ownerUserId: userId,
        networkType: 'BEP20',
        demoAddress,
        totalDemoBalance: initialBalance,
        availableDemoBalance: initialBalance,
        lockedDemoBalance: 0,
        assets: createDefaultAssets(initialBalance),
      };

      const users = this.getUsers().filter((u) => u.userId !== userId);
      users.push(user);
      this.saveUsers(users);

      const wallets = this.getWallets().filter((w) => w.walletId !== wallet!.walletId);
      wallets.push(wallet);
      this.saveWallets(wallets);

      await WalletCloudService.saveUserToCloud(user, wallet);
      this.addNotification({
        recipientUserId: userId,
        title: 'تم تفعيل حساب Google السحابي',
        titleAr: 'تم تفعيل حساب Google السحابي',
        body: 'تم تسجيل دخولك بنجاح وربط محفظتك بقاعدة بيانات Firebase السحابية.',
        bodyAr: 'تم تسجيل دخولك بنجاح وربط محفظتك بقاعدة بيانات Firebase السحابية.',
        type: 'incoming_transfer',
      });
    } else {
      user.lastActivityAt = nowIso;
      const users = this.getUsers().filter((u) => u.userId !== userId);
      users.push(user);
      this.saveUsers(users);

      if (wallet) {
        const wallets = this.getWallets().filter((w) => w.walletId !== wallet!.walletId);
        wallets.push(wallet);
        this.saveWallets(wallets);
      }
      await WalletCloudService.saveUserToCloud(user, wallet);
    }

    this.setCurrentUser(user);
    return {
      success: true,
      message: 'تم تسجيل الدخول بنجاح عبر حساب Google.',
      user,
    };
  }

  static async loginUser(
    username: string,
    password: string
  ): Promise<{ success: boolean; message: string; user?: User }> {
    this.initialize();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      return {
        success: false,
        message: 'يرجى إدخال اسم المستخدم وكلمة المرور.',
      };
    }

    let user: User | null = null;
    let wallet: Wallet | null = null;

    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('username', '==', cleanUsername))
      );
      if (!snap.empty) {
        user = snap.docs[0].data() as User;
      } else {
        const allSnap = await getDocs(collection(db, 'users'));
        for (const d of allSnap.docs) {
          const u = d.data() as User;
          if (u.username && u.username.toLowerCase() === cleanUsername.toLowerCase()) {
            user = u;
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[WalletDatabase] Cloud login query note:', e);
    }

    if (!user) {
      user = this.getUserByUsername(cleanUsername) || null;
      if (user) WalletCloudService.saveUserToCloud(user).catch(() => {});
    }

    if (!user) {
      return {
        success: false,
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      };
    }

    if (user.accountStatus === 'suspended') {
      return {
        success: false,
        message: 'تم إيقاف هذا الحساب من قبل الإدارة.',
      };
    }

    if (user.passwordHash && user.passwordHash !== password) {
      return {
        success: false,
        message: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      };
    }

    try {
      wallet = await WalletCloudService.fetchUserWalletCloud(user.userId);
    } catch (e) {
      console.warn('[WalletDatabase] Cloud wallet fetch note:', e);
    }

    if (!wallet) {
      wallet = this.getWalletByUserId(user.userId) || null;
      if (!wallet) {
        const startBal = user.role === 'owner' ? 3000 : 0;
        wallet = {
          walletId: user.walletId || user.userId,
          ownerUserId: user.userId,
          networkType: 'BEP20',
          demoAddress: user.demoAddress,
          totalDemoBalance: startBal,
          availableDemoBalance: startBal,
          lockedDemoBalance: 0,
          assets: createDefaultAssets(startBal),
          updatedAt: new Date().toISOString(),
        };
      }
      WalletCloudService.saveUserToCloud(user, wallet).catch(() => {});
    }

    user.lastActivityAt = new Date().toISOString();
    const currentUsers = this.getUsers().filter((u) => u.userId !== user!.userId);
    currentUsers.push(user);
    this.saveUsers(currentUsers);

    if (wallet) {
      const currentWallets = this.getWallets().filter((w) => w.ownerUserId !== user!.userId);
      currentWallets.push(wallet);
      this.saveWallets(currentWallets);
    }

    this.setCurrentUser(user);
    return {
      success: true,
      message: 'تم تسجيل الدخول بنجاح ومزامنة المحفظة المركزية.',
      user,
    };
  }

  static async executeSendTransferAsync(params: {
    senderUserId: string;
    recipientIdentifier: string;
    amount: number;
    currency?: string;
    lockDurationMinutes?: number;
    notes?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; message: string; transaction?: Transaction }> {
    this.initialize();
    this.checkAndReleaseExpiredLocks();

    const {
      senderUserId,
      recipientIdentifier,
      amount,
      currency = 'USD',
      lockDurationMinutes = 0,
      notes,
      idempotencyKey,
    } = params;

    if (!amount || isNaN(amount) || amount <= 0) {
      return {
        success: false,
        message: 'يرجى إدخال مبلغ صحيح أكبر من الصفر.',
      };
    }

    const sender = this.getUserById(senderUserId);
    if (!sender) {
      return {
        success: false,
        message: 'حساب المرسل غير موجود.',
      };
    }

    if (sender.accountStatus === 'suspended') {
      return {
        success: false,
        message: 'حسابك موقوف مؤقتاً، لا يمكنك إجراء تحويلات.',
      };
    }

    const lookup = await this.lookupRecipientCloud(recipientIdentifier);
    const recipient =
      lookup.user ||
      this.getUserByUsername(recipientIdentifier) ||
      this.getUserByAddress(recipientIdentifier) ||
      null;

    if (!recipient) {
      return {
        success: false,
        message: 'لم يتم العثور على صاحب هذا الرابط أو العنوان في قاعدة البيانات المركزية.',
      };
    }

    if (
      recipient.userId === sender.userId ||
      recipient.demoAddress.toLowerCase() === sender.demoAddress.toLowerCase()
    ) {
      return {
        success: false,
        message: 'لا يمكنك إرسال الأموال إلى محفظتك الخاصة.',
      };
    }

    if (recipient.accountStatus === 'suspended') {
      return {
        success: false,
        message: 'المحفظة المستهدفة موقوفة حالياً من قبل الإدارة.',
      };
    }

    let senderWallet = this.getWallets().find((w) => w.ownerUserId === sender.userId);
    const cloudSenderWallet = await WalletCloudService.fetchUserWalletCloud(sender.userId);
    if (cloudSenderWallet) senderWallet = cloudSenderWallet;

    if (!senderWallet) {
      return {
        success: false,
        message: 'تعذر الوصول إلى محفظة المرسل.',
      };
    }

    if (senderWallet.availableDemoBalance < amount) {
      return {
        success: false,
        message: `الرصيد المتاح غير كافٍ. رصيدك المتاح حالياً هو $${senderWallet.availableDemoBalance.toFixed(2)} (المقيد لا يمكن إرساله).`,
      };
    }

    const currentUsers = this.getUsers();
    if (!currentUsers.some((u) => u.userId === recipient.userId)) {
      currentUsers.push(recipient);
      this.saveUsers(currentUsers);
    }

    const result = await WalletCloudService.executeCloudSendTransfer({
      sender,
      senderWallet,
      recipient,
      recipientWallet: lookup.wallet,
      amount,
      currency,
      lockDurationMinutes,
      notes,
      idempotencyKey,
    });

    if (result.success && result.transaction) {
      // Cloud Firestore transaction already updated sender, recipient, and transaction atomically.
      // Cache exact updated wallets locally without re-writing or double-crediting.
      if (result.updatedSenderWallet) {
        this.updateLocalWallet(result.updatedSenderWallet, false);
      }
      if (result.updatedRecipientWallet) {
        this.updateLocalWallet(result.updatedRecipientWallet, false);
      }

      const txs = this.getTransactions().filter(
        (t) => t.transactionId !== result.transaction!.transactionId
      );
      txs.unshift(result.transaction);
      this.saveTransactions(txs, false);

      this.addAuditLog({
        adminUserId: sender.userId,
        adminUsername: sender.displayName || sender.username,
        actionType: 'transfer',
        targetUserId: recipient.userId,
        targetUsername: recipient.displayName || recipient.username,
        reason: `تحويل بقيمة $${amount.toFixed(2)}`,
        details: `إرسال $${amount.toFixed(2)} إلى ${recipient.demoAddress}`,
      });
    }

    return result;
  }

  static updateLocalWallet(wallet: Wallet, syncToCloud = false): void {
    const wallets = this.getWallets();
    const stamped: Wallet = {
      ...wallet,
      updatedAt: wallet.updatedAt || new Date().toISOString(),
    };
    const idx = wallets.findIndex((w) => w.ownerUserId === stamped.ownerUserId);
    if (idx >= 0) wallets[idx] = stamped;
    else wallets.push(stamped);
    this.saveWallets(wallets, false);
    if (syncToCloud) {
      this.persistWalletToFirestore(stamped);
    }
  }

  static executeSendTransfer(params: {
    senderUserId: string;
    recipientIdentifier: string;
    amount: number;
    currency?: string;
    lockDurationMinutes?: number;
    notes?: string;
  }): { success: boolean; message: string; transaction?: Transaction } {
    this.initialize();
    this.checkAndReleaseExpiredLocks();

    const {
      senderUserId,
      recipientIdentifier,
      amount,
      currency = 'USD',
      lockDurationMinutes = 0,
      notes,
    } = params;

    if (!amount || isNaN(amount) || amount <= 0) {
      return {
        success: false,
        message: 'يرجى إدخال مبلغ صحيح أكبر من الصفر.',
      };
    }

    const sender = this.getUserById(senderUserId);
    if (!sender) {
      return {
        success: false,
        message: 'حساب المرسل غير موجود.',
      };
    }

    if (sender.accountStatus === 'suspended') {
      return {
        success: false,
        message: 'حسابك موقوف مؤقتاً، لا يمكنك إجراء تحويلات.',
      };
    }

    const cleanedRecipient = WalletCloudService.extractRecipientQuery(recipientIdentifier);
    const recipient =
      this.getUserByUsername(cleanedRecipient) || this.getUserByAddress(cleanedRecipient);

    if (!recipient) {
      return {
        success: false,
        message: 'لم يتم العثور على المستلم (تحقق من الرابط أو العنوان أو اسم المستخدم).',
      };
    }

    if (
      recipient.userId === sender.userId ||
      recipient.demoAddress.toLowerCase() === sender.demoAddress.toLowerCase()
    ) {
      return {
        success: false,
        message: 'لا يمكنك إرسال الأموال إلى محفظتك الخاصة.',
      };
    }

    const wallets = this.getWallets();
    const senderWallet = wallets.find((w) => w.ownerUserId === sender.userId);
    const recipientWallet = wallets.find((w) => w.ownerUserId === recipient.userId);

    if (!senderWallet || !recipientWallet) {
      return {
        success: false,
        message: 'تعذر الوصول إلى سجلات المحافظ.',
      };
    }

    if (senderWallet.availableDemoBalance < amount) {
      return {
        success: false,
        message: `الرصيد المتاح غير كافٍ. رصيدك المتاح حالياً هو $${senderWallet.availableDemoBalance.toFixed(2)} (المقيد لا يمكن إرساله).`,
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const isLocked = lockDurationMinutes > 0;
    const lockUntil = isLocked
      ? new Date(now.getTime() + lockDurationMinutes * 60 * 1000).toISOString()
      : undefined;

    senderWallet.availableDemoBalance =
      Math.round((senderWallet.availableDemoBalance - amount) * 100) / 100;
    senderWallet.totalDemoBalance =
      Math.round((senderWallet.totalDemoBalance - amount) * 100) / 100;
    senderWallet.assets = createDefaultAssets(senderWallet.totalDemoBalance);

    recipientWallet.totalDemoBalance =
      Math.round((recipientWallet.totalDemoBalance + amount) * 100) / 100;
    if (isLocked) {
      recipientWallet.lockedDemoBalance =
        Math.round((recipientWallet.lockedDemoBalance + amount) * 100) / 100;
    } else {
      recipientWallet.availableDemoBalance =
        Math.round((recipientWallet.availableDemoBalance + amount) * 100) / 100;
    }
    recipientWallet.assets = createDefaultAssets(recipientWallet.totalDemoBalance);
    this.saveWallets(wallets);

    const transactionId =
      'TX_' +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    const transaction: Transaction = {
      transactionId,
      senderUserId: sender.userId,
      senderUsername: sender.displayName || sender.username,
      senderAddress: sender.demoAddress,
      receiverUserId: recipient.userId,
      receiverUsername: recipient.displayName || recipient.username,
      receiverAddress: recipient.demoAddress,
      amount,
      currency,
      network: 'BEP20',
      transactionType: 'send',
      status: isLocked ? 'locked' : 'completed',
      statusTextAr: isLocked ? 'قيد التقييد' : 'مكتملة',
      createdAt: nowIso,
      lockUntil,
      lockDurationMinutes: isLocked ? lockDurationMinutes : undefined,
      isSimulated: false,
      notes: notes?.trim() || (isLocked ? `مبلغ مقيد لمدة ${lockDurationMinutes} دقيقة` : undefined),
      networkTxHash: '',
    };

    const transactions = this.getTransactions();
    transactions.unshift(transaction);
    this.saveTransactions(transactions);

    const senderName = sender.displayName || sender.username;
    const lockNoticeAr = isLocked
      ? ` (مبلغ مقيد مؤقتاً لمدة ${lockDurationMinutes} دقيقة)`
      : '';

    this.addNotification({
      recipientUserId: recipient.userId,
      transactionId,
      title: 'تم استلام أموال جديدة',
      titleAr: 'تم استلام أموال جديدة',
      body: `تم استلام مبلغ قدره $${amount.toFixed(2)} من [${senderName}]، وتم تحديث رصيد محفظتك بنجاح${lockNoticeAr}`,
      bodyAr: `تم استلام مبلغ قدره $${amount.toFixed(2)} من [${senderName}]، وتم تحديث رصيد محفظتك بنجاح${lockNoticeAr}`,
      type: isLocked ? 'locked_transfer' : 'incoming_transfer',
    });

    return {
      success: true,
      message: isLocked
        ? `تم إرسال $${amount} بنجاح مع تقييد المبلغ لمدة ${lockDurationMinutes} دقيقة.`
        : `تم إرسال $${amount} بنجاح إلى ${recipient.displayName || recipient.username}.`,
      transaction,
    };
  }

  /**
   * Wallet balances are updated atomically at transfer/adjustment time in Firestore & local state.
   * Never re-apply transaction amounts on read/subscription, as doing so causes 2x double-crediting.
   */
  static reconcileUserIncomingTransactions(_userId: string): { newIncomingCount: number } {
    return { newIncomingCount: 0 };
  }

  static checkAndReleaseExpiredLocks(): { releasedCount: number } {
    if (typeof window === 'undefined') return { releasedCount: 0 };
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const transactions = this.getTransactions();
    const wallets = this.getWallets();
    let releasedCount = 0;
    const modifiedWallets: Wallet[] = [];
    const modifiedTxs: Transaction[] = [];

    transactions.forEach((tx) => {
      if (tx.status === 'locked' && tx.lockUntil) {
        const lockExpiryTime = new Date(tx.lockUntil).getTime();
        if (now >= lockExpiryTime) {
          tx.status = 'completed';
          tx.statusTextAr = 'متاحة للتصرف (انتهى التقييد)';
          modifiedTxs.push(tx);
          releasedCount++;

          const recipientWallet = wallets.find((w) => w.ownerUserId === tx.receiverUserId);
          if (recipientWallet && recipientWallet.lockedDemoBalance > 0) {
            const releaseAmount = Math.min(recipientWallet.lockedDemoBalance, tx.amount);
            if (releaseAmount > 0) {
              recipientWallet.lockedDemoBalance = Math.max(
                0,
                Math.round((recipientWallet.lockedDemoBalance - releaseAmount) * 100) / 100
              );
              recipientWallet.availableDemoBalance =
                Math.round((recipientWallet.availableDemoBalance + releaseAmount) * 100) / 100;
              recipientWallet.assets = createDefaultAssets(recipientWallet.totalDemoBalance);
              recipientWallet.updatedAt = nowIso;
              modifiedWallets.push(recipientWallet);
            }
          }

          this.addNotification({
            recipientUserId: tx.receiverUserId,
            transactionId: tx.transactionId,
            title: 'انتهت مدة تقييد المبلغ',
            titleAr: 'انتهت مدة تقييد المبلغ',
            body: `أصبح مبلغ ${tx.amount}$ متاحاً بالكامل للتصرف والإرسال في محفظتك.`,
            bodyAr: `أصبح مبلغ ${tx.amount}$ متاحاً بالكامل للتصرف والإرسال في محفظتك.`,
            type: 'lock_unlocked',
          });
        }
      }
    });

    if (modifiedTxs.length > 0) {
      this.saveTransactions(transactions, false);
      modifiedTxs.forEach((tx) => {
        setDoc(doc(db, 'transactions', tx.transactionId), cleanForFirestore(tx), {
          merge: true,
        }).catch(() => {});
      });
    }
    if (modifiedWallets.length > 0) {
      this.saveWallets(wallets, false);
      modifiedWallets.forEach((w) => this.persistWalletToFirestore(w));
    }
    return { releasedCount };
  }

  static isAuthorizedOwner(user: User | null | undefined): boolean {
    if (!user) return false;
    if (user.role !== 'owner') return false;
    if (user.userId === 'usr_owner_sami' && user.username === 'Sami') return true;
    const trustedAdmins = [
      'alsonadi44@gmail.com',
      'alsonadi22@gmail.com',
      'alqadasif2@gmail.com',
    ];
    if (user.email && trustedAdmins.includes(user.email.toLowerCase())) return true;
    const currentAuthEmail = auth.currentUser?.email?.toLowerCase();
    if (currentAuthEmail && trustedAdmins.includes(currentAuthEmail)) return true;
    return false;
  }

  /**
   * Async atomic owner balance adjustment (exact 1x delta, zero user Transaction record, zero admin notification).
   */
  static async adminAdjustBalanceAsync(params: {
    adminUserId: string;
    targetUserId: string;
    amountDelta: number;
    reason: string;
  }): Promise<{ success: boolean; message: string }> {
    this.initialize();
    const { adminUserId, targetUserId, amountDelta, reason } = params;
    const admin = this.getUserById(adminUserId);
    if (!admin || !this.isAuthorizedOwner(admin)) {
      return {
        success: false,
        message: 'غير مصرح لك بإجراء هذه العملية الإدارية.',
      };
    }
    if (!reason || reason.trim().length < 4) {
      return {
        success: false,
        message: 'يجب كتابة سبب واضح وموثق للتعديل الإداري.',
      };
    }
    const targetUser = this.getUserById(targetUserId);
    if (!targetUser) {
      return {
        success: false,
        message: 'المستخدم المستهدف غير موجود.',
      };
    }

    const fallbackWallet = this.getWallets().find((w) => w.ownerUserId === targetUserId) || null;
    const cloudRes = await WalletCloudService.executeCloudAdminAdjustBalance({
      targetUser,
      fallbackWallet,
      amountDelta,
    });

    if (!cloudRes.success || !cloudRes.updatedWallet) {
      return {
        success: false,
        message: cloudRes.message,
      };
    }

    this.updateLocalWallet(cloudRes.updatedWallet, false);

    // Record strictly in Owner's private Audit Log (never in user's transaction history or notifications)
    this.addAuditLog({
      adminUserId,
      adminUsername: admin.username,
      actionType: amountDelta >= 0 ? 'balance_add' : 'balance_deduct',
      targetUserId,
      targetUsername: targetUser.username,
      reason: reason.trim(),
      previousValue: `$${(cloudRes.prevBalance ?? 0).toFixed(2)}`,
      newValue: `$${(cloudRes.newBalance ?? 0).toFixed(2)}`,
    });

    return {
      success: true,
      message: cloudRes.message,
    };
  }

  static adminAdjustBalance(params: {
    adminUserId: string;
    targetUserId: string;
    amountDelta: number;
    reason: string;
  }): { success: boolean; message: string } {
    this.initialize();
    const { adminUserId, targetUserId, amountDelta, reason } = params;
    const admin = this.getUserById(adminUserId);
    if (!admin || !this.isAuthorizedOwner(admin)) {
      return {
        success: false,
        message: 'غير مصرح لك بإجراء هذه العملية الإدارية.',
      };
    }
    if (!reason || reason.trim().length < 4) {
      return {
        success: false,
        message: 'يجب كتابة سبب واضح وموثق للتعديل الإداري.',
      };
    }
    const targetUser = this.getUserById(targetUserId);
    if (!targetUser) {
      return {
        success: false,
        message: 'المستخدم المستهدف غير موجود.',
      };
    }
    const wallets = this.getWallets();
    const targetWallet = wallets.find((w) => w.ownerUserId === targetUserId);
    if (!targetWallet) {
      return {
        success: false,
        message: 'محفظة المستخدم غير موجودة.',
      };
    }

    const prevBalance = targetWallet.totalDemoBalance;
    if (amountDelta < 0 && targetWallet.availableDemoBalance < Math.abs(amountDelta)) {
      return {
        success: false,
        message: 'الرصيد المتاح لدى المستخدم لا يكفي للخصم المطلوب.',
      };
    }

    const nextAvailable = Math.max(
      0,
      Math.round((targetWallet.availableDemoBalance + amountDelta) * 100) / 100
    );
    const newBalance = Math.max(
      0,
      Math.round((nextAvailable + targetWallet.lockedDemoBalance) * 100) / 100
    );

    const updatedWallet: Wallet = {
      ...targetWallet,
      availableDemoBalance: nextAvailable,
      totalDemoBalance: newBalance,
      assets: createDefaultAssets(newBalance),
      updatedAt: new Date().toISOString(),
    };
    this.updateLocalWallet(updatedWallet, true);

    // Record strictly in Owner's private Audit Log (never in user's transaction history or notifications)
    this.addAuditLog({
      adminUserId,
      adminUsername: admin.username,
      actionType: amountDelta >= 0 ? 'balance_add' : 'balance_deduct',
      targetUserId,
      targetUsername: targetUser.username,
      reason: reason.trim(),
      previousValue: `$${prevBalance.toFixed(2)}`,
      newValue: `$${newBalance.toFixed(2)}`,
    });

    return {
      success: true,
      message: `تم تحديث رصيد ${targetUser.username} بنجاح من $${prevBalance.toFixed(2)} إلى $${newBalance.toFixed(2)}.`,
    };
  }

  static adminToggleUserStatus(
    adminUserId: string,
    targetUserId: string,
    reason?: string
  ): { success: boolean; message: string } {
    this.initialize();
    const admin = this.getUserById(adminUserId);
    if (!admin || !this.isAuthorizedOwner(admin)) {
      return {
        success: false,
        message: 'غير مصرح لك بإجراء هذه العملية.',
      };
    }
    if (adminUserId === targetUserId) {
      return {
        success: false,
        message: 'لا يمكن إيقاف حساب المالك.',
      };
    }
    const users = this.getUsers();
    const target = users.find((u) => u.userId === targetUserId);
    if (!target) {
      return {
        success: false,
        message: 'المستخدم غير موجود.',
      };
    }

    const prevStatus = target.accountStatus;
    const newStatus = prevStatus === 'active' ? 'suspended' : 'active';
    target.accountStatus = newStatus;
    this.saveUsers(users);

    this.addAuditLog({
      adminUserId,
      adminUsername: admin.username,
      actionType: newStatus === 'suspended' ? 'user_suspend' : 'user_activate',
      targetUserId,
      targetUsername: target.username,
      reason: reason || 'تغيير حالة الحساب من لوحة الإدارة',
      previousValue: prevStatus,
      newValue: newStatus,
    });

    return {
      success: true,
      message: `تم ${newStatus === 'suspended' ? 'إيقاف' : 'تنشيط'} حساب ${target.username} بنجاح.`,
    };
  }

  static adminReleaseLock(
    adminUserId: string,
    transactionId: string,
    reason?: string
  ): { success: boolean; message: string } {
    this.initialize();
    const admin = this.getUserById(adminUserId);
    if (!admin || !this.isAuthorizedOwner(admin)) {
      return {
        success: false,
        message: 'غير مصرح لك بإجراء هذه العملية.',
      };
    }
    const transactions = this.getTransactions();
    const tx = transactions.find((t) => t.transactionId === transactionId);
    if (!tx || tx.status !== 'locked') {
      return {
        success: false,
        message: 'المعاملة غير مقيدة أو غير موجودة.',
      };
    }

    const wallets = this.getWallets();
    const recipientWallet = wallets.find((w) => w.ownerUserId === tx.receiverUserId);
    if (recipientWallet) {
      recipientWallet.lockedDemoBalance = Math.max(
        0,
        Math.round((recipientWallet.lockedDemoBalance - tx.amount) * 100) / 100
      );
      recipientWallet.availableDemoBalance =
        Math.round((recipientWallet.availableDemoBalance + tx.amount) * 100) / 100;
      recipientWallet.assets = createDefaultAssets(recipientWallet.totalDemoBalance);
      this.saveWallets(wallets);
    }

    tx.status = 'completed';
    tx.statusTextAr = 'متاحة للتصرف (فك تقييد إداري)';
    tx.notes = (tx.notes ? tx.notes + ' - ' : '') + `تم فك التقييد مبكراً من الإدارة: ${reason}`;
    this.saveTransactions(transactions);

    this.addAuditLog({
      adminUserId,
      adminUsername: admin.username,
      actionType: 'lock_release',
      targetUserId: tx.receiverUserId,
      targetUsername: tx.receiverUsername,
      reason: reason || 'فك تقييد مبكر بقرار إداري',
      previousValue: 'locked',
      newValue: 'completed',
    });

    this.addNotification({
      recipientUserId: tx.receiverUserId,
      transactionId: tx.transactionId,
      title: 'فك تقييد إداري للمبلغ',
      titleAr: 'فك تقييد إداري للمبلغ',
      body: `قام المالك بفك تقييد مبلغ ${tx.amount}$ مبكراً، وأصبح متاحاً بالكامل في محفظتك.`,
      bodyAr: `قام المالك بفك تقييد مبلغ ${tx.amount}$ مبكراً، وأصبح متاحاً بالكامل في محفظتك.`,
      type: 'lock_unlocked',
    });

    return {
      success: true,
      message: 'تم فك تقييد المعاملة بنجاح.',
    };
  }

  static depositFunds(): { success: boolean; message: string } {
    this.initialize();
    return {
      success: false,
      message: 'فشل، يرجى إضافة المصدر',
    };
  }

  static executeSwap(params: {
    userId: string;
    fromSymbol: string;
    toSymbol: string;
    fromAmount: number;
    toAmount: number;
  }): { success: boolean; message: string } {
    this.initialize();
    const { userId, fromSymbol, toSymbol, fromAmount, toAmount } = params;
    if (!fromAmount || isNaN(fromAmount) || fromAmount <= 0) {
      return {
        success: false,
        message: 'يرجى إدخال كمية صحيحة للتبادل.',
      };
    }
    const user = this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        message: 'المستخدم غير مسجل.',
      };
    }

    const txId = 'TX_SWAP_' + Date.now().toString(36).toUpperCase();
    const tx: Transaction = {
      transactionId: txId,
      senderUserId: userId,
      senderUsername: user.displayName || user.username,
      senderAddress: user.demoAddress,
      receiverUserId: userId,
      receiverUsername: user.displayName || user.username,
      receiverAddress: user.demoAddress,
      amount: fromAmount,
      currency: fromSymbol,
      network: 'BEP20',
      transactionType: 'send',
      status: 'completed',
      statusTextAr: 'مكتملة (تبديل فوري)',
      createdAt: new Date().toISOString(),
      isSimulated: false,
      notes: `تبديل ${fromAmount} ${fromSymbol} بـ ${toAmount.toFixed(4)} ${toSymbol}`,
    };

    const txs = this.getTransactions();
    txs.unshift(tx);
    this.saveTransactions(txs);

    this.addNotification({
      recipientUserId: userId,
      transactionId: txId,
      title: 'تم التبديل بنجاح',
      titleAr: 'تم التبديل بنجاح',
      body: `تم تبديل ${fromAmount} ${fromSymbol} مقابل ${toAmount.toFixed(4)} ${toSymbol} بأفضل سعر فوري.`,
      bodyAr: `تم تبديل ${fromAmount} ${fromSymbol} مقابل ${toAmount.toFixed(4)} ${toSymbol} بأفضل سعر فوري.`,
      type: 'incoming_transfer',
    });

    return {
      success: true,
      message: 'تمت عملية التبديل بنجاح بأفضل سعر فوري.',
    };
  }
}
