import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { LiveMarketData } from '../types/wallet';

const ASSETS_CONFIG = [
  { symbol: 'BTC', ticker: 'BTCUSDT', name: 'Bitcoin', nameAr: 'بيتكوين' },
  { symbol: 'ETH', ticker: 'ETHUSDT', name: 'Ethereum', nameAr: 'إيثيريوم' },
  { symbol: 'BNB', ticker: 'BNBUSDT', name: 'BNB Smart Chain', nameAr: 'بي إن بي سمارت شين' },
  { symbol: 'SOL', ticker: 'SOLUSDT', name: 'Solana', nameAr: 'سولانا' },
  { symbol: 'TRX', ticker: 'TRXUSDT', name: 'TRON', nameAr: 'ترون' },
  { symbol: 'USDT', ticker: 'USDT', name: 'Tether USD', nameAr: 'تيثر دولار' },
];

type PriceListener = (prices: Record<string, LiveMarketData>, isConnected: boolean) => void;

class MarketPriceService {
  private static instance: MarketPriceService;
  private prices: Record<string, LiveMarketData> = {};
  private listeners: Set<PriceListener> = new Set();
  private isConnected = false;
  private ws: WebSocket | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastFetchTime = 0;
  private isInitialized = false;

  constructor() {
    this.initDefaultPrices();
  }

  public static getInstance(): MarketPriceService {
    if (!MarketPriceService.instance) {
      MarketPriceService.instance = new MarketPriceService();
    }
    return MarketPriceService.instance;
  }

  private initDefaultPrices(): void {
    const now = new Date().toISOString();
    this.prices = {
      USDT: {
        symbol: 'USDT',
        tickerSymbol: 'USDT',
        name: 'Tether USD',
        nameAr: 'تيثر دولار',
        price: 1,
        bidPrice: 0.9999,
        askPrice: 1.0001,
        spread: 0.0002,
        change24h: 0.01,
        change24hAmount: 0.0001,
        high24h: 1.001,
        low24h: 0.999,
        volume24h: 45_000_000_000,
        lastUpdated: now,
        isLive: false,
        source: 'Binance Market Feed',
      },
      BNB: {
        symbol: 'BNB',
        tickerSymbol: 'BNBUSDT',
        name: 'BNB Smart Chain',
        nameAr: 'بي إن بي سمارت شين',
        price: 640,
        bidPrice: 639.9,
        askPrice: 640.1,
        spread: 0.2,
        change24h: 2.45,
        change24hAmount: 15.3,
        high24h: 652,
        low24h: 628,
        volume24h: 980_000_000,
        lastUpdated: now,
        isLive: false,
        source: 'Binance Market Feed',
      },
      ETH: {
        symbol: 'ETH',
        tickerSymbol: 'ETHUSDT',
        name: 'Ethereum',
        nameAr: 'إيثيريوم',
        price: 3500,
        bidPrice: 3499.5,
        askPrice: 3500.5,
        spread: 1,
        change24h: -1.15,
        change24hAmount: -40.5,
        high24h: 3580,
        low24h: 3420,
        volume24h: 15_000_000_000,
        lastUpdated: now,
        isLive: false,
        source: 'Binance Market Feed',
      },
      BTC: {
        symbol: 'BTC',
        tickerSymbol: 'BTCUSDT',
        name: 'Bitcoin',
        nameAr: 'بيتكوين',
        price: 96000,
        bidPrice: 95995,
        askPrice: 96005,
        spread: 10,
        change24h: 3.82,
        change24hAmount: 3500,
        high24h: 97200,
        low24h: 92800,
        volume24h: 38_000_000_000,
        lastUpdated: now,
        isLive: false,
        source: 'Binance Market Feed',
      },
      SOL: {
        symbol: 'SOL',
        tickerSymbol: 'SOLUSDT',
        name: 'Solana',
        nameAr: 'سولانا',
        price: 185,
        bidPrice: 184.95,
        askPrice: 185.05,
        spread: 0.1,
        change24h: 4.2,
        change24hAmount: 7.45,
        high24h: 192,
        low24h: 178,
        volume24h: 4_200_000_000,
        lastUpdated: now,
        isLive: false,
        source: 'Binance Market Feed',
      },
      TRX: {
        symbol: 'TRX',
        tickerSymbol: 'TRXUSDT',
        name: 'TRON',
        nameAr: 'ترون',
        price: 0.28,
        bidPrice: 0.2799,
        askPrice: 0.2801,
        spread: 0.0002,
        change24h: 1.1,
        change24hAmount: 0.003,
        high24h: 0.29,
        low24h: 0.27,
        volume24h: 890_000_000,
        lastUpdated: now,
        isLive: false,
        source: 'Binance Market Feed',
      },
    };
  }

  public start(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.fetchLivePrices();
    this.pollingInterval = setInterval(() => {
      this.fetchLivePrices();
    }, 12000);
    this.connectWebSocket();
  }

