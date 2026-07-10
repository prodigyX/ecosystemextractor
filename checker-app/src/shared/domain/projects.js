/**
 * @typedef {Object} SourceProject
 * @property {string} [id]
 * @property {string} name
 * @property {string} [slogan]
 * @property {string} [external_url]
 * @property {string} [icon_url]
 * @property {string} [banner_url]
 * @property {string} [short_description]
 * @property {string} [long_description]
 * @property {string} [about_us]
 * @property {boolean} [featured]
 * @property {Array<{name: string}>} [categories]
 * @property {Array<{image_url: string, order_index?: number}>} [screenshots]
 * @property {Array<{platform: string, url: string}>} [socials]
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {string|null} website
 * @property {string|null} x
 * @property {string|null} icon
 * @property {string|null} banner
 * @property {string|null} description
 * @property {string|null} longDescription
 * @property {string|null} aboutUs
 * @property {boolean} featured
 * @property {string[]} categories
 * @property {string[]} screenshots
 * @property {import('./scoring.js').CheckStatus} websiteStatus
 * @property {import('./scoring.js').CheckStatus} xStatus
 */

/**
 * Normalizes raw ecosystem-extract JSON into the flat Project shape the app checks.
 * @param {SourceProject[]} data
 * @returns {Project[]}
 */
export function extractProjects(data) {
  return data.map((item) => {
    const twitter = item.socials?.find((s) => s.platform === 'twitter')
    return {
      id: item.id ?? crypto.randomUUID(),
      name: item.name,
      website: item.external_url || null,
      x: twitter?.url || null,
      icon: item.icon_url || null,
      banner: item.banner_url || null,
      description: item.short_description || item.slogan || null,
      longDescription: item.long_description || null,
      aboutUs: item.about_us || null,
      featured: item.featured === true,
      categories: item.categories?.map((c) => c.name).filter(Boolean) ?? [],
      screenshots: item.screenshots
        ?.slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((s) => s.image_url)
        .filter(Boolean) ?? [],
      websiteStatus: 'idle',
      xStatus: 'idle',
    }
  })
}
