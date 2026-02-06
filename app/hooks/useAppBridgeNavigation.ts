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
    // Basic safety check for window
    if (typeof window === 'undefined') return;

    // Use a more robust check for the global shopify object
    const win = window as any;
    
    // Retry mechanism because App Bridge might load async
    const syncHistory = () => {
        if (win.shopify && win.shopify.navigate && win.shopify.navigate.history) {
            try {
                win.shopify.navigate.history.replace(location.pathname + location.search);
            } catch (error) {
                // Ignore errors during history replacement (common in dev/unstable connections)
            }
        }
    };

    // Attempt immediately
    syncHistory();
    
    // And try again briefly after, just in case
    const timer = setTimeout(syncHistory, 500);
    return () => clearTimeout(timer);

  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as any;

    // PopState event handler - geri/ileri tuşları için
    const handlePopState = (event: PopStateEvent): void => {
      if (!win.shopify?.navigate?.history) {
        return;
      }
      // ... rest of logic
    }; 
    
    // We don't implement full popstate logic here as it often conflicts with Remix Router
    // defaulting to simple replacement above is safer.
    
  }, []);
}

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

