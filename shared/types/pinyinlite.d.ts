declare module 'pinyinlite' {
  interface PinyinOptions {
    keepUnrecognized?: boolean
  }
  /** One array of readings per input character. */
  export default function pinyin(text: string, options?: PinyinOptions): string[][]
}
