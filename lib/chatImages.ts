import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export async function pickImage(source: 'camera' | 'library'): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

/** 把远程图片下载并转成 base64，给多模态AI API用 */
export async function imageUrlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { base64, mimeType };
}

export async function uploadChatImage(localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const ext = localUri.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('chat-images')
    .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  if (error) throw error;

  const { data } = supabase.storage.from('chat-images').getPublicUrl(path);
  return data.publicUrl;
}
