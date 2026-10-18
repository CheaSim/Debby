/** Incremental cumulative text -> natural phrases. Keeps decimals and surrogate pairs intact. */
export class SpeechTextBuffer {
  private snapshot = ''
  private pending = ''
  update(text: string, done = false): string[] {
    if (!text.startsWith(this.snapshot)) throw new Error('台词已改写，已停止朗读，文字回复会保留。')
    this.pending += text.slice(this.snapshot.length); this.snapshot = text
    const result: string[] = []
    while (this.pending.length) {
      let cut = 0
      for (let i = 0; i < Math.min(this.pending.length, 100); i++) {
        const char = this.pending[i]
        const period = char === '.' && /\s/.test(this.pending[i + 1] ?? '') && !/\d/.test(this.pending[i - 1] ?? '')
        if (i >= 5 && (/[。！？!?；;\n]/.test(char) || period)) {
          cut = i + 1
          while (/[”’」』"')）]/.test(this.pending[cut] ?? '') && cut < this.pending.length) cut++
          break
        }
      }
      if (!cut && this.pending.length >= 100) {
        const prefix = this.pending.slice(0, 100)
        const pause = Math.max(prefix.lastIndexOf('，'), prefix.lastIndexOf(','), prefix.lastIndexOf(' '), prefix.lastIndexOf('、'))
        cut = pause >= 35 ? pause + 1 : 100
        if (/[\uD800-\uDBFF]/.test(this.pending[cut - 1])) cut--
      }
      if (!cut && done) cut = this.pending.length
      if (!cut) break
      const phrase = this.pending.slice(0, cut).trim(); this.pending = this.pending.slice(cut)
      if (/[\p{L}\p{N}]/u.test(phrase)) result.push(phrase)
    }
    return result
  }
}
