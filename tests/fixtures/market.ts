export function tencentRecord({ code = 'sh000001', name = 'Index', price = '3842.19', previousClose = '3830.45',
  timestamp = '20260930161500', changePct = '0.31' } = {}): string {
  const fields = Array<string>(50).fill('0')
  Object.assign(fields, { 1: name, 2: code.slice(2), 3: price, 4: previousClose, 30: timestamp, 32: changePct })
  return `v_${code}="${fields.join('~')}";`
}

export function sinaRecord({ code = 'sh000001', name = 'Index', price = '3842.1946', previousClose = '3830.4513',
  date = '2026-09-30', time = '16:19:58' } = {}): string {
  const fields = Array<string>(33).fill('0')
  Object.assign(fields, { 0: name, 2: previousClose, 3: price, 30: date, 31: time })
  return `var hq_str_${code}="${fields.join(',')}";`
}
