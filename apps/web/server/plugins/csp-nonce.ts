/** Puts the request's CSP nonce on every inline <script> of the rendered page. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = event.context.cspNonce
    if (!nonce) return
    const tag = (chunk: string) => chunk.replaceAll('<script', `<script nonce="${nonce}"`)
    html.head = html.head.map(tag)
    html.bodyPrepend = html.bodyPrepend.map(tag)
    html.body = html.body.map(tag)
    html.bodyAppend = html.bodyAppend.map(tag)
  })
})
