import type { Post } from './types'

// Deterministic hour offsets — index-stable so seed posts don't reshuffle on every render.
// Results in display strings like "2 tuntia sitten", "8 tuntia sitten", "eilen", etc.
const SEED_OFFSETS_HOURS = [2, 5, 8, 12, 18, 24, 30, 36, 42, 48]

function seedTs(index: number): string {
  return new Date(Date.now() - SEED_OFFSETS_HOURS[index % SEED_OFFSETS_HOURS.length] * 3600000).toISOString()
}

export function getSeedPosts(neighborhood: string): Partial<Post>[] {
  return [
    {
      id: `seed-1-${neighborhood}`,
      type: 'tarvitsen',
      title: 'Onko kellään porakonetta lainattavaksi?',
      description: 'Pitäisi porata muutama reikä seinään. Palautan saman päivän aikana!',
      location: neighborhood,
      is_pro_listing: false,
      like_count: 0,
      comment_count: 0,
      tags: ['tyokalut'],
      created_at: seedTs(0),
      updated_at: seedTs(0),
      is_active: true,
      is_seed: true,
      user: {
        id: 'seed-user-1',
        name: 'Mikko K.',
        avatar_url: null,
        naapurusto: neighborhood,
      } as any,
    },
    {
      id: `seed-2-${neighborhood}`,
      type: 'tarjoan',
      title: 'Vapaaehtoinen koiranulkoiluttaja',
      description: 'Tykkään ulkoilla koirien kanssa. Voin auttaa arkisin klo 10-14.',
      location: neighborhood,
      is_pro_listing: false,
      like_count: 0,
      comment_count: 0,
      tags: ['lemmikit'],
      created_at: seedTs(1),
      updated_at: seedTs(1),
      is_active: true,
      is_seed: true,
      user: {
        id: 'seed-user-2',
        name: 'Anna L.',
        avatar_url: null,
        naapurusto: neighborhood,
      } as any,
    },
    {
      id: `seed-3-${neighborhood}`,
      type: 'ilmaista',
      title: 'Sohva hyvässä kunnossa',
      description: 'Harmaa 3-istuttava sohva, pitää noutaa tänään tai huomenna. Muutan pois.',
      location: neighborhood,
      image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80',
      is_pro_listing: false,
      like_count: 3,
      comment_count: 1,
      tags: ['huonekalut'],
      created_at: seedTs(2),
      updated_at: seedTs(2),
      is_active: true,
      is_seed: true,
      user: {
        id: 'seed-user-3',
        name: 'Jari M.',
        avatar_url: null,
        naapurusto: neighborhood,
      } as any,
    },
    {
      id: `seed-4-${neighborhood}`,
      type: 'ilmaista',
      title: 'Tuoreita korvapuusteja',
      description: 'Leivoin liikaa! 12 korvapuustia jakoon, nouda Fleminginkadulta.',
      location: neighborhood,
      image_url: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=600&q=80',
      is_pro_listing: false,
      like_count: 7,
      comment_count: 2,
      tags: ['ruoka'],
      expires_at: new Date(Date.now() + 43200000).toISOString(),
      created_at: seedTs(3),
      updated_at: seedTs(3),
      is_active: true,
      is_seed: true,
      user: {
        id: 'seed-user-4',
        name: 'Liisa H.',
        avatar_url: null,
        naapurusto: neighborhood,
      } as any,
    },
    {
      id: `seed-5-${neighborhood}`,
      type: 'lainaa',
      title: 'Lainaan painepesuria',
      description: 'Kärcher K5, päivävuokra 5€. Sopii terassin, auton tai pyörän pesuun.',
      location: neighborhood,
      image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&q=80',
      daily_fee: 5,
      is_pro_listing: false,
      like_count: 2,
      comment_count: 0,
      tags: ['tyokalut'],
      created_at: seedTs(4),
      updated_at: seedTs(4),
      is_active: true,
      is_seed: true,
      user: {
        id: 'seed-user-5',
        name: 'Timo P.',
        avatar_url: null,
        naapurusto: neighborhood,
      } as any,
    },
  ]
}
