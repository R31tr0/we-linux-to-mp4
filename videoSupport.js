const fs = require('fs');
const { spawnSync } = require('child_process');

const RESOLUTIONS = {
  '1': { width: 1920, height: 1080, label: '1920x1080 (Full HD)' },
  '2': { width: 1280, height: 720, label: '1280x720 (HD, заметно легче для CPU)' }
};

const CAGE_SIZE = { width: 1920, height: 1080 };
const XVFB_START_DELAY = 4000;
const CAGE_START_DELAY = 6000;
const GPU_VENDOR_IDS = { amd: '0x1002', nvidia: '0x10de' };

function commandExists(name) {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;
}

function findRenderDevice(vendor) {
  try {
    const nodes = fs.readdirSync('/dev/dri').filter((name) => name.startsWith('renderD')).sort();
    if (vendor && GPU_VENDOR_IDS[vendor]) {
      for (const node of nodes) {
        try {
          const id = fs.readFileSync(`/sys/class/drm/${node}/device/vendor`, 'utf8').trim();
          if (id === GPU_VENDOR_IDS[vendor]) return `/dev/dri/${node}`;
        } catch (_) {}
      }
    }
    if (nodes.length > 0) return `/dev/dri/${nodes[0]}`;
  } catch (_) {}
  return '/dev/dri/renderD128';
}

function ffmpegHasEncoder(name) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return result.status === 0 && new RegExp(`\\b${name}\\b`).test(result.stdout);
}

let vaapiGpuConvertCache = null;
function vaapiGpuConvertWorks() {
  if (vaapiGpuConvertCache !== null) return vaapiGpuConvertCache;
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-vaapi_device', findRenderDevice('amd'),
    '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=1:d=1,format=bgr0',
    '-vf', 'hwupload,scale_vaapi=format=nv12',
    '-frames:v', '1',
    '-c:v', 'h264_vaapi',
    '-f', 'null', '-'
  ], { stdio: 'ignore' });
  vaapiGpuConvertCache = result.status === 0;
  return vaapiGpuConvertCache;
}

function fileHasData(file) {
  try {
    return fs.statSync(file).size > 0;
  } catch (_) {
    return false;
  }
}

function findWaylandSocket(dir) {
  try {
    const socket = fs.readdirSync(dir).find(
      (name) => name.startsWith('wayland-') && !name.endsWith('.lock')
    );
    if (socket) return socket;
  } catch (_) {}
  return 'wayland-0';
}

module.exports = {
  CAGE_SIZE,
  CAGE_START_DELAY,
  RESOLUTIONS,
  XVFB_START_DELAY,
  commandExists,
  ffmpegHasEncoder,
  fileHasData,
  findRenderDevice,
  findWaylandSocket,
  vaapiGpuConvertWorks
};
