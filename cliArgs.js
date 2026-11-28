function printHelp() {
  console.log(`
Использование:
  node index.js [флаги]

Флаги:
  --input <файл.pkg>       Путь к сцене (без интерактивного вопроса)
  --skip-readme            Не показывать вопрос о прочтении справки
  --verbose                Подробно показать все ассеты
  --extract <N>            Вырезать N-е видео и завершить работу
  --render                 Сразу выбрать рендер сцены
  --duration <сек>         Длительность записи
  --fps <число>            Частота кадров
  --backend xvfb|cage      Способ рендера
  --resolution <имя>       Разрешение: 1920x1080 или 1280x720
  --codec <имя>            Кодек: default, nvidia или amd
  --out <файл.mp4>         Имя выходного файла
  --help                   Показать эту справку

Примеры:
  node index.js --input scene.pkg --skip-readme
  node index.js --input scene.pkg --render --duration 10 --fps 60 --backend xvfb --resolution 1920x1080 --codec default --out result.mp4
  node index.js --input scene.pkg --extract 1 --out video.mp4
`);
}

function parseArgs(argv) {
  const options = {
    verbose: false,
    skipReadme: false,
    help: false,
    extract: null,
    render: false
  };
  const valueFlags = new Set([
    'input',
    'extract',
    'duration',
    'fps',
    'backend',
    'resolution',
    'codec',
    'out'
  ]);

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (!argument.startsWith('--')) {
      throw new Error(`Неизвестный аргумент: ${argument}`);
    }

    const name = argument.slice(2);
    if (name === 'help') {
      options.help = true;
    } else if (name === 'verbose') {
      options.verbose = true;
    } else if (name === 'skip-readme') {
      options.skipReadme = true;
    } else if (name === 'render') {
      options.render = true;
    } else if (valueFlags.has(name)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Для --${name} требуется значение`);
      }
      options[name] = value;
      i++;
    } else {
      throw new Error(`Неизвестный флаг: --${name}`);
    }
  }

  return options;
}

function validateOptions(options) {
  if (options.extract !== null) {
    const extractIndex = Number(options.extract);
    if (!Number.isInteger(extractIndex) || extractIndex < 1) {
      throw new Error('--extract должен принимать положительный номер видео');
    }
    options.extract = extractIndex;
  }
  if (options.duration !== undefined) {
    options.duration = Number(options.duration);
    if (!Number.isFinite(options.duration) || options.duration <= 0) {
      throw new Error('--duration должен быть положительным числом');
    }
  }
  if (options.fps !== undefined) {
    options.fps = Number(options.fps);
    if (!Number.isInteger(options.fps) || options.fps <= 0) {
      throw new Error('--fps должен быть положительным целым числом');
    }
  }
  if (options.backend !== undefined &&
      !['xvfb', 'cage'].includes(options.backend.toLowerCase())) {
    throw new Error('--backend принимает только xvfb или cage');
  }
  if (options.resolution !== undefined) {
    const resolution = options.resolution.toLowerCase();
    if (!['1920x1080', '1280x720'].includes(resolution)) {
      throw new Error('--resolution принимает только 1920x1080 или 1280x720');
    }
  }
  if (options.codec !== undefined) {
    const codec = options.codec.toLowerCase();
    if (!['default', 'libopenh264', 'nvidia', 'amd'].includes(codec)) {
      throw new Error('--codec принимает default, libopenh264, nvidia или amd');
    }
    options.codec = codec === 'libopenh264' ? 'default' : codec;
  }
  if (options.backend !== undefined) {
    options.backend = options.backend.toLowerCase();
  }
  if (options.resolution !== undefined) {
    options.resolution = options.resolution.toLowerCase();
  }
}

module.exports = {
  parseArgs,
  validateOptions,
  printHelp
};
