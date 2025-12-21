import { useEffect } from 'react';
import { useLocation } from '@remix-run/react';

/**
 * App Bridge Navigation Hook
 *
 * Shopify embedded uygulamalarında browser geri tuşu ile
 * iframe navigation senkronizasyonunu sağlar.
 *
 * Problem: Geri tuşuna basıldığında iframe boşalıyor
 * Çözüm: History API'sini Shopify App Bridge ile senkronize et
 */
export function useAppBridgeNavigation(): void {
  const location = useLocation();

  useEffect(() => {
    // Shopify App Bridge global nesnesini kontrol et
    const shopify = (window as Window & { shopify?: ShopifyGlobal }).shopify;

    if (!shopify) {
      return;
    }

    // Her route değişiminde Shopify'a bildir
    // Bu, browser history ile Shopify admin history'sini senkronize tutar
    const currentPath = location.pathname + location.search;

    try {
      // App Bridge history API'si varsa kullan
      if (shopify.navigate?.history) {
        shopify.navigate.history.replace(currentPath);
      }
    } catch (error) {
      // Sessizce hata yönet - kritik değil
      console.debug('[AppBridge] History sync skipped:', error);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const shopify = (window as Window & { shopify?: ShopifyGlobal }).shopify;

    // PopState event handler - geri/ileri tuşları için
    const handlePopState = (event: PopStateEvent): void => {
      if (!shopify?.navigate?.history) {
        return;
      }

      try {
        // Mevcut konumu koru - iframe'in boşalmasını engelle
        const currentPath = location.pathname + location.search;

        // Shopify admin'e mevcut konumu bildir
        shopify.navigate.history.replace(currentPath);

        // Event'i işlenmiş olarak işaretle
        event.preventDefault();
      } catch (error) {
        console.debug('[AppBridge] PopState handling error:', error);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [location.pathname, location.search]);
}

/**
 * Shopify Global Window Type
 */
interface ShopifyGlobal {
  navigate?: {
    history?: {
      push: (path: string) => void;
      replace: (path: string) => void;
    };
  };
  environment?: {
    embedded: boolean;
    mobile: boolean;
  };
}

export default useAppBridgeNavigation;

