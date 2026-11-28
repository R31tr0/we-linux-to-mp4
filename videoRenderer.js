const path = require('path');
const fs = require('fs');
const os = require('os');
const { pipeline } = require('stream/promises');
const BACKENDS = require('./videoBackends');
const CODEC_PROFILES = require('./videoCodecs');
const { execFileSync } = require('child_process');
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
  resolution = RESOLUTIONS['1'],
  videos = [],
  readlineSync,
  outputName = null
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
  const outputVideo = outputName || `output_scene_${randomSuffix}.mp4`;

  console.log(`\nЗапускаю фоновый рендер для: ${wallpaperDir}`);

  let blendMode = 'lighten';
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

  const renderWithLayer = async (video, inputVideo, outPath) => {
    const extension = path.extname(video.name) || '.mp4';
    const layerPath = path.join(
      os.tmpdir(),
      `we-linux-layer-${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}${extension}`
    );
    try {
      await pipeline(
        fs.createReadStream(pkgPath, { start: video.start, end: video.end }),
        fs.createWriteStream(layerPath)
      );
      const outputOptions = profile.ffmpegOutput();
      const videoFilterIndex = outputOptions.indexOf('-vf');
      const outputFilter =
        videoFilterIndex === -1 ? null : outputOptions.splice(videoFilterIndex, 2)[1];
      const filterGraph =
      '[1:v][0:v]scale2ref=w=rw:h=rh[layer_scaled][base_raw];' +
      '[base_raw]format=rgb24[base];' +
      '[layer_scaled]format=rgb24[layer];' +
      `[base][layer]blend=all_mode=${blendMode}:shortest=0,format=yuv420p[v]` +
      (outputFilter ? `;[v]${outputFilter}[encoded]` : '');

      execFileSync(
        'ffmpeg',
        [
          '-y',
          ...profile.ffmpegInput(),
          '-i',
          inputVideo,
          '-i',
          layerPath,
          '-filter_complex',
          filterGraph,
          '-map',
          outputFilter ? '[encoded]' : '[v]',
          '-map',
          '0:a?',
          '-t',
          String(durationSec),
          ...outputOptions,
          '-c:a',
          'copy',
          outPath
        ],
        { stdio: 'inherit' }
      );
      console.log(`Готово! Видео со слоем сохранено в файл: ${outPath}`);
    } finally {
      await fs.promises.rm(layerPath, { force: true });
    }
  };
  let startimer;
  engineProcess.once('error', (error) => {
    clearTimeout(startimer);
    engineStartFailed = true;
    console.error('Ошибка запуска движка или композитора:', error.message);
    session.cleanup();
  });
  
  engineProcess.once('close', (code, signal) => {
    if (!recorderProcess && !engineStartFailed) {
      clearTimeout(startimer);
      console.error(
        `Движок завершился до начала записи (код ${code}, сигнал ${signal || 'нет'}).`
      );
      session.cleanup();
    } else if (recorderProcess && !recordingFinished) {
      console.error('Движок завершился во время записи; остановка рекордера.');
      recorderProcess.kill(session.manualStop ? 'SIGINT' : 'SIGTERM');
    }
  });
  
  startimer = setTimeout(() => {
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

    recorderProcess.once('close', async (code, signal) => {
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

      if (ok && videos.length > 0 && readlineSync) {
        const useLayer = readlineSync.question(
          '\nВы хотите отрендерить сцену со слоем из архива? (y/n): '
        );
       
        if (useLayer.toLowerCase() === 'y') {
          console.log('\nДоступные видеофайлы для слоёв:');
          videos.forEach((file, index) => {
            console.log(`[${index + 1}] ${file.name} (${file.sizeMB})`);
          });
           const askaboutblend = readlineSync.question(
          '\n каким методом наложить слои ? lighten (1) или softlight (2) результат может быть разным тестируйте в зависимости от обоев (lighten/softlight): '
        );
        if (askaboutblend === '2') {
          blendMode = 'softlight';
        }
          const choice = readlineSync.question(
            '\nВведите номер видео для слоя (0 = применить все слои осторожно рендер всех слоев работает не лучшим образом лучше рендерить по 1 и 2 слоя ): '
          ).trim();

          if (!/^\d+$/.test(choice) || Number(choice) > videos.length) {
            console.error('Ошибка: файла с таким номером нет в списке.');
          } else if (Number(choice) === 0) {
            let inputVideo = outputVideo;
            for (const [index, video] of videos.entries()) {
              const outPath = `layersoutput_${index + 1}.mp4`;
              console.log(`Рендер слоя ${index + 1} из ${videos.length}...`);
              try {
                await renderWithLayer(video, inputVideo, outPath);
                inputVideo = outPath;
              } catch (error) {
                console.error(
                  `Ошибка при рендере слоя ${index + 1}:`,
                  error.message
                );
                break;
              }
            }
          } else {
            const selectedVideo = videos[Number(choice) - 1];
            console.log('Начинаю рендер слоя...');
            try {
              await renderWithLayer(
                selectedVideo,
                outputVideo,
                'layersoutput.mp4'
              );
            } catch (error) {
              console.error('Ошибка при рендере слоя:', error.message);
            }
          }
        }
      }
      session.cleanup();
    });
  }, session.startDelayMs);
}

module.exports = renderSceneToVideo;
