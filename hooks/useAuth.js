// hooks/useAuth.js
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        // 1. 初次載入時檢查目前的 Session
        const checkAuth = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            setIsAuthenticated(!!session);
            setIsChecking(false);
        };

        checkAuth();

        // 2. 訂閱登入狀態改變 (如果在另一個分頁登入/登出，這裡會自動同步)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsAuthenticated(!!session);
        });

        return () => subscription.unsubscribe();
    }, []);

    return { isAuthenticated, isChecking };
}
