/**
 * Re-exports the current project list in the same shape as the source
 * ecosystem extract (see extracts/latest extract.json / extractProjects in
 * shared/domain/projects.js), but with each project's `socials` topped up
 * with the Discord/Telegram/GitHub links the deep check actually found —
 * via the homepage scrape, the X bio/Linktree fallback, or the rendered-page
 * fallback for JS-heavy sites (see server/pipeline.js) — not just whatever
 * was in the original source data.
 * @param {import('../shared/domain/projects.js').Project[]} projects
 * @param {Record<string, {facts?: {links?: {discord?: string|null, telegram?: string|null, github?: string|null}}}>} deep
 */
export function downloadExtractWithSocials(projects, deep) {
  const payload = projects.map((p) => {
    const links = deep[p.id]?.facts?.links ?? {}
    const socials = []
    if (p.x) socials.push({ platform: 'twitter', url: p.x })
    if (links.discord) socials.push({ platform: 'discord', url: links.discord })
    if (links.telegram) socials.push({ platform: 'telegram', url: links.telegram })
    if (links.github) socials.push({ platform: 'github', url: links.github })

    return {
      id: p.id,
      name: p.name,
      short_description: p.description ?? null,
      long_description: p.longDescription ?? null,
      icon_url: p.icon ?? null,
      banner_url: p.banner ?? null,
      external_url: p.website ?? null,
      about_us: p.aboutUs ?? null,
      featured: p.featured === true,
      categories: p.categories.map((name) => ({ name })),
      screenshots: p.screenshots.map((image_url, index) => ({ image_url, order_index: index })),
      socials,
    }
  })

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'extract-with-socials.json'
  a.click()
  URL.revokeObjectURL(url)
}
