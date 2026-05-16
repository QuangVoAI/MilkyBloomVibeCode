import { io } from 'socket.io-client';
import { APP_BASE_URL } from './config';

const SOCKET_URL = APP_BASE_URL;

// BroadcastChannel for cross-tab communication (same browser, instant)
const CART_CHANNEL_NAME = 'cart_updates';

// Generate unique tab ID for conflict resolution
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.userId = null;
    this.broadcastChannel = null;
    this.broadcastCallbacks = new Set();
    this.tabId = TAB_ID;
    
    // Track last update timestamp per variant for conflict resolution
    this.lastUpdateTimestamps = {};
    
    // Store event callbacks for socket events
    this.socketCallbacks = new Map(); // event -> Set of callbacks
    
    // Pending product rooms to join when socket connects
    this.pendingProductRooms = new Set();
    
    // Initialize BroadcastChannel for cross-tab sync
    this._initBroadcastChannel();
  }

  _initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(CART_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event) => {
        const { type, payload, timestamp, sourceTabId } = event.data;
        
        // Ignore messages from self
        if (sourceTabId === this.tabId) {
          return;
        }
        
        if (type === 'cart_updated') {
          // Call all registered callbacks with timestamp for conflict resolution
          this.broadcastCallbacks.forEach(callback => {
            try {
              callback({ ...payload, _timestamp: timestamp, _sourceTabId: sourceTabId });
            } catch (err) {
              console.error('Error in broadcast callback:', err);
            }
          });
        }
      };
    }
  }

  connect(userId, options = {}) {
    // Store userId for rejoining on reconnect
    this.userId = userId;
    const nextAuthToken = options.token || localStorage.getItem('authToken') || null;
    const authTokenChanged = this.authToken !== nextAuthToken;
    this.authToken = nextAuthToken;
    
    // If already connected, just join the room
    if (this.socket?.connected && !authTokenChanged) {
      if (userId) {
        this.socket.emit('join_user_room', userId);
      }
      return this.socket;
    }

    // If socket exists but not connected, disconnect first
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 20000,
      auth: this.authToken ? { token: this.authToken } : undefined,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._dispatchEvent('connect', { connected: true });

      // Join user room
      if (this.userId) {
        this.socket.emit('join_user_room', this.userId);
      }
      
      // Join any pending product rooms
      this.pendingProductRooms.forEach(productId => {
        this.socket.emit('join_product_room', productId);
      });
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this._dispatchEvent('disconnect', { connected: false });
    });

    this.socket.on('reconnect', () => {
      this._dispatchEvent('reconnect', { connected: true });
      // Rejoin user room on reconnect
      if (this.userId) {
        this.socket.emit('join_user_room', this.userId);
      }
      // Rejoin all product rooms on reconnect
      this.pendingProductRooms.forEach(productId => {
        this.socket.emit('join_product_room', productId);
      });
    });

    this.socket.on('connect_error', () => {
      this._dispatchEvent('connect_error', { connected: false });
      // Connection error - socket.io will auto-retry
    });

    // Set up the main cart_updated listener that dispatches to all registered callbacks
    this.socket.on('cart_updated', (data) => {
      this._dispatchEvent('cart_updated', data);
    });

    // Set up product review/comment listeners
    this.socket.on('new_review', (data) => {
      this._dispatchEvent('new_review', data);
    });

    this.socket.on('review_deleted', (data) => {
      this._dispatchEvent('review_deleted', data);
    });

    this.socket.on('new_comment', (data) => {
      this._dispatchEvent('new_comment', data);
    });

    this.socket.on('comment_deleted', (data) => {
      this._dispatchEvent('comment_deleted', data);
    });

    this.socket.on('stats_updated', (data) => {
      this._dispatchEvent('stats_updated', data);
    });

    this.socket.on('chat_status', (data) => {
      this._dispatchEvent('chat_status', data);
    });

    this.socket.on('chat_token', (data) => {
      this._dispatchEvent('chat_token', data);
    });

    this.socket.on('chat_final', (data) => {
      this._dispatchEvent('chat_final', data);
    });

    this.socket.on('chat_error', (data) => {
      this._dispatchEvent('chat_error', data);
    });

    return this.socket;
  }

  // Dispatch event to all registered callbacks
  _dispatchEvent(event, data) {
    const callbacks = this.socketCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in ${event} callback:`, err);
        }
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.userId = null;
    }
  }

  // Register a callback for socket events
  on(event, callback) {
    if (!this.socketCallbacks.has(event)) {
      this.socketCallbacks.set(event, new Set());
    }
    this.socketCallbacks.get(event).add(callback);
  }

  // Unregister a callback for socket events
  off(event, callback) {
    const callbacks = this.socketCallbacks.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  emit(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ [Socket] Cannot emit ${event} - not connected`);
    }
  }

  sendChatMessage(data) {
    this.emit('chat_message', data);
  }

  // Join a product room for real-time review/comment updates
  joinProductRoom(productId) {
    if (!productId) return;
    
    // Add to pending rooms (will be joined when connected)
    this.pendingProductRooms.add(productId);
    
    // If already connected, join immediately
    if (this.socket?.connected) {
      this.socket.emit('join_product_room', productId);
    }
  }

  // Leave a product room
  leaveProductRoom(productId) {
    if (!productId) return;
    
    // Remove from pending rooms
    this.pendingProductRooms.delete(productId);
    
    if (this.socket?.connected) {
      this.socket.emit('leave_product_room', productId);
    }
  }

  // Subscribe to cart updates from BroadcastChannel (returns unsubscribe function)
  onCartUpdate(callback) {
    this.broadcastCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.broadcastCallbacks.delete(callback);
    };
  }

  /**
   * Broadcast cart update to other tabs with timestamp for conflict resolution
   * @param {Object} data - Cart data to broadcast
   * @param {Object} variantTimestamps - Map of variantId -> timestamp for per-item conflict resolution
   */
  broadcastCartUpdate(data, variantTimestamps = {}) {
    const timestamp = Date.now();
    
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'cart_updated',
        payload: { ...data, _variantTimestamps: variantTimestamps },
        timestamp,
        sourceTabId: this.tabId,
      });
    }
  }

  /**
   * Check if an incoming update is newer than local state for a specific variant
   * @param {string} variantId - The variant to check
   * @param {number} incomingTimestamp - Timestamp of incoming update
   * @returns {boolean} - True if incoming update is newer
   */
  isNewerUpdate(variantId, incomingTimestamp) {
    const localTimestamp = this.lastUpdateTimestamps[variantId] || 0;
    return incomingTimestamp > localTimestamp;
  }

  /**
   * Record a local update timestamp for a variant
   * @param {string} variantId - The variant being updated
   * @returns {number} - The timestamp recorded
   */
  recordLocalUpdate(variantId) {
    const timestamp = Date.now();
    this.lastUpdateTimestamps[variantId] = timestamp;
    return timestamp;
  }

  /**
   * Get the tab ID for this instance
   */
  getTabId() {
    return this.tabId;
  }

  isConnected() {
    return this.connected && this.socket?.connected;
  }
  
  /**
   * Force refresh - useful for debugging
   */
  forceReconnect() {
    const userId = this.userId;
    this.disconnect();
    if (userId) {
      this.connect(userId);
    }
  }
}

export const socketService = new SocketService();
