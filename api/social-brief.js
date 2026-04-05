import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const SCHOOL_DOMAIN = 'handong.ac.kr'
const MODEL_NAME = 'gemini-2.5-flash'
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'https://next-to-handong.web.app',
]

function readEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : ''
}

function getAllowedOrigins() {
  const extra = readEnv('SOCIAL_AI_ALLOWED_ORIGINS')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return [...new Set([...DEFAULT_ORIGINS, ...extra])]
}

function setCorsHeaders(response, origin) {
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
  }

  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Max-Age', '86400')
}

function getOrigin(request) {
  return typeof request.headers.origin === 'string' ? request.headers.origin : ''
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true
  }

  return getAllowedOrigins().includes(origin)
}

function sendJson(response, statusCode, payload, origin) {
  setCorsHeaders(response, origin)
  response.status(statusCode).json(payload)
}

function ensureAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]
  }

  const projectId = readEnv('FIREBASE_PROJECT_ID')
  const clientEmail = readEnv('FIREBASE_CLIENT_EMAIL')
  const privateKey = readEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin 환경변수가 누락되었습니다.')
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function mapProfile(uid, raw, role) {
  return {
    uid,
    displayName: asString(raw?.displayName, '한동 학생'),
    photoURL: asString(raw?.photoURL, ''),
    studentId: asString(raw?.studentId, ''),
    bio: asString(raw?.bio, ''),
    hometown: asString(raw?.hometown, ''),
    major: asString(raw?.major, ''),
    interests: asStringArray(raw?.interests),
    role,
  }
}

function hasMeaningfulProfile(profile) {
  return Boolean(
    profile.studentId ||
      profile.bio ||
      profile.hometown ||
      profile.major ||
      profile.interests.length > 0,
  )
}

function defaultPrompts() {
  return [
    '한동대에서 요즘 제일 자주 가는 공간은 어디인가요?',
    '이번 학기에 가장 기억에 남는 수업이나 과제가 있었나요?',
    '포항에서 자주 가는 맛집이나 카페가 있나요?',
    '요즘 쉬는 시간이나 주말에 자주 하는 일이 있나요?',
  ]
}

function buildPrompt(participants) {
  const participantLines = participants
    .map((participant, index) => {
      const details = []

      if (participant.studentId) details.push(`학번: ${participant.studentId}`)
      if (participant.major) details.push(`전공: ${participant.major}`)
      if (participant.hometown) details.push(`고향: ${participant.hometown}`)
      if (participant.interests.length > 0) {
        details.push(`관심사: ${participant.interests.join(', ')}`)
      }
      if (participant.bio) details.push(`소개: ${participant.bio}`)

      return `${index + 1}. ${participant.displayName} (${participant.role === 'host' ? '모집자' : '참여자'})${details.length > 0 ? ` - ${details.join(' / ')}` : ''}`
    })
    .join('\n')

  const hasDetailedProfiles = participants.some(hasMeaningfulProfile)

  return [
    '너는 한동대학교 학생들이 처음 만나도 어색하지 않게 대화를 시작하도록 돕는 캠퍼스 식사 도우미다.',
    '한국어로만 답하고, 질문 4개만 만들어라.',
    '반드시 JSON만 반환해라.',
    '형식은 {"prompts":["질문1","질문2","질문3","질문4"]} 로 고정해라.',
    '질문 4개는 서로 주제가 겹치지 않게 만들어라.',
    '모든 질문은 반드시 자연스러운 완성 문장으로 쓰고, 물음표로 끝내라.',
    '너무 사적이거나 민감한 주제는 피하고, 가볍고 자연스러운 질문으로 만들어라.',
    hasDetailedProfiles
      ? '가능하면 최소 2개의 질문은 참여자들의 전공, 고향, 관심사를 직접 반영해라.'
      : '프로필 정보가 거의 없으므로 처음 만난 대학생들끼리 부담 없이 시작할 수 있는 공통 질문으로 만들어라.',
    `이번 생성의 분위기 키: ${new Date().toISOString()}`,
    '',
    '참여자 정보:',
    participantLines,
  ].join('\n')
}

function cleanPromptCandidate(text) {
  return text
    .replace(/^[-*•\s]+/, '')
    .replace(/^(?:q|질문)\s*\d+[:.)\-\s]*/i, '')
    .replace(/^\d+[:.)\-\s]*/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCompleteQuestion(prompt) {
  return (
    prompt.length >= 12 &&
    /[?？]$/.test(prompt) &&
    !/[,:;]$/.test(prompt)
  )
}

function normalizePromptArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => cleanPromptCandidate(item))
    .filter((item, index, array) => isCompleteQuestion(item) && array.indexOf(item) === index)
}

function extractPrompts(text) {
  if (!text) {
    return []
  }

  const normalized = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\r/g, '\n')
    .trim()

  if (!normalized) {
    return []
  }

  const prompts = []
  let buffer = ''

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const rawLine of lines) {
    const startsNewPrompt = /^(?:[-*•]\s+|(?:q|질문)\s*\d+[:.)\-\s]+|\d+[:.)\-\s]+)/i.test(rawLine)
    const line = cleanPromptCandidate(rawLine)

    if (!line) {
      continue
    }

    if (startsNewPrompt && buffer) {
      prompts.push(buffer)
      buffer = line
    } else {
      buffer = buffer ? `${buffer} ${line}` : line
    }

    if (/[?？!]$/.test(line)) {
      prompts.push(buffer)
      buffer = ''
    }
  }

  if (buffer) {
    prompts.push(buffer)
  }

  const sentenceSplit = prompts
    .flatMap((item) =>
      item
        .split(/(?<=[?？!])\s+/)
        .map((part) => cleanPromptCandidate(part))
        .filter(Boolean),
    )
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => isCompleteQuestion(item))

  return sentenceSplit.filter((line, index, array) => array.indexOf(line) === index).slice(0, 4)
}

