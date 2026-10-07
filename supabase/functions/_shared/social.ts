export const CHAT_MAX = 140;
export function chatText(value: unknown): string {
  if (typeof value !== 'string' || value.length > CHAT_MAX) throw new Error('Messages can contain up to 140 characters');
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
  if (!text) throw new Error('Write a message first');
  return text;
}
export function chatDuration(text: string) { return Math.min(10000, Math.max(3000, text.length * 70)); }
export function worldName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a world name');
  const text = value.trim();
  if (!text || text.length > 32 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)) throw new Error('Use 1–32 printable characters');
  return text;
}
