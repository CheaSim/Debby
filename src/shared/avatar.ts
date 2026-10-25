/** Stable gesture IDs shared by UI, Pi tools and the external Agent shell. */
export const avatarActions = ['greet', 'celebrate', 'comfort', 'notify', 'nod', 'shake', 'heart', 'shy', 'think', 'stretch', 'bow', 'clap'] as const
export type AvatarAction = typeof avatarActions[number]
export interface AvatarCue { id: number; name: AvatarAction }
export const avatarActionInfo: Record<AvatarAction, { label: string; text: string; duration: number }> = {
  greet: { label: '挥手', text: '我在呢，今天也一起加油。', duration: 2.4 },
  celebrate: { label: '开心庆祝', text: '值得开心的小事，也要认真庆祝！', duration: 2.6 },
  comfort: { label: '安慰你', text: '慢慢来，我会陪你把心情理顺。', duration: 2.8 },
  notify: { label: '小提醒', text: '有件小事想提醒你。', duration: 2.2 },
  nod: { label: '点点头', text: '嗯嗯，我有认真听。', duration: 2.2 },
  shake: { label: '摇摇头', text: '先等一等，想清楚再决定。', duration: 2.2 },
  heart: { label: '抱抱心意', text: '把今天的一点温柔送给你。', duration: 3.2 },
  shy: { label: '害羞一下', text: '被你发现啦，有一点点不好意思。', duration: 2.8 },
  think: { label: '认真思考', text: '让我和你一起想一想。', duration: 3.2 },
  stretch: { label: '伸个懒腰', text: '肩膀放松一下，眼睛也休息一会儿。', duration: 4 },
  bow: { label: '谢谢你', text: '谢谢你今天也来找我。', duration: 2.8 },
  clap: { label: '给你鼓掌', text: '有坚持自己的计划，很棒呀。', duration: 3 }
}
export interface AvatarApi { onAvatarAction(listener: (cue: AvatarCue) => void): () => void }
