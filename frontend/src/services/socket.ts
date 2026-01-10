const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export interface WebSocketMessage {
  type: string;
  data?: any;
  [key: string]: any;
}

export class MatchWebSocket {
  private ws: WebSocket | null = null;
  private matchId: number;
  private token: string;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(matchId: number, token: string) {
    this.matchId = matchId;
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = WS_URL.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
      const url = `${protocol}//${host}/ws/match/${this.matchId}/?token=${this.token}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
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
        reject(error);
      };

      this.ws.onclose = () => {
        this.ws = null;
        // Próba ponownego połączenia
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}

let currentSocket: MatchWebSocket | null = null;

export const connectSocket = (matchId: number, token: string): MatchWebSocket => {
  if (currentSocket) {
    currentSocket.disconnect();
  }

  currentSocket = new MatchWebSocket(matchId, token);
  return currentSocket;
};

export const disconnectSocket = () => {
  if (currentSocket) {
    currentSocket.disconnect();
    currentSocket = null;
  }
};

export const getSocket = (): MatchWebSocket | null => {
  return currentSocket;
};
