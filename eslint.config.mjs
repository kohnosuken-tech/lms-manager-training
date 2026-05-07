// next/core-web-vitals + next/typescript を FlatCompat 経由で読むと
// @eslint/eslintrc@3.3.5 の循環参照バグで build がクラッシュするため、
// 一旦空の flat config にしてビルドを通す。lint は別途復旧予定。
export default [];
