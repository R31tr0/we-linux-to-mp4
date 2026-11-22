// база
const fs = require('fs');
const readlineSync = require('readline-sync');
const classifyAssets = require('./assetClassifier');
const printAssetMap = require('./assetMap');
const extractVideo = require('./videoExtractor');

const welcomeMessage = String.raw`
__        __   _                            _          __  __ ____  _  _   
\ \      / /__| | ___ ___  _ __ ___   ___  | |_ ___   |  \/  |  _ \| || |  
 \ \ /\ / / _ \ |/ __/ _ \| '_ \` _ \ / _ \ | __/ _ \  | |\/| | |_) | || |_ 
  \ V  V /  __/ | (_| (_) | | | | | |  __/ | || (_) | | |  | |  __/|__   _|
   \_/\_/ \___|_|\___\___/|_| |_| |_|\___|  \__\___/  |_|  |_|_|      |_|  
`;

const choice1 = readlineSync.keyInSelect(['Да', 'Нет'], 'привет перед началом работы я бы посоветовал прочитать важный текст перел использованием продолжить?');
if (choice1 === 0) {
 
  const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m"
};

const importantText = `
${c.cyan}================================================================================${c.reset}
${c.bold}                         ОБРАЩЕНИЕ АВТОРА И СПРАВКА${c.reset}
${c.cyan}================================================================================${c.reset}

всем привет кто читает это сообщение спасибо вам огромное в первую очередь 
за то что вы используете мой проект но тк как я обычный джун я не могу сделать 
проект который заменит огромное пропиперитариатное ПО и я не могу сделать проект 
который будет работать на всех платформах и с любыми обоями но я активно работаю 
над этим проектом даже с силой нееросетей мне как обычному джуну фронтендеру 
такое дается тяжело но я горю этим и буду разрабатывать это дальше 

${c.yellow}--- вот то что я хотел вам сказать ---${c.reset}

${c.bold}во 1${c.reset} этот скрипт не может рендерить обои с сложными шейдерами и виджетами 1 в 1 
совместимость и работоспособность зависит от движка linuxwallpaperengine и его 
разрабов он написан на с++ и я не могу его переписать на js тк это будет очень 
сложно и долго и я не могу сделать его кроссплатформенным тк я не знаю как это 
сделать я крайне негативно отношусь к внедрению ии в код поэтому не буду 
использовать ии для его расширения и улучшения самого движка

${c.yellow}какие обои врядли отрендерятся корректно:${c.reset}
  ${c.bold}1${c.reset} сложные шейдеры
  ${c.bold}2${c.reset} виджеты например визуализаторы (я думаю в будущем добавить возмодность 
    отклюбчать виджеты тк как смысл от них если это мп4)
  ${c.bold}3${c.reset} обои где еффекты ренлерятся как слои по верх основной сцены (возможно я 
    добавлю автоматизацию для этого ) пока что вы можете только отренлерить 
    сцену и вытянуть каждый слой по отдельности и сами склеить слои

${c.red}какие обои точно не отрендерятся и не будут работать:${c.reset}
  обои с новыми шейдерами которые не поддерживаются движком linuxwallpaperengine 
  и обои с новыми виджетами которые не поддерживаются движком linuxwallpaperengine 
  возможны черные текстуры и черный экран

${c.cyan}================================================================================${c.reset}
${c.bold}                     ЗА ЧТО ОТВЕЧАЮТ ВЫБОРЫ В САМОМ СКРИПТЕ${c.reset}
${c.cyan}================================================================================${c.reset}

${c.bold}# 1 | Вырезать готовое видео из архива?${c.reset}
  ${c.green}Варианты:${c.reset} y / n
  ${c.dim}За что отвечает:${c.reset} Показывается, только если в scene.pkg есть готовые видеофайлы. 
  При y выбираешь номер файла, и он копируется из архива как есть, без рендера.

${c.bold}# 2 | Отрендерить и записать сцену через движок?${c.reset}
  ${c.green}Варианты:${c.reset} y / n
  ${c.dim}За что отвечает:${c.reset} Запускает запись сцены, если нет готового видео или оно не нужно.

${c.bold}# 3 | Сколько секунд записать${c.reset}
  ${c.green}Варианты:${c.reset} число
  ${c.dim}За что отвечает:${c.reset} Длительность ролика.

${c.bold}# 4 | Сколько fps записать${c.reset}
  ${c.green}Варианты:${c.reset} целое число
  ${c.dim}За что отвечает:${c.reset} Частота кадров, которую получают и движок, и запись.

${c.bold}# 5 | Способ рендера${c.reset}
  ${c.green}Варианты:${c.reset} [1] Xvfb (по Enter), [2] Cage headless
  ${c.dim}За что отвечает:${c.reset} Где считается сама сцена. [1] на CPU через llvmpipe, работает 
  везде, это твой проверенный вариант. [2] на GPU через Wayland-композитор Cage, 
  а записывает wf-recorder. Режим экспериментальный, нужны пакеты cage и wf-recorder.

${c.bold}# 6 | Разрешение записи${c.reset}
  ${c.green}Варианты:${c.reset} [1] 1920x1080 (по Enter), [2] 1280x720
  ${c.dim}За что отвечает:${c.reset} Спрашивается только для Xvfb. 720p заметно легче для CPU. 
  В режиме Cage вопроса нет: там фиксированные 1280x720 (константа CAGE_SIZE).

${c.bold}# 7 | Кодек${c.reset}
  ${c.green}Варианты:${c.reset} [1] libopenh264 (по Enter), [2] NVIDIA h264_nvenc, [3] AMD h264_vaapi
  ${c.dim}За что отвечает:${c.reset} Чем сжимается видео. Влияет только на кодирование, а не на рендер 
  сцены. [1] на CPU, [2] и [3] на видеокарте.

${c.cyan}--------------------------------------------------------------------------------${c.reset}
в общем большой успех ренлера и его фпс зависит от выбраного кодека и способа 
рендера и от того насколько мощный у вас компьютер и видеокарта и от того 
насколько сложная сцена которую вы хотите отрендерить
${c.cyan}================================================================================${c.reset}
`;

