/// <reference types="vite/client" />

import type { FinPetApi } from '../../shared/types'

declare global {
  interface Window {
    finpet?: FinPetApi
  }
}

export {}
