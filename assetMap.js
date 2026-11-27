function printAssetMap(assets) {
  console.log('\nКАРТА АССЕТОВ В АРХИВЕ');
  console.log(' Видео:', assets.videos);
  console.log(' Текстуры:', assets.textures);
  console.log(' Шейдеры:', assets.shaders);
  console.log(' Конфиги (JSON):', assets.configs);
  console.log(' Аудио:', assets.audio);
  console.log(' Прочее:', assets.other);
  if (assets.shaders.length > 0) {
    console.log(
      '\nВНИМАНИЕ: Сцена с неподдерживаемыми шейдерами может отрендериться некорректно. Это касается рендера, а не извлечения файлов.'
    );
  }
}

module.exports = printAssetMap;
