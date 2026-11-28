#!/usr/bin/env node
const fs = require('fs');
const parsePkg = require('./pkgParser');
const path = require('path');
const readlineSync = require('readline-sync');
const classifyAssets = require('./assetClassifier');
const printAssetMap = require('./assetMap');
const extractVideo = require('./videoExtractor');
const readmetext = require('./readme');
const { parseArgs, validateOptions, printHelp } = require('./cliArgs');

const welcomeMessage = String.raw`
__        __   _                            _          __  __ ____  _  _   
\ \      / /__| | ___ ___  _ __ ___   ___  | |_ ___   |  \/  |  _ \| || |  
 \ \ /\ / / _ \ |/ __/ _ \| '_ \` _ \ / _ \ | __/ _ \  | |\/| | |_) | || |_ 
  \ V  V /  __/ | (_| (_) | | | | | |  __/ | || (_) | | |  | |  __/|__   _|
   \_/\_/ \___|_|\___\___/|_| |_| |_|\___|  \__\___/  |_|  |_|_|      |_|  
`;

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    validateOptions(options);
  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.skipReadme) {
    const choice1 = readlineSync.keyInSelect(
      ['Да', 'Нет'],
      'Привет! Перед началом работы рекомендуется прочитать важную информацию. Продолжить?'
    );
    if (choice1 === 0) readmetext();
  }

  console.log(welcomeMessage);
  const pkgPath = options.input ||
    readlineSync.question('По какому пути лежит ваш файл? ');

  if (path.extname(pkgPath).trim().toLowerCase() !== '.pkg') {
    console.error('Ошибка: указанный файл не является .pkg сценой.');
    process.exit(1);
  }

  let fd;
  try {
    fd = fs.openSync(pkgPath, 'r');
    const { version, files, dataStart } = parsePkg(fd);
    console.log('Версия архива:', version);
    console.log('Всего файлов:', files.length);
    const assets = classifyAssets(files, dataStart, fd);
    printAssetMap(assets, { verbose: options.verbose });
    await extractVideo(assets, pkgPath, readlineSync, options);
  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exitCode = 1;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
if (require.main === module) main();

