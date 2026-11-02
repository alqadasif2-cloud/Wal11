import React, { useState } from 'react';
import { User } from '../types/wallet';
import { CreditCard, X, AlertCircle, Loader2, ShieldAlert, ArrowRight, Wallet as WalletIcon, PlusCircle } from 'lucide-react';

interface FaucetModalProps {
  currentUser: User;
  isArabic: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const FaucetModal: React.FC<FaucetModalProps> = ({
  isArabic,
  onClose,
}) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple_pay' | 'crypto'>('card');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [failureMessage, setFailureMessage] = useState<string>('');

  const handleBuy = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAmount <= 0 || isProcessing) return;

    setIsProcessing(true);
    setFailureMessage('');

    // Simulate gateway verification
    setTimeout(() => {
      setIsProcessing(false);
      // Strictly fail and prompt to add source - zero balance added
      setFailureMessage(
        isArabic 
          ? 'فشل، يرجى إضافة المصدر' 
          : 'Failed, please add payment source'
      );
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0b111e] border border-slate-800 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isArabic ? 'شراء العملات الرقمية' : 'Buy Crypto'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isArabic ? 'شراء فوري عبر البطاقة البنكية أو الدفع السريع' : 'Instant purchase via card or quick pay'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-900 border border-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Failure Banner when attempted */}
        {failureMessage ? (
          <div className="my-6 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex flex-col items-center justify-center text-center gap-3 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-extrabold text-base text-rose-300">
                {failureMessage}
              </h4>
              <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                {isArabic 
                  ? 'لم يتم العثور على بطاقة بنكية أو مصدر تمويل مرتبط بهذا الحساب لإتمام العملية. لم يتم إضافة أي رصيد إلى محفظتك.' 
                  : 'No payment source or linked card found. Zero balance has been credited.'}
              </p>
            </div>

            <div className="flex w-full gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFailureMessage('')}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-800 transition-colors cursor-pointer"
              >
                {isArabic ? 'إعادة المحاولة' : 'Try Again'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {isArabic ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBuy} className="space-y-4 my-3">
            {/* Amount Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                {isArabic ? 'حدد المبلغ المطلوب شراؤه:' : 'Select Purchase Amount:'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 250, 500].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedAmount(amt)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedAmount === amt
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md shadow-cyan-500/20 scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Preview */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">
                  {isArabic ? 'المبلغ المستلم التقديري' : 'Estimated Crypto Received'}
                </span>
                <span className="text-xl font-black text-white font-mono">
                  {selectedAmount.toFixed(2)} <span className="text-cyan-400 text-sm font-sans">USDT</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md font-semibold">
                  1 USD ≈ 1.00 USDT
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                {isArabic ? 'طريقة الدفع:' : 'Payment Method:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'border-cyan-500/80 bg-cyan-950/30 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CreditCard className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                  <span className="text-[11px] font-bold block">Visa/Master</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('apple_pay')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === 'apple_pay'
                      ? 'border-cyan-500/80 bg-cyan-950/30 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <WalletIcon className="w-4 h-4 mx-auto mb-1 text-purple-400" />
                  <span className="text-[11px] font-bold block">Apple/Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('crypto')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === 'crypto'
                      ? 'border-cyan-500/80 bg-cyan-950/30 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                  <span className="text-[11px] font-bold block">Crypto Pay</span>
                </button>
              </div>
            </div>

            {/* Notice note */}
            <div className="flex items-center gap-2 text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                {isArabic 
                  ? 'يتطلب الشراء ربط مصدر دفع بنكي معتمد بحسابك.' 
                  : 'Purchases require a verified linked payment source.'}
              </span>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-cyan-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{isArabic ? 'جاري التحقق من مصدر الدفع...' : 'Verifying Payment Source...'}</span>
                </>
              ) : (
                <>
                  <span>
                    {isArabic ? `شراء $${selectedAmount} (USDT) الآن` : `Buy $${selectedAmount} (USDT) Now`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
