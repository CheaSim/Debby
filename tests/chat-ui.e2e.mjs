import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-chat-ui-'))
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await application.firstWindow()
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30000 })
  const quickChat = page.getByRole('button', { name: '快速对话', exact: true })
  assert.equal(await quickChat.isVisible(), true, 'Quick chat must be visible on the basic pet page')
  assert.equal(await quickChat.locator('span').first().innerText(), '对话')
  assert.equal(await page.locator('.quick-chat-hint').isVisible(), true)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'debby-quick-chat.png') })
  await page.evaluate(() => window.finpet.setClickThrough(true))
  await quickChat.click()
  await page.waitForSelector('.app-expanded.app-dialogue')
  assert.equal(await page.locator('#tab-chat').getAttribute('aria-selected'), 'true')
  assert.equal((await page.evaluate(() => window.finpet.getSnapshot())).settings.clickThrough, false)
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '对 Debby 说')
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false, 'Quick chat must not start a media session')
  await page.getByRole('button', { name: '今天有点累', exact: true }).click()
  await page.waitForSelector('dialog.chat-config[open]')
  assert.equal(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), '今天有点累，陪我聊两句吧。')
  assert.equal((await page.evaluate(() => window.finpet.getChatState())).messages.length, 0, 'Choosing a starter before setup must not call a model')
  await page.locator('[title="关闭 BYOK"]').click()
  // Fixture IPC is isolated to this test process. No cloud calls, credentials or user data.
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const state = { revision: 10, config: { configured: true, cloudConsent: true, storage: 'none', modelId: '界面测试 · 非实盘' }, messages: [], busy: false }
    let timer
    const emit = () => { state.revision++; window.webContents.send('chat:changed', state) }
    for (const channel of ['chat:state', 'chat:send', 'chat:cancel', 'chat:clear']) ipcMain.removeHandler(channel)
    ipcMain.handle('chat:state', () => state)
    ipcMain.handle('chat:send', (_event, text) => {
      if (text === '错误') throw new Error('测试服务暂时不可用')
      state.error = undefined
      state.busy = true
      state.messages.push({ id: `u-${state.revision}`, role: 'user', text, status: 'done', timestamp: Date.now() })
      const line = { id: `a-${state.revision}`, role: 'assistant', text: '', status: 'streaming', timestamp: Date.now() }
      state.messages.push(line)
      state.activeTool = '查看指数与自选'
      emit()
      let count = 0
      timer = setInterval(() => {
        line.text += '【界面测试】我在呢。一起看看指数的节奏，记得保留行情日期。\n'
        state.activeTool = undefined
        if (++count === (text === '长回复' ? 12 : 3)) { clearInterval(timer); state.busy = false; line.status = 'done' }
        emit()
      }, 80)
    })
    ipcMain.handle('chat:cancel', () => { clearInterval(timer); state.busy = false; state.activeTool = undefined; state.messages.at(-1).status = 'cancelled'; emit() })
    ipcMain.handle('chat:clear', () => { clearInterval(timer); state.busy = false; state.messages = []; state.error = undefined; emit() })
    emit()
  })
  await page.waitForSelector('.dialogue-input textarea')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '对 Debby 说')
  assert.equal(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), '今天有点累，陪我聊两句吧。', 'Setup must preserve the selected question')
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('')
  await page.getByRole('button', { name: '今天大盘怎么样？', exact: true }).click()
  await page.waitForSelector('[title="发送消息"]')
  assert.match(await page.locator('.dialogue-question').innerText(), /今天大盘怎么样/)
  await page.getByRole('button', { name: '看看我的自选', exact: true }).click()
  await page.waitForSelector('[title="发送消息"]')
  assert.match(await page.locator('.dialogue-question').innerText(), /当前自选/)
  assert.equal((await page.evaluate(() => window.finpet.getChatState())).messages.filter((line) => line.role === 'user').length, 2, 'A suggestion must send exactly one question')
  await page.locator('[title="新会话"]').click()
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('保留我的草稿')
  await quickChat.click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '对 Debby 说')
  assert.equal(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), '保留我的草稿')
  await page.getByRole('tab', { name: '行情', exact: true }).click()
  await quickChat.click()
  await page.waitForSelector('.app-expanded.app-dialogue')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '对 Debby 说')
  assert.equal(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), '保留我的草稿', 'Quick chat remounted the conversation')
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('长回复')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[title="停止回复"]')
  await page.waitForSelector('[title="发送消息"]', { timeout: 5000 })
  assert.equal(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), '')
  assert.match(await page.locator('.dialogue-question').innerText(), /长回复/)
  const scroll = await page.locator('.dialogue-text').evaluate((element) => ({ content: element.scrollHeight, height: element.clientHeight, top: element.scrollTop }))
  assert.ok(scroll.content > scroll.height && scroll.top > 0, 'Long replies did not scroll within the dialogue')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'debby-dialogue-streaming-test.png') })
  await page.locator('[title="会话回看"]').click()
  assert.equal(await page.locator('.dialogue-history article').count(), 2)
  await page.locator('[title="关闭会话回看"]').click()
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('第二个问题')
  await page.locator('[title="发送消息"]').click()
  await page.locator('[title="停止回复"]').click()
  await page.waitForSelector('[title="发送消息"]')
  assert.equal((await page.evaluate(() => window.finpet.getChatState())).messages.at(-1).status, 'cancelled')
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('错误')
  await page.locator('[title="发送消息"]').click()
  await page.waitForFunction(() => document.querySelector('.dialogue-feedback').textContent.includes('暂时不可用'))
  assert.equal(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), '错误', 'Failed sends should keep the draft')
  await page.locator('[title="新会话"]').click()
  await page.waitForFunction(() => document.querySelector('.dialogue-text').textContent.includes('今天想聊些什么'))
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setResizable(true); window.setBounds({ width: 390, height: 740 }) })
  await page.waitForFunction(() => innerWidth <= 400)
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('窄屏对话')
  await page.locator('[title="发送消息"]').click()
  await page.waitForSelector('[title="发送消息"]')
  const inputBox = await page.locator('.dialogue-input').boundingBox()
  assert.ok(inputBox.x >= 0 && inputBox.x + inputBox.width <= 390)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'debby-dialogue-input-narrow.png') })
  console.log('Chat UI E2E passed: first-use hint, starter -> setup -> preserved draft, one-click questions and follow-ups, quick chat, click-through exit, focus, no media activation, streaming, cancellation, history and narrow input. No external LLM request made.')
} finally {
  if (application) await application.close()
  await rm(userData, { recursive: true, force: true })
}
