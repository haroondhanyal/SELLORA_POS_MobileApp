import { apiRequest } from '@/services/api';
import { getApiUrl } from '@/services/apiUrl';

export type PrivateStorageBucket = 'avatars' | 'products' | 'customers' | 'expenses';

export async function uploadPrivateFile(bucket: PrivateStorageBucket, path: string, base64: string, contentType: string) {
  return apiRequest<{ path: string }>(`/api/storage/${bucket}/upload`, {
    method: 'POST', body: JSON.stringify({ path, base64, contentType }),
  });
}

export async function deletePrivateFiles(bucket: PrivateStorageBucket, paths: string[]) {
  return apiRequest<{ removed: number }>(`/api/storage/${bucket}/delete`, {
    method: 'POST', body: JSON.stringify({ paths }),
  });
}

export async function getPrivateFileUrl(bucket: PrivateStorageBucket, path: string) {
  const result = await apiRequest<{ signedUrl: string }>(`/api/storage/${bucket}/signed`, {
    method: 'POST', body: JSON.stringify({ path, expiresIn: 3600 }),
  });
  const apiUrl = getApiUrl();
  const configuredOrigin = new URL(apiUrl).origin;
  const signed = new URL(result.signedUrl);
  // Keep the URL on the same LAN or deployment host used by this app build.
  return `${configuredOrigin}${signed.pathname}${signed.search}`;
}
