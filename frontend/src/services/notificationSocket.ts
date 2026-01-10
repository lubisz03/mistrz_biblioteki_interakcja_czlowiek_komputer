const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export interface NotificationMessage {
  type: string;
  [key: string]: any;
}

export class NotificationWebSocket {
  private ws: WebSocket | null = null;
  private token: string;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: number | null = null;

  constructor(token: string) {
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Użyj bezpośrednio WS_URL jeśli zaczyna się od ws:// lub wss://
      let url: string;
      if (WS_URL.startsWith('ws://') || WS_URL.startsWith('wss://')) {
        url = `${WS_URL}/ws/notifications/?token=${this.token}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = WS_URL.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
        url = `${protocol}//${host}/ws/notifications/?token=${this.token}`;
      }

      console.log('NotificationSocket: Connecting to', url.replace(/token=[^&]+/, 'token=***'));
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Rozpocznij ping co 30 sekund
        this.startPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: NotificationMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing notification message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Notification WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.stopPing();
        // Próba ponownego połączenia
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
        }
      };
    });
  }

  private startPing() {
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping');
      }
    }, 30000); // Co 30 sekund
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(message: NotificationMessage) {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach((listener) => listener(message));
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
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}

let notificationSocket: NotificationWebSocket | null = null;

export const connectNotificationSocket = (token: string): NotificationWebSocket => {
  if (notificationSocket) {
    notificationSocket.disconnect();
  }

  notificationSocket = new NotificationWebSocket(token);
  return notificationSocket;
};

export const disconnectNotificationSocket = () => {
  if (notificationSocket) {
    notificationSocket.disconnect();
    notificationSocket = null;
  }
};

export const getNotificationSocket = (): NotificationWebSocket | null => {
  return notificationSocket;
};
