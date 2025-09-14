import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export async function sendDiagnostics(stats: any[]) {
  if (!stats || stats.length === 0) {
    console.log('⚠️ No stats to send');
    return;
  }

  try {
    await firestore()
      .collection('diagnostics')
      .add({
        stats,
        timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      });
    console.log('✅ Diagnostics uploaded to Firestore');
  } catch (e) {
    console.error('❌ Error uploading diagnostics:', e);
  }
}
