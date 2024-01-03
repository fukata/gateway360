/**
 * WebCrypto APIを用いて生パスワードをハッシュ化する
 * @param rawText
 * @param salt
 */
export const encrypt = async (rawText: string, salt: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${rawText}${salt}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hash))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * WebCrypto APIを用いてハッシュ化されたパスワードが生パスワードと一致するかをチェックする
 * @param rawText
 * @param encryptedText
 * @param salt
 */
export const verify = async (rawText: string, encryptedText: string, salt: string): Promise<boolean> => {
  const hashHex = await encrypt(rawText, salt)
  return encryptedText === hashHex
}
