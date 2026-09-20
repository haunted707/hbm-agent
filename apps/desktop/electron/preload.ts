import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.hbmDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('hbm:translucency:support')
const hudWindowing = ipcRenderer.sendSync('hbm:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true
const launchFlags = ipcRenderer.sendSync('hbm:launch-flags')

contextBridge.exposeInMainWorld('hbmDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Launch-flag fact: the Nous free tier is on for this launch
  // (HBM_GUEST_ONBOARDING=1 or --guest-onboarding). Read-only; the same
  // decision is stamped onto every backend the app spawns.
  guestOnboardingEnabled: launchFlags?.guestOnboarding === true,
  // Launch-flag fact: skip the first-run film (HBM_SKIP_INTRO=1 or
  // --skip-intro). Rehearsal aid for the guided chat behind it.
  skipIntro: launchFlags?.skipIntro === true,
  getConnection: (profile, opts) => ipcRenderer.invoke('hbm:connection', profile, opts),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('hbm:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('hbm:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('hbm:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('hbm:backend:touch', profile),
  getPoolLimits: () => ipcRenderer.invoke('hbm:pool-limits:get'),
  setPoolLimits: limits => ipcRenderer.invoke('hbm:pool-limits:set', limits),
  getGatewayWsUrl: profile => ipcRenderer.invoke('hbm:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('hbm:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('hbm:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('hbm:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('hbm:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('hbm:window:openInstance'),
  openBrowserWindow: tabId => ipcRenderer.invoke('hbm:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('hbm:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('hbm:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('hbm:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('hbm:wake-indicator:get'),
    setState: state => ipcRenderer.send('hbm:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('hbm:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('hbm:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    grow: request => ipcRenderer.send('hbm:chat-onboarding:grow', request),
    soloBoot: () => ipcRenderer.send('hbm:chat-onboarding:solo-boot')
  },
  introReveal: {
    open: (payload?: { hideMain?: boolean }) => ipcRenderer.invoke('hbm:intro-reveal:open', payload),
    close: (payload?: { showMain?: boolean }) => ipcRenderer.invoke('hbm:intro-reveal:close', payload),
    skip: () => ipcRenderer.send('hbm:intro-reveal:skip'),
    ready: () => ipcRenderer.send('hbm:intro-reveal:ready'),
    onSkip: callback => {
      const listener = () => callback()

      ipcRenderer.on('hbm:intro-reveal:skip', listener)

      return () => ipcRenderer.removeListener('hbm:intro-reveal:skip', listener)
    },
    onClosed: callback => {
      const listener = () => callback()

      ipcRenderer.on('hbm:intro-reveal:closed', listener)

      return () => ipcRenderer.removeListener('hbm:intro-reveal:closed', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('hbm:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('hbm:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('hbm:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('hbm:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('hbm:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('hbm:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('hbm:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('hbm:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('hbm:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('hbm:hud:open', request),
    close: () => ipcRenderer.invoke('hbm:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('hbm:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('hbm:hud:begin-move'),
    endMove: () => ipcRenderer.send('hbm:hud:end-move'),
    moveBy: delta => ipcRenderer.send('hbm:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('hbm:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('hbm:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('hbm:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('hbm:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('hbm:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('hbm:hud:goto', listener)

      return () => ipcRenderer.removeListener('hbm:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('hbm:hud:changed', listener)

      return () => ipcRenderer.removeListener('hbm:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('hbm:hud:cursor', listener)

      return () => ipcRenderer.removeListener('hbm:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('hbm:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('hbm:hud:game-overlay', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('hbm:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('hbm:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('hbm:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('hbm:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('hbm:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('hbm:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('hbm:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('hbm:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('hbm:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('hbm:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('hbm:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('hbm:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('hbm:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('hbm:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('hbm:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('hbm:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('hbm:connections:list'),
    save: payload => ipcRenderer.invoke('hbm:connections:save', payload),
    remove: id => ipcRenderer.invoke('hbm:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('hbm:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('hbm:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('hbm:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('hbm:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('hbm:connections:update-managed', id),
    // Fan out `hbm update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('hbm:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:connections:changed', listener)

      return () => ipcRenderer.removeListener('hbm:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('hbm:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('hbm:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('hbm:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('hbm:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('hbm:connection-config:oauth-logout', remoteUrl),
  // HBM AGENT Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('hbm:cloud:status'),
    login: () => ipcRenderer.invoke('hbm:cloud:login'),
    logout: () => ipcRenderer.invoke('hbm:cloud:logout'),
    discover: org => ipcRenderer.invoke('hbm:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('hbm:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    get: () => ipcRenderer.invoke('hbm:profile:get'),
    remember: name => ipcRenderer.invoke('hbm:profile:remember', name),
    set: name => ipcRenderer.invoke('hbm:profile:set', name)
  },
  api: request => ipcRenderer.invoke('hbm:api', request),
  notify: payload => ipcRenderer.invoke('hbm:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('hbm:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('hbm:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('hbm:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('hbm:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('hbm:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('hbm:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('hbm:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('hbm:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('hbm:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('hbm:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('hbm:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('hbm:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('hbm:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('hbm:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('hbm:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('hbm:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('hbm:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('hbm:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('hbm:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('hbm:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('hbm:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('hbm:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('hbm:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('hbm:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('hbm:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('hbm:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('hbm:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('hbm:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('hbm:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('hbm:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('hbm:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('hbm:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('hbm:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('hbm:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('hbm:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('hbm:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('hbm:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('hbm:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('hbm:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('hbm:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('hbm:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('hbm:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('hbm:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('hbm:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('hbm:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('hbm:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('hbm:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('hbm:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('hbm:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:zoom:changed', listener)

      return () => ipcRenderer.removeListener('hbm:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('hbm:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('hbm:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('hbm:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('hbm:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('hbm:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('hbm:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('hbm:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('hbm:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('hbm:fs:reconcileDesktopPlugins'),
  logsRoot: () => ipcRenderer.invoke('hbm:fs:logsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('hbm:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('hbm:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('hbm:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('hbm:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('hbm:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('hbm:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('hbm:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('hbm:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('hbm:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('hbm:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('hbm:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('hbm:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('hbm:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('hbm:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('hbm:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('hbm:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('hbm:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('hbm:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('hbm:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('hbm:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('hbm:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('hbm:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('hbm:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('hbm:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('hbm:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('hbm:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('hbm:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('hbm:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('hbm:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('hbm:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('hbm:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `hbm:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `hbm:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('hbm:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('hbm:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('hbm:preview-nav', listener)

    return () => ipcRenderer.removeListener('hbm:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('hbm:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('hbm:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('hbm:open-updates', listener)

    return () => ipcRenderer.removeListener('hbm:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:deep-link', listener)

    return () => ipcRenderer.removeListener('hbm:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('hbm:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('hbm:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('hbm:plugin:installDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:window-state-changed', listener)

    return () => ipcRenderer.removeListener('hbm:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('hbm:focus-session', listener)

    return () => ipcRenderer.removeListener('hbm:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:notification-action', listener)

    return () => ipcRenderer.removeListener('hbm:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:notification-activate', listener)

    return () => ipcRenderer.removeListener('hbm:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('hbm:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:backend-exit', listener)

    return () => ipcRenderer.removeListener('hbm:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('hbm:connection:applied', listener)

    return () => ipcRenderer.removeListener('hbm:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('hbm:power-resume', listener)

    return () => ipcRenderer.removeListener('hbm:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('hbm:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('hbm:power-battery', listener)

    return () => ipcRenderer.removeListener('hbm:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:boot-progress', listener)

    return () => ipcRenderer.removeListener('hbm:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('hbm:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('hbm:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('hbm:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('hbm:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('hbm:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('hbm:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hbm:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('hbm:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('hbm:version'),
  relaunchApp: () => ipcRenderer.invoke('hbm:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('hbm:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('hbm:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('hbm:uninstall:summary'),
    run: mode => ipcRenderer.invoke('hbm:uninstall:run', { mode })
  },
  updates: {
    check: opts => ipcRenderer.invoke('hbm:updates:check', opts),
    apply: opts => ipcRenderer.invoke('hbm:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('hbm:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('hbm:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('hbm:updates:progress', listener)

      return () => ipcRenderer.removeListener('hbm:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('hbm:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('hbm:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('hbm:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('hbm:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('hbm:found-in-page', listener)

    return () => ipcRenderer.removeListener('hbm:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('hbm:open-find-bar', listener)

    return () => ipcRenderer.removeListener('hbm:open-find-bar', listener)
  }
})
