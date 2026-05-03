/**
 * L-4: PII マスクユーティリティ。
 * ログやエラーメッセージに含まれる個人情報を安全にマスクする。
 */

/**
 * メールアドレスをマスクする。
 * local part の先頭 1 文字のみ残し、残りを `****` に置換する。
 *
 * 例:
 *   maskEmail("alice@example.com")  => "a****@example.com"
 *   maskEmail("bob@example.co.jp") => "b****@example.co.jp"
 *   maskEmail("invalid")            => "****" (@ がない場合)
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex < 0) {
    // @ がない不正なメールアドレスはすべてマスク
    return "****";
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex); // "@example.com" 部分
  if (local.length === 0) {
    return `****${domain}`;
  }
  const firstChar = local[0];
  return `${firstChar}****${domain}`;
}
