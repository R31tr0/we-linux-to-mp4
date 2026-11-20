// база
const fs = require('fs');
const readlineSync = require('readline-sync');
const classifyAssets = require('./assetClassifier');
const printAssetMap = require('./assetMap');
const extractVideo = require('./videoExtractor');

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
