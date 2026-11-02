/**
 * Formatter utilities for TRUST WALLET
 */

export function formatCurrency(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCryptoAmount(amount: number, symbol?: string): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '0';
  let formatted = '';
  if (amount === 0) {
    formatted = '0';
  } else if (Math.abs(amount) < 1e-6) {
    formatted = amount.toFixed(8);
  } else if (Math.abs(amount) < 0.01) {
    formatted = amount.toFixed(6);
  } else if (Math.abs(amount) < 1) {
    formatted = amount.toFixed(4);
  } else {
    formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 4,
      minimumFractionDigits: 2,
    }).format(amount);
  }
  if (formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '');
  }
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function shortenAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00:00';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDateTime(dateStr: string | Date, isArabic = false): string {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return String(dateStr);
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
