import { handleManifest } from './_lib/http.js'

export const GET = (req: Request) => handleManifest(req)
