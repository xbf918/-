import { useEffect } from 'react';
import { WebSocketClient } from '@/services/server';

export function useNotifications() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const ws = new WebSocketClient();
    ws.connect((data) => {
      if (data.type === 'notification' && data.message) {
        showBrowserNotification(data.event || '通知', data.message);
      }
    });

    return () => ws.disconnect();
  }, []);
}

function showBrowserNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
    });
  }
}
