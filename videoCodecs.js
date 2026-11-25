const { findRenderDevice, vaapiGpuConvertWorks } = require('./videoSupport');

const CODEC_PROFILES = {
  default: {
    label: 'По умолчанию (libopenh264, CPU)',
    encoder: 'libopenh264',
    vendor: null,
    ffmpegInput: () => [],
    ffmpegOutput: () => ['-c:v', 'libopenh264', '-b:v', '8M', '-pix_fmt', 'yuv420p'],
    wfArgs: () => ['-c', 'libopenh264', '-x', 'yuv420p', '-p', 'b=8M']
  },
  nvidia: {
    label: 'NVIDIA (h264_nvenc, GPU)',
    encoder: 'h264_nvenc',
    vendor: 'nvidia',
    ffmpegInput: () => [],
    ffmpegOutput: () => [
      '-c:v', 'h264_nvenc',
      '-preset', 'p5', '-tune', 'hq',
      '-rc', 'vbr', '-cq', '23', '-b:v', '0',
      '-pix_fmt', 'yuv420p'
    ],
    wfArgs: () => [
      '-c', 'h264_nvenc', '-x', 'yuv420p',
      '-p', 'preset=p5', '-p', 'tune=hq', '-p', 'rc=vbr', '-p', 'cq=23', '-p', 'b=0'
    ]
  },
  amd: {
    label: 'AMD (h264_vaapi, GPU)',
    encoder: 'h264_vaapi',
    vendor: 'amd',
    ffmpegInput: () => ['-vaapi_device', findRenderDevice('amd')],
    ffmpegOutput: () => {
      const gpuConvert = vaapiGpuConvertWorks();
      console.log(
        gpuConvert
          ? 'VAAPI: конвертация цвета выполняется на GPU.'
          : 'VAAPI: конвертация цвета на GPU недоступна, использую CPU.'
      );
      return [
        '-vf', gpuConvert ? 'hwupload,scale_vaapi=format=nv12' : 'format=nv12,hwupload',
        '-c:v', 'h264_vaapi',
        '-rc_mode', 'CQP', '-qp', '22'
      ];
    },
    wfArgs: () => ['-c', 'h264_vaapi', '-d', findRenderDevice('amd'), '-p', 'qp=22']
  }
};

module.exports = CODEC_PROFILES;
