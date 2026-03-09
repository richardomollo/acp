import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const scanAreaSize = width * 0.7;

interface Booking {
  id: string;
  confirmation_code: string;
  user_id: string;
  user_name: string;
  user_email: string;
  session_id: string;
  session_name: string;
  session_date: string;
  session_time: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled';
}

export default function CheckinScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recentCheckins, setRecentCheckins] = useState<Booking[]>([]);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    loadRecentCheckins();
  }, []);

  const loadRecentCheckins = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id')
        .eq('partner_id', partner.id);

      const gymIds = partnerGyms?.map(pg => pg.gym_id) || [];
      if (gymIds.length === 0) return;

      const today = new Date().toISOString().split('T')[0];

      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          confirmation_code,
          user_id,
          session_id,
          status,
          created_at,
          users(name, email),
          sessions(
            name,
            date,
            time,
            gym_id
          )
        `)
        .in('sessions.gym_id', gymIds)
        .eq('status', 'checked_in')
        .gte('sessions.date', today)
        .order('created_at', { ascending: false })
        .limit(5);

      const formatted = (bookings || []).map(b => ({
        id: b.id,
        confirmation_code: b.confirmation_code,
        user_id: b.user_id,
        user_name: (b.users as any)?.name || 'Unknown',
        user_email: (b.users as any)?.email || '',
        session_id: b.session_id,
        session_name: (b.sessions as any)?.name || 'Unknown',
        session_date: (b.sessions as any)?.date || '',
        session_time: (b.sessions as any)?.time || '',
        status: b.status as any,
      }));

      setRecentCheckins(formatted);
    } catch (error) {
      console.error('Load recent check-ins error:', error);
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing) return;

    setScanned(true);
    setProcessing(true);

    try {
      // Parse QR code data
      let bookingData;
      try {
        bookingData = JSON.parse(data);
      } catch {
        // If not JSON, treat as confirmation code
        bookingData = { confirmationCode: data };
      }

      const confirmationCode = bookingData.confirmationCode || bookingData.confirmation_code;

      if (!confirmationCode) {
        Alert.alert('Invalid QR Code', 'This QR code does not contain a valid booking');
        setScanned(false);
        setProcessing(false);
        return;
      }

      // Get current partner
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Not authenticated');
        setScanned(false);
        setProcessing(false);
        return;
      }

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) {
        Alert.alert('Error', 'Partner profile not found');
        setScanned(false);
        setProcessing(false);
        return;
      }

      // Get partner's gyms
      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id')
        .eq('partner_id', partner.id);

      const gymIds = partnerGyms?.map(pg => pg.gym_id) || [];

      // Find booking by confirmation code
      const { data: booking, error } = await supabase
        .from('bookings')
        .select(`
          id,
          confirmation_code,
          status,
          users(name, email),
          sessions(
            id,
            name,
            date,
            time,
            gym_id
          )
        `)
        .eq('confirmation_code', confirmationCode)
        .in('sessions.gym_id', gymIds)
        .single();

      if (error || !booking) {
        Alert.alert(
          'Booking Not Found',
          'No booking found with this QR code at your venues',
          [{ text: 'Scan Again', onPress: () => { setScanned(false); setProcessing(false); } }]
        );
        return;
      }

      // Check if already checked in
      if (booking.status === 'checked_in') {
        Alert.alert(
          'Already Checked In',
          `${(booking.users as any)?.name} already checked in`,
          [{ text: 'Scan Again', onPress: () => { setScanned(false); setProcessing(false); } }]
        );
        return;
      }

      // Check if cancelled
      if (booking.status === 'cancelled') {
        Alert.alert(
          'Booking Cancelled',
          'This booking has been cancelled',
          [{ text: 'Scan Again', onPress: () => { setScanned(false); setProcessing(false); } }]
        );
        return;
      }

      // Perform check-in
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'checked_in' })
        .eq('id', booking.id);

      if (updateError) throw updateError;

      // Success!
      Alert.alert(
        'Check-In Successful! ✅',
        `${(booking.users as any)?.name}\n${(booking.sessions as any)?.name}`,
        [
          { 
            text: 'Done', 
            onPress: () => { 
              setScanned(false); 
              setProcessing(false);
              loadRecentCheckins();
            } 
          }
        ]
      );

    } catch (error: any) {
      console.error('Check-in error:', error);
      Alert.alert(
        'Check-In Failed',
        error.message || 'Something went wrong',
        [{ text: 'Try Again', onPress: () => { setScanned(false); setProcessing(false); } }]
      );
    }
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  // Handle permissions
  if (!permission) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>QR Check-In</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#e0e0e0" />
          <ThemedText style={styles.permissionTitle}>Camera Permission Required</ThemedText>
          <ThemedText style={styles.permissionText}>
            We need camera access to scan QR codes for check-in
          </ThemedText>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <ThemedText style={styles.permissionButtonText}>Grant Permission</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>QR Check-In</ThemedText>
        <TouchableOpacity 
          style={styles.manualButton}
          onPress={() => router.push('/partner/manual-check-in')}
        >
          <Ionicons name="keypad-outline" size={24} color="#002fff" />
        </TouchableOpacity>
      </View>

      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          enableTorch={torchOn}
        >
          {/* Scan Area Overlay */}
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              {/* Corners */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              
              {processing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <ThemedText style={styles.processingText}>Processing...</ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <View style={styles.instructionsBox}>
              <ThemedText style={styles.instructionsText}>
                Position QR code within the frame
              </ThemedText>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={styles.torchButton}
              onPress={() => setTorchOn(!torchOn)}
            >
              <Ionicons 
                name={torchOn ? "flash" : "flash-outline"} 
                size={28} 
                color="#fff" 
              />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>

      {/* Recent Check-Ins */}
      <View style={styles.recentContainer}>
        <View style={styles.recentHeader}>
          <ThemedText style={styles.recentTitle}>Recent Check-Ins</ThemedText>
          <TouchableOpacity onPress={loadRecentCheckins}>
            <Ionicons name="refresh" size={20} color="#002fff" />
          </TouchableOpacity>
        </View>
        
        {recentCheckins.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No recent check-ins</ThemedText>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentCheckins.map((item) => (
              <View key={item.id} style={styles.recentItem}>
                <View style={styles.recentIcon}>
                  <Ionicons name="checkmark" size={16} color="#00c853" />
                </View>
                <View style={styles.recentInfo}>
                  <ThemedText style={styles.recentName}>{item.user_name}</ThemedText>
                  <ThemedText style={styles.recentSession}>
                    {item.session_name} • {formatTime(item.session_time)}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  manualButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  permissionButton: {
    backgroundColor: '#002fff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: scanAreaSize,
    height: scanAreaSize,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 20,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#00c853',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 20,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
  },
  instructionsContainer: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  instructionsBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  instructionsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  torchButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  recentContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: 200,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  recentList: {
    gap: 8,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  recentSession: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});