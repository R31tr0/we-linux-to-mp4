function printAssetList(label, items, verbose) {
  if (items.length === 0) return;
  if (!verbose) {
    console.log(`  ${label}: ${items.length}`);
    return;
  }
  console.log(`  ${label}:`);
  items.forEach((item) => {
    console.log(`    - ${item.name} (${item.sizeMB})`);
  });
}

function printAssetMap(assets, options = {}) {
  const verbose = Boolean(options.verbose);
  console.log('\nАССЕТЫ В АРХИВЕ');
  printAssetList('Видео', assets.videos, verbose);
  printAssetList('Текстуры', assets.textures, verbose);
  printAssetList('Шейдеры', assets.shaders, verbose);
  printAssetList('Конфиги', assets.configs, verbose);
  printAssetList('Аудио', assets.audio, verbose);
  printAssetList('Прочее', assets.other, verbose);
  if (assets.shaders.length > 0) {
    console.log(
      '\nВНИМАНИЕ: Сцена с неподдерживаемыми шейдерами может отрендериться некорректно. Это касается рендера, а не извлечения файлов.'
    );
  }
}

module.exports = printAssetMap;
