import { useConnectionStore } from '../store/connectionStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export interface WebSocketMessage {
  type: string;
  data?: any;
  [key: string]: any;
}

export class MatchWebSocket {
  public ws: WebSocket | null = null;
  public matchId: number;
  private token: string;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private shouldReconnect = true; // Flaga kontrolująca czy reconnect jest dozwolony

  constructor(matchId: number, token: string) {
    this.matchId = matchId;
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Włącz reconnect przy nowym połączeniu
      this.shouldReconnect = true;
      
      const connectionStore = useConnectionStore.getState();
      connectionStore.setMatchSocketStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = WS_URL.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
      const url = `${protocol}//${host}/ws/match/${this.matchId}/?token=${this.token}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        connectionStore.setMatchSocketStatus('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectionStore.setMatchSocketStatus('disconnected');
        reject(error);
      };

      this.ws.onclose = () => {
        this.ws = null;

        // Próba ponownego połączenia TYLKO jeśli nie było celowego disconnect
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          connectionStore.setMatchSocketStatus('reconnecting');
          setTimeout(() => {
            // Sprawdź ponownie przed reconnect
            if (this.shouldReconnect) {
              this.connect();
            }
          }, 1000 * this.reconnectAttempts);
        } else {
          connectionStore.setMatchSocketStatus('disconnected');
        }
      };
    });
  }

  private handleMessage(message: WebSocketMessage) {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach((listener) => listener(message.data || message));
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  send(type: string, data?: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  disconnect() {
    // Wyłącz reconnect - to jest celowe rozłączenie
    this.shouldReconnect = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Zapobiega dalszym próbom
    
    const connectionStore = useConnectionStore.getState();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    connectionStore.setMatchSocketStatus('disconnected');
    this.listeners.clear();
  }
}

let currentSocket: MatchWebSocket | null = null;

export const connectSocket = (matchId: number, token: string): MatchWebSocket => {
  // Jeśli socket już istnieje i jest dla tego samego meczu, zwróć go
  if (currentSocket && currentSocket.matchId === matchId) {
    // Sprawdź czy socket jest już połączony lub w trakcie łączenia
    if (currentSocket.ws && (currentSocket.ws.readyState === WebSocket.OPEN || currentSocket.ws.readyState === WebSocket.CONNECTING)) {
      return currentSocket;
    }
  }

  // Zamknij stary socket tylko jeśli istnieje i nie jest w trakcie łączenia
  if (currentSocket) {
    if (currentSocket.ws && currentSocket.ws.readyState === WebSocket.CONNECTING) {
      // Poczekaj chwilę na zamknięcie
      currentSocket.ws.onopen = () => {
        currentSocket?.disconnect();
      };
    } else {
      currentSocket.disconnect();
    }
  }

  currentSocket = new MatchWebSocket(matchId, token);
  return currentSocket;
};

export const disconnectSocket = () => {
  if (currentSocket) {
    currentSocket.disconnect();
    currentSocket = null;
    // Resetuj status połączenia meczu gdy socket jest rozłączany
    const connectionStore = useConnectionStore.getState();
    connectionStore.setMatchSocketStatus('disconnected');
  }
};

export const getSocket = (): MatchWebSocket | null => {
  return currentSocket;
};
