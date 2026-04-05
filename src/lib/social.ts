import type { SocialConversationBrief } from '../data/campusData'
import { auth } from './firebase'

interface SocialConversationBriefResponse {
  partyId: string
  participants: SocialConversationBrief['participants']
  prompts: string[]
  usedFallbackPrompt: boolean
}

interface SocialConversationErrorResponse {
  error?: string
}

const socialApiUrl = (import.meta.env.VITE_SOCIAL_AI_API_URL ?? '').trim()

export const isSocialAiEnabled = socialApiUrl.length > 0

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const error = (payload as SocialConversationErrorResponse).error
  return typeof error === 'string' && error.trim().length > 0 ? error : fallback
}

function isSocialConversationResponse(
  payload: SocialConversationBriefResponse | SocialConversationErrorResponse | null,
): payload is SocialConversationBriefResponse {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'partyId' in payload &&
      'participants' in payload &&
      'prompts' in payload,
  )
}

export async function getSocialConversationBrief(partyId: string) {
  if (!isSocialAiEnabled) {
    throw new Error('AI 추천 서버가 아직 연결되지 않아 기본 질문으로 먼저 보여드리고 있습니다.')
  }

  const currentUser = auth?.currentUser

  if (!currentUser) {
    throw new Error('로그인이 필요합니다.')
  }

  const idToken = await currentUser.getIdToken()
  const response = await fetch(socialApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ partyId }),
  })

  const payload = (await response.json().catch(() => null)) as
    | SocialConversationBriefResponse
    | SocialConversationErrorResponse
    | null

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, '대화 거리 추천을 불러오지 못했습니다.'))
  }

  if (!isSocialConversationResponse(payload)) {
    throw new Error('대화 거리 추천 응답 형식이 올바르지 않습니다.')
  }

  return {
    partyId: payload.partyId,
    participants: Array.isArray(payload.participants) ? payload.participants : [],
    prompts: Array.isArray(payload.prompts) ? payload.prompts : [],
    usedFallbackPrompt: Boolean(payload.usedFallbackPrompt),
  } satisfies SocialConversationBrief
}
