import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db, ensureFirebaseAuth, handleFirestoreError, OperationType } from './firebase';
import {
  AppNotification,
  isUserVisibleNotification,
  isWalletTransferTransaction,
  Transaction,
  User,
  Wallet,
} from '../types/wallet';
import { createDefaultAssets } from './walletDb';

export function cleanForFirestore<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanForFirestore) as unknown as T;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      cleaned[k] = v && typeof v === 'object' && !(v instanceof Date) ? cleanForFirestore(v) : v;
    }
  }
  return cleaned as T;
}

const activeTransferLocks = new Set<string>();

export interface RecipientLookupResult {
  found: boolean;
  user: User | null;
  wallet: Wallet | null;
  isCloudVerified: boolean;
  error?: string;
}

export interface CloudSendTransferParams {
  sender: User;
  senderWallet: Wallet;
  recipient: User;
  recipientWallet?: Wallet | null;
  amount: number;
  currency?: string;
  lockDurationMinutes?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface CloudSendTransferResult {
  success: boolean;
  message: string;
  transaction?: Transaction;
  updatedSenderWallet?: Wallet;
  updatedRecipientWallet?: Wallet;
}

function pickNewerWalletData(
  a?: Partial<Wallet> | null,
  b?: Partial<Wallet> | null
): Partial<Wallet> | null {
  if (!a && !b) return null;
  if (!a) return b || null;
  if (!b) return a || null;
  const timeA = a.updatedAt ? Date.parse(a.updatedAt) || 0 : 0;
  const timeB = b.updatedAt ? Date.parse(b.updatedAt) || 0 : 0;
  return timeB > timeA ? b : a;
}

export class WalletCloudService {
  /**
   * Parse any input string (plain address, username, or full URL)
   * Extracts candidate address, username, or URL query parameter.
   */
  static extractRecipientQuery(input: string): string {
    const raw = (input || '').trim();
    if (!raw) return '';
    if (raw.includes('?') || raw.includes('://') || raw.startsWith('/?')) {
      try {
        const urlObj = new URL(raw.startsWith('/') ? `http://localhost${raw}` : raw);
        const candidate =
          urlObj.searchParams.get('wallet') ||
          urlObj.searchParams.get('to') ||
          urlObj.searchParams.get('sendTo') ||
          urlObj.searchParams.get('address') ||
          urlObj.searchParams.get('recipient');
        if (candidate) return candidate.trim();
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment.startsWith('0x')) return lastSegment.trim();
      } catch {
        const match = raw.match(/[?&](?:wallet|to|sendTo|address)=([^&#]+)/i);
        if (match && match[1]) return decodeURIComponent(match[1]).trim();
      }
    }
    if (raw.startsWith('@')) return raw.substring(1).trim();
    return raw;
  }

  /**
   * Search Firestore cloud database for a recipient across all devices and phones.
   * Checks both 'users' and 'wallets' collections in Cloud Firestore.
   */
  static async lookupRecipientCloud(
    input: string,
    localUsersFallback: User[] = []
  ): Promise<RecipientLookupResult> {
    const cleaned = this.extractRecipientQuery(input);
    if (!cleaned) {
      return {
        found: false,
        user: null,
        wallet: null,
        isCloudVerified: false,
      };
    }

    await ensureFirebaseAuth();
    const lowerCleaned = cleaned.toLowerCase();

    try {
      const usersCol = collection(db, 'users');
      const walletsCol = collection(db, 'wallets');

      const snapAddress = await getDocs(query(usersCol, where('demoAddress', '==', cleaned)));
      if (!snapAddress.empty) {
        const cloudUser = snapAddress.docs[0].data() as User;
        return {
          found: true,
          user: cloudUser,
          wallet: await this.fetchUserWalletCloud(cloudUser.userId),
          isCloudVerified: true,
        };
      }

      const snapUsername = await getDocs(query(usersCol, where('username', '==', cleaned)));
      if (!snapUsername.empty) {
        const cloudUser = snapUsername.docs[0].data() as User;
        return {
          found: true,
          user: cloudUser,
          wallet: await this.fetchUserWalletCloud(cloudUser.userId),
          isCloudVerified: true,
        };
      }

      try {
        const userDocSnap = await getDoc(doc(db, 'users', cleaned));
        if (userDocSnap.exists()) {
          const cloudUser = userDocSnap.data() as User;
          return {
            found: true,
            user: cloudUser,
            wallet: await this.fetchUserWalletCloud(cloudUser.userId),
            isCloudVerified: true,
          };
        }
      } catch {}

      const snapWalletAddr = await getDocs(query(walletsCol, where('demoAddress', '==', cleaned)));
      if (!snapWalletAddr.empty) {
        const cloudWallet = snapWalletAddr.docs[0].data() as Wallet;
        const ownerId = cloudWallet.ownerUserId;
        let ownerUser: User | null = null;
        if (ownerId) {
          const ownerDoc = await getDoc(doc(db, 'users', ownerId));
          if (ownerDoc.exists()) ownerUser = ownerDoc.data() as User;
        }
        if (ownerUser) {
          return {
            found: true,
            user: ownerUser,
            wallet: cloudWallet,
            isCloudVerified: true,
          };
        }
      }

      const allUsersSnap = await getDocs(usersCol);
      if (!allUsersSnap.empty) {
        for (const docSnap of allUsersSnap.docs) {
          const u = docSnap.data() as User;
          if (
            (u.demoAddress && u.demoAddress.toLowerCase() === lowerCleaned) ||
            (u.username && u.username.toLowerCase() === lowerCleaned) ||
            (u.userId && u.userId.toLowerCase() === lowerCleaned) ||
            (u.displayName && u.displayName.toLowerCase() === lowerCleaned)
          ) {
            return {
              found: true,
              user: u,
              wallet: await this.fetchUserWalletCloud(u.userId),
              isCloudVerified: true,
            };
          }
        }
      }

      const allWalletsSnap = await getDocs(walletsCol);
      if (!allWalletsSnap.empty) {
        for (const docSnap of allWalletsSnap.docs) {
          const w = docSnap.data() as Wallet;
          if (
            (w.demoAddress && w.demoAddress.toLowerCase() === lowerCleaned) ||
            (w.walletId && w.walletId.toLowerCase() === lowerCleaned)
          ) {
            let ownerUser: User | null = null;
            if (w.ownerUserId) {
              const uDoc = await getDoc(doc(db, 'users', w.ownerUserId));
              if (uDoc.exists()) ownerUser = uDoc.data() as User;
            }
            if (ownerUser) {
              return {
                found: true,
                user: ownerUser,
                wallet: w,
                isCloudVerified: true,
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[WalletCloudService] Cloud lookup query note:', e);
    }

    const localMatch = localUsersFallback.find(
      (u) =>
        (u.demoAddress && u.demoAddress.toLowerCase() === lowerCleaned) ||
        (u.username && u.username.toLowerCase() === lowerCleaned) ||
        (u.userId && u.userId.toLowerCase() === lowerCleaned)
    );
    if (localMatch) {
      this.saveUserToCloud(localMatch).catch(() => {});
      return {
        found: true,
        user: localMatch,
        wallet: null,
        isCloudVerified: true,
      };
    }

    return {
      found: false,
      user: null,
      wallet: null,
      isCloudVerified: false,
      error: 'لم يتم العثور على صاحب هذا الرابط أو العنوان في قاعدة البيانات المركزية.',
    };
  }

  /**
   * Fetch live wallet directly from Cloud Firestore (picking newest across userId & ownerUserId docs).
   */
  static async fetchUserWalletCloud(userId: string): Promise<Wallet | null> {
    if (!userId) return null;
    try {
      await ensureFirebaseAuth();
      let candidate: Wallet | null = null;
      const wDoc = await getDoc(doc(db, 'wallets', userId));
      if (wDoc.exists()) {
        candidate = wDoc.data() as Wallet;
      }
      const snap = await getDocs(query(collection(db, 'wallets'), where('ownerUserId', '==', userId)));
      if (!snap.empty) {
        snap.forEach((d) => {
          const data = d.data() as Wallet;
          candidate = (pickNewerWalletData(candidate, data) as Wallet) || candidate;
        });
      }
      return candidate;
    } catch (e) {
      console.warn('[WalletCloudService] fetchUserWalletCloud note:', e);
    }
    return null;
  }

  /**
   * Save or update a user and their wallet to Firestore cloud.
   */
  static async saveUserToCloud(user: User, wallet?: Wallet | null): Promise<void> {
    try {
      await ensureFirebaseAuth();
      await setDoc(
        doc(db, 'users', user.userId),
        cleanForFirestore({
          ...user,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
      if (wallet) {
        await setDoc(
          doc(db, 'wallets', user.userId),
          cleanForFirestore({
            ...wallet,
            ownerUserId: user.userId,
            walletId: wallet.walletId || user.userId,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
        if (wallet.walletId && wallet.walletId !== user.userId) {
          await setDoc(
            doc(db, 'wallets', wallet.walletId),
            cleanForFirestore({
              ...wallet,
              ownerUserId: user.userId,
              updatedAt: new Date().toISOString(),
            }),
            { merge: true }
          );
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.userId}`);
    }
  }

  /**
   * Generate a shareable wallet link for receiving funds.
   */
  static getShareableWalletLink(address: string): string {
    return `${typeof window !== 'undefined' ? window.location.origin : 'https://trustwallet.pro'}/?wallet=${encodeURIComponent(address)}`;
  }

  /**
   * Execute an atomic, multi-device transfer via Cloud Firestore Transaction.
   * Atomically verifies sender balance, debits sender, credits recipient,
   * writes transaction ledger entry, and dispatches in-app notification.
   */
  static async executeCloudSendTransfer(
    params: CloudSendTransferParams
  ): Promise<CloudSendTransferResult> {
    const {
      sender,
      senderWallet,
      recipient,
      amount,
      currency = 'USD',
      lockDurationMinutes = 0,
      notes,
      idempotencyKey,
    } = params;

    const opKey = idempotencyKey || `${sender.userId}_${recipient.userId}_${amount}_${Date.now()}`;
    if (activeTransferLocks.has(opKey)) {
      return {
        success: false,
        message: 'عملية التحويل قيد المعالجة بالفعل، يرجى الانتظار.',
      };
    }
    activeTransferLocks.add(opKey);

    try {
      if (amount <= 0 || isNaN(amount)) {
        return {
          success: false,
          message: 'يرجى إدخال مبلغ صحيح أكبر من الصفر.',
        };
      }
      if (
        sender.userId === recipient.userId ||
        sender.demoAddress.toLowerCase() === recipient.demoAddress.toLowerCase()
      ) {
        return {
          success: false,
          message: 'لا يمكنك إرسال الأموال إلى محفظتك الخاصة.',
        };
      }

      await ensureFirebaseAuth();
      const now = new Date();
      const nowIso = now.toISOString();
      const isLocked = (lockDurationMinutes || 0) > 0;
      const lockUntil = isLocked
        ? new Date(now.getTime() + lockDurationMinutes * 60 * 1000).toISOString()
        : undefined;

      const txId =
        'TX_' +
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).substring(2, 6).toUpperCase();
      const notifId = 'NTF_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      const networkTxHash =
        '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

      const newTx: Transaction = {
        transactionId: txId,
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
        networkTxHash,
      };

      const senderName = sender.displayName || sender.username;
      const lockNoticeAr = isLocked ? ` (مبلغ مقيد لمدة ${lockDurationMinutes} دقيقة)` : '';

      const notificationPayload: AppNotification = {
        notificationId: notifId,
        recipientUserId: recipient.userId,
        transactionId: txId,
        title: 'تم استلام أموال جديدة',
        titleAr: 'تم استلام أموال جديدة',
        body: `تم استلام مبلغ قدره $${amount.toFixed(2)} من [${senderName}]، وتم تحديث رصيد محفظتك بنجاح${lockNoticeAr}`,
        bodyAr: `تم استلام مبلغ قدره $${amount.toFixed(2)} من [${senderName}]، وتم تحديث رصيد محفظتك بنجاح${lockNoticeAr}`,
        createdAt: nowIso,
        read: false,
        type: isLocked ? 'locked_transfer' : 'incoming_transfer',
      };

      const senderWalletRef = doc(db, 'wallets', sender.userId);
      const senderAltWalletRef =
        sender.walletId && sender.walletId !== sender.userId
          ? doc(db, 'wallets', sender.walletId)
          : null;
      const recipientWalletRef = doc(db, 'wallets', recipient.userId);
      const recipientAltWalletRef =
        recipient.walletId && recipient.walletId !== recipient.userId
          ? doc(db, 'wallets', recipient.walletId)
          : null;
      const txDocRef = doc(db, 'transactions', txId);
      const notifDocRef = doc(db, 'notifications', notifId);

      let finalSenderWallet: Wallet | null = null;
      let finalRecipientWallet: Wallet | null = null;

      await runTransaction(db, async (t) => {
        // Perform all reads first (Firestore transaction requirement)
        const senderSnap = await t.get(senderWalletRef);
        const senderAltSnap = senderAltWalletRef ? await t.get(senderAltWalletRef) : null;
        const recipientSnap = await t.get(recipientWalletRef);
        const recipientAltSnap = recipientAltWalletRef ? await t.get(recipientAltWalletRef) : null;

        const bestSenderCloud = pickNewerWalletData(
          senderSnap.exists() ? (senderSnap.data() as Partial<Wallet>) : null,
          senderAltSnap && senderAltSnap.exists() ? (senderAltSnap.data() as Partial<Wallet>) : null
        );

        let curSenderTotal = senderWallet.totalDemoBalance;
        let curSenderAvailable = senderWallet.availableDemoBalance;
        let curSenderLocked = senderWallet.lockedDemoBalance;

        if (bestSenderCloud) {
          curSenderTotal =
            typeof bestSenderCloud.totalDemoBalance === 'number'
              ? bestSenderCloud.totalDemoBalance
              : curSenderTotal;
          curSenderAvailable =
            typeof bestSenderCloud.availableDemoBalance === 'number'
              ? bestSenderCloud.availableDemoBalance
              : curSenderAvailable;
          curSenderLocked =
            typeof bestSenderCloud.lockedDemoBalance === 'number'
              ? bestSenderCloud.lockedDemoBalance
              : curSenderLocked;
        }

        if (curSenderAvailable < amount) {
          throw new Error(
            `الرصيد المتاح غير كافٍ. رصيدك المتاح حالياً هو $${curSenderAvailable.toFixed(2)}.`
          );
        }

        const bestRecipientCloud = pickNewerWalletData(
          recipientSnap.exists() ? (recipientSnap.data() as Partial<Wallet>) : null,
          recipientAltSnap && recipientAltSnap.exists()
            ? (recipientAltSnap.data() as Partial<Wallet>)
            : null
        );
        const fallbackRecipient = params.recipientWallet || null;
        const activeRecipientBase = bestRecipientCloud || fallbackRecipient;

        const curRecipientTotal =
          activeRecipientBase && typeof activeRecipientBase.totalDemoBalance === 'number'
            ? activeRecipientBase.totalDemoBalance
            : 0;
        const curRecipientAvailable =
          activeRecipientBase && typeof activeRecipientBase.availableDemoBalance === 'number'
            ? activeRecipientBase.availableDemoBalance
            : 0;
        const curRecipientLocked =
          activeRecipientBase && typeof activeRecipientBase.lockedDemoBalance === 'number'
            ? activeRecipientBase.lockedDemoBalance
            : 0;
        const recipientNetwork = activeRecipientBase?.networkType || 'BEP20';

        // Exact 1x deduction from sender and exact 1x addition to recipient
        const newSenderTotal = Math.max(0, Math.round((curSenderTotal - amount) * 100) / 100);
        const newSenderAvailable = Math.max(0, Math.round((curSenderAvailable - amount) * 100) / 100);
        const newRecipientTotal = Math.round((curRecipientTotal + amount) * 100) / 100;
        const newRecipientLocked = isLocked
          ? Math.round((curRecipientLocked + amount) * 100) / 100
          : curRecipientLocked;
        const newRecipientAvailable = isLocked
          ? curRecipientAvailable
          : Math.round((curRecipientAvailable + amount) * 100) / 100;

        const updatedSender: Wallet = {
          ...senderWallet,
          walletId: senderWallet.walletId || sender.walletId || sender.userId,
          ownerUserId: sender.userId,
          demoAddress: sender.demoAddress,
          totalDemoBalance: newSenderTotal,
          availableDemoBalance: newSenderAvailable,
          lockedDemoBalance: curSenderLocked,
          assets: createDefaultAssets(newSenderTotal),
          updatedAt: nowIso,
        };

        const updatedRecipient: Wallet = {
          walletId: recipient.walletId || recipient.userId,
          ownerUserId: recipient.userId,
          networkType: recipientNetwork,
          demoAddress: recipient.demoAddress,
          totalDemoBalance: newRecipientTotal,
          availableDemoBalance: newRecipientAvailable,
          lockedDemoBalance: newRecipientLocked,
          assets: createDefaultAssets(newRecipientTotal),
          updatedAt: nowIso,
        };

        t.set(senderWalletRef, cleanForFirestore(updatedSender), { merge: true });
        if (senderAltWalletRef) {
          t.set(senderAltWalletRef, cleanForFirestore(updatedSender), { merge: true });
        }
        t.set(recipientWalletRef, cleanForFirestore(updatedRecipient), { merge: true });
        if (recipientAltWalletRef) {
          t.set(recipientAltWalletRef, cleanForFirestore(updatedRecipient), { merge: true });
        }
        t.set(txDocRef, cleanForFirestore(newTx));
        t.set(notifDocRef, cleanForFirestore(notificationPayload));
        finalSenderWallet = updatedSender;
        finalRecipientWallet = updatedRecipient;
      });

      return {
        success: true,
        message: isLocked
          ? `تم إرسال $${amount.toFixed(2)} بنجاح مع تقييد المبلغ لمدة ${lockDurationMinutes} دقيقة.`
          : `تم إرسال $${amount.toFixed(2)} بنجاح إلى ${recipient.displayName || recipient.username}.`,
        transaction: newTx,
        updatedSenderWallet: finalSenderWallet || undefined,
        updatedRecipientWallet: finalRecipientWallet || undefined,
      };
    } catch (err: unknown) {
      console.error('[WalletCloudService] Transfer error:', err);
      const errMessage = err instanceof Error ? err.message : undefined;
      return {
        success: false,
        message:
          errMessage || 'فشلت عملية التحويل. يرجى التحقق من الاتصال بالإنترنت والمحاولة مجدداً.',
      };
    } finally {
      setTimeout(() => {
        activeTransferLocks.delete(opKey);
      }, 2500);
    }
  }

  /**
   * Atomically adjust a target user's wallet balance by exact 1x amountDelta in Cloud Firestore
   * WITHOUT creating any user-visible Transaction or Notification.
   */
  static async executeCloudAdminAdjustBalance(params: {
    targetUser: User;
    fallbackWallet?: Wallet | null;
    amountDelta: number;
  }): Promise<{
    success: boolean;
    message: string;
    prevBalance?: number;
    newBalance?: number;
    updatedWallet?: Wallet;
  }> {
    const { targetUser, fallbackWallet, amountDelta } = params;
    const opKey = `admin_adj_${targetUser.userId}`;
    if (activeTransferLocks.has(opKey)) {
      return {
        success: false,
        message: 'عملية تعديل الرصيد قيد التنفيذ حالياً، يرجى الانتظار.',
      };
    }
    activeTransferLocks.add(opKey);

    try {
      await ensureFirebaseAuth();
      const nowIso = new Date().toISOString();
      const primaryRef = doc(db, 'wallets', targetUser.userId);
      const altRef =
        targetUser.walletId && targetUser.walletId !== targetUser.userId
          ? doc(db, 'wallets', targetUser.walletId)
          : null;

      let prevBalanceOut = 0;
      let newBalanceOut = 0;
      let finalWallet: Wallet | null = null;

      await runTransaction(db, async (t) => {
        const primarySnap = await t.get(primaryRef);
        const altSnap = altRef ? await t.get(altRef) : null;

        const bestCloud = pickNewerWalletData(
          primarySnap.exists() ? (primarySnap.data() as Partial<Wallet>) : null,
          altSnap && altSnap.exists() ? (altSnap.data() as Partial<Wallet>) : null
        );
        const base = bestCloud || fallbackWallet || null;

        const curTotal =
          base && typeof base.totalDemoBalance === 'number' ? base.totalDemoBalance : 0;
        const curAvailable =
          base && typeof base.availableDemoBalance === 'number' ? base.availableDemoBalance : 0;
        const curLocked =
          base && typeof base.lockedDemoBalance === 'number' ? base.lockedDemoBalance : 0;
        const networkType = base?.networkType || 'BEP20';

        if (amountDelta < 0 && curAvailable < Math.abs(amountDelta)) {
          throw new Error('الرصيد المتاح لدى المستخدم لا يكفي للخصم المطلوب.');
        }

        const nextAvailable = Math.max(
          0,
          Math.round((curAvailable + amountDelta) * 100) / 100
        );
        const nextTotal = Math.max(0, Math.round((nextAvailable + curLocked) * 100) / 100);

        const updated: Wallet = {
          walletId: targetUser.walletId || targetUser.userId,
          ownerUserId: targetUser.userId,
          networkType,
          demoAddress: targetUser.demoAddress,
          totalDemoBalance: nextTotal,
          availableDemoBalance: nextAvailable,
          lockedDemoBalance: curLocked,
          assets: createDefaultAssets(nextTotal),
          updatedAt: nowIso,
        };

        t.set(primaryRef, cleanForFirestore(updated), { merge: true });
        if (altRef) {
          t.set(altRef, cleanForFirestore(updated), { merge: true });
        }

        prevBalanceOut = curTotal;
        newBalanceOut = nextTotal;
        finalWallet = updated;
      });

      return {
        success: true,
        message: `تم تحديث رصيد ${targetUser.username} بنجاح من $${prevBalanceOut.toFixed(2)} إلى $${newBalanceOut.toFixed(2)}.`,
        prevBalance: prevBalanceOut,
        newBalance: newBalanceOut,
        updatedWallet: finalWallet || undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      return {
        success: false,
        message: msg || 'تعذر تنفيذ تعديل الرصيد سحابياً.',
      };
    } finally {
      setTimeout(() => {
        activeTransferLocks.delete(opKey);
      }, 1000);
    }
  }

  /**
   * Real-time Cloud Firestore Listener for user's wallet document.
   * Ensures instant balance reflection across devices when money is received or unlocked.
   */
  static subscribeUserWallet(
    userId: string,
    onData: (wallet: Wallet) => void
  ): Unsubscribe | null {
    if (!userId || typeof window === 'undefined') return null;
    try {
      return onSnapshot(
        doc(db, 'wallets', userId),
        (snap) => {
          if (snap.exists()) onData(snap.data() as Wallet);
        },
        (err) => {
          console.warn('[WalletCloudService] Wallet snapshot warning:', err);
        }
      );
    } catch {
      return null;
    }
  }

  /**
   * Real-time Cloud Firestore Listener for user wallet-to-wallet transactions only.
   */
  static subscribeUserTransactions(
    userId: string,
    onData: (transactions: Transaction[]) => void
  ): Unsubscribe | null {
    if (!userId || typeof window === 'undefined') return null;
    try {
      return onSnapshot(
        collection(db, 'transactions'),
        (snap) => {
          const userTxs: Transaction[] = [];
          snap.forEach((d) => {
            const t = d.data() as Transaction;
            if (
              (t.senderUserId === userId || t.receiverUserId === userId) &&
              isWalletTransferTransaction(t)
            ) {
              userTxs.push(t);
            }
          });
          userTxs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          onData(userTxs);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        }
      );
    } catch {
      return null;
    }
  }

  /**
   * Real-time Cloud Firestore Listener for user notifications.
   */
  static subscribeUserNotifications(
    userId: string,
    onData: (notifications: AppNotification[]) => void
  ): Unsubscribe | null {
    if (!userId || typeof window === 'undefined') return null;
    try {
      return onSnapshot(
        collection(db, 'notifications'),
        (snap) => {
          const userNotifs: AppNotification[] = [];
          snap.forEach((d) => {
            const n = d.data() as AppNotification;
            if (n.recipientUserId === userId && isUserVisibleNotification(n)) {
              userNotifs.push(n);
            }
          });
          userNotifs.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          onData(userNotifs);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'notifications');
        }
      );
    } catch {
      return null;
    }
  }
}
