import { verifyReleaseArchive } from './check-release-assets.mjs'
export default async function afterPack(context) { await verifyReleaseArchive(context.appOutDir) }
