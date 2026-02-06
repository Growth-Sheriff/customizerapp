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
    if (typeof window === 'undefined') return;
    const win = window as any;

    // Sync function
    const syncHistory = () => {
      if (win.shopify?.navigate?.history) {
        try {
          win.shopify.navigate.history.replace(location.pathname + location.search);
        } catch (e) {
          // ignore
        }
      }
    };

    // Initial sync
    syncHistory();
    const timer = setTimeout(syncHistory, 500);

    // PopState handler
    const handlePopState = (event: PopStateEvent) => {
       if (win.shopify?.navigate?.history) {
         try {
            win.shopify.navigate.history.replace(location.pathname + location.search);
         } catch (e) {
            console.debug('[AppBridge] PopState error', e); 
         }
       }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      clearTimeout(timer);
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