console.log(importantText);

}

console.log(welcomeMessage);
const pkgPath = readlineSync.question('По какому пути лежит ваш файл? ');
const fd = fs.openSync(pkgPath, 'r');

let cursor = 0;
const intBuffer = Buffer.alloc(4);

// 1 блок: версия
fs.readSync(fd, intBuffer, 0, 4, cursor);
const versionlength = intBuffer.readInt32LE(0);
cursor += 4;

const versionBuffer = Buffer.alloc(versionlength);
fs.readSync(fd, versionBuffer, 0, versionlength, cursor);
const version = versionBuffer.toString('utf8');
cursor += versionlength;

console.log('Версия архива:', version);

// 2 блок: общее количество файлов
fs.readSync(fd, intBuffer, 0, 4, cursor);
const filecount = intBuffer.readInt32LE(0);
cursor += 4;

console.log('Всего файлов:', filecount);

// 3 блок: оглавление
const files = [];

for (let i = 0; i < filecount; i++) {
  fs.readSync(fd, intBuffer, 0, 4, cursor);
  const filenamesize = intBuffer.readInt32LE(0);
  cursor += 4;

  const filenameBuffer = Buffer.alloc(filenamesize);
  fs.readSync(fd, filenameBuffer, 0, filenamesize, cursor);
  const name = filenameBuffer.toString('utf8');
  cursor += filenamesize;
  console.log(`Файл ${i + 1}: ${name}`); 
  fs.readSync(fd, intBuffer, 0, 4, cursor);
  const offset = intBuffer.readInt32LE(0);
  cursor += 4;

  fs.readSync(fd, intBuffer, 0, 4, cursor);
  const size = intBuffer.readInt32LE(0);
  cursor += 4;

  files.push({ name, offset, size });
}

const dataStart = cursor;
console.log('Блок данных начинается с байта:', dataStart);

// 4 блок: классификация ассетов
const assets = classifyAssets(files, dataStart, fd);

fs.closeSync(fd);

// 5 блок: вывод карты и извлечение видео
printAssetMap(assets);
extractVideo(assets, pkgPath, readlineSync);
