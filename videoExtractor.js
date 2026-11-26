const fs = require('fs');
const path = require('path');
const { commandExists, RESOLUTIONS } = require('./videoSupport');
const renderSceneToVideo = require('./videoRenderer');

function extractReadyVideo(assets, pkgPath, readlineSync) {
  if (assets.videos.length === 0) {
    console.log('\nЧистых видеофайлов внутри архива нет (это интерактивная сцена).');
    return false;
  }

  console.log('\nДоступные видеофайлы для вырезки:');
  assets.videos.forEach((file, index) => {
    console.log(`[${index}] ${file.name} (${file.sizeMB})`);
  });

  const ask = readlineSync.question(
    '\nВы хотите вырезать готовый видеофайл из архива? (y/n): '
  );
  if (ask.toLowerCase() !== 'y') {
    console.log('Вырезка готового видео пропущена.');
    return false;
  }

  const choice = readlineSync.question(
    '\nВведите номер видео для вырезки (или нажмите Enter для пропуска): '
  );
  if (choice.trim() === '') {
    return false;
  }

  const selectedVideo = assets.videos[Number(choice)];
  if (!selectedVideo) {
    console.log('Ошибка: файла с таким номером нет в списке.');
    return false;
  }

  const outputName = path.basename(selectedVideo.name);
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
  return true;
}

function extractVideo(assets, pkgPath, readlineSync) {
  if (extractReadyVideo(assets, pkgPath, readlineSync)) {
    return;
  }

  const ask = readlineSync.question(
    '\nВы хотите отрендерить и записать сцену в видео через движок? (y/n): '
  );
  if (ask.toLowerCase() !== 'y') {
    console.log('Конвертация видео отменена пользователем.');
    return;
  }

  const durationSec = Number(
    readlineSync.question('Сколько секунд записать? (например, 10): ')
  );
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    console.error('Ошибка: длительность должна быть положительным числом.');
    return;
  }

  const fps = Number(readlineSync.question('Сколько fps записать? (например, 60): '));
  if (!Number.isInteger(fps) || fps <= 0) {
    console.error('Ошибка: fps должен быть положительным целым числом.');
    return;
  }

  const cageReady = ['cage', 'wf-recorder'].every(commandExists);
  console.log('\nВыберите способ рендера:');
  console.log('[1] Xvfb (рендер на CPU, работает везде)');
  console.log(
    `[2] Cage headless (рендер на GPU, экспериментально)${
      cageReady ? '' : ' - не установлены cage и wf-recorder'
    }`
  );
  const backendChoice = readlineSync.question('Номер (Enter = 1): ').trim();
  const backendKey = backendChoice === '2' ? 'cage' : 'xvfb';

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

  renderSceneToVideo(
    pkgPath,
    durationSec,
    fps,
    codecKey,
    backendKey,
    resolution,
    assets.videos,
    readlineSync
  );
}

module.exports = extractVideo;