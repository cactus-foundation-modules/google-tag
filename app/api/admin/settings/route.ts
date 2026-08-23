// GET/PATCH /api/m/google-tag/admin/settings
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { prisma } from '@/lib/db/prisma'
import { getBannerState, getGoogleTagSettings, updateGoogleTagSettings } from '@/modules/google-tag/lib/settings'

async function view() {
  const [settings, banner, config] = await Promise.all([
    getGoogleTagSettings(),
    getBannerState(),
    prisma.siteConfig
      .findUnique({ where: { id: 'singleton' }, select: { adminPath: true } })
      .catch(() => null),
  ])
  return {
    ...settings,
    ga4MeasurementId: settings.ga4MeasurementId ?? '',
    adsConversionId: settings.adsConversionId ?? '',
    adsPurchaseLabel: settings.adsPurchaseLabel ?? '',
    banner,
    // So the tab can link straight to the cookie settings it is complaining
    // about, rather than describing where they are and hoping.
    adminPath: config?.adminPath ?? 'cactus-admin',
  }
}

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'googletag.manage')) return errorResponse('Forbidden', 403)
  return NextResponse.json(await view())
}

const Body = z.object({
  enabled: z.boolean().optional(),
  // Length caps only stop a paste of half a page reaching the column; the real
  // shape check is the normaliser in lib/types, which runs server-side and turns
  // anything unrecognisable into "not set".
  ga4MeasurementId: z.string().max(60).optional(),
  adsConversionId: z.string().max(120).optional(),
  adsPurchaseLabel: z.string().max(120).optional(),
  trackPageViews: z.boolean().optional(),
  loadBeforeConsent: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'googletag.manage')) return errorResponse('Forbidden', 403)

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid settings', 400)

  await updateGoogleTagSettings(parsed.data)
  return NextResponse.json(await view())
}
