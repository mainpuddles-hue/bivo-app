import { File as FsFile } from 'expo-file-system'

/**
 * Read a local image URI as an `ArrayBuffer` for direct upload to Supabase
 * Storage.
 *
 * `await fetch(uri).blob().arrayBuffer()` — the canonical web pattern — does
 * NOT work in React Native: `Blob.arrayBuffer()` is undefined for blobs
 * produced from a `file://` fetch, so the expression throws
 * "blob.arrayBuffer is not a function" and breaks the publish flow.
 *
 * `expo-file-system` ships a `File` class whose `arrayBuffer()` method is
 * implemented in native code and works reliably on both iOS and Android.
 * Use this helper instead of poking the blob in any new upload site.
 */
export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  return new FsFile(uri).arrayBuffer()
}
