import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/services/config';
import { getAuthToken, removeAuthToken, setAuthToken } from '@/utils/authHelpers';
import { AuthContext } from '@/context/AuthContext';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Decode JWT payload safely
  const decodeToken = (token) => {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch (err) {
      console.error('Không decode được token:', err);
      return null;
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromQuery = params.get('token');

    const cleanUrl = () => {
      params.delete('token');
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
    };

    const bootstrapFromStorage = () => {
      const token = getAuthToken();
      const storedUser = localStorage.getItem('user');

      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (err) {
          console.error('Invalid user data in localStorage:', err);
          removeAuthToken();
          localStorage.removeItem('user');
          setUser(null);
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    };

    const bootstrapFromOAuth = async (token) => {
      // Token already saved before this function is called
      const decoded = decodeToken(token);
      const userId = decoded?.id || decoded?._id;

      if (!userId) {
        console.error('OAuth token missing user ID');
        removeAuthToken();
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const resp = await fetch(`${API_BASE_URL}/users/${userId}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (resp.ok) {
          const json = await resp.json();
          const fetchedUser = json?.data || json;
          localStorage.setItem('user', JSON.stringify(fetchedUser));
          setUser(fetchedUser);
        } else {
          console.error('Failed to fetch user after OAuth:', resp.status);
          // Keep token but set basic user from decoded token
          const basicUser = { _id: userId, id: userId, email: decoded.email, role: decoded.role };
          localStorage.setItem('user', JSON.stringify(basicUser));
          setUser(basicUser);
        }
      } catch (err) {
        console.error('Lấy thông tin user sau OAuth lỗi:', err);
        // Keep token but set basic user from decoded token
        const basicUser = { _id: userId, id: userId, email: decoded.email, role: decoded.role };
        localStorage.setItem('user', JSON.stringify(basicUser));
        setUser(basicUser);
      } finally {
        setLoading(false);
      }
    };

    // Ưu tiên token trả về qua query (OAuth)
    if (tokenFromQuery) {
      // Save token FIRST before cleaning URL
      setAuthToken(tokenFromQuery);
      cleanUrl();
      bootstrapFromOAuth(tokenFromQuery);
      return;
    }

    // Fallback: lấy từ localStorage (login thường)
    bootstrapFromStorage();

    // Listen for login events from other components
    const handleUserLogin = () => {
      const token = getAuthToken();
      const storedUser = localStorage.getItem('user');
      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (err) {
          console.error('Invalid user data:', err);
          setUser(null);
        }
      }
    };

    window.addEventListener('userLoggedIn', handleUserLogin);
    return () => window.removeEventListener('userLoggedIn', handleUserLogin);
  }, []);

  const login = (userData, token) => {
    setAuthToken(token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    removeAuthToken();
    localStorage.removeItem('user');
    localStorage.removeItem('guestSessionId');
    setUser(null);
    
    // Dispatch logout event for other components
    window.dispatchEvent(new Event('userLoggedOut'));
  };

  const updateUser = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
