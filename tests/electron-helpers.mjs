/** Read the native window; offscreen Chromium reports screenX/screenY as zero. */
export async function waitForNativePosition(app, x, y) {
  await app.evaluate(async ({ BrowserWindow }, expected) => {
    const window = BrowserWindow.getAllWindows()[0], deadline = Date.now() + 5000
    let position
    while (Date.now() < deadline) {
      position = window.getPosition()
      if (position[0] === expected.x && position[1] === expected.y) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw Error(`Native drag position ${position}; expected ${expected.x},${expected.y}`)
  }, { x, y })
}
