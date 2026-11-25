const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const CODEC_PROFILES = require('./videoCodecs');
const {
  CAGE_SIZE,
  CAGE_START_DELAY,
  XVFB_START_DELAY,
  findRenderDevice,
  findWaylandSocket
} = require('./videoSupport');

function createXvfbSession(ctx) {
  const sizeStr = `${ctx.size.width}x${ctx.size.height}`;
  const engineEnv = {
    ...process.env,
    XDG_SESSION_TYPE: 'x11',
    LIBGL_ALWAYS_SOFTWARE: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'mesa'
  };
  delete engineEnv.WAYLAND_DISPLAY;

  const engine = spawn('xvfb-run', [
    '-n', '99',
    '-s', `-screen 0 ${sizeStr}x24`,
    ctx.engineBinaryPath,
    '--window', `0x0x${sizeStr}`,
    '--fps', `${ctx.fps}`,
    '--silent',
    ctx.wallpaperDir
  ], { detached: true, stdio: 'inherit', env: engineEnv });

  return {
    engine,
    startDelayMs: XVFB_START_DELAY,
    manualStop: false,
    startRecorder() {
      return spawn('ffmpeg', [
        '-y',
        ...ctx.profile.ffmpegInput(),
        '-video_size', sizeStr,
        '-framerate', `${ctx.fps}`,
        '-f', 'x11grab',
        '-draw_mouse', '0',
        '-thread_queue_size', '512',
        '-i', ':99',
        '-t', String(ctx.durationSec),
        ...ctx.profile.ffmpegOutput(),
        ctx.outputVideo
      ], { stdio: ['ignore', 'inherit', 'inherit'] });
    },
    cleanup() {}
  };
}

function createCageSession(ctx) {
  const { width, height } = ctx.size;
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-wl-'));
  const env = {
    ...process.env,
    XDG_RUNTIME_DIR: runtimeDir,
    WLR_BACKENDS: 'headless',
    WLR_HEADLESS_OUTPUTS: '1',
    WLR_LIBINPUT_NO_DEVICES: '1',
    WLR_RENDERER: 'gles2'
  };
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  delete env.LIBGL_ALWAYS_SOFTWARE;
  if (ctx.profile.vendor) {
    env.WLR_RENDER_DRM_DEVICE = findRenderDevice(ctx.profile.vendor);
  }

  const engine = spawn('cage', [
    '--',
    ctx.engineBinaryPath,
    '--window', `0x0x${width}x${height}`,
    '--fps', `${ctx.fps}`,
    '--silent',
    ctx.wallpaperDir
  ], { detached: true, stdio: 'inherit', env });

  return {
    engine,
    startDelayMs: CAGE_START_DELAY,
    manualStop: true,
    startRecorder() {
      const recorderEnv = {
        ...process.env,
        XDG_RUNTIME_DIR: runtimeDir,
        WAYLAND_DISPLAY: findWaylandSocket(runtimeDir)
      };
      delete recorderEnv.DISPLAY;
      return spawn('wf-recorder', [
        '-y',
        '-r', `${ctx.fps}`,
        '-f', ctx.outputVideo,
        ...ctx.profile.wfArgs()
      ], { env: recorderEnv, stdio: ['ignore', 'inherit', 'inherit'] });
    },
    cleanup() {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (_) {}
    }
  };
}

const BACKENDS = {
  xvfb: {
    label: 'Xvfb (рендер на CPU)',
    requires: ['xvfb-run', 'ffmpeg'],
    installHint: 'sudo dnf install xorg-x11-server-Xvfb',
    size: (resolution) => resolution,
    create: createXvfbSession
  },
  cage: {
    label: 'Cage headless (рендер на GPU)',
    requires: ['cage', 'wf-recorder'],
    installHint: 'sudo dnf install cage wf-recorder',
    size: () => CAGE_SIZE,
    create: createCageSession
  }
};

module.exports = BACKENDS;
