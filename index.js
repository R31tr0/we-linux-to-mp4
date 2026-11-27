#!/usr/bin/env node
// база
const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
const classifyAssets = require('./assetClassifier');
const printAssetMap = require('./assetMap');
const extractVideo = require('./videoExtractor');
const readmetext = require('./readme')

const welcomeMessage = String.raw`
__        __   _                            _          __  __ ____  _  _   
\ \      / /__| | ___ ___  _ __ ___   ___  | |_ ___   |  \/  |  _ \| || |  
 \ \ /\ / / _ \ |/ __/ _ \| '_ \` _ \ / _ \ | __/ _ \  | |\/| | |_) | || |_ 
  \ V  V /  __/ | (_| (_) | | | | | |  __/ | || (_) | | |  | |  __/|__   _|
   \_/\_/ \___|_|\___\___/|_| |_| |_|\___|  \__\___/  |_|  |_|_|      |_|  
`;

const choice1 = readlineSync.keyInSelect(['Да', 'Нет'], 'привет перед началом работы я бы посоветовал прочитать важный текст перел использованием продолжить?');
if (choice1 === 0) {
  readmetext();
}

console.log(welcomeMessage);
const pkgPath = readlineSync.question('По какому пути лежит ваш файл? ');

if (path.extname(pkgPath).toLowerCase() !== '.pkg') {
  console.error('Ошибка: указанный файл не является .pkg сценой.');
  process.exit(1);
}

const fd = fs.openSync(pkgPath, 'r');


let cursor = 0;
const intBuffer = Buffer.alloc(4);

// 1 блок: версия
fs.readSync(fd, intBuffer, 0, 4, cursor);
const versionlength = intBuffer.readUInt32LE(0);
cursor += 4;

const versionBuffer = Buffer.alloc(versionlength);
fs.readSync(fd, versionBuffer, 0, versionlength, cursor);
const version = versionBuffer.toString('utf8');
cursor += versionlength;

console.log('Версия архива:', version);

// 2 блок: общее количество файлов
fs.readSync(fd, intBuffer, 0, 4, cursor);
const filecount = intBuffer.readUInt32LE(0);
cursor += 4;

console.log('Всего файлов:', filecount);

// 3 блок: оглавление
const files = [];

for (let i = 0; i < filecount; i++) {
  fs.readSync(fd, intBuffer, 0, 4, cursor);
  const filenamesize = intBuffer.readUInt32LE(0);
  cursor += 4;

  const filenameBuffer = Buffer.alloc(filenamesize);
  fs.readSync(fd, filenameBuffer, 0, filenamesize, cursor);
  const name = filenameBuffer.toString('utf8');
  cursor += filenamesize;
  console.log(`Файл ${i + 1}: ${name}`); 
  fs.readSync(fd, intBuffer, 0, 4, cursor);
  const offset = intBuffer.readUInt32LE(0);
  cursor += 4;

  fs.readSync(fd, intBuffer, 0, 4, cursor);
  const size = intBuffer.readUInt32LE(0);
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
