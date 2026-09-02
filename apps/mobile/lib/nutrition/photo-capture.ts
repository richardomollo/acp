// ACP Intelligence™ — Nutrition N5. A thin wrapper over expo-image-picker for
// meal photos. It ONLY captures bytes; it never analyses, uploads, or persists
// anything. The caller passes the returned base64 straight to analysePhoto and
// discards it once the confirmation flow is done (§10/§32).
//
// Preprocessing is deliberately minimal (§9): quality 0.4 keeps a phone photo
// well under the 5 MB server cap, and the analysis endpoint additionally asks
// the model for `detail: 'low'`. base64:true + no `exif` request means no
// location/EXIF is read or forwarded (§11).

import * as ImagePicker from 'expo-image-picker';
import { isAllowedMimeType, mimeFromPickedAsset } from './nutrition-photo.ts';

export type PhotoCaptureResult =
  | { ok: true; base64: string; mimeType: string; width: number; height: number }
  | { ok: false; reason: 'cancelled' | 'permission_denied' | 'unsupported' | 'error' };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.4,
  base64: true,
  allowsEditing: false,
  exif: false,
};

function toResult(res: ImagePicker.ImagePickerResult): PhotoCaptureResult {
  if (res.canceled) return { ok: false, reason: 'cancelled' };
  const asset = res.assets?.[0];
  if (!asset?.base64) return { ok: false, reason: 'error' };
  const mimeType = mimeFromPickedAsset({ mimeType: asset.mimeType, uri: asset.uri });
  if (!isAllowedMimeType(mimeType)) return { ok: false, reason: 'unsupported' };
  return {
    ok: true,
    base64: asset.base64,
    mimeType,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}

/** Open the camera. A denied permission returns `permission_denied` — the
 *  caller falls through to manual search, it is never surfaced as an error. */
export async function captureMealPhoto(): Promise<PhotoCaptureResult> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'permission_denied' };
    return toResult(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Pick an existing photo from the library. Same contract as captureMealPhoto. */
export async function pickMealPhotoFromLibrary(): Promise<PhotoCaptureResult> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'permission_denied' };
    return toResult(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
  } catch {
    return { ok: false, reason: 'error' };
  }
}
