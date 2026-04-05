const admin = require('firebase-admin')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')

admin.initializeApp()

const db = admin.firestore()
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')
const SCHOOL_DOMAIN = 'handong.ac.kr'
const MODEL_NAME = 'gemini-2.5-flash'

function assertSchoolUser(request) {
  const email = request.auth?.token?.email || ''
  const emailVerified = request.auth?.token?.email_verified === true

  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }

  if (!emailVerified || !email.endsWith('@' + SCHOOL_DOMAIN)) {
    throw new HttpsError('permission-denied', '학교 계정 사용자만 이용할 수 있습니다.')
  }
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item) => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
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
    profile.studentId || profile.bio || profile.hometown || profile.major || profile.interests.length > 0,
  )
}

function defaultPrompts() {
  return [
    '한동대에서 요즘 제일 자주 가는 공간은 어디인가요?',
    '이번 학기에 가장 기억에 남는 수업이나 과제가 있었나요?',
    '포항에서 은근히 자주 가게 되는 맛집이나 카페가 있나요?',
    '요즘 쉬는 시간이나 주말에 자주 하는 일이 있나요?',
  ]
}

function buildPrompt(participants) {
  const participantLines = participants
    .map((participant, index) => {
      const details = []

      if (participant.studentId) details.push('학번: ' + participant.studentId)
      if (participant.major) details.push('전공: ' + participant.major)
      if (participant.hometown) details.push('고향: ' + participant.hometown)
      if (participant.interests.length > 0) details.push('관심사: ' + participant.interests.join(', '))
      if (participant.bio) details.push('소개: ' + participant.bio)

      return `${index + 1}. ${participant.displayName} (${participant.role === 'host' ? '모집자' : '참여자'})${details.length > 0 ? ' - ' + details.join(' / ') : ''}`
    })
    .join('\n')

  const hasDetailedProfiles = participants.some(hasMeaningfulProfile)

  return [
    '너는 한동대학교 학생들이 처음 만나도 어색하지 않게 대화를 시작하도록 돕는 캠퍼스 식사 도우미다.',
    '한국어로만 답하고, 한 줄짜리 질문 4개만 만들어라.',
    '번호, 제목, 설명 없이 질문 문장만 줄바꿈으로 반환해라.',
    '너무 사적이거나 민감한 주제는 피하고, 가볍고 자연스러운 질문으로 만들어라.',
    hasDetailedProfiles ? '가능하면 참여자들의 전공, 고향, 관심사를 자연스럽게 반영해라.' : '프로필 정보가 거의 없으므로 첫 만남에 부담 없는 공통 질문으로 만들어라.',
    '',
    '참여자 정보:',
    participantLines,
  ].join('\n')
}

function extractPrompts(text) {
  if (!text) {
    return []
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter((line, index, array) => line.length > 0 && array.indexOf(line) === index)
    .slice(0, 4)
}

async function requestGeminiPrompts(prompt, apiKey) {
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
          temperature: 0.9,
          maxOutputTokens: 240,
        },
      }),
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error('Gemini 요청 실패: ' + errorBody)
  }

  const data = await response.json()
  const text = (data.candidates || []).flatMap((candidate) => candidate?.content?.parts || []).map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')

  return extractPrompts(text)
}

exports.getSocialConversationBrief = onCall(
  {
    region: 'asia-northeast3',
    secrets: [GEMINI_API_KEY],
  },
  async (request) => {
    assertSchoolUser(request)

    const partyId = asString(request.data?.partyId)

    if (!partyId) {
      throw new HttpsError('invalid-argument', '파티 ID가 필요합니다.')
    }

    const partyRef = db.collection('deliveryParties').doc(partyId)
    const partySnapshot = await partyRef.get()

    if (!partySnapshot.exists) {
      throw new HttpsError('not-found', '배달 파티를 찾을 수 없습니다.')
    }

    const party = partySnapshot.data() || {}

    if (party.mood !== 'social') {
      throw new HttpsError('failed-precondition', 'Social 식사 파티에서만 사용할 수 있습니다.')
    }

    const approvedRequests = await partyRef.collection('joinRequests').where('status', '==', 'approved').get()
    const approvedIds = approvedRequests.docs.map((doc) => doc.id)
    const isHost = party.hostId === request.auth.uid
    const isApprovedMember = approvedIds.includes(request.auth.uid)

    if (!isHost && !isApprovedMember) {
      throw new HttpsError('permission-denied', '승인된 참여자만 대화 추천을 볼 수 있습니다.')
    }

    const participantIds = [...new Set([party.hostId, ...approvedIds].filter(Boolean))]
    const profileSnapshots = await Promise.all(participantIds.map((uid) => db.collection('usersPublic').doc(uid).get()))

    const participants = profileSnapshots.map((snapshot) =>
      mapProfile(snapshot.id, snapshot.exists ? snapshot.data() : {}, snapshot.id === party.hostId ? 'host' : 'member'),
    )

    if (participants.length < 2) {
      return {
        partyId,
        participants,
        prompts: defaultPrompts(),
        usedFallbackPrompt: true,
      }
    }

    let prompts = defaultPrompts()
    let usedFallbackPrompt = !participants.some(hasMeaningfulProfile)

    try {
      const generatedPrompts = await requestGeminiPrompts(buildPrompt(participants), GEMINI_API_KEY.value())

      if (generatedPrompts.length > 0) {
        prompts = generatedPrompts
      } else {
        usedFallbackPrompt = true
      }
    } catch (error) {
      console.error('Gemini prompt generation failed', error)
      usedFallbackPrompt = true
    }

    return {
      partyId,
      participants,
      prompts,
      usedFallbackPrompt,
    }
  },
)