function buildFinalPrompts(generatedPrompts) {
  const merged = [...generatedPrompts, ...defaultPrompts()]
    .map((prompt) => cleanPromptCandidate(prompt))
    .filter((prompt, index, array) => isCompleteQuestion(prompt) && array.indexOf(prompt) === index)

  return merged.slice(0, 4)
}

function parseJsonPrompts(text) {
  if (!text) {
    return []
  }

  try {
    const parsed = JSON.parse(text)

    if (Array.isArray(parsed)) {
      return normalizePromptArray(parsed)
    }

    if (parsed && typeof parsed === 'object' && 'prompts' in parsed) {
      return normalizePromptArray(parsed.prompts)
    }
  } catch {
    return []
  }

  return []
}

async function requestGeminiPrompts(prompt) {
  const apiKey = readEnv('GEMINI_API_KEY')

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.05,
          topP: 0.95,
          maxOutputTokens: 280,
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini 요청 실패: ${errorBody}`)
  }

  const data = await response.json()
  const text = (data.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')

  const jsonPrompts = parseJsonPrompts(text)

  if (jsonPrompts.length > 0) {
    return jsonPrompts
  }

  return extractPrompts(text)
}

async function verifyUser(request) {
  const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : ''

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('로그인이 필요합니다.')
  }

  const idToken = authorization.slice('Bearer '.length)
  ensureAdminApp()
  const decodedToken = await getAuth().verifyIdToken(idToken)
  const email = asString(decodedToken.email, '')

  if (!decodedToken.email_verified || !email.endsWith(`@${SCHOOL_DOMAIN}`)) {
    throw new Error('학교 계정 사용자만 이용할 수 있습니다.')
  }

  return decodedToken
}

function parseBody(body) {
  if (!body) {
    return {}
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return {}
    }
  }

  if (typeof body === 'object') {
    return body
  }

  return {}
}

export default async function handler(request, response) {
  const origin = getOrigin(request)

  if (!isAllowedOrigin(origin)) {
    return sendJson(response, 403, { error: '허용되지 않은 요청 출처입니다.' }, origin)
  }

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response, origin)
    return response.status(204).end()
  }

  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'POST 요청만 지원합니다.' }, origin)
  }

  try {
    const decodedToken = await verifyUser(request)
    const { partyId } = parseBody(request.body)
    const cleanPartyId = asString(partyId, '')

    if (!cleanPartyId) {
      return sendJson(response, 400, { error: '파티 ID가 필요합니다.' }, origin)
    }

    ensureAdminApp()
    const db = getFirestore()
    const partyRef = db.collection('deliveryParties').doc(cleanPartyId)
    const partySnapshot = await partyRef.get()

    if (!partySnapshot.exists) {
      return sendJson(response, 404, { error: '배달 파티를 찾을 수 없습니다.' }, origin)
    }

    const party = partySnapshot.data() || {}

    if (party.mood !== 'social') {
      return sendJson(response, 400, { error: 'Social 식사 파티에서만 사용할 수 있습니다.' }, origin)
    }

    const approvedRequests = await partyRef.collection('joinRequests').where('status', '==', 'approved').get()
    const approvedIds = approvedRequests.docs.map((doc) => doc.id)
    const isHost = party.hostId === decodedToken.uid
    const isApprovedMember = approvedIds.includes(decodedToken.uid)

    if (!isHost && !isApprovedMember) {
      return sendJson(response, 403, { error: '승인된 참여자만 대화 추천을 볼 수 있습니다.' }, origin)
    }

    const participantIds = [...new Set([party.hostId, ...approvedIds].filter(Boolean))]
    const profileSnapshots = await Promise.all(
      participantIds.map((uid) => db.collection('usersPublic').doc(uid).get()),
    )

    const participants = profileSnapshots.map((snapshot) =>
      mapProfile(
        snapshot.id,
        snapshot.exists ? snapshot.data() : {},
        snapshot.id === party.hostId ? 'host' : 'member',
      ),
    )

    if (participants.length < 2) {
      return sendJson(
        response,
        200,
        {
          partyId: cleanPartyId,
          participants,
          prompts: defaultPrompts(),
          usedFallbackPrompt: true,
        },
        origin,
      )
    }

    const baseFallbackPrompts = defaultPrompts()
    let prompts = baseFallbackPrompts
    let usedFallbackPrompt = !participants.some(hasMeaningfulProfile)

    try {
      const generatedPrompts = await requestGeminiPrompts(buildPrompt(participants))

      if (generatedPrompts.length > 0) {
        prompts = buildFinalPrompts(generatedPrompts)
        usedFallbackPrompt =
          prompts.length < 4 ||
          prompts.some((prompt) => baseFallbackPrompts.includes(prompt))
      } else {
        usedFallbackPrompt = true
      }
    } catch (error) {
      console.error('Gemini prompt generation failed', error)
      usedFallbackPrompt = true
    }

    return sendJson(
      response,
      200,
      {
        partyId: cleanPartyId,
        participants,
        prompts,
        usedFallbackPrompt,
      },
      origin,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '대화 거리 추천을 준비하지 못했습니다.'
    return sendJson(response, 500, { error: message }, origin)
  }
}
