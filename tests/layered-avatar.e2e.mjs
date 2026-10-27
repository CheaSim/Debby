import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import { DebbyClient } from '../integrations/client.mjs'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-layered-'))
let app, page, harness
const errors = []
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  const open = async () => { await page.getByTitle('桌宠选项', { exact: true }).click(); await page.getByTitle('角色工坊', { exact: true }).click(); await page.waitForSelector('.avatar-studio[open]') }
  const close = async () => page.getByTitle('关闭角色工坊').click()
  await open()
  assert.equal(await page.getByRole('heading', { name: '让你的角色，陪在身边' }).count(), 1)
  // Original test artwork is generated in memory; no upstream character art is redistributed.
  await page.addScriptTag({ url: await page.evaluate(() => new URL('vendor/anime25d/ag-psd.min.js', document.baseURI).href) })
  const bytes = await page.evaluate(() => {
    const layer = (name, paint) => { const c = document.createElement('canvas'); c.width = 256; c.height = 320; paint(c.getContext('2d')); return { name, canvas: c } }
    const ellipse = (ctx, x, y, rx, ry, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill() }
    const children = [layer('back hair', c => ellipse(c, 128, 135, 88, 117, '#5c456e')),
      layer('topwear', c => { c.fillStyle = '#e7a5c5'; c.fillRect(61, 205, 134, 115) }),
      layer('neck', c => { c.fillStyle = '#ffe1d7'; c.fillRect(109, 175, 38, 55) }),
      layer('face', c => ellipse(c, 128, 124, 70, 80, '#ffe9df')),
      layer('eyewhite', c => { ellipse(c, 98, 123, 18, 21, 'white'); ellipse(c, 158, 123, 18, 21, 'white') }),
      layer('irides', c => { ellipse(c, 98, 123, 10, 16, '#815ca9'); ellipse(c, 158, 123, 10, 16, '#815ca9') }),
      layer('eyebrow', c => { c.fillStyle = '#5c456e'; c.fillRect(81, 91, 33, 4); c.fillRect(142, 91, 33, 4) }),
      layer('mouth_open', c => ellipse(c, 128, 165, 9, 8, '#b96882')),
      layer('front hair', c => { c.fillStyle = '#76538f'; c.beginPath(); c.moveTo(54, 78); c.quadraticCurveTo(128, -4, 202, 78); c.lineTo(145, 61); c.lineTo(128, 87); c.lineTo(106, 60); c.closePath(); c.fill() })]
    return [...new Uint8Array(window.agPsd.writePsd({ width: 256, height: 320, children }))]
  })
  const input = page.getByLabel('导入角色 PSD', { exact: true })
  await input.setInputFiles({ name: 'broken.psd', mimeType: 'application/octet-stream', buffer: Buffer.from('not a PSD') })
  await page.getByRole('alert').filter({ hasText: /PSD/ }).waitFor()
  assert.equal(await page.locator('.pet-wrap [data-3d-ready=true]').count(), 1, 'Bad import keeps the active 3D avatar')
  await input.setInputFiles({ name: 'Debby-original-test.psd', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) })
  await page.waitForSelector('.avatar-preview [data-layered-ready=true]', { timeout: 30000 })
  await page.getByRole('button', { name: '试试口型', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('.avatar-preview .layered-pet-host').dataset.mouth) > .3)
  await page.getByRole('button', { name: '小心意', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.avatar-preview .layered-pet-host').dataset.behavior === 'heart')
  await page.getByRole('button', { name: '查看全身', exact: true }).click()
  assert.equal(await page.locator('.avatar-preview .layered-pet-host').getAttribute('data-view'), 'full')
  await page.evaluate(() => { window.__originalAvatarPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = () => { throw new DOMException('存储空间不足', 'QuotaExceededError') } })
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor()
  assert.equal(await page.locator('.pet-wrap [data-3d-ready=true]').count(), 1, 'Failed save cannot silently replace the active avatar')
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__originalAvatarPut; delete window.__originalAvatarPut })
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click()
  await page.waitForSelector('.pet-wrap [data-layered-ready=true]', { timeout: 30000 })
  await page.screenshot({ path: resolve(root, 'work/avatar-studio-test.png') })
  await close()
  // A fresh renderer reconstructs the saved PSD with no network or device permission.
  await page.reload(); await page.waitForSelector('.pet-wrap [data-layered-ready=true]', { timeout: 30000 })
  assert.equal(await page.locator('.pet-wrap [data-3d-ready=true]').count(), 0)
  await page.locator('.pet-wrap .layered-pet-host').click({ position: { x: 120, y: 120 } })
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.behavior === 'pat')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(300, 180))
  const pet = await page.locator('.pet-wrap .layered-pet-host').boundingBox()
  await page.mouse.move(pet.x + pet.width / 2, pet.y + pet.height / 2)
  await page.mouse.down(); await page.mouse.move(pet.x + pet.width / 2 - 30, pet.y + pet.height / 2 - 20)
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.behavior === 'lifted')
  await page.mouse.up(); await page.waitForFunction(() => window.screenX === 270 && window.screenY === 160)
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.behavior === 'land')
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  await page.evaluate(() => window.finpet.enableShell(true))
  harness = new DebbyClient(resolve(userData, 'agent-bridge.json'), 'Layered renderer E2E')
  await harness.setTask('layered-task', '检查新立绘', 'working')
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.behavior === 'working')
  await harness.say('layered-task', 'layered-face', '我陪你慢慢来。', { expression: { emotion: 'caring', intensity: .8 } })
  await page.waitForSelector('.pet-wrap [data-emotion=caring][data-emotion-source=agent]')
  await harness.animate('layered-task', 'nod')
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.behavior === 'nod')
  const pose = await page.locator('.pet-wrap .layered-pet-host').getAttribute('data-pose')
  await page.waitForFunction(pose => document.querySelector('.pet-wrap .layered-pet-host').dataset.pose !== pose, pose)
  await page.evaluate(() => window.finpet.cancelShellTask())
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.behavior !== 'nod')
  await harness.release()
  // Dance temporarily uses the skeletal renderer and restores the layered avatar on Stop.
  await page.evaluate(() => window.finpet.controlDance({ action: 'play', id: 'welcome' }))
  await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.controlDance({ action: 'stop' }))
  await page.waitForSelector('.pet-wrap [data-layered-ready=true]', { timeout: 30000 })
  await open()
  await page.getByRole('button', { name: '使用原来的 3D', exact: true }).click()
  await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await close(); await page.reload(); await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await open()
  // Optional live QA with upstream sample, downloaded only to ignored work/; never committed.
  const sample = resolve(root, 'work/upstream-anime-rig/sample2.psd')
  if (process.env.DEBBY_TEST_UPSTREAM_PSD === '1' && await access(sample).then(() => true, () => false)) {
    await input.setInputFiles(sample)
    await page.locator('.avatar-model-info strong').filter({ hasText: /^sample2$/ }).waitFor({ timeout: 60000 })
    await page.waitForSelector('.avatar-preview [data-layered-ready=true]', { timeout: 60000 })
    await page.getByRole('button', { name: '用这个角色陪我', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '用这个角色陪我', exact: true }).isEnabled(), true)
    await page.screenshot({ path: resolve(root, 'work/avatar-studio-upstream.png') })
    console.log('Pinned upstream sample PSD: real mesh rendering passed (QA only).')
  }
  await page.getByTitle('移除保存的立绘').click()
  await page.getByRole('status').filter({ hasText: '已移除' }).waitFor()
  await close(); await page.reload(); await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await open(); assert.equal(await page.locator('.avatar-empty').count(), 1)
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(380, 540); w.setSize(390, 620) })
  await page.waitForFunction(() => window.innerWidth <= 390)
  assert.equal(await page.locator('.avatar-studio').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true)
  await page.screenshot({ path: resolve(root, 'work/avatar-studio-narrow.png') })
  assert.deepEqual(errors, [])
  console.log('Layered avatar E2E passed: worker validation, pixels, mouth, gestures, persistence, 3D fallback/dance, removal, narrow UI, no devices.')
} finally { await harness?.release().catch(() => {}); await app?.close(); await rm(userData, { recursive: true, force: true }) }
