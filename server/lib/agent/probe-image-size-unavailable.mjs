// Cloudflare Workers build stub for `probe-image-size`, a transitive Mastra
// (memory) dependency. Its CommonJS/stream graph collides during bundling and
// breaks the Worker at startup. Remote image probing is only used by the AI
// agent memory path, which is disabled for the SourceClip support board.
export default function probeImageSize() {
  throw new Error('Remote image probing is unavailable in the SourceClip Workers build (AI features disabled).')
}
