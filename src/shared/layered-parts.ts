const names: Record<string, string> = { 'front hair': '前发', 'back hair': '后发', 'side hair': '侧发', ahoge: '呆毛', face: '脸部', facedetail: '脸颊', eyewhite: '眼白', irides: '虹膜', eyelash: '睫毛', eyebrow: '眉毛', eye_close: '闭眼', eye_close2: '闭眼差分', mouth_open: '开口', mouth_close: '闭口', nose: '鼻子', ears: '耳朵', earwear: '耳饰', neck: '颈部', neckwear: '领饰', topwear: '上装', bottomwear: '裙装', handwear: '手臂', legwear: '腿部', footwear: '鞋子', headwear: '头饰', eyewear: '眼镜', tail: '尾巴', wings: '翅膀', objects: '配饰' }
export function layeredPartLabel(name: string): string {
  const side = /_(l|r)$/.exec(name), base = name.replace(/_(l|r)$/, '').replace(/_\d+$/, '')
  return (names[base] ?? name) + (side ? (side[1] === 'l' ? ' · 左侧' : ' · 右侧') : '')
}
