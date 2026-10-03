/**
 * Workspace Explorer — host half.
 *
 * Mounts one route family (`/api/workspace-explorer`) that serves the
 * plugin's registered root directories, their preferences, one directory level
 * at a time, and the ranked `@` completion candidates the browser half offers
 * for every registered root. It reads directory *metadata* only — names and
 * types, whether one level at a time or through the bounded recursive walk the
 * candidate index performs: the plugin never opens file content (the shipped
 * Sidebar document preview owns content reads).
 * Configuration and bridge receipts live in plugin-owned sidecars under DSH
 * home; native Session/workspace mutations use official Host Services only.
 *
 * The browser half ships through `package.json`'s `dsh.client` declaration and
 * replaces the sidebar's workspace region by shadowing the
 * `sidebar.workspaces` slot; this half knows nothing about the UI.
 *
 * @module dsh-multi-root-explorer
 */
import { ConfigStore, pluginDataDir, resolveDshHome } from './host/store.js'
import { makeRoutes, ROUTES } from './host/routes.js'
import { sessionsRootPath } from './host/sessions.js'
import { NativeBridge } from './host/native-bridge.js'

/** Stable Cordis plugin name. */
export const name = 'workspace-explorer'

/** Services required before the route family can mount. */
export const inject = ['webServer']

/**
 * Mount the Workspace Explorer routes.
 * @param ctx - host plugin context carrying `webServer`.
 * @param config - the Loader entry's configuration, when the profile sets one.
 */
export function apply(ctx, config) {
  const dshHome = resolveDshHome(config?.dshHome)
  const store = new ConfigStore({ dir: pluginDataDir(dshHome), logger: ctx.logger })
  const sessionsRoot = typeof config?.sessionsRoot === 'string' && config.sessionsRoot.trim() !== ''
    ? config.sessionsRoot
    : sessionsRootPath(dshHome)
  ctx.logger?.info?.(`workspace-explorer: serving ${ROUTES.state.slice(0, ROUTES.state.lastIndexOf('/'))} (config ${store.file})`)
  ctx.effect(() => {
    const nativeBridge = new NativeBridge(ctx, store)
    nativeBridge.start()
    const disposers = makeRoutes({
      store,
      nativeBridge,
      sessionsRoot,
      // The live Session store is optional: without it the deletion route still
      // works, it just cannot pre-check whether a Session's Agent is running.
      sessions: ctx.get('sessions'),
      logger: ctx.logger,
    }).map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers.splice(0)) dispose()
      return nativeBridge.dispose()
    }
  }, 'workspace-explorer: routes')
}

export { ROUTES }
