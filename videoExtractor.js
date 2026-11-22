const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// Настройки
// ---------------------------------------------------------------------------

// Разрешения для режима Xvfb. Чем меньше, тем меньше работы у llvmpipe (рендер на CPU).
const RESOLUTIONS = {
  '1': { width: 1920, height: 1080, label: '1920x1080 (Full HD)' },
  '2': { width: 1280, height: 720, label: '1280x720 (HD, заметно легче для CPU)' }
};

// Размер виртуального экрана в режиме Cage headless.
// У headless-бэкенда wlroots размер по умолчанию 1920x1080; менять его без wlr-randr нельзя.
const CAGE_SIZE = { width: 1920, height: 1080 };

// Задержка перед стартом записи (секунды на запуск движка), мс
const XVFB_START_DELAY = 4000;
const CAGE_START_DELAY = 6000;

// PCI-идентификаторы производителей (читаются из /sys/class/drm/*/device/vendor)
const GPU_VENDOR_IDS = { amd: '0x1002', nvidia: '0x10de' };

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function commandExists(name) {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;
}

// Ищем render-устройство. Если указан vendor ('amd' | 'nvidia'), берём карту этого производителя
// (важно, когда в системе две видеокарты, например iGPU и дискретная).
function findRenderDevice(vendor) {
  try {
    const nodes = fs.readdirSync('/dev/dri').filter((n) => n.startsWith('renderD')).sort();
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

// Проверяем, что нужный энкодер вообще есть в установленном ffmpeg
function ffmpegHasEncoder(name) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return res.status === 0 && new RegExp(`\\b${name}\\b`).test(res.stdout);
}

// Пробуем на крошечном тестовом кадре, работает ли конвертация цвета на GPU через scale_vaapi
let vaapiGpuConvertCache = null;
function vaapiGpuConvertWorks() {
  if (vaapiGpuConvertCache !== null) return vaapiGpuConvertCache;
  const res = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-vaapi_device', findRenderDevice('amd'),
    '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=1:d=1,format=bgr0',
    '-vf', 'hwupload,scale_vaapi=format=nv12',
    '-frames:v', '1',
    '-c:v', 'h264_vaapi',
    '-f', 'null', '-'
  ], { stdio: 'ignore' });
  vaapiGpuConvertCache = res.status === 0;
  return vaapiGpuConvertCache;
}

function fileHasData(file) {
  try {
    return fs.statSync(file).size > 0;
  } catch (_) {
    return false;
  }
}

// Находим сокет Wayland, который создал cage в приватной папке
function findWaylandSocket(dir) {
  try {
    const sock = fs.readdirSync(dir).find((n) => n.startsWith('wayland-') && !n.endsWith('.lock'));
    if (sock) return sock;
  } catch (_) {}
  return 'wayland-0';
}

// ---------------------------------------------------------------------------
// Профили кодирования
//   ffmpegInput / ffmpegOutput: аргументы для режима Xvfb (запись через ffmpeg x11grab)
//   wfArgs: аргументы для режима Cage (запись через wf-recorder)
// ---------------------------------------------------------------------------
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
      // Если драйвер умеет, конвертация bgr0 -> nv12 идёт на GPU, а не на CPU
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

// ---------------------------------------------------------------------------
// Способы рендера
//   Каждая фабрика сразу запускает движок и возвращает сессию:
//   { engine, startDelayMs, manualStop, startRecorder(), cleanup() }
// ---------------------------------------------------------------------------

