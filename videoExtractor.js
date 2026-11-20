const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

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

    renderSceneToVideo(pkgPath, durationSec, fps);
  } else {
    console.log('Конвертация видео отменена пользователем.');
  }
}

function renderSceneToVideo(pkgPath, durationSec, fps) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    console.error('Ошибка: длительность должна быть положительным числом.');
    return;
  }
  if (!Number.isInteger(fps) || fps <= 0) {
    console.error('Ошибка: fps должен быть положительным целым числом.');
    return;
  }

  const wallpaperDir = path.dirname(pkgPath);
  const engineBinaryPath = path.join(__dirname, 'bin', 'linux-wallpaperengine');
  const outputVideo = 'output_scene.mp4';

  console.log(`\nЗапускаю фоновый рендер для: ${wallpaperDir}`);

  const engineEnv = { ...process.env, XDG_SESSION_TYPE: 'x11', LIBGL_ALWAYS_SOFTWARE: '1',__GLX_VENDOR_LIBRARY_NAME: 'mesa' };
  delete engineEnv.WAYLAND_DISPLAY;

  const engineProcess = spawn('xvfb-run', [ // Запускаем движок через xvfb-run для работы на виртуальном дисплее X11.
      '-n', '99', // Назначаем виртуальному дисплею номер 99.
      '-s', '-screen 0 1920x1080x24', // Создаём один экран разрешением 1920x1080 и глубиной цвета 24 бита.
      engineBinaryPath, // Указываем путь к исполняемому файлу движка.
      '--window', '0x0x1920x1080', // Задаём движку окно размером 1920x1080 в позиции с координатами (0,0).
      '--fps', `${fps}`, // Передаём движку частоту кадров из переменной fps.
      '--silent', // Запускаем движок в тихом режиме без звука.
      wallpaperDir // Передаём движку папку с обоями или файлами для воспроизведения.
    ], { detached: true, stdio: 'inherit', env: engineEnv }); // Отделяем процесс от родительского и наследуем стандартные потоки ввода и вывода.

  let ffmpegProcess;
  let engineStartFailed = false;
  let recordingFinished = false;

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
    console.error('Ошибка запуска xvfb-run или движка:', err.message);
  });

  engineProcess.once('close', (code, signal) => {
    if (!ffmpegProcess && !engineStartFailed) {
      console.error(
        `Движок завершился до начала записи (код ${code}, сигнал ${signal || 'нет'}).`
      );
    } else if (ffmpegProcess && !recordingFinished) {
      console.error('Движок завершился во время записи; остановка ffmpeg.');
      ffmpegProcess.kill('SIGTERM');
    }
  });

  setTimeout(() => {
    if (engineStartFailed || engineProcess.exitCode !== null || engineProcess.signalCode !== null) {
      return;
      
    }

    console.log(`Идет запись в фоне (${durationSec} сек)...`);

    // Запускаем процесс ffmpeg для записи экрана.
    ffmpegProcess = spawn('ffmpeg', [
      '-y', // Перезаписывать выходной файл, если он уже существует.
      '-video_size', '1920x1080', // Устанавливаем размер записываемого изображения: 1920 на 1080 пикселей.
      '-framerate', `${fps}`, // Задаём частоту кадров записи из переменной fps.
      '-f', 'x11grab', // Указываем ffmpeg использовать захват экрана через X11.
      '-draw_mouse', '0', // убираем крест
      '-i', ':99', // Захватываем экран дисплея :99
      '-t', String(durationSec), // Ограничиваем длительность записи указанным количеством секунд.
      '-c:v', 'libopenh264', // Кодируем видео с помощью видеокодека libopenh264.
      '-b:v', '8M', // Устанавливаем целевой битрейт видео 8 Мбит/с.
      '-pix_fmt', 'yuv420p', // Преобразуем пиксели в формат yuv420p для совместимости.
      outputVideo // Указываем путь и имя создаваемого видеофайла.
    ], { stdio: ['ignore', 'inherit', 'inherit'] }); // Не передаём ввод; выводим стандартные потоки ffmpeg в родительский процесс.

    ffmpegProcess.once('error', (err) => {
      console.error('Ошибка запуска ffmpeg:', err.message);
      recordingFinished = true;
      stopEngine();
    });

    ffmpegProcess.once('close', (code, signal) => {
      recordingFinished = true;
      if (code === 0) {
        console.log(`\nГотово! Видео сохранено в файл: ${outputVideo}`);
      } else {
        console.error(
          `Ошибка записи видео: ffmpeg завершился с кодом ${code}, сигнал ${signal || 'нет'}.`
        );
      }
      stopEngine();
    });
  }, 4000);
}

module.exports = extractVideo;