  public stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isInitialized = false;
  }

  public subscribe(listener: PriceListener): () => void {
    this.listeners.add(listener);
    listener(this.prices, this.isConnected);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getPrices(): Record<string, LiveMarketData> {
    return { ...this.prices };
  }

  public getPrice(symbol: string): LiveMarketData | undefined {
    return this.prices[symbol.toUpperCase()];
  }

  public isFeedLive(): boolean {
    return this.isConnected;
  }

  public getLastFetchTime(): number {
    return this.lastFetchTime;
  }

  private async fetchLivePrices(): Promise<void> {
    try {
      const symbolsParam = JSON.stringify(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'TRXUSDT']);
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Market API returned ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const nowIso = new Date().toISOString();
      const updated: Record<string, LiveMarketData> = { ...this.prices };

      for (const item of data) {
        const symbolMatch = ASSETS_CONFIG.find((c) => c.ticker === item.symbol);
        if (!symbolMatch) continue;

        const lastPrice = parseFloat(item.lastPrice);
        const bidPrice = parseFloat(item.bidPrice) || lastPrice;
        const askPrice = parseFloat(item.askPrice) || lastPrice;
        const spread = Math.max(0, askPrice - bidPrice);
        const changePercent = parseFloat(item.priceChangePercent);
        const changeAmount = parseFloat(item.priceChange);
        const high = parseFloat(item.highPrice);
        const low = parseFloat(item.lowPrice);
        const volume = parseFloat(item.volume);

        updated[symbolMatch.symbol] = {
          symbol: symbolMatch.symbol,
          tickerSymbol: item.symbol,
          name: symbolMatch.name,
          nameAr: symbolMatch.nameAr,
          price: lastPrice,
          bidPrice: Math.round(bidPrice * 10000) / 10000,
          askPrice: Math.round(askPrice * 10000) / 10000,
          spread: Math.round(spread * 10000) / 10000,
          change24h: Math.round(changePercent * 100) / 100,
          change24hAmount: Math.round(changeAmount * 100) / 100,
          high24h: high,
          low24h: low,
          volume24h: volume,
          lastUpdated: nowIso,
          isLive: true,
          source: 'Binance Real-Time Market',
        };
      }

      updated['USDT'] = {
        ...updated['USDT'],
        price: 1,
        bidPrice: 0.9999,
        askPrice: 1.0001,
        spread: 0.0002,
        lastUpdated: nowIso,
        isLive: true,
      };

      this.prices = updated;
      this.isConnected = true;
      this.lastFetchTime = Date.now();
      this.notifyListeners();
      this.syncPricesToFirestore(updated).catch(() => {});
    } catch (err) {
      console.warn('Live price fetch warning (using last cached):', err);
      this.isConnected = false;
      this.notifyListeners();
    }
  }

  private connectWebSocket(): void {
    if (typeof window === 'undefined') return;
    try {
      const wsUrl =
        'wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker/bnbusdt@ticker/solusdt@ticker/trxusdt@ticker';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.notifyListeners();
      };

      this.ws.onmessage = (event) => {
        try {
          const tick = JSON.parse(event.data);
          if (!tick.s) return;
          const symbolMatch = ASSETS_CONFIG.find((c) => c.ticker === tick.s);
          if (!symbolMatch) return;

          const lastPrice = parseFloat(tick.c);
          const bidPrice = parseFloat(tick.b) || lastPrice;
          const askPrice = parseFloat(tick.a) || lastPrice;
          const spread = Math.max(0, askPrice - bidPrice);
          const changePercent = parseFloat(tick.P);
          const changeAmount = parseFloat(tick.p);
          const high = parseFloat(tick.h);
          const low = parseFloat(tick.l);
          const volume = parseFloat(tick.v);
          const nowIso = new Date().toISOString();

          this.prices[symbolMatch.symbol] = {
            ...this.prices[symbolMatch.symbol],
            price: lastPrice,
            bidPrice: Math.round(bidPrice * 10000) / 10000,
            askPrice: Math.round(askPrice * 10000) / 10000,
            spread: Math.round(spread * 10000) / 10000,
            change24h: Math.round(changePercent * 100) / 100,
            change24hAmount: Math.round(changeAmount * 100) / 100,
            high24h: high,
            low24h: low,
            volume24h: volume,
            lastUpdated: nowIso,
            isLive: true,
            source: 'Binance Live WebSocket',
          };

          this.isConnected = true;
          this.lastFetchTime = Date.now();
          this.notifyListeners();
        } catch {}
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.notifyListeners();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        setTimeout(() => {
          if (this.isInitialized) this.connectWebSocket();
        }, 8000);
      };
    } catch {}
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.prices, this.isConnected);
    }
  }

  private async syncPricesToFirestore(prices: Record<string, LiveMarketData>): Promise<void> {
    try {
      const symbols = Object.keys(prices);
      for (const sym of symbols) {
        const item = prices[sym];
        await setDoc(
          doc(db, 'marketPrices', sym),
          {
            ...item,
            updatedAt: item.lastUpdated,
          },
          { merge: true }
        );
      }
    } catch {}
  }
}

export const marketPriceService = MarketPriceService.getInstance();