// Способ 1: Xvfb. Работает везде, но OpenGL считается на CPU (llvmpipe).
function createXvfbSession(ctx) {
  const sizeStr = `${ctx.size.width}x${ctx.size.height}`;

  const engineEnv = {
    ...process.env,
    XDG_SESSION_TYPE: 'x11',
    LIBGL_ALWAYS_SOFTWARE: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'mesa'
  };
  delete engineEnv.WAYLAND_DISPLAY;

  const engine = spawn('xvfb-run', [ // Запускаем движок через xvfb-run на виртуальном дисплее X11.
    '-n', '99', // Номер виртуального дисплея.
    '-s', `-screen 0 ${sizeStr}x24`, // Экран выбранного разрешения, глубина цвета 24 бита.
    ctx.engineBinaryPath, // Путь к движку.
    '--window', `0x0x${sizeStr}`, // Окно движка во весь экран.
    '--fps', `${ctx.fps}`, // Частота кадров.
    '--silent', // Без звука.
    ctx.wallpaperDir // Папка с обоями.
  ], { detached: true, stdio: 'inherit', env: engineEnv });

  return {
    engine,
    startDelayMs: XVFB_START_DELAY,
    manualStop: false, // ffmpeg сам остановится по -t
    startRecorder() {
      return spawn('ffmpeg', [
        '-y', // Перезаписывать выходной файл.
        ...ctx.profile.ffmpegInput(), // Для VAAPI: -vaapi_device ...
        '-video_size', sizeStr, // Размер совпадает с экраном Xvfb.
        '-framerate', `${ctx.fps}`,
        '-f', 'x11grab', // Захват экрана через X11.
        '-draw_mouse', '0', // Убираем курсор.
        '-thread_queue_size', '512', // Буфер захвата, чтобы реже терять кадры.
        '-i', ':99',
        '-t', String(ctx.durationSec), // Ограничиваем длительность.
        ...ctx.profile.ffmpegOutput(), // Кодек и параметры профиля.
        ctx.outputVideo
      ], { stdio: ['ignore', 'inherit', 'inherit'] });
    },
    cleanup() {}
  };
}

