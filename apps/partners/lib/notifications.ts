import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationData {
  type: 'booking' | 'cancellation' | 'session_reminder' | 'payout';
  bookingId?: string;
  sessionId?: string;
  payoutId?: string;
  [key: string]: any;
}

class NotificationService {
  private expoPushToken: string | null = null;

  // Register for push notifications
  async registerForPushNotifications(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification');
        return null;
      }

      // Get Expo push token
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })).data;

      this.expoPushToken = token;

      // Configure for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#002fff',
        });

        // Create channels for different notification types
        await this.createNotificationChannels();
      }

      // Save token to database
      await this.saveTokenToDatabase(token);

      return token;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  // Create Android notification channels
  async createNotificationChannels() {
    // Bookings channel
    await Notifications.setNotificationChannelAsync('bookings', {
      name: 'Bookings',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'notification.wav',
      lightColor: '#002fff',
    });

    // Session reminders channel
    await Notifications.setNotificationChannelAsync('sessions', {
      name: 'Session Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'notification.wav',
      lightColor: '#002fff',
    });

    // Payouts channel
    await Notifications.setNotificationChannelAsync('payouts', {
      name: 'Payouts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'notification.wav',
      lightColor: '#002fff',
    });
  }

  // Save push token to database
  async saveTokenToDatabase(token: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      const { error } = await supabase
        .from('partner_push_tokens')
        .upsert({
          partner_id: partner.id,
          expo_push_token: token,
          device_id: Constants.deviceId,
          platform: Platform.OS,
          active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'expo_push_token',
        });

      if (error) throw error;

      console.log('✅ Push token saved to database');
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  }

  // Remove push token (on logout)
  async removeToken() {
    try {
      if (!this.expoPushToken) return;

      const { error } = await supabase
        .from('partner_push_tokens')
        .update({ active: false })
        .eq('expo_push_token', this.expoPushToken);

      if (error) throw error;

      this.expoPushToken = null;
    } catch (error) {
      console.error('Error removing push token:', error);
    }
  }

  // Schedule local notification (for session reminders)
  async scheduleLocalNotification(
    title: string,
    body: string,
    trigger: Date,
    data?: NotificationData
  ) {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'notification.wav',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  // Cancel scheduled notification
  async cancelScheduledNotification(notificationId: string) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  // Get badge count
  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  // Set badge count
  async setBadgeCount(count: number) {
    await Notifications.setBadgeCountAsync(count);
  }

  // Clear badge
  async clearBadge() {
    await Notifications.setBadgeCountAsync(0);
  }

  // Add notification listener
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  // Add notification response listener (when user taps notification)
  addNotificationResponseReceivedListener(
    callback: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  // Create in-app notification
  async createInAppNotification(
    partnerId: string,
    type: NotificationData['type'],
    title: string,
    body: string,
    data?: any,
    actionUrl?: string
  ) {
    try {
      const { error } = await supabase
        .from('partner_notifications')
        .insert({
          partner_id: partnerId,
          type,
          title,
          body,
          data,
          action_url: actionUrl,
          priority: type === 'session_reminder' ? 'critical' : 'high',
        });

      if (error) throw error;

      // Update badge count
      await this.updateBadgeCount(partnerId);
    } catch (error) {
      console.error('Error creating in-app notification:', error);
    }
  }

  // Mark notification as read
  async markAsRead(notificationId: string) {
    try {
      const { error } = await supabase
        .from('partner_notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      // Update badge count
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (partner) {
        await this.updateBadgeCount(partner.id);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Update badge count
  async updateBadgeCount(partnerId: string) {
    try {
      const { count } = await supabase
        .from('partner_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('read', false);

      await this.setBadgeCount(count || 0);
    } catch (error) {
      console.error('Error updating badge count:', error);
    }
  }

  // Get unread count
  async getUnreadCount(partnerId: string): Promise<number> {
    try {
      const { count } = await supabase
        .from('partner_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('read', false);

      return count || 0;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();