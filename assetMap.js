function printAssetMap(assets) {
  console.log('\nКАРТА АССЕТОВ В АРХИВЕ');
  console.log(' Видео:', assets.videos);
  console.log(' Текстуры:', assets.textures);
  console.log(' Шейдеры:', assets.shaders);
  console.log(' Конфиги (JSON):', assets.configs);
  console.log(' Аудио:', assets.audio);
  console.log(' Прочее:', assets.other);
  if (assets.shaders.length > 0) {
    console.log('\nВНИМАНИЕ: В архиве обнаружены шейдеры. Их извлечение может привести к некорректной работе приложения. Будьте осторожны при работе с этими файлами.'
    );
  }
}

module.exports = printAssetMap;