// Способ 2: Cage (Wayland-композитор) в headless-режиме + wf-recorder.
// Рендер идёт на настоящем GPU через EGL/GBM, захват и кодирование тоже на GPU.
function createCageSession(ctx) {
  const { width, height } = ctx.size;

  // Приватная папка для сокета Wayland, чтобы не пересекаться с вашей реальной сессией
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-wl-'));

  const env = {
    ...process.env,
    XDG_RUNTIME_DIR: runtimeDir,
    WLR_BACKENDS: 'headless', // Виртуальный выход без монитора.
    WLR_HEADLESS_OUTPUTS: '1',
    WLR_LIBINPUT_NO_DEVICES: '1', // Разрешаем старт без устройств ввода.
    WLR_RENDERER: 'gles2'
  };
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  delete env.LIBGL_ALWAYS_SOFTWARE; // Никакого программного рендера.
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
    manualStop: true, // wf-recorder не знает про длительность, остановим сигналом SIGINT
    startRecorder() {
      const recEnv = {
        ...process.env,
        XDG_RUNTIME_DIR: runtimeDir,
        WAYLAND_DISPLAY: findWaylandSocket(runtimeDir)
      };
      delete recEnv.DISPLAY;
      return spawn('wf-recorder', [
        '-y', // Перезаписывать выходной файл.
        '-r', `${ctx.fps}`,
        '-f', ctx.outputVideo,
        ...ctx.profile.wfArgs()
      ], { env: recEnv, stdio: ['ignore', 'inherit', 'inherit'] });
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

// ---------------------------------------------------------------------------
// Основной сценарий
// ---------------------------------------------------------------------------

function extractVideo(assets, pkgPath, readlineSync) {
  // 1. Сначала предлагаем вырезать готовые видео, ЕСЛИ они есть в архиве
  if (assets.videos.length > 0) {
    console.log('\nДоступные видеофайлы для вырезки:');
    assets.videos.forEach((file, index) => {
      console.log(`[${index}] ${file.name} (${file.sizeMB})`);
    });

    const ask = readlineSync.question(
      '\nВы хотите вырезать готовый видеофайл из архива? (y/n): '
    );

    if (ask.toLowerCase() === 'y') {
      const choice = readlineSync.question(
        '\nВведите номер видео для вырезки (или нажмите Enter для пропуска): '
      );

      if (choice.trim() !== '') {
        const selectedVideo = assets.videos[Number(choice)];

        if (selectedVideo) {
          const outputName = selectedVideo.name.split('/').pop();
          console.log(`Начинаю вырезать ${outputName}...`);

          const readStream = fs.createReadStream(pkgPath, {
            start: selectedVideo.start,
            end: selectedVideo.end
          });
          const writeStream = fs.createWriteStream(outputName);

          readStream.pipe(writeStream);
          writeStream.on('finish', () => {
            console.log(`Готово! Файл успешно сохранен как ${outputName}`);
          });
          return; // Выходим, чтобы не мешать потоку записи вопросами в консоли
        } else {
          console.log('Ошибка: файла с таким номером нет в списке.');
        }
      }
    } else {
      console.log('Вырезка готового видео пропущена.');
    }
  } else {
    console.log('\nЧистых видеофайлов внутри архива нет (это интерактивная сцена).');
  }

  const ask2 = readlineSync.question(
    '\nВы хотите отрендерить и записать сцену в видео через движок? (y/n): '
  );

  if (ask2.toLowerCase() === 'y') {
    const duration = readlineSync.question('Сколько секунд записать? (например, 10): ');
    const durationSec = Number(duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      console.error('Ошибка: длительность должна быть положительным числом.');
      return;
    }

    const fps = Number(readlineSync.question('Сколько fps записать? (например, 60): '));
    if (!Number.isInteger(fps) || fps <= 0) {
      console.error('Ошибка: fps должен быть положительным целым числом.');
      return;
    }

    const cageReady = BACKENDS.cage.requires.every(commandExists);
    console.log('\nВыберите способ рендера:');
    console.log('[1] Xvfb (рендер на CPU, работает везде)');
    console.log(
      `[2] Cage headless (рендер на GPU, экспериментально)${
        cageReady ? '' : ' - не установлены cage и wf-recorder'
      }`
    );
    const backendChoice = readlineSync.question('Номер (Enter = 1): ').trim();
    const backendKey = backendChoice === '2' ? 'cage' : 'xvfb';

    // Разрешение выбираем только для Xvfb; у Cage размер фиксированный
    let resolution = RESOLUTIONS['1'];
    if (backendKey === 'xvfb') {
      console.log('\nВыберите разрешение записи:');
      console.log(`[1] ${RESOLUTIONS['1'].label}`);
      console.log(`[2] ${RESOLUTIONS['2'].label}`);
      const resChoice = readlineSync.question('Номер (Enter = 1): ').trim();
      resolution = RESOLUTIONS[resChoice] || RESOLUTIONS['1'];
    }

    console.log('\nВыберите кодек для записи:');
    console.log('[1] По умолчанию (libopenh264, CPU)');
    console.log('[2] NVIDIA (h264_nvenc)');
    console.log('[3] AMD (h264_vaapi)');
    const codecChoice = readlineSync.question('Номер (Enter = 1): ').trim();
    const codecKey = { '2': 'nvidia', '3': 'amd' }[codecChoice] || 'default';

    renderSceneToVideo(pkgPath, durationSec, fps, codecKey, backendKey, resolution);
  } else {
    console.log('Конвертация видео отменена пользователем.');
  }
}

function renderSceneToVideo(
  pkgPath,
  durationSec,
  fps,
  codecKey = 'default',
  backendKey = 'xvfb',
  resolution = RESOLUTIONS['1']
) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    console.error('Ошибка: длительность должна быть положительным числом.');
    return;
  }
  if (!Number.isInteger(fps) || fps <= 0) {
    console.error('Ошибка: fps должен быть положительным целым числом.');
    return;
  }

  // Выбираем способ рендера; если нужных программ нет, откатываемся на Xvfb
  let backend = BACKENDS[backendKey] || BACKENDS.xvfb;
  const missing = backend.requires.filter((cmd) => !commandExists(cmd));
  if (missing.length > 0) {
    console.warn(`Не найдено: ${missing.join(', ')}. Установка: ${backend.installHint}`);
    if (backend !== BACKENDS.xvfb) {
      console.warn('Использую Xvfb (рендер на CPU).');
      backend = BACKENDS.xvfb;
      resolution = RESOLUTIONS['1'];
    } else {
      return;
    }
  }

  // Выбираем профиль кодека; если энкодера нет в ffmpeg, откатываемся на libopenh264
  let profile = CODEC_PROFILES[codecKey] || CODEC_PROFILES.default;
  if (!ffmpegHasEncoder(profile.encoder)) {
    console.warn(`Энкодер ${profile.encoder} не найден в вашем ffmpeg, использую libopenh264.`);
    profile = CODEC_PROFILES.default;
  }

  const size = backend.size(resolution);
  console.log(`Рендер: ${backend.label}`);
  console.log(`Кодек: ${profile.label}`);
  console.log(`Разрешение: ${size.width}x${size.height}`);

  const wallpaperDir = path.dirname(pkgPath);
  const engineBinaryPath = path.join(__dirname, 'bin', 'linux-wallpaperengine');
  const randomSuffix = Math.floor(Math.random() * 100000);
  const outputVideo = `output_scene_${randomSuffix}.mp4`;

  console.log(`\nЗапускаю фоновый рендер для: ${wallpaperDir}`);

  const session = backend.create({
    wallpaperDir,
    engineBinaryPath,
    fps,
    durationSec,
    size,
    profile,
    outputVideo
  });
  const engineProcess = session.engine;

  let recorderProcess;
  let engineStartFailed = false;
  let recordingFinished = false;
  let stoppedByUs = false;

  const stopEngine = () => {
    if (!engineProcess.pid) return;
    try {
      process.kill(-engineProcess.pid, 'SIGTERM');
    } catch (err) {
      if (err.code !== 'ESRCH') {
        console.error('Не удалось остановить движок:', err.message);
      }
    }
  };

  engineProcess.once('error', (err) => {
    engineStartFailed = true;
    console.error('Ошибка запуска движка или композитора:', err.message);
    session.cleanup();
  });

  engineProcess.once('close', (code, signal) => {
    if (!recorderProcess && !engineStartFailed) {
      console.error(
        `Движок завершился до начала записи (код ${code}, сигнал ${signal || 'нет'}).`
      );
      session.cleanup();
    } else if (recorderProcess && !recordingFinished) {
      console.error('Движок завершился во время записи; остановка рекордера.');
      recorderProcess.kill(session.manualStop ? 'SIGINT' : 'SIGTERM');
    }
  });

  setTimeout(() => {
    if (engineStartFailed || engineProcess.exitCode !== null || engineProcess.signalCode !== null) {
      return;
    }

    console.log(`Идет запись в фоне (${durationSec} сек)...`);

    recorderProcess = session.startRecorder();

    // wf-recorder не умеет ограничивать длительность сам, останавливаем его через SIGINT
    if (session.manualStop) {
      setTimeout(() => {
        if (!recordingFinished) {
          stoppedByUs = true;
          recorderProcess.kill('SIGINT');
        }
      }, durationSec * 1000);
    }

    recorderProcess.once('error', (err) => {
      console.error('Ошибка запуска рекордера:', err.message);
      recordingFinished = true;
      stopEngine();
      session.cleanup();
    });

    recorderProcess.once('close', (code, signal) => {
      recordingFinished = true;
      const ok = code === 0 || (stoppedByUs && fileHasData(outputVideo));
      if (ok) {
        console.log(`\nГотово! Видео сохранено в файл: ${outputVideo}`);
      } else {
        console.error(
          `Ошибка записи видео: рекордер завершился с кодом ${code}, сигнал ${signal || 'нет'}.`
        );
      }
      stopEngine();
      session.cleanup();
    });
  }, session.startDelayMs);
}

module.exports = extractVideo;