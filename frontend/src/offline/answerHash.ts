/** Хэши ответов (раздел 8.2). Зеркало backend/app/services/package.py. */
const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export async function sha256Blob(b: Blob): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()));
}

export const singleHash = (salt: string, qid: string, optionId: string) => sha256Hex(`${salt}:${qid}:${optionId}`);
export const optionHash = (salt: string, optionId: string, correct: boolean) => sha256Hex(`${salt}:${optionId}:${correct ? '1' : '0'}`);
export const positionHash = (salt: string, qid: string, i: number, optionId: string) => sha256Hex(`${salt}:${qid}:${i}:${optionId}`);
export const keywordHash = (salt: string, stem: string) => sha256Hex(`${salt}:${stem}`);
