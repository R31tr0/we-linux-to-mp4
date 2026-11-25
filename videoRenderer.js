const path = require('path');
const BACKENDS = require('./videoBackends');
const CODEC_PROFILES = require('./videoCodecs');
const {
  RESOLUTIONS,
  commandExists,
  ffmpegHasEncoder,
  fileHasData
} = require('./videoSupport');

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

  let backend = BACKENDS[backendKey] || BACKENDS.xvfb;
  const missing = backend.requires.filter((command) => !commandExists(command));
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
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error('Не удалось остановить движок:', error.message);
      }
    }
  };

  engineProcess.once('error', (error) => {
    engineStartFailed = true;
    console.error('Ошибка запуска движка или композитора:', error.message);
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

    if (session.manualStop) {
      setTimeout(() => {
        if (!recordingFinished) {
          stoppedByUs = true;
          recorderProcess.kill('SIGINT');
        }
      }, durationSec * 1000);
    }

    recorderProcess.once('error', (error) => {
      console.error('Ошибка запуска рекордера:', error.message);
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

module.exports = renderSceneToVideo;
