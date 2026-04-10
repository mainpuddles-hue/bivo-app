declare const __DEV__: boolean

/**
 * Auto-suggest tags based on post title and description.
 * Uses keyword matching for Finnish content.
 */

const TAG_KEYWORDS: Record<string, string[]> = {
  kodinhoito: ['siivous', 'siivota', 'puhdist', 'pesu', 'imuroi', 'pyykki', 'kodinhoito'],
  muutto: ['muutto', 'kantaa', 'kuljett', 'paketti', 'siirrä'],
  lastenhoito: ['lasten', 'lapsi', 'hoita', 'vauva', 'päivähoito', 'babysit'],
  lemmikit: ['koira', 'kissa', 'lemmikki', 'eläin', 'ulkoilut', 'hoitaja'],
  tekniikka: ['tietokone', 'puhelin', 'it-tuki', 'ohjelmo', 'netti', 'wlan', 'wifi'],
  puutarha: ['puutarha', 'piha', 'nurmi', 'istutus', 'kasvi', 'puunkaato'],
  korjaus: ['korjaus', 'remontti', 'maalaus', 'putki', 'sähkö', 'asennus'],
  ruoka: ['ruoka', 'ateria', 'kokka', 'leipo', 'keittä', 'ravintola', 'herkku'],
  urheilu: ['urheilu', 'jumppa', 'valmennus', 'treeni', 'liikunta', 'pyörä', 'juoksu'],
  kulttuuri: ['musiikki', 'taide', 'teatteri', 'elokuva', 'konsertti', 'näyttely'],
  opetus: ['opetus', 'kurssi', 'kielet', 'tuki', 'matemat', 'koulu'],
  vaatteet: ['vaatteet', 'kengät', 'takki', 'paita', 'housut', 'mekko'],
  huonekalu: ['sohva', 'pöytä', 'tuoli', 'sänky', 'hylly', 'kaappi', 'huonekalu'],
  elektroniikka: ['tv', 'televisio', 'kaiutin', 'kuulokkeet', 'pelikonsol', 'kamera'],
}

interface AutoCategoryResult {
  suggestedTags: string[]
  confidence: number // 0-1
}

export function suggestTags(title: string, description?: string): AutoCategoryResult {
  const text = `${title} ${description ?? ''}`.toLowerCase()
  const matches: { tag: string; count: number }[] = []

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    const matchCount = keywords.filter(kw => text.includes(kw)).length
    if (matchCount > 0) {
      matches.push({ tag, count: matchCount })
    }
  }

  // Sort by match count, take top 3
  matches.sort((a, b) => b.count - a.count)
  const suggestedTags = matches.slice(0, 3).map(m => m.tag)
  const confidence = matches.length > 0 ? Math.min(matches[0].count / 3, 1) : 0

  return { suggestedTags, confidence }
}